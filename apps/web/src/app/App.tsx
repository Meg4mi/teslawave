import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  WAVE_BACK_WINDOW_MS,
  WAVE_PROMPT_TTL_MS,
  isColourId,
  isModel,
  type ServerMsg,
  type TeslaModel,
} from '@teslawave/protocol';
import { LiveMap } from '../map/LiveMap';
import { createNet, type Net, type NetStatus } from '../net/sockets';
import { usePosition } from '../geo/usePosition';
import {
  applyServerMsg,
  bumpSelfWaves,
  dropCells,
  getCar,
  getSelfWaves,
  getSummary,
  pruneExpired,
  refreshSummary,
  resetWorld,
  setSelfPlacement,
  setSelfReported,
  setSubscribedCells,
  subscribeSummary,
} from '../sim/world';
import { newId, useIdentity } from '../identity/store';
import { play, setMuted, unlockAudio } from '../ui/sound';
import { ControlButton, Toast, type ToastContent } from '../ui/primitives';
import {
  EyeIcon,
  EyeOffIcon,
  NorthUpIcon,
  SettingsIcon,
  SoundOffIcon,
  SoundOnIcon,
  TrackUpIcon,
} from '../ui/icons';
import { useCopy } from '../i18n';
import { Disclaimer } from '../ui/Disclaimer';
import { Onboarding, type OnboardingResult } from '../screens/Onboarding';
import { Hud } from '../screens/Hud';
import { WaveButton, type WaveTarget } from '../screens/WaveButton';
import { WaveCard, type WaveCardContent } from '../screens/WaveCard';
import { CarCard } from '../screens/CarCard';
import { PulseSheet } from '../screens/PulseSheet';
import { SettingsSheet } from '../screens/SettingsSheet';
import { EnterCodeSheet, ShowPairingSheet } from '../screens/Pairing';
import { GarageSheet, type CarEdit } from '../screens/GarageSheet';
import { HowToWave } from '../screens/HowToWave';
import type { Renderer } from '../overlay/renderer';
import { installTestHook } from './testHook';
import { isE2E } from '../config/env';
import './app.css';
import '../screens/sheets.css';

type SheetName = 'settings' | 'pulse' | 'pair-show' | 'pair-enter' | 'how-to' | 'garage' | null;

const BOOT_KEY = 'tw.booted';

