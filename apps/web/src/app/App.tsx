import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { isColourId, isModel, isSecret, isStatusId, type ReportKind } from '@teslawave/protocol';
import { LiveMap } from '../map/LiveMap';
import { nextResetLabel } from '../net/budget';
import { usePulse } from '../net/usePulse';
import { getCar, getReport, getSummary, subscribeSummary } from '../sim/world';
import { identityFrom, newSecret, useIdentity } from '../identity/store';
import { play, unlockAudio } from '../ui/sound';
import { speak } from '../ui/voice';
import { ControlButton, Toast, type ToastContent } from '../ui/primitives';
import {
  BadgeIcon,
  EyeIcon,
  EyeOffIcon,
  NorthUpIcon,
  ReportIcon,
  SettingsIcon,
  SoundOffIcon,
  SoundOnIcon,
  TrackUpIcon,
  WarningIcon,
} from '../ui/icons';
import { useCopy } from '../i18n';
import { Disclaimer } from '../ui/Disclaimer';
import { Onboarding, type OnboardingResult } from '../screens/Onboarding';
import { Hud } from '../screens/Hud';
import { WaveButton, type WaveTarget } from '../screens/WaveButton';
import { WaveCard } from '../screens/WaveCard';
import { CarCard } from '../screens/CarCard';
import { PulseSheet } from '../screens/PulseSheet';
import { ShareSheet } from '../screens/ShareSheet';
import { SettingsSheet } from '../screens/SettingsSheet';
import { EnterCodeSheet, ShowPairingSheet } from '../screens/Pairing';
import { GarageSheet, type CarEdit } from '../screens/GarageSheet';
import { HowToWave } from '../screens/HowToWave';
import { ReportSheet } from '../screens/ReportSheet';
import { ReportCard } from '../screens/ReportCard';
import type { Renderer } from '../overlay/renderer';
import { installTestHook } from './testHook';
import { useSession } from './useSession';
import { useDocumentMeta } from './meta';
import { isE2E } from '../config/env';
import './app.css';
import '../screens/sheets.css';

type SheetName =
  | 'settings'
  | 'pulse'
  | 'pair-show'
  | 'pair-enter'
  | 'how-to'
  | 'garage'
  | 'share'
  | 'report'
  | null;

const BOOT_KEY = 'tw.booted';

type Paired = {
  secret: string;
  model: string;
  colour: string;
  nick?: string;
  status?: string;
  statusText?: string;
};

/**
 * The screens, and what opens them. Everything between the driver and the hub — the socket,
 * the position feed, the wave, the parking clock — lives in `useSession`; this file decides
 * what is on the screen.
 */
