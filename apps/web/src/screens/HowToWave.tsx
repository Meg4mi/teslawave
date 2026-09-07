import { useEffect, useRef, type ReactNode } from 'react';
import { createTrack } from '@teslawave/protocol';
import { Button, Sheet, SheetActions } from '../ui/primitives';
import { useCopy } from '../i18n';
import { createRenderer, type Renderer } from '../overlay/renderer';
import type { RenderCar } from '../sim/world';
import { play, unlockAudio } from '../ui/sound';
import './how-to-wave.css';

const CYCLE_MS = 8_000;
/** Where in the loop you wave, and where they wave back. */
const SENT_AT = 0.42;
const BACK_AT = 0.66;
/** How long they take to wave back when you press the button yourself. */
const REPLY_MS = 1_400;

/**
 * The whole product is one gesture, and until now you could only discover it by happening to
 * drive past another user. On a quiet road that is never. So here it is, played out: two cars
 * closing, the button appearing, your wave landing, theirs coming back. It loops, and the
 * Wave button in it is real enough to press.
 *
 * The cars and the waves are drawn by the map's own renderer on a canvas over a hand-drawn
 * road, so what this shows is what the map does, to the frame: the sheet used to keep its
 * own three little rings, and they stopped resembling the real thing the first time the real
 * thing changed (ADR-0022).
 */
export function HowToWave({ onClose }: { onClose: () => void }): ReactNode {
  const copy = useCopy();
  const roadRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const replyTimer = useRef(0);

  useEffect(() => {
    const road = roadRef.current;
    const stage = stageRef.current;
    if (!road || !stage) return;
    const roadCtx = road.getContext('2d');
    if (!roadCtx) return;
    const renderer = createRenderer(stage);
    rendererRef.current = renderer;

    // Screen pixels are the "map" here: the projector is the identity, so the car's
    // placement is its position on the stage and nothing needs a real coordinate.
    const project = (lng: number, lat: number): { x: number; y: number } => ({ x: lng, y: lat });
    const theirs: RenderCar = {
      id: 'demo',
      model: 'Y',
      colour: 'deepblue',
      waves: 0,
      since: 0,
      cell: '',
      hub: 'u0',
      track: createTrack(),
      trail: [],
      // Long ago, so the renderer never plays its "someone appears" ring for them.
      appearedAt: -1e12,
      lastServerTs: 0,
      placement: { lat: 0, lng: 0, heading: 180, speed: 0 },
      distanceM: 0,
    };

    let raf = 0;
    const started = performance.now();
    let sentInCycle = -1;
    let backInCycle = -1;

    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const dpr = window.devicePixelRatio;
      const width = road.clientWidth;
      const height = road.clientHeight;
      for (const canvas of [road, stage]) {
        if (canvas.width !== Math.round(width * dpr)) {
          canvas.width = Math.round(width * dpr);
          canvas.height = Math.round(height * dpr);
        }
      }

      const elapsed = now - started;
      const cycle = Math.floor(elapsed / CYCLE_MS);
      const t = (elapsed % CYCLE_MS) / CYCLE_MS;
      // A fixed-width road down the middle: stretched across a 17" screen it stops reading
      // as a road at all.
      const roadWidth = Math.min(230, width * 0.5);
      const centre = width / 2;
      const mine = { x: centre - roadWidth * 0.26, y: height * 0.68 };
      const approach = Math.min(1, t / 0.34);
      const theirsAt = { x: centre + roadWidth * 0.26, y: height * (-0.12 + approach * 0.66) };
      const close = t >= 0.34;

      roadCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      roadCtx.clearRect(0, 0, width, height);
      roadCtx.fillStyle = 'rgba(58, 69, 87, 0.35)';
      roadCtx.fillRect(centre - roadWidth / 2, 0, roadWidth, height);
      roadCtx.strokeStyle = 'rgba(122, 140, 168, 0.5)';
      roadCtx.lineWidth = 1.5;
      for (const x of [centre - roadWidth / 2, centre + roadWidth / 2]) {
        roadCtx.beginPath();
        roadCtx.moveTo(x, 0);
        roadCtx.lineTo(x, height);
        roadCtx.stroke();
      }
      // Scrolling dashes: the cheapest possible way to say "these cars are moving".
      roadCtx.strokeStyle = 'rgba(160, 178, 202, 0.45)';
      roadCtx.setLineDash([12, 16]);
      roadCtx.lineDashOffset = -((now / 12) % 28);
      roadCtx.beginPath();
      roadCtx.moveTo(centre, 0);
      roadCtx.lineTo(centre, height);
      roadCtx.stroke();
      roadCtx.setLineDash([]);

      theirs.placement = { lat: theirsAt.y, lng: theirsAt.x, heading: 180, speed: 0 };

      // Once per loop: you wave, and a little later they wave back. Pressing the button
      // below fires the same two, whenever you like.
      if (close && sentInCycle !== cycle && t >= SENT_AT) {
        sentInCycle = cycle;
        renderer.addWave({ kind: 'sent', fromId: null, toId: 'demo' });
      }
      if (backInCycle !== cycle && t >= BACK_AT) {
        backInCycle = cycle;
        renderer.addWave({ kind: 'received', fromId: 'demo', toId: null });
      }

      renderer.render(
        now,
        project,
        {
          cars: [theirs],
          self: { lat: mine.y, lng: mine.x, heading: 0, model: '3', colour: 'pearl' },
          nearbyId: close ? 'demo' : null,
          selectedId: null,
          trails: false,
          ambient: false,
          bearing: 0,
          // Sprites at their largest: this is a diagram, not a map at speed.
          zoom: 18,
        },
        dpr,
      );
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(replyTimer.current);
      rendererRef.current = null;
    };
  }, []);

  const tryIt = (): void => {
    unlockAudio();
    play('sent');
    rendererRef.current?.addWave({ kind: 'sent', fromId: null, toId: 'demo' });
    window.clearTimeout(replyTimer.current);
    replyTimer.current = window.setTimeout(() => {
      play('received');
      rendererRef.current?.addWave({ kind: 'received', fromId: 'demo', toId: null });
    }, REPLY_MS);
  };

  return (
    <Sheet label={copy.howTo.title} title={copy.howTo.title} onClose={onClose}>
      <p className="sheet__note">{copy.howTo.lead}</p>

      <div className="howto__stage" aria-hidden>
        <canvas className="howto__layer" ref={roadRef} />
        <canvas className="howto__layer" ref={stageRef} />
      </div>

      <ol className="howto__steps">
        {copy.howTo.steps.map((step) => (
          <li key={step}>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="settings__hint">{copy.howTo.tapHint}</p>

      <SheetActions>
        <Button variant="ghost" onClick={onClose}>
          {copy.howTo.close}
        </Button>
        <Button variant="primary" onClick={tryIt}>
          {copy.howTo.tryIt}
        </Button>
      </SheetActions>
    </Sheet>
  );
}
