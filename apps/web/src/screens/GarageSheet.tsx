import { useState, type ReactNode } from 'react';
import type { CarColourId, TeslaModel } from '@teslawave/protocol';
import { Button, Sheet, SheetActions } from '../ui/primitives';
import { CarSvg } from '../ui/CarSvg';
import { CarPicker, type CarChoice } from './CarPicker';
import { useCopy } from '../i18n';

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
  const copy = useCopy();
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
    <Sheet label={copy.garage.title} title={copy.garage.title} onClose={onClose} wide>
      <div className="garage">
        <div className="garage__stage" aria-hidden>
          <CarSvg
            key={draft.model}
            className="garage__car"
            model={draft.model}
            colour={draft.colour}
            size={420}
            heading={90}
          />
          <p className="stage__caption">
            <span className="stage__model">{copy.cars.model(draft.model)}</span>
            <span className="stage__paint">{copy.cars.colour(draft.colour)}</span>
          </p>
        </div>
        <div className="garage__form">
          <CarPicker value={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />
          <p className="settings__hint">{copy.garage.hint}</p>
        </div>
      </div>
      <SheetActions>
        <Button variant="ghost" onClick={onClose}>
          {copy.garage.cancel}
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
          {copy.garage.save}
        </Button>
      </SheetActions>
    </Sheet>
  );
}