export function App(): ReactNode {
  const copy = useCopy();
  useDocumentMeta(copy.seo.title, copy.seo.description);
  const { identity, prefs, setIdentity, setPrefs, claimMilestone } = useIdentity();
  const [sheet, setSheet] = useState<SheetName>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastContent | null>(null);
  const [tiles, setTiles] = useState(true);
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const toastId = useRef(0);
  /** Reports already announced, by id: each is said once, however long it stays close. */
  const announced = useRef(new Set<string>());

  const summary = useSyncExternalStore(subscribeSummary, getSummary, getSummary);

  const showToast = useCallback((text: string, icon?: ReactNode, warm = false): void => {
    toastId.current += 1;
    setToast({ id: toastId.current, text, ...(icon ? { icon } : {}), warm });
  }, []);

  // Asked once, from the rough position the request itself carries, and only while the first
  // screen is up: after Go the HUD has the real numbers off the socket.
  const pulse = usePulse(identity ? null : origin);

  const session = useSession({ identity, prefs, claimMilestone, rendererRef, showToast });
  const { status, spectator, parked, wave: sendWave } = session;

  /*
   * A report coming within range is said once: a toast with its pin, the chime, and the
   * voice. Keyed on the report's id, so the line at the foot of the screen can keep counting
   * the metres down without this firing again, and a pin you drive past twice is one alert.
   */
  const alertId = summary.alert?.id ?? null;
  useEffect(() => {
    const alert = summary.alert;
    if (!alert || alertId === null || announced.current.has(alertId)) return;
    announced.current.add(alertId);
    const icon = alert.kind === 'police' ? <BadgeIcon size={22} /> : <WarningIcon size={22} />;
    showToast(copy.report.nearby(alert.kind, alert.distanceM), icon, true);
    play('received');
    speak(copy.voice.report(alert.kind, alert.distanceM));
    // Only a new id is a new alert; the distance on it is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertId]);

  const report = useCallback(
    (kind: ReportKind): void => {
      setSheet(null);
      session.report(kind);
    },
    [session],
  );

  // The card asked a question and the tap answered it: it closes, as the wave button does.
  const voteOnReport = useCallback(
    (there: boolean): void => {
      if (!selectedReportId) return;
      session.confirm(selectedReportId, there);
      setSelectedReportId(null);
    },
    [session, selectedReportId],
  );

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

  // A wave from the button or the card closes the card: the tap was the whole point of it.
  const wave = useCallback(
    (id: string): void => {
      setSelectedId(null);
      sendWave(id);
    },
    [sendWave],
  );

  const editCar = useCallback(
    (next: CarEdit): void => {
      if (!identity) return;
      // Rebuilt rather than patched, so deleting the name actually deletes it. The new profile
      // reaches everyone around you on the socket that is already open.
      setIdentity(
        identityFrom(identity.secret, {
          createdAt: identity.createdAt,
          model: next.model,
          colour: next.colour,
          ...(next.nick === undefined ? {} : { nick: next.nick }),
          ...(next.status === undefined ? {} : { status: next.status }),
          ...(next.statusText === undefined ? {} : { statusText: next.statusText }),
        }),
      );
      setSheet(null);
      showToast(copy.garage.saved);
    },
    [identity, setIdentity, showToast, copy],
  );

  const adopt = useCallback(
    (paired: Paired): void => {
      if (!isSecret(paired.secret) || !isModel(paired.model) || !isColourId(paired.colour))
        return;
      // The car becomes the phone's driver: same secret, so the hub gives it the same id.
      setIdentity(
        identityFrom(paired.secret, {
          model: paired.model,
          colour: paired.colour,
          createdAt: Date.now(),
          ...(paired.nick === undefined ? {} : { nick: paired.nick }),
          ...(isStatusId(paired.status) ? { status: paired.status } : {}),
          ...(isStatusId(paired.status) || paired.statusText === undefined
            ? {}
            : { statusText: paired.statusText }),
        }),
      );
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
      .then((res) => (res.ok ? (res.json() as Promise<{ identity: Paired }>) : null))
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
    setIdentity(identityFrom(newSecret(), { createdAt: Date.now(), ...result }));
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
  // Looked up every render rather than held: a pin that lapses while its card is open takes
  // the card with it, which is the honest thing for a card that asks whether it is still there.
  const selectedReport = selectedReportId ? getReport(selectedReportId) : undefined;
  // No wave button while hidden, by hand or by the clock: the hub would refuse the wave.
  const canWave = prefs.sharing && !spectator && !parked;
  const nearby = useMemo(() => (canWave ? summary.nearby : null), [summary.nearby, canWave]);
  // The car that just waved at you takes the button over while it is still on the map. Not
  // memoised: the button is built to take a fresh object every render, and whether they are
  // still on the map is a question for the world, which the summary re-renders us for.
  const { backFrom } = session;
  const waveTarget: WaveTarget | null =
    backFrom && canWave && getCar(backFrom.id)
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
          pulse={pulse}
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
        selectedReportId={selectedReportId}
        nearbyId={nearby?.id ?? null}
        self={selfCar}
        origin={origin}
        onSelect={setSelectedId}
        onSelectSelf={openGarage}
        onSelectReport={setSelectedReportId}
        onReady={onMapReady}
        onTiles={setTiles}
      />

      <Hud
        summary={summary}
        status={status}
        locating={session.locating}
        onOpenPulse={() => setSheet('pulse')}
        onHowItWorks={() => setSheet('how-to')}
      />

      {/* Notices sit at the foot, centred, one above the other if there are two. */}
      {spectator ? <Notice>{copy.map.spectator}</Notice> : null}
      {parked && prefs.sharing ? <Notice>{copy.map.parked}</Notice> : null}
      {status === 'budget' ? <Notice>{copy.map.budget(nextResetLabel())}</Notice> : null}
      {status === 'paused' ? <Notice>{copy.map.paused}</Notice> : null}
      {!tiles ? <Notice>{copy.map.tilesOffline}</Notice> : null}
      {session.upgrading ? <Notice>{copy.map.upgrading}</Notice> : null}
      {/* The report you are approaching, counting down, for as long as it is within range. */}
      {summary.alert ? (
        <Notice warm>
          {copy.report.nearby(summary.alert.kind, summary.alert.distanceM)}
          <span className="hud__banner-sub"> · {copy.report.confirmed(summary.alert.n)}</span>
        </Notice>
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
        {/* The one control that does something to the map rather than to your own screen, so
            it says what it reports and wears the warm accent rather than sitting in the
            column as one more grey toggle. A driver who has never opened it should know from
            the column alone that police and an accident can be flagged from here. */}
        <ControlButton
          label={copy.controls.report}
          sub={copy.controls.reportKinds}
          title={copy.report.control}
          icon={<ReportIcon />}
          tone="alert"
          onClick={() => setSheet('report')}
        />
        <ControlButton
          label={copy.controls.settings}
          title={copy.controls.settings}
          icon={<SettingsIcon />}
          onClick={() => setSheet('settings')}
        />
      </nav>

      <WaveButton target={waveTarget} onWave={wave} />

      {session.flashId !== null ? (
        <div key={session.flashId} className="wave-flash" aria-hidden />
      ) : null}
      <WaveCard card={session.waveCard} onDone={session.dismissWaveCard} />

      {session.milestone !== null ? (
        <div className="milestone" role="status">
          <span className="milestone__count num">{session.milestone}</span>
          <span>{copy.milestones[session.milestone]}</span>
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
      {/* A tapped pin: what it is, who says so, and the question it exists to ask. */}
      {selectedReport ? (
        <ReportCard
          report={selectedReport}
          serverNow={summary.serverNow}
          onVote={voteOnReport}
          onClose={() => setSelectedReportId(null)}
        />
      ) : null}
      {sheet === 'pulse' ? (
        <PulseSheet
          summary={summary}
          onShare={() => setSheet('share')}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === 'share' ? (
        <ShareSheet
          car={identity}
          waves={summary.selfWaves}
          onClose={() => setSheet('pulse')}
        />
      ) : null}
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
      {sheet === 'garage' ? (
        <GarageSheet car={identity} onSave={editCar} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === 'pair-show' ? (
        <ShowPairingSheet identity={identity} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === 'pair-enter' ? (
        <EnterCodeSheet onPaired={adopt} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === 'how-to' ? <HowToWave onClose={() => setSheet(null)} /> : null}
      {sheet === 'report' ? <ReportSheet onReport={report} onClose={() => setSheet(null)} /> : null}

      <Disclaimer />
    </>
  );
}

/** One line at the foot of the screen. Warm is for a report ahead: the one line to mind. */
function Notice({ children, warm = false }: { children: ReactNode; warm?: boolean }): ReactNode {
  return (
    <div className="hud hud--foot">
      <p className={`hud__banner ${warm ? 'hud__banner--warm' : ''}`.trim()} role={warm ? 'status' : undefined}>
        {children}
      </p>
    </div>
  );
}
