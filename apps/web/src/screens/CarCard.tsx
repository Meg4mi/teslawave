import type { ReactNode } from 'react';
import { MODEL_LABELS, colourOf, describeCar } from '@teslawave/protocol';
import { Button, Sheet } from '../ui/primitives';
import { CarChip } from '../ui/CarChip';
import { COPY } from '../ui/copy';
import type { WorldCar } from '../sim/world';

export function CarCard({
  car,
  serverNow,
  onWave,
  onClose,
}: {
  car: WorldCar;
  serverNow: number;
  onWave: (id: string) => void;
  onClose: () => void;
}): ReactNode {
  const minutes = Math.floor((serverNow - car.since) / 60_000);
  const title = car.nick ?? describeCar(car.model, car.colour);

  return (
    <Sheet label={title} onClose={onClose}>
      <div className="card-sheet__head">
        <CarChip model={car.model} colour={car.colour} size={72} />
        <div>
          <h2 className="card-sheet__title">{title}</h2>
          <p className="card-sheet__meta">
            {MODEL_LABELS[car.model]} · {colourOf(car.colour).label} · {COPY.card.waves(car.waves)} ·{' '}
            {COPY.card.onlineFor(minutes)}
          </p>
        </div>
      </div>
      <div className="card-sheet__actions">
        <Button variant="primary" onClick={() => onWave(car.id)}>
          {COPY.card.wave}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {COPY.controls.close}
        </Button>
      </div>
    </Sheet>
  );
}
