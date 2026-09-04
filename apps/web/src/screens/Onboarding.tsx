import { useState, type ReactNode } from 'react';
import type { CarColourId, TeslaModel } from '@teslawave/protocol';
import { Button } from '../ui/primitives';
import { CarPicker, type CarChoice } from './CarPicker';
import { COPY } from '../ui/copy';
import { Disclaimer } from '../ui/Disclaimer';
import './onboarding.css';

export type OnboardingResult = { model: TeslaModel; colour: CarColourId; nick?: string };

export function Onboarding({
  onGo,
  onHaveCode,
  onHowItWorks,
}: {
  onGo: (result: OnboardingResult) => void;
  onHaveCode: () => void;
  onHowItWorks: () => void;
}): ReactNode {
  const [car, setCar] = useState<CarChoice>({ model: '3', colour: 'pearl', nick: '' });

  return (
    <div className="onboarding">
      <div className="onboarding__inner">
        <header className="onboarding__head">
          <h1 className="onboarding__title">{COPY.onboarding.intro}</h1>
          <p className="onboarding__sub">{COPY.onboarding.sub}</p>
        </header>

        <CarPicker value={car} onChange={(patch) => setCar({ ...car, ...patch })} />

        <Button
          variant="primary"
          className="onboarding__go"
          onClick={() =>
            onGo({
              model: car.model,
              colour: car.colour,
              ...(car.nick.trim() ? { nick: car.nick.trim() } : {}),
            })
          }
        >
          {COPY.onboarding.go}
        </Button>

        <div className="onboarding__links">
          <button type="button" data-touch className="link" onClick={onHowItWorks}>
            {COPY.onboarding.howItWorks}
          </button>
          <button type="button" data-touch className="link" onClick={onHaveCode}>
            {COPY.onboarding.havePairingCode}
          </button>
        </div>

        <p className="onboarding__privacy">{COPY.onboarding.privacy}</p>
        <Disclaimer inline />
      </div>
    </div>
  );
}
