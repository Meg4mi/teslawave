import type { ReactNode } from 'react';
import { MODEL_LABELS, colourOf, describeCar } from '@teslawave/protocol';
import { Button, Sheet, SheetActions } from '../ui/primitives';
import { CarSvg } from '../ui/CarSvg';
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
        <span className="card-sheet__car" aria-hidden>
          <CarSvg model={car.model} colour={car.colour} size={150} heading={90} />
        </span>
        <div>
          <h2 className="card-sheet__title">{title}</h2>
          <p className="card-sheet__meta">
            <span>
              {MODEL_LABELS[car.model]} · {colourOf(car.colour).label}
            </span>
            <span>
              <span className="num">{car.waves}</span> {car.waves === 1 ? 'wave' : 'waves'}
            </span>
            <span>{COPY.card.onlineFor(minutes)}</span>
          </p>
        </div>
      </div>
      <SheetActions>
        <Button variant="primary" size="lg" onClick={() => onWave(car.id)}>
          {COPY.card.wave}
        </Button>
      </SheetActions>
    </Sheet>
  );
}
