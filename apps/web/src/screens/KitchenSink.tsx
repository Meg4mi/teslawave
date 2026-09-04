import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CAR_COLOURS, TESLA_MODELS, type TeslaModel } from '@teslawave/protocol';
import { createRenderer, type Renderer } from '../overlay/renderer';
import { createTrack, pushSample } from '@teslawave/protocol';
import { Button, Counter, Toast, type ToastContent } from '../ui/primitives';
import { CarChip } from '../ui/CarChip';
import { COPY } from '../ui/copy';
import { play, unlockAudio } from '../ui/sound';
import type { RenderCar } from '../sim/world';
import '../app/app.css';
import '../screens/sheets.css';

/**
 * Development only. Every signature moment on demand, plus the whole sprite matrix, so the
 * animation timings can be judged side by side instead of one at a time on a motorway.
 */
export function KitchenSink(): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [waves, setWaves] = useState(9);
  const [toast, setToast] = useState<ToastContent | null>(null);
  const [milestone, setMilestone] = useState<number | null>(null);
  const [nearby, setNearby] = useState(true);
  const chipSize = Number(new URLSearchParams(location.search).get('size') ?? 44);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const renderer = createRenderer(canvas);
    rendererRef.current = renderer;

    const now = Date.now();
    const cars: RenderCar[] = TESLA_MODELS.map((model, i) => {
      const track = createTrack();
      const lat = 46.2 + i * 0.0006;
      pushSample(track, { lat, lng: 6.14, heading: 40 + i * 60, speed: 60, ts: now }, now);
      return {
        id: `demo-${model}`,
        model,
        colour: CAR_COLOURS[i % CAR_COLOURS.length]?.id ?? 'red',
        waves: i,
        since: now,
        cell: 'u0hq',
        track,
        trail: Array.from({ length: 20 }, (_, k) => ({
          lat: lat - k * 0.00012,
          lng: 6.14 - k * 0.00008,
          at: performance.now() - k * 900,
        })),
        appearedAt: performance.now(),
        lastServerTs: now,
        placement: { lat, lng: 6.14, heading: 40 + i * 60, speed: 60 },
        distanceM: 100 + i * 40,
      };
    });

    // A flat projection is enough to judge motion and timing.
    const project = (lng: number, lat: number): { x: number; y: number } => ({
      x: width / 2 + (lng - 6.14) * 90_000,
      y: height / 2 - (lat - 46.2) * 130_000,
    });

    let raf = 0;
    const frame = (t: number): void => {
      raf = requestAnimationFrame(frame);
      renderer.render(
        t,
        project,
        {
          cars,
          self: { lat: 46.1994, lng: 6.14, heading: 0, model: '3', colour: 'pearl' },
          nearbyId: nearby ? 'demo-Y' : null,
          selectedId: null,
          trails: true,
          ambient: false,
          bearing: 0,
        },
        dpr,
      );
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [nearby]);

  const fire = (kind: 'sent' | 'received' | 'back' | 'milestone' | 'sonar'): void => {
    unlockAudio();
    const renderer = rendererRef.current;
    if (kind === 'sonar') return renderer?.playSonar();
    if (kind === 'sent') {
      renderer?.addFlight({ fromId: null, toId: 'demo-Y', ms: 400 });
      renderer?.addRipple({ lat: 0, lng: 0, followId: 'demo-Y', ms: 900, rings: 3, colour: '#6ee7ff' });
      play('sent');
      setWaves((n) => n + 1);
      return;
    }
    if (kind === 'received' || kind === 'back') {
      renderer?.addRipple({ lat: 0, lng: 0, followId: 'demo-3', ms: 900, rings: 3, colour: '#ffd08a' });
      play('received');
      setWaves((n) => n + 1);
      setToast({
        id: Date.now(),
        text: kind === 'back' ? COPY.wave.back : COPY.wave.received('3', 'ultrared'),
        icon: <CarChip model="3" colour="ultrared" size={28} />,
        warm: true,
      });
      return;
    }
    play('milestone');
    setMilestone(10);
    setTimeout(() => setMilestone(null), 5_000);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-0)', overflow: 'auto' }}>
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />

      <div style={{ position: 'relative', padding: 'var(--edge)', display: 'grid', gap: 16 }}>
        <h1 className="onboarding__title">Kitchen sink</h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Button onClick={() => fire('sonar')}>Boot sonar</Button>
          <Button onClick={() => fire('sent')}>Wave sent</Button>
          <Button onClick={() => fire('received')}>Wave received</Button>
          <Button onClick={() => fire('back')}>Waved back</Button>
          <Button onClick={() => fire('milestone')}>Milestone</Button>
          <Button onClick={() => setNearby((v) => !v)}>
            {nearby ? 'Hide wave button' : 'Show wave button'}
          </Button>
        </div>

        <p className="hud__row">
          Waves <Counter value={waves} celebrate />
        </p>

        {/* ?size=160 blows the matrix up for judging silhouettes; 44 is what ships. */}
        <div data-sprite-matrix style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TESLA_MODELS.map((model: TeslaModel) =>
            CAR_COLOURS.map((colour) => (
              <CarChip
                key={`${model}-${colour.id}`}
                model={model}
                colour={colour.id}
                size={chipSize}
              />
            )),
          )}
        </div>
      </div>

      {nearby ? (
        <button type="button" className="wave" onClick={() => fire('sent')}>
          {COPY.wave.prompt('Y', 'deepblue')}
          <span className="wave__countdown" aria-hidden />
        </button>
      ) : null}

      {milestone !== null ? (
        <div className="milestone">
          <span className="milestone__count num">{milestone}</span>
          <span>{COPY.milestones[milestone]}</span>
        </div>
      ) : null}

      <Toast toast={toast} onDone={() => setToast(null)} />
    </div>
  );
}
