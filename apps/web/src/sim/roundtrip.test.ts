import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CELL_PRECISION,
  POS_INTERVAL_STATIONARY_MS,
  PRESENCE_EXPIRY_MS,
  PROTOCOL_VERSION,
  SERVER_TICK_MS,
  INTEREST_RADIUS_M,
  decodeBounds,
  destination,
  encode,
  haversineM,
  hubOf,
  idFromSecret,
  type ClientMsg,
  type ServerMsg,
} from '@teslawave/protocol';
import {
  createHub,
  flushIfDue,
  onClose,
  onMessage,
  openSocket,
  restoreSocket,
  type Effect,
  type HubState,
  type SocketProfile,
} from '@teslawave/hub-core';
import {
  applyServerMsg,
  dropCells,
  getCar,
  resetWorld,
  setSubscribedCells,
  tickWorld,
} from './world';

/**
 * The hub and the client, driven against each other.
 *
 * Every one of these cases was a bug found on a real car screen, and every one of them was
 * an ordering bug *between* the two halves rather than a fault in either: a car blinking out
 * at a cell border because the hub sends the update before the departure; ghosts after a
 * reconnect because a welcome restates a cell; the whole map wiping because the hub had
 * hibernated and its snapshot was empty. Each was found by a person driving a car and fixed
 * against a unit test written afterwards, on one side only.
 *
 * Both sides are pure and deterministic — that is what ADR-0013 bought — so they can be run
 * against each other with a virtual clock, which is the only place these bugs are visible
 * before someone reports them. The hub is the real `@teslawave/hub-core`; the client is the
 * real `sim/world`. The only thing faked is time and the wire between them.
 */

const START = 1_700_000_000_000;
const GENEVA = { lat: 46.2044, lng: 6.1432 };
const CELL = encode(GENEVA.lat, GENEVA.lng, CELL_PRECISION);
const HUB = hubOf(CELL);
/** Just over the northern edge of CELL, which is where a border crossing happens. */
const NORTH_EDGE = decodeBounds(CELL).maxLat;
const NORTH_CELL = encode(NORTH_EDGE + 0.01, GENEVA.lng, CELL_PRECISION);

/** Our own socket. Effects addressed here are the only ones the client ever sees. */
const US = 'us';
const secretOf = (name: string): string => `secret-${name}-0123456789`;
const idOf = (name: string): string => idFromSecret(secretOf(name));

type Rig = ReturnType<typeof createRig>;

