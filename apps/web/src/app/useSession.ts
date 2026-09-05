import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  WAVE_BACK_WINDOW_MS,
  WAVE_PROMPT_TTL_MS,
  hubOf,
  type ServerMsg,
  type TeslaModel,
} from '@teslawave/protocol';
import { createNet, type Net, type NetStatus } from '../net/sockets';
import { startBeacon } from '../perf/beacon';
import { usePosition } from '../geo/usePosition';
import {
  applyServerMsg,
  bumpSelfWaves,
  dropCells,
  getCar,
  getSelfWaves,
  pruneExpired,
  refreshSummary,
  resetWorld,
  setSelfPlacement,
  setSelfReported,
  setSubscribedCells,
} from '../sim/world';
import type { Identity, Prefs } from '../identity/store';
import { play, setMuted } from '../ui/sound';
import { useCopy } from '../i18n';
import type { Renderer } from '../overlay/renderer';
import type { WaveCardContent } from '../screens/WaveCard';

/** The car that waved at you last, unprompted, while it is still around to wave back at. */
export type WaveBack = { id: string; model: TeslaModel; colour: string; at: number };

export type Session = {
  status: NetStatus;
  /** Location denied or unavailable: sees, is not seen, cannot wave. */
  spectator: boolean;
  /** Parked for PARKED_HIDE_MS: hidden by the clock until the car moves (ADR-0026). */
  parked: boolean;
  /** A wave count just crossed: the number to celebrate, for a few seconds. */
  milestone: number | null;
  /** The card a received wave raises. */
  waveCard: WaveCardContent | null;
  dismissWaveCard: () => void;
  /** The edge flash of a received wave: keyed so each one is a fresh element. */
  flashId: number | null;
  backFrom: WaveBack | null;
  /** Send a wave. Says so on screen if it could not go out at all. */
  wave: (id: string) => void;
};

/**
 * Everything that happens between the driver and the hub while the map is up: the socket,
 * the position feed, the wave in both directions, the parking clock, the beacon. The App
 * composes screens; this is the drive underneath them.
 */
