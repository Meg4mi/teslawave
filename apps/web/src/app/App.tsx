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
  isColourId,
  isModel,
  type ServerMsg,
} from '@teslawave/protocol';
import { LiveMap } from '../map/LiveMap';
import { createNet, type Net, type NetStatus } from '../net/sockets';
import { usePosition } from '../geo/usePosition';
import { fuzzed, resetFuzz } from '../geo/fuzz';
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
import { CarChip } from '../ui/CarChip';
import { COPY } from '../ui/copy';
import { Disclaimer } from '../ui/Disclaimer';
import { Onboarding, type OnboardingResult } from '../screens/Onboarding';
import { Hud } from '../screens/Hud';
import { WaveButton } from '../screens/WaveButton';
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
      .then((res) => (res.ok ? (res.json() as Promise<{ lat: number | null; lng: number | null }>) : null))
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
        rendererRef.current?.addRipple({
          lat: 0,
          lng: 0,
          followId: msg.from.id,
          ms: 900,
          rings: 3,
          colour: isWaveBack ? '#ffd08a' : '#ffd08a',
        });
        play('received');
        bumpSelfWaves();
        celebrate();
        showToast(
          isWaveBack ? COPY.wave.back : COPY.wave.received(msg.from.model, msg.from.colour),
          <CarChip model={msg.from.model} colour={msg.from.colour} size={28} />,
          true,
        );
      }
      if (msg.t === 'waved') {
        if (msg.ok) {
          bumpSelfWaves();
          celebrate();
          rendererRef.current?.addRipple({
            lat: 0,
            lng: 0,
            followId: msg.to,
            ms: 900,
            rings: 3,
            colour: '#6ee7ff',
          });
        } else {
          sentWaves.current.delete(msg.to);
          const why =
            msg.reason === 'range'
              ? COPY.wave.tooFar
              : msg.reason === 'offline'
                ? COPY.wave.offline
                : msg.reason === 'rate'
                  ? COPY.wave.tooSoon
                  : COPY.wave.hidden;
          showToast(why);
        }
      }
    },
    [showToast, celebrate],
  );

  const wave = useCallback((id: string): void => {
    sentWaves.current.set(id, Date.now());
    netRef.current?.send({ t: 'wave', to: id });
    rendererRef.current?.addFlight({ fromId: null, toId: id, ms: 400 });
    play('sent');
    setSelectedId(null);
  }, []);

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
    resetFuzz();
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

  // Your own car is drawn from the raw local fix; only the fuzzed one is ever sent (ADR-0012).
  useEffect(() => {
    if (!fix) return;
    setSelfPlacement({ lat: fix.lat, lng: fix.lng, heading: fix.heading, speed: fix.speed });
    const reported = fuzzed(fix);
    setSelfReported(reported);
    netRef.current?.update(reported);
  }, [fix]);

  // Spectators have no position of their own, so start the camera where the request came from.
  useEffect(() => {
    if (!spectator || !identity) return;
    let cancelled = false;
    void fetch('/api/whereami')
      .then((res) => (res.ok ? (res.json() as Promise<{ lat: number | null; lng: number | null }>) : null))
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
      showToast(COPY.garage.saved);
    },
    [setIdentity, showToast],
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
      showToast(COPY.pairing.done);
    },
    [setIdentity, setPrefs, showToast],
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
  const selfCar = identity ? { model: identity.model, colour: identity.colour } : null;

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
          <p className="hud__banner">{COPY.map.spectator}</p>
        </div>
      ) : null}
      {status === 'budget' ? (
        <div className="hud hud--foot">
          <p className="hud__banner">{COPY.map.budget('02:00')}</p>
        </div>
      ) : null}
      {status === 'paused' ? (
        <div className="hud hud--foot">
          <p className="hud__banner">{COPY.map.paused}</p>
        </div>
      ) : null}
      {!tiles ? (
        <div className="hud hud--foot">
          <p className="hud__banner">{COPY.map.tilesOffline}</p>
        </div>
      ) : null}

      {/* Labelled, not cryptic: on a touch screen there is no hover, so a tooltip would
          never appear. Each control says what it does and what state it is in. */}
      <nav className="controls" aria-label={COPY.controls.settings}>
        <ControlButton
          label={prefs.sharing ? COPY.controls.visible : COPY.controls.invisible}
          title={prefs.sharing ? COPY.controls.goInvisible : COPY.controls.goVisible}
          active={!prefs.sharing}
          icon={prefs.sharing ? <EyeIcon /> : <EyeOffIcon />}
          onClick={() => setPrefs({ sharing: !prefs.sharing })}
        />
        <ControlButton
          label={prefs.muted ? COPY.controls.muted : COPY.controls.sound}
          title={prefs.muted ? COPY.controls.unmute : COPY.controls.mute}
          active={prefs.muted}
          icon={prefs.muted ? <SoundOffIcon /> : <SoundOnIcon />}
          onClick={() => setPrefs({ muted: !prefs.muted })}
        />
        <ControlButton
          label={prefs.northUp ? COPY.controls.northUp : COPY.controls.trackUp}
          title={prefs.northUp ? COPY.controls.orientationNorth : COPY.controls.orientation}
          active={prefs.northUp}
          icon={prefs.northUp ? <NorthUpIcon /> : <TrackUpIcon />}
          onClick={() => setPrefs({ northUp: !prefs.northUp })}
        />
        <ControlButton
          label={COPY.controls.settings}
          title={COPY.controls.settings}
          icon={<SettingsIcon />}
          onClick={() => setSheet('settings')}
        />
      </nav>

      <WaveButton target={nearby} onWave={wave} />

      {milestone !== null ? (
        <div className="milestone" role="status">
          <span className="milestone__count num">{milestone}</span>
          <span>{COPY.milestones[milestone]}</span>
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