function createRig(ourCells: string[] = [CELL]) {
  let now = START;
  let hub: HubState = createHub(HUB, now);
  /** What the hub would have written into each socket's attachment: what survives a wake. */
  const profiles = new Map<string, SocketProfile>();
  const inbox: ServerMsg[] = [];
  let ourCellsHeld = [...ourCells];
  /**
   * Checked after every single message, not once per tick.
   *
   * This distinction is the whole point of the border case. A crossing produces two diffs —
   * gone from the old cell, updated in the new one — and a client that deletes on the gone
   * regardless still ends up correct once both have been applied. On the wire they are two
   * separate frames with the render loop running at 60 fps between them, so "correct after
   * both" is exactly the bug that made every car blink out at every border.
   */
  let afterEachMessage: ((msg: ServerMsg) => void) | null = null;

  const apply = (effects: Effect[]): void => {
    for (const effect of effects) {
      if (effect.k === 'attach') profiles.set(effect.to, effect.profile);
      else if (effect.k === 'send' && effect.to === US) inbox.push(effect.msg);
    }
  };

  /** Hand the client everything the hub addressed to it, through the real message handler. */
  const deliver = (): void => {
    for (const msg of inbox.splice(0)) {
      applyServerMsg(msg, HUB);
      afterEachMessage?.(msg);
    }
  };

  const send = (key: string, msg: ClientMsg): void => apply(onMessage(hub, key, msg, now));

  const hello = (key: string, name: string, cells: string[], v = PROTOCOL_VERSION): void => {
    openSocket(hub, key);
    // A hello with no version at all is what a hub from before ADR-0029 receives, and what
    // every client deployed before it sends.
    const msg = { t: 'hello', secret: secretOf(name), model: '3', colour: 'red', cells } as Record<
      string,
      unknown
    >;
    if (v >= 0) msg['v'] = v;
    send(key, msg as unknown as ClientMsg);
  };

  return {
    get now(): number {
      return now;
    },
    get hub(): HubState {
      return hub;
    },

    /** Run a check after every message the client applies, not just at tick boundaries. */
    onEachMessage(fn: ((msg: ServerMsg) => void) | null): void {
      afterEachMessage = fn;
    },

    /** Move the shared clock. The client reads it through `Date.now`, as it does in a car. */
    advance(ms: number): void {
      now += ms;
      vi.setSystemTime(now);
    },

    join(key: string, name: string, cells: string[] = [CELL], v = PROTOCOL_VERSION): void {
      hello(key, name, cells, v);
      if (key === US) {
        ourCellsHeld = [...cells];
        setSubscribedCells(ourCellsHeld);
      }
      deliver();
    },

    pos(key: string, lat: number, lng: number, speed = 50, heading = 0): void {
      send(key, { t: 'pos', lat, lng, heading, speed, ts: now });
    },

    /** One server tick: flush the diffs, hand ours over, and draw a frame. */
    tick(): void {
      apply(flushIfDue(hub, now));
      deliver();
      tickWorld(now);
    },

    /** The socket drops. The hub forgets the connection; the client keeps its world. */
    drop(key: string): void {
      apply(onClose(hub, key, now));
      profiles.delete(key);
    },

    /**
     * The hub hibernates and wakes: presence lives in memory only, so it comes back empty
     * and every driver has to report again (ADR-0002). Counters and socket attachments are
     * what survive, exactly as `HubDO#restore` rebuilds them.
     */
    hibernate(): void {
      const counters = {
        wavesByUser: hub.counters.wavesByUser,
        lastWaveByUser: hub.counters.lastWaveByUser,
        wavesByCellDay: hub.counters.wavesByCellDay,
        lastWriteAt: hub.counters.lastWriteAt,
      };
      const woken = createHub(HUB, now, counters);
      for (const profile of profiles.values()) restoreSocket(woken, profile);
      hub = woken;
    },

    /** Our client reconnects: a fresh socket, a fresh hello, and whatever welcome comes back. */
    reconnect(cells: string[] = ourCellsHeld): void {
      hello(US, 'us', cells);
      ourCellsHeld = [...cells];
      setSubscribedCells(ourCellsHeld);
      deliver();
    },

    /** The client stopped holding a socket for these cells, so it forgets them. */
    forgetCells(cells: string[]): void {
      dropCells(cells);
    },
  };
}

/** True when the client is currently showing this driver: in the world and drawable. */
const onMap = (id: string): boolean => getCar(id) !== undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  resetWorld(idOf('us'));
});

afterEach(() => {
  vi.useRealTimers();
});

/** Drive `steps` server ticks, reporting every driver in `movers` and watching `watch`. */
function run(
  rig: Rig,
  steps: number,
  movers: Array<{ key: string; lat: number; lng: number; speed?: number; heading?: number }>,
  watch: (step: number) => void,
): void {
  for (let step = 0; step < steps; step++) {
    for (const m of movers) {
      const next = destination(m.lat, m.lng, m.heading ?? 0, ((m.speed ?? 50) / 3.6) * (SERVER_TICK_MS / 1000));
      m.lat = next.lat;
      m.lng = next.lng;
      rig.pos(m.key, m.lat, m.lng, m.speed ?? 50, m.heading ?? 0);
    }
    rig.advance(SERVER_TICK_MS);
    rig.tick();
    watch(step);
  }
}