export function App(): ReactNode {
  const copy = useCopy();
  const { identity, prefs, setIdentity, setPrefs, claimMilestone } = useIdentity();
  // Read by the connection effect, which must not re-run when the car changes.
  const profileRef = useRef(identity);
  useEffect(() => {
    profileRef.current = identity;
  });
  const [status, setStatus] = useState<NetStatus>('idle');
  const [sheet, setSheet] = useState<SheetName>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastContent | null>(null);
  const [milestone, setMilestone] = useState<number | null>(null);
  const [waveCard, setWaveCard] = useState<WaveCardContent | null>(null);
  /** The edge flash of a received wave: a keyed element that lives for under a second. */
  const [flashId, setFlashId] = useState<number | null>(null);
  /**
   * Who waved at you last, unprompted, and is still around: the wave button comes back for
   * them as "Wave back", whatever the summary thinks the closest car is.
   */
  const [backFrom, setBackFrom] = useState<{
    id: string;
    model: TeslaModel;
    colour: string;
    at: number;
  } | null>(null);
  const [tiles, setTiles] = useState(true);
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const netRef = useRef<Net | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const sentWaves = useRef(new Map<string, number>());
  const toastId = useRef(0);

  const summary = useSyncExternalStore(subscribeSummary, getSummary, getSummary);

  useEffect(() => {
    if (isE2E()) installTestHook();
  }, []);

  /*
   * Rough position from the request, before anyone has granted anything. It centres the map
   * that sits behind onboarding, so the first screen is the place you are about to be rather
   * than a black form, and so "Go" drops your car onto a map you were already looking at.
   */
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/whereami')
      .then((res) =>
        res.ok ? (res.json() as Promise<{ lat: number | null; lng: number | null }>) : null,
      )
      .then((body) => {
        if (!cancelled && body?.lat && body.lng) setOrigin({ lat: body.lat, lng: body.lng });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const { status: geo, fix } = usePosition(identity !== null);
  const spectator = geo === 'denied' || geo === 'unavailable';

  const showToast = useCallback((text: string, icon?: ReactNode, warm = false): void => {
    toastId.current += 1;
    setToast({ id: toastId.current, text, ...(icon ? { icon } : {}), warm });
  }, []);

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
    [showToast, celebrate, copy],
  );

  const wave = useCallback((id: string): void => {
    sentWaves.current.set(id, Date.now());
    netRef.current?.send({ t: 'wave', to: id });
    rendererRef.current?.addWave({ kind: 'sent', fromId: null, toId: id });
    play('sent');
    setSelectedId(null);
  }, []);

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
    });
    netRef.current = net;
    resetWorld(identityId);
    net.start({
      id: identityId,
      model: profileRef.current?.model ?? '3',
      colour: profileRef.current?.colour ?? 'pearl',
      spectator,
      ...(profileRef.current?.nick === undefined ? {} : { nick: profileRef.current.nick }),
    });
    return () => {
      net.stop();
      netRef.current = null;
    };
  }, [identityId, spectator, onServerMsg]);

  // What you are driving, pushed down the socket that is already open.
  useEffect(() => {
    if (!identity) return;
    netRef.current?.setProfile({
      id: identity.id,
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

  const editCar = useCallback(
    (next: CarEdit): void => {
      const current = profileRef.current;
      if (!current) return;
      // Rebuilt rather than patched, so deleting the name actually deletes it. The new profile
      // reaches everyone around you on the socket that is already open.
      setIdentity({
        id: current.id,
        createdAt: current.createdAt,
        model: next.model,
        colour: next.colour,
        ...(next.nick === undefined ? {} : { nick: next.nick }),
      });
      setSheet(null);
      showToast(copy.garage.saved);
    },
    [setIdentity, showToast, copy],
  );

  const adopt = useCallback(
    (paired: { id: string; model: string; colour: string; nick?: string }): void => {
      if (!isModel(paired.model) || !isColourId(paired.colour)) return;
      setIdentity({
        id: paired.id,
        model: paired.model,
        colour: paired.colour,
        createdAt: Date.now(),
        ...(paired.nick === undefined ? {} : { nick: paired.nick }),
      });
      setPrefs({ sharing: true });
      setSheet(null);
      showToast(copy.pairing.done);
    },
    [setIdentity, setPrefs, showToast, copy],
  );

  // --- Pairing deep link ------------------------------------------------------------
  useEffect(() => {
    const code = new URLSearchParams(location.search).get('pair');
    if (!code) return;
    void fetch('/api/pair/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    })
      .then((res) =>
        res.ok
          ? (res.json() as Promise<{
              identity: { id: string; model: string; colour: string; nick?: string };
            }>)
          : null,
      )
      .then((body) => {
        if (body?.identity) adopt(body.identity);
        history.replaceState(null, '', location.pathname);
      })
      .catch(() => undefined);
    // Runs once on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Boot ------------------------------------------------------------------------
  const start = (result: OnboardingResult): void => {
    unlockAudio();
    setIdentity({ id: newId(), createdAt: Date.now(), ...result });
    setPrefs({ sharing: true });
    rendererRef.current?.playSonar();
  };

  // Tapping your own car on the map opens the garage: the car is the thing you edit.
  const openGarage = useCallback((): void => setSheet('garage'), []);

  const onMapReady = useCallback((renderer: Renderer): void => {
    rendererRef.current = renderer;
    try {
      if (!sessionStorage.getItem(BOOT_KEY)) {
        renderer.playSonar();
        sessionStorage.setItem(BOOT_KEY, '1');
      }
    } catch {
      renderer.playSonar();
    }
  }, []);

  const selected = selectedId ? getCar(selectedId) : undefined;
  const nearby = useMemo(
    () => (prefs.sharing && !spectator ? summary.nearby : null),
    [summary.nearby, prefs.sharing, spectator],
  );
  // The car that just waved at you takes the button over while it is still on the map. Not
  // memoised: the button is built to take a fresh object every render, and whether they are
  // still on the map is a question for the world, which the summary re-renders us for.
  const waveTarget: WaveTarget | null =
    backFrom && prefs.sharing && !spectator && getCar(backFrom.id)
      ? { ...backFrom, back: true, prompt: backFrom.at }
      : nearby;
  // Stable while the car is: the map re-renders twice a second for the HUD, and a fresh
  // object here re-ran the map's prop effect on every one of those.
  const selfModel = identity?.model;
  const selfColour = identity?.colour;
  const selfCar = useMemo(
    () => (selfModel && selfColour ? { model: selfModel, colour: selfColour } : null),
    [selfModel, selfColour],
  );

  // Onboarding is a card over the live map, not a separate black screen: same place, same
  // materials, and tapping Go drops your car onto the map already in front of you.
  if (!identity)
    return (
      <>
        <LiveMap
          northUp
          bare
          selectedId={null}
          nearbyId={null}
          self={null}
          origin={origin}
          onSelect={() => undefined}
          onReady={onMapReady}
          onTiles={setTiles}
        />
        <Onboarding
          onGo={start}
          onHaveCode={() => setSheet('pair-enter')}
          onHowItWorks={() => setSheet('how-to')}
        />
        {sheet === 'how-to' ? <HowToWave onClose={() => setSheet(null)} /> : null}
        {sheet === 'pair-enter' ? (
          <EnterCodeSheet onPaired={adopt} onClose={() => setSheet(null)} />
        ) : null}
      </>
    );

  return (
    <>
      <LiveMap
        northUp={prefs.northUp}
        selectedId={selectedId}
        nearbyId={nearby?.id ?? null}
        self={selfCar}
        origin={origin}
        onSelect={setSelectedId}
        onSelectSelf={openGarage}
        onReady={onMapReady}
        onTiles={setTiles}
      />

      <Hud
        summary={summary}
        status={status}
        onOpenPulse={() => setSheet('pulse')}
        onHowItWorks={() => setSheet('how-to')}
      />

      {/* Notices sit at the foot, centred, one above the other if there are two. */}
      {spectator ? (
        <div className="hud hud--foot">
          <p className="hud__banner">{copy.map.spectator}</p>
        </div>
      ) : null}
      {status === 'budget' ? (
        <div className="hud hud--foot">
          <p className="hud__banner">{copy.map.budget('02:00')}</p>
        </div>
      ) : null}
      {status === 'paused' ? (
        <div className="hud hud--foot">
          <p className="hud__banner">{copy.map.paused}</p>
        </div>
      ) : null}
      {!tiles ? (
        <div className="hud hud--foot">
          <p className="hud__banner">{copy.map.tilesOffline}</p>
        </div>
      ) : null}

      {/* Labelled, not cryptic: on a touch screen there is no hover, so a tooltip would
          never appear. Each control says what it does and what state it is in. */}
      <nav className="controls" aria-label={copy.controls.settings}>
        <ControlButton
          label={prefs.sharing ? copy.controls.visible : copy.controls.invisible}
          title={prefs.sharing ? copy.controls.goInvisible : copy.controls.goVisible}
          active={!prefs.sharing}
          icon={prefs.sharing ? <EyeIcon /> : <EyeOffIcon />}
          onClick={() => setPrefs({ sharing: !prefs.sharing })}
        />
        <ControlButton
          label={prefs.muted ? copy.controls.muted : copy.controls.sound}
          title={prefs.muted ? copy.controls.unmute : copy.controls.mute}
          active={prefs.muted}
          icon={prefs.muted ? <SoundOffIcon /> : <SoundOnIcon />}
          onClick={() => setPrefs({ muted: !prefs.muted })}
        />
        <ControlButton
          label={prefs.northUp ? copy.controls.northUp : copy.controls.trackUp}
          title={prefs.northUp ? copy.controls.orientationNorth : copy.controls.orientation}
          active={prefs.northUp}
          icon={prefs.northUp ? <NorthUpIcon /> : <TrackUpIcon />}
          onClick={() => setPrefs({ northUp: !prefs.northUp })}
        />
        <ControlButton
          label={copy.controls.settings}
          title={copy.controls.settings}
          icon={<SettingsIcon />}
          onClick={() => setSheet('settings')}
        />
      </nav>

      <WaveButton target={waveTarget} onWave={wave} />

      {flashId !== null ? <div key={flashId} className="wave-flash" aria-hidden /> : null}
      <WaveCard card={waveCard} onDone={() => setWaveCard(null)} />

      {milestone !== null ? (
        <div className="milestone" role="status">
          <span className="milestone__count num">{milestone}</span>
          <span>{copy.milestones[milestone]}</span>
        </div>
      ) : null}

      <Toast key={toast?.id ?? 'none'} toast={toast} onDone={() => setToast(null)} />

      {selected ? (
        <CarCard
          car={selected}
          serverNow={summary.serverNow}
          onWave={wave}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
      {sheet === 'pulse' ? <PulseSheet summary={summary} onClose={() => setSheet(null)} /> : null}
      {sheet === 'settings' ? (
        <SettingsSheet
          identity={identity}
          prefs={prefs}
          onChange={setPrefs}
          onShowPairing={() => setSheet('pair-show')}
          onEnterCode={() => setSheet('pair-enter')}
          onHowItWorks={() => setSheet('how-to')}
          onEditCar={() => setSheet('garage')}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === 'garage' && identity ? (
        <GarageSheet car={identity} onSave={editCar} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === 'pair-show' && identity ? (
        <ShowPairingSheet identity={identity} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === 'pair-enter' ? (
        <EnterCodeSheet onPaired={adopt} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === 'how-to' ? <HowToWave onClose={() => setSheet(null)} /> : null}

      <Disclaimer />
    </>
  );
}
