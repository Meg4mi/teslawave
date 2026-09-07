import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { TeslaModel } from '@teslawave/protocol';
import { CarSvg } from '../ui/CarSvg';
import { useCopy } from '../i18n';

export type WaveCardContent = {
  id: number;
  model: TeslaModel;
  colour: string;
  /** What their driver called the car, if they named it. Their spelling, their capitals. */
  nick?: string;
  back: boolean;
};

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
  const copy = useCopy();
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
  const described = copy.cars.describe(card.model, card.colour);
  /*
   * A named car is named here. The name is who they are — that is the point of typing one —
   * so it takes the big line, and the car it belongs to keeps its own line underneath rather
   * than being displaced by it: at a glance across a lane you recognise the paint, not the
   * name. Without a name the card is exactly what it was.
   *
   * A live region reads the text as it stands, so the lines are left readable in order:
   * "Ghost, blue Model Y, waved at you". The drawing is decoration.
   */
  return (
    <div className={`wave-card ${leaving ? 'wave-card--leaving' : ''}`.trim()} role="status">
      <span className="wave-card__car" aria-hidden>
        <CarSvg model={card.model} colour={card.colour} size={96} heading={90} />
      </span>
      <span className="wave-card__text">
        {/* Never capitalised by us: a name is written the way its owner wrote it. */}
        {card.nick ? (
          <span className="wave-card__who wave-card__who--name">{card.nick}</span>
        ) : null}
        <span className={card.nick ? 'wave-card__model' : 'wave-card__who'}>{described}</span>
        <span className="wave-card__what">
          {card.back ? copy.wave.cardBackTitle : copy.wave.cardTitle}
        </span>
      </span>
    </div>
  );
}