describe('the hub and the client, against each other', () => {
  it('never blinks a car out as it crosses a cell border', () => {
    // The bug: the hub announces the crossing car as an update in the new cell and a
    // departure from the old one, and sends the update first. The client deleted on the
    // departure regardless, so every car blinked out at every border.
    const rig = createRig([CELL, NORTH_CELL]);
    rig.join(US, 'us', [CELL, NORTH_CELL]);
    rig.join('b', 'car-b', [CELL, NORTH_CELL]);
    rig.pos(US, GENEVA.lat, GENEVA.lng, 0);

    // Start 200 m short of the edge, driving north fast enough to cross within the run.
    const b = { key: 'b', lat: NORTH_EDGE - 0.002, lng: GENEVA.lng, speed: 90, heading: 0 };
    rig.pos('b', b.lat, b.lng, b.speed, b.heading);
    rig.advance(SERVER_TICK_MS);
    rig.tick();
    expect(onMap(idOf('car-b'))).toBe(true);

    let crossed = false;
    const gaps: string[] = [];
    // After every frame the socket delivers, because that is when the map can be drawn.
    rig.onEachMessage((msg) => {
      if (!onMap(idOf('car-b')))
        gaps.push(
          msg.t === 'diff' || msg.t === 'diff2'
            ? `after a ${msg.t} for ${msg.cell}`
            : `after a ${msg.t}`,
        );
    });
    run(rig, 40, [b], () => {
      rig.pos(US, GENEVA.lat, GENEVA.lng, 0);
      if (rig.hub.presence.get(idOf('car-b'))?.cell === NORTH_CELL) crossed = true;
      if (!onMap(idOf('car-b'))) gaps.push('at a tick boundary');
    });

    expect(crossed, 'the test has to actually cross a border to mean anything').toBe(true);
    expect(gaps, `car vanished ${gaps.join('; ')}`).toEqual([]);
  });

  it('does not wipe the map when the hub wakes from hibernation', () => {
    // The bug: a wake starts with empty presence, so the welcome snapshot is empty. The
    // client treated it as the whole truth and deleted everyone; the map blanked and
    // trickled back one car at a time.
    const rig = createRig();
    rig.join(US, 'us');
    rig.join('b', 'car-b');
    const b = { key: 'b', lat: GENEVA.lat, lng: GENEVA.lng, speed: 50, heading: 90 };
    run(rig, 3, [b], () => rig.pos(US, GENEVA.lat, GENEVA.lng, 0));
    expect(onMap(idOf('car-b'))).toBe(true);

    // The socket drops, the hub sleeps, and our reconnect is what wakes it.
    rig.drop(US);
    rig.hibernate();
    rig.advance(1_000);
    rig.reconnect();
    expect(onMap(idOf('car-b')), 'an empty welcome must not erase a driver').toBe(true);

    // B is still out there and reports again on its own schedule. It should never have gone.
    const gaps: number[] = [];
    run(rig, 10, [b], (step) => {
      rig.pos(US, GENEVA.lat, GENEVA.lng, 0);
      if (!onMap(idOf('car-b'))) gaps.push(step);
    });
    expect(gaps, `car vanished on ticks ${gaps.join(', ')}`).toEqual([]);
  });

  it('takes a driver off the map as soon as their socket closes', () => {
    const rig = createRig();
    rig.join(US, 'us');
    rig.join('b', 'car-b');
    const b = { key: 'b', lat: GENEVA.lat, lng: GENEVA.lng, speed: 50, heading: 90 };
    run(rig, 3, [b], () => rig.pos(US, GENEVA.lat, GENEVA.lng, 0));
    expect(onMap(idOf('car-b'))).toBe(true);

    // A clean close is unambiguous: they closed the tab, or went invisible. No waiting.
    rig.drop('b');
    rig.advance(SERVER_TICK_MS);
    rig.tick();
    expect(onMap(idOf('car-b'))).toBe(false);
  });

  it('expires a driver whose socket stayed open but whose positions stopped', () => {
    // The harder half, and the one a driver actually sees: a frozen tab, a tunnel, a phone
    // whose screen went dark. The socket is still open and its pings are still answered, so
    // nothing announces a departure — only the clock does.
    const rig = createRig();
    rig.join(US, 'us');
    rig.join('b', 'car-b');
    const b = { key: 'b', lat: GENEVA.lat, lng: GENEVA.lng, speed: 50, heading: 90 };
    run(rig, 3, [b], () => rig.pos(US, GENEVA.lat, GENEVA.lng, 0));
    expect(onMap(idOf('car-b'))).toBe(true);

    const startedAt = rig.now;
    let goneAfterMs: number | null = null;
    // B is in `movers` no longer: the socket lives on, the positions stop.
    run(rig, 60, [], () => {
      rig.pos(US, GENEVA.lat, GENEVA.lng, 0);
      if (goneAfterMs === null && !onMap(idOf('car-b'))) goneAfterMs = rig.now - startedAt;
    });

    expect(goneAfterMs, 'a silent driver must not stay on the map for ever').not.toBeNull();
    // Neither early — a car at a red light reports every 30 s and must not flicker — nor late.
    expect(goneAfterMs ?? 0).toBeGreaterThan(PRESENCE_EXPIRY_MS - 2 * SERVER_TICK_MS);
    expect(goneAfterMs ?? 0).toBeLessThan(PRESENCE_EXPIRY_MS + 2 * SERVER_TICK_MS);
  });

  it('clears a driver who left while our socket was down, faster than the plain expiry', () => {
    // The other half of the welcome problem: anyone missing from a snapshot gets until their
    // next report to show up rather than being deleted at once — but they must still go.
    const rig = createRig();
    rig.join(US, 'us');
    rig.join('b', 'car-b');
    const b = { key: 'b', lat: GENEVA.lat, lng: GENEVA.lng, speed: 50, heading: 90 };
    run(rig, 3, [b], () => rig.pos(US, GENEVA.lat, GENEVA.lng, 0));

    rig.drop(US);
    rig.drop('b'); // B leaves while we cannot see anything.
    rig.advance(5_000);
    rig.reconnect();

    const startedAt = rig.now;
    let goneAfterMs: number | null = null;
    run(rig, 40, [], () => {
      rig.pos(US, GENEVA.lat, GENEVA.lng, 0);
      if (goneAfterMs === null && !onMap(idOf('car-b'))) goneAfterMs = rig.now - startedAt;
    });
    expect(goneAfterMs).not.toBeNull();
    expect(
      goneAfterMs ?? 0,
      'a welcome should clear a departed driver sooner than the expiry sweep would',
    ).toBeLessThanOrEqual(POS_INTERVAL_STATIONARY_MS + 2 * SERVER_TICK_MS);
  });

  /**
   * The three cases above are the bugs we know about. This is for the ones we do not: a long
   * drive with drops, wakes and border crossings shuffled together, checking the two things
   * that must be true at every single tick, whatever order events arrive in.
   */
  it('holds the invariants across a drive full of drops, wakes and crossings', () => {
    const rig = createRig([CELL, NORTH_CELL]);
    rig.join(US, 'us', [CELL, NORTH_CELL]);

    const names = ['n1', 'n2', 'n3', 'n4'];
    const movers = names.map((name, i) => ({
      key: name,
      name,
      lat: NORTH_EDGE - 0.02 - i * 0.005,
      lng: GENEVA.lng + i * 0.01,
      speed: 70 + i * 10,
      heading: 0,
      reporting: true,
      /** When this driver last got a position through to the hub. */
      lastReportAt: START,
    }));
    for (const m of movers) rig.join(m.key, m.name, [CELL, NORTH_CELL]);

    // Deterministic pseudo-randomness: a failure has to be reproducible to be worth anything.
    let seed = 20260907;
    const rand = (): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };

    const failures: string[] = [];
    let beyondInterest = false;
    let sawCompactWire = false;
    rig.onEachMessage((msg) => {
      if (msg.t === 'diff2') sawCompactWire = true;
    });
    for (let step = 0; step < 150; step++) {
      // Someone drops or comes back, now and then.
      if (step > 5 && rand() < 0.06) {
        const m = movers[Math.floor(rand() * movers.length)];
        if (m) {
          if (m.reporting) {
            rig.drop(m.key);
            m.reporting = false;
          } else {
            rig.join(m.key, m.name, [CELL, NORTH_CELL]);
            m.reporting = true;
          }
        }
      }
      // The hub sleeps and we reconnect into it, which is what a quiet region really does.
      if (step === 60) {
        rig.drop(US);
        rig.hibernate();
        rig.reconnect([CELL, NORTH_CELL]);
      }

      for (const m of movers) {
        if (!m.reporting) continue;
        const next = destination(m.lat, m.lng, m.heading, (m.speed / 3.6) * (SERVER_TICK_MS / 1000));
        m.lat = next.lat;
        m.lng = next.lng;
        rig.pos(m.key, m.lat, m.lng, m.speed, m.heading);
        m.lastReportAt = rig.now;
      }
      rig.pos(US, GENEVA.lat, GENEVA.lng, 0);
      rig.advance(SERVER_TICK_MS);
      rig.tick();

      for (const m of movers) {
        const id = idOf(m.name);
        const since = rig.now - m.lastReportAt;
        const away = haversineM(GENEVA.lat, GENEVA.lng, m.lat, m.lng);
        if (away > INTEREST_RADIUS_M) beyondInterest = true;
        /*
         * A driver reporting steadily, and near enough to be on our map, is on our map. This
         * is the border-blink invariant and the hibernation-wipe one, stated once for every
         * driver on every tick.
         *
         * "Near enough" is the part ADR-0033 added, and it is stated as a fact about
         * distance rather than left implicit in the fixture: a car beyond the drop radius is
         * *supposed* to be absent, and a rig that did not say so would either fail for the
         * right reason with a confusing message, or drift into never testing the invariant
         * at all as the numbers change.
         */
        if (m.reporting && since <= SERVER_TICK_MS * 2 && away < INTEREST_RADIUS_M && !onMap(id))
          failures.push(`step ${step}: ${m.name} vanished while still reporting, ${Math.round(away)} m away`);
        // And a driver who stopped is gone, on the client's own clock. No ghosts.
        if (since > PRESENCE_EXPIRY_MS + SERVER_TICK_MS * 2 && onMap(id))
          failures.push(`step ${step}: ${m.name} is a ghost, ${since} ms since its last report`);
      }
    }

    expect(failures, failures.slice(0, 10).join('\n')).toEqual([]);
    // The drive has to have actually crossed a border for the first invariant to mean much.
    expect(movers.some((m) => m.lat > NORTH_EDGE)).toBe(true);
    // And it has to have been the compact wire all along, or none of this tested it.
    expect(sawCompactWire).toBe(true);
    // Everyone stayed inside interest, so the invariant above was never skipped.
    expect(beyondInterest).toBe(false);
  });
});

