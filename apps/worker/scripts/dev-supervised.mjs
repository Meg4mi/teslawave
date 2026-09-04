#!/usr/bin/env node
/**
 * `wrangler dev`, kept alive for the length of an end-to-end run.
 *
 * Wrangler's dev server puts a proxy Worker in front of the real one, and when a client drops
 * a WebSocket abruptly — a browser context closing mid-frame, a test going offline on purpose —
 * that proxy can report "Network connection lost", which wrangler 4.129 treats as fatal and
 * exits. It happened about fifty tests into the suite, on the CI runner and locally alike,
 * and every test after it failed with a refused connection. None of that is the app: the hub
 * does not see a thing.
 *
 * So the suite runs wrangler under this: forward its output, restart it if it dies on its
 * own, and stop it — without restarting — when Playwright ends the run. Local state lives on
 * disk under `.wrangler/state`, so a restart keeps the D1 rows and only loses in-memory
 * presence, which the clients rebuild in seconds. The specs' first navigation retries for a
 * few seconds to bridge the gap (`e2e/helpers.ts`).
 */
import { spawn } from 'node:child_process';
import { connect } from 'node:net';

// Run through `pnpm --filter @teslawave/worker dev:e2e`, which puts node_modules/.bin on PATH.
const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const port = portArg >= 0 ? Number(args[portArg + 1]) : 8787;

const MAX_RESTARTS = 5;
const RESTART_DELAY_MS = 1_000;
/** How long to wait for the runtime to let go of the port before starting again. */
const PORT_WAIT_MS = 15_000;

/** True while something still answers on the port. */
const listening = () =>
  new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });

const waitForPort = async () => {
  const deadline = Date.now() + PORT_WAIT_MS;
  while (await listening()) {
    if (Date.now() > deadline) {
      console.error(`[dev-supervised] port ${port} is still held after ${PORT_WAIT_MS} ms; trying anyway.`);
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
};

let child = null;
let stopping = false;
let restarts = 0;

const start = () => {
  child = spawn('wrangler', ['dev', ...args], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code, signal) => {
    child = null;
    if (stopping) process.exit(0);
    if (restarts >= MAX_RESTARTS) {
      console.error(`[dev-supervised] wrangler dev exited (${signal ?? code}) ${restarts} times; giving up.`);
      process.exit(code ?? 1);
    }
    restarts += 1;
    console.error(
      `[dev-supervised] wrangler dev exited (${signal ?? code}); restarting (${restarts}/${MAX_RESTARTS}).`,
    );
    setTimeout(() => void waitForPort().then(start), RESTART_DELAY_MS);
  });
};

const stop = (signal) => {
  stopping = true;
  if (child) child.kill(signal);
  else process.exit(0);
};
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGHUP', () => stop('SIGTERM'));

start();
