import { useState, type ReactNode } from 'react';
import type { CarColourId, TeslaModel } from '@teslawave/protocol';
import { Button, Sheet } from '../ui/primitives';
import { CarPicker, type CarChoice } from './CarPicker';
import { COPY } from '../ui/copy';

export type CarEdit = { model: TeslaModel; colour: CarColourId; nick?: string };

/**
 * Change the car you are showing as, after onboarding. Applied on Save rather than live: on a
 * car screen, half-finished changes broadcast to everyone around you as you tap through the
 * palette, and the wire cost of that is a `hello` per tap.
 */
export function GarageSheet({
  car,
  onSave,
  onClose,
}: {
  car: CarEdit;
  onSave: (next: CarEdit) => void;
  onClose: () => void;
}): ReactNode {
  const [draft, setDraft] = useState<CarChoice>({
    model: car.model,
    colour: car.colour,
    nick: car.nick ?? '',
  });

  const changed =
    draft.model !== car.model ||
    draft.colour !== car.colour ||
    draft.nick.trim() !== (car.nick ?? '');

  return (
    <Sheet label={COPY.garage.title} onClose={onClose}>
      <h2 className="card-sheet__title">{COPY.garage.title}</h2>
      <p className="settings__hint garage__hint">{COPY.garage.hint}</p>

      <CarPicker value={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} heroSize={120} />

      <div className="card-sheet__actions">
        <Button variant="ghost" onClick={onClose}>
          {COPY.garage.cancel}
        </Button>
        <Button
          variant="primary"
          disabled={!changed}
          onClick={() =>
            onSave({
              model: draft.model,
              colour: draft.colour,
              ...(draft.nick.trim() ? { nick: draft.nick.trim() } : {}),
            })
          }
        >
          {COPY.garage.save}
        </Button>
      </div>
    </Sheet>
  );
}