/**
 * What happens if the new hub has to be rolled back.
 *
 * The compact wire is the largest change the core data path has ever had, and it goes out to
 * every car at once. The question that decides how safe that is: once a driver has reloaded
 * into the new build, can the hub be put back to the old one without stranding them?
 *
 * It can, and not by accident — the client still understands whole car states, because that
 * is the same code path that carries a client which has *not* reloaded yet (ADR-0029). The
 * two directions of compatibility turn out to be the same one. Worth a test, because it is
 * the property a deploy is trusted on and nothing else asserts it.
 */
describe('a rollback', () => {
  it('leaves a client on the new build working against a hub on the old wire', () => {
    const rig = createRig();
    // A hub from before ADR-0029 never reads a version, so every socket looks legacy to it
    // and it answers everyone in whole car states. `-1` is this rig's way of saying that.
    rig.join(US, 'us', [CELL], -1);
    rig.join('b', 'car-b', [CELL], -1);

    let sawWholeWire = false;
    let sawCompactWire = false;
    rig.onEachMessage((msg) => {
      if (msg.t === 'diff') sawWholeWire = true;
      if (msg.t === 'diff2') sawCompactWire = true;
    });

    const b = { key: 'b', lat: GENEVA.lat, lng: GENEVA.lng, speed: 50, heading: 90 };
    const gaps: number[] = [];
    run(rig, 8, [b], (step) => {
      rig.pos(US, GENEVA.lat, GENEVA.lng, 0);
      if (!onMap(idOf('car-b'))) gaps.push(step);
    });

    expect(gaps, `car missing on ticks ${gaps.join(', ')}`).toEqual([]);
    expect(sawWholeWire, 'the rolled-back hub should be speaking the old wire').toBe(true);
    expect(sawCompactWire).toBe(false);
    // And the car is still routable for a wave, which needs the hub it arrived on.
    expect(getCar(idOf('car-b'))?.hub).toBe(HUB);
  });
});
