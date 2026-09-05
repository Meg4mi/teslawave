import type { ReactNode } from 'react';
import { Button, Sheet, SheetActions } from '../ui/primitives';
import { CarSvg } from '../ui/CarSvg';
import { useCopy } from '../i18n';
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
  const copy = useCopy();
  const minutes = Math.floor((serverNow - car.since) / 60_000);
  const title = car.nick ?? copy.cars.describe(car.model, car.colour);

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
              {copy.cars.model(car.model)} · {copy.cars.colour(car.colour)}
            </span>
            <span>
              <span className="num">{car.waves}</span> {copy.card.wavesLabel(car.waves)}
            </span>
            <span>{copy.card.onlineFor(minutes)}</span>
          </p>
        </div>
      </div>
      <SheetActions>
        <Button variant="primary" size="lg" onClick={() => onWave(car.id)}>
          {copy.card.wave}
        </Button>
      </SheetActions>
    </Sheet>
  );
}
