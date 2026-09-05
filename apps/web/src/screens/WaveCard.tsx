import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { TeslaModel } from '@teslawave/protocol';
import { describeCar } from '@teslawave/protocol';
import { CarSvg } from '../ui/CarSvg';
import { COPY } from '../ui/copy';

export type WaveCardContent = { id: number; model: TeslaModel; colour: string; back: boolean };

/** On screen for this long, then the exit animation in app.css. */
const SHOW_MS = 4_000;
const LEAVE_MS = 300;

/**
 * The card a received wave raises: the other car, large, in its real paint, and two words.
 * It replaced a 56 px toast with 15 px type, which nobody driving a car ever read. It sits at
 * the top of the screen, clear of the wave button and the milestone card at the bottom, so
 * the first wave you ever receive (which raises both) does not stack three things.
 *
 * Timers are keyed on which card this is and nothing else, for the reason the toast's are:
 * the parent re-renders twice a second and must not restart them.
 */
export function WaveCard({
  card,
  onDone,
}: {
  card: WaveCardContent | null;
  onDone: () => void;
}): ReactNode {
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  const [leavingId, setLeavingId] = useState<number | null>(null);
  const id = card?.id ?? null;

  useEffect(() => {
    if (id === null) return;
    const hide = setTimeout(() => setLeavingId(id), SHOW_MS);
    const finish = setTimeout(() => done.current(), SHOW_MS + LEAVE_MS);
    return () => {
      clearTimeout(hide);
      clearTimeout(finish);
    };
  }, [id]);

  if (!card) return null;
  const leaving = leavingId === card.id;
  // A live region reads its text, so the two lines are left readable: "blue Model Y waved
  // at you" is the sentence, and the drawing is decoration.
  return (
    <div className={`wave-card ${leaving ? 'wave-card--leaving' : ''}`.trim()} role="status">
      <span className="wave-card__car" aria-hidden>
        <CarSvg model={card.model} colour={card.colour} size={96} heading={90} />
      </span>
      <span className="wave-card__text">
        <span className="wave-card__who">{describeCar(card.model, card.colour)}</span>
        <span className="wave-card__what">
          {card.back ? COPY.wave.cardBackTitle : COPY.wave.cardTitle}
        </span>
      </span>
    </div>
  );
}