export function useSession({
  identity,
  prefs,
  claimMilestone,
  rendererRef,
  showToast,
}: {
  identity: Identity | null;
  prefs: Prefs;
  claimMilestone: (waves: number) => number | null;
  rendererRef: RefObject<Renderer | null>;
  showToast: (text: string) => void;
}): Session {
  const copy = useCopy();
  // Read by the connection effect, which must not re-run when the car changes.
  const profileRef = useRef(identity);
  useEffect(() => {
    profileRef.current = identity;
  });
  const netRef = useRef<Net | null>(null);
  const sentWaves = useRef(new Map<string, number>());

  const [status, setStatus] = useState<NetStatus>('idle');
  const [parked, setParked] = useState(false);
  const [milestone, setMilestone] = useState<number | null>(null);
  const [waveCard, setWaveCard] = useState<WaveCardContent | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [backFrom, setBackFrom] = useState<WaveBack | null>(null);

  const { status: geo, fix } = usePosition(identity !== null);
  const spectator = geo === 'denied' || geo === 'unavailable';

  /**
   * Milestones are personal and local: no leaderboard, nothing to compare against
   * (brief 4.3). Raised from the event that caused them rather than from an effect watching
   * the counter, so it fires exactly once per wave.
   */
  const celebrate = useCallback((): void => {
    const reached = claimMilestone(getSelfWaves());
    if (reached === null) return;
    setMilestone(reached);
    play('milestone');
    window.setTimeout(() => setMilestone(null), 5_000);
  }, [claimMilestone]);

  // --- The wave, in both directions -------------------------------------------------
  const onServerMsg = useCallback(
    (msg: ServerMsg): void => {
      applyServerMsg(msg);
      if (msg.t === 'wave') {
        const sentAt = sentWaves.current.get(msg.from.id);
        const isWaveBack = sentAt !== undefined && Date.now() - sentAt < WAVE_BACK_WINDOW_MS;
        rendererRef.current?.addWave({ kind: 'received', fromId: msg.from.id, toId: null });
        play('received');
        bumpSelfWaves();
        celebrate();
        const at = Date.now();
        setWaveCard({ id: at, model: msg.from.model, colour: msg.from.colour, back: isWaveBack });
        setFlashId(at);
        // A nod you did not start is one you can return. One you did start is already done.
        setBackFrom(
          isWaveBack
            ? null
            : { id: msg.from.id, model: msg.from.model, colour: msg.from.colour, at },
        );
      }
      if (msg.t === 'waved') {
        if (msg.ok) {
          bumpSelfWaves();
          celebrate();
        } else {
          sentWaves.current.delete(msg.to);
          const why =
            msg.reason === 'range'
              ? copy.wave.tooFar
              : msg.reason === 'offline'
                ? copy.wave.offline
                : msg.reason === 'rate'
                  ? copy.wave.tooSoon
                  : copy.wave.hidden;
          showToast(why);
        }
      }
    },
    [showToast, celebrate, copy, rendererRef],
  );

  const wave = useCallback(
    (id: string): void => {
      // To the hub that owns the target's cell and no other (ADR-0007, amended): the others
      // would refuse it, and once they each accepted it, which counted and chimed it twice.
      const cell = getCar(id)?.cell;
      const sent = netRef.current?.send({ t: 'wave', to: id }, cell ? hubOf(cell) : undefined);
      if (!sent) {
        showToast(copy.wave.offline);
        return;
      }
      sentWaves.current.set(id, Date.now());
      rendererRef.current?.addWave({ kind: 'sent', fromId: null, toId: id });
      play('sent');
    },
    [showToast, copy, rendererRef],
  );

  // The flash unmounts itself; the "wave back" offer outlives the button's window by nothing.
  useEffect(() => {
    if (flashId === null) return;
    const timer = window.setTimeout(() => setFlashId(null), 1_000);
    return () => window.clearTimeout(timer);
  }, [flashId]);
  useEffect(() => {
    if (!backFrom) return;
    const timer = window.setTimeout(() => setBackFrom(null), WAVE_PROMPT_TTL_MS);
    return () => window.clearTimeout(timer);
  }, [backFrom]);

  /*
   * --- Connection ---------------------------------------------------------------------
   *
   * Keyed on who you are, not on what you are driving. Changing your paint used to replace the
   * identity object, which tore the socket down, cleared the world and re-fuzzed the position:
   * the map blinked and everyone around you saw you leave and come back. Profile changes go
   * down the open socket instead, as a fresh `hello`.
   */
  const identityId = identity?.id;
  useEffect(() => {
    if (!identityId) return;
    const net = createNet({
      onMessage: onServerMsg,
      onStatus: setStatus,
      onCellsDropped: dropCells,
      onCells: setSubscribedCells,
      onParked: setParked,
    });
    netRef.current = net;
    resetWorld(identityId);
    net.start({
      secret: profileRef.current?.secret ?? '',
      model: profileRef.current?.model ?? '3',
      colour: profileRef.current?.colour ?? 'pearl',
      spectator,
      ...(profileRef.current?.nick === undefined ? {} : { nick: profileRef.current.nick }),
    });
    return () => {
      net.stop();
      netRef.current = null;
      setParked(false);
    };
  }, [identityId, spectator, onServerMsg]);

  // What you are driving, pushed down the socket that is already open.
  useEffect(() => {
    if (!identity) return;
    netRef.current?.setProfile({
      secret: identity.secret,
      model: identity.model,
      colour: identity.colour,
      spectator,
      ...(identity.nick === undefined ? {} : { nick: identity.nick }),
    });
  }, [identity, spectator]);

  /**
   * Wall-clock heartbeat. The render loop expires cars, but a hidden tab gets no animation
   * frames at all, so a phone put in a pocket used to come back showing drivers who had left
   * minutes earlier. An interval keeps firing (throttled, but firing) while hidden.
   */
  useEffect(() => {
    if (!identity) return;
    const beat = window.setInterval(() => {
      if (pruneExpired() > 0 || document.visibilityState === 'visible') refreshSummary();
    }, 5_000);
    return () => clearInterval(beat);
  }, [identity]);

  useEffect(() => {
    netRef.current?.setHidden(!prefs.sharing);
  }, [prefs.sharing]);

  useEffect(() => {
    setMuted(prefs.muted);
  }, [prefs.muted]);

  // Anonymous frame timings, only while the driver has said yes (ADR-0027).
  useEffect(() => {
    if (!identity || !prefs.perfBeacon) return;
    return startBeacon();
  }, [identity, prefs.perfBeacon]);

  // The fix goes out exactly as the device gave it (ADR-0024). Your own sprite is smoothed
  // between fixes; distances are measured from the fix itself, which is what the hub holds.
  useEffect(() => {
    if (!fix) return;
    const reported = { lat: fix.lat, lng: fix.lng, heading: fix.heading, speed: fix.speed };
    setSelfPlacement(reported);
    setSelfReported(reported);
    netRef.current?.update(reported);
  }, [fix]);

  // Spectators have no position of their own, so start the camera where the request came from.
  useEffect(() => {
    if (!spectator || !identity) return;
    let cancelled = false;
    void fetch('/api/whereami')
      .then((res) =>
        res.ok ? (res.json() as Promise<{ lat: number | null; lng: number | null }>) : null,
      )
      .then((body) => {
        if (cancelled || !body?.lat || !body.lng) return;
        setSelfPlacement({ lat: body.lat, lng: body.lng, heading: 0, speed: 0 });
        setSelfReported({ lat: body.lat, lng: body.lng });
        netRef.current?.update({ lat: body.lat, lng: body.lng, heading: 0, speed: 0 });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [spectator, identity]);

  const dismissWaveCard = useCallback((): void => setWaveCard(null), []);

  return {
    status,
    spectator,
    parked,
    milestone,
    waveCard,
    dismissWaveCard,
    flashId,
    backFrom,
    wave,
  };
}
