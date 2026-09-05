import { useState, type ReactNode } from 'react';
import type { CarColourId, TeslaModel } from '@teslawave/protocol';
import { Button } from '../ui/primitives';
import { CarSvg } from '../ui/CarSvg';
import { CarPicker, type CarChoice } from './CarPicker';
import { useCopy } from '../i18n';
import { Disclaimer } from '../ui/Disclaimer';
import './onboarding.css';

export type OnboardingResult = { model: TeslaModel; colour: CarColourId; nick?: string };

/**
 * The first screen, over the live map. On the car it is the configurator every owner has
 * already used: the car on the left, big, in the paint you choose; the choices on the right;
 * one white button. On a phone the same thing stacks.
 */
export function Onboarding({
  onGo,
  onHaveCode,
  onHowItWorks,
}: {
  onGo: (result: OnboardingResult) => void;
  onHaveCode: () => void;
  onHowItWorks: () => void;
}): ReactNode {
  const copy = useCopy();
  const [car, setCar] = useState<CarChoice>({ model: '3', colour: 'pearl', nick: '' });

  return (
    <div className="onboarding">
      <div className="onboarding__grid">
        <section className="onboarding__stage" aria-hidden>
          <div className="stage">
            <div className="stage__floor" />
            {/* Keyed on the model so a change of car lands, rather than morphs. */}
            <CarSvg
              key={car.model}
              className="stage__car"
              model={car.model}
              colour={car.colour}
              heading={90}
              size={640}
            />
          </div>
          <p className="stage__caption">
            <span className="stage__model">{copy.cars.model(car.model)}</span>
            <span className="stage__paint">
              {copy.cars.colour(car.colour)}
              {car.nick.trim() ? ` · ${car.nick.trim()}` : ''}
            </span>
          </p>
        </section>

        <section className="onboarding__form">
          <header className="onboarding__head">
            <p className="onboarding__brand eyebrow">{copy.brand}</p>
            <h1 className="onboarding__title">{copy.onboarding.intro}</h1>
            <p className="onboarding__sub">{copy.onboarding.sub}</p>
          </header>

          <CarPicker value={car} onChange={(patch) => setCar({ ...car, ...patch })} />

          <Button
            variant="primary"
            size="lg"
            className="onboarding__go"
            onClick={() =>
              onGo({
                model: car.model,
                colour: car.colour,
                ...(car.nick.trim() ? { nick: car.nick.trim() } : {}),
              })
            }
          >
            {copy.onboarding.go}
          </Button>

          <div className="onboarding__links">
            <button type="button" data-touch className="link" onClick={onHowItWorks}>
              {copy.onboarding.howItWorks}
            </button>
            <button type="button" data-touch className="link" onClick={onHaveCode}>
              {copy.onboarding.havePairingCode}
            </button>
          </div>

          <p className="onboarding__privacy">{copy.onboarding.privacy}</p>
          <Disclaimer inline />
        </section>
      </div>
    </div>
  );
}
