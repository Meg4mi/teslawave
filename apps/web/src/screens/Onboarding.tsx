import { useState, type ReactNode } from 'react';
import {
  CAR_COLOURS,
  MODEL_LABELS,
  NICK_MAX_LEN,
  TESLA_MODELS,
  type CarColourId,
  type TeslaModel,
} from '@teslawave/protocol';
import { Button } from '../ui/primitives';
import { CarChip } from '../ui/CarChip';
import { COPY } from '../ui/copy';
import { Disclaimer } from '../ui/Disclaimer';
import './onboarding.css';

export type OnboardingResult = { model: TeslaModel; colour: CarColourId; nick?: string };

export function Onboarding({
  onGo,
  onHaveCode,
}: {
  onGo: (result: OnboardingResult) => void;
  onHaveCode: () => void;
}): ReactNode {
  const [model, setModel] = useState<TeslaModel>('3');
  const [colour, setColour] = useState<CarColourId>('pearl');
  const [nick, setNick] = useState('');

  return (
    <div className="onboarding">
      <div className="onboarding__inner">
        <header className="onboarding__head">
          <h1 className="onboarding__title">{COPY.onboarding.intro}</h1>
          <p className="onboarding__sub">{COPY.onboarding.sub}</p>
        </header>

        <div className="onboarding__preview" aria-hidden>
          <CarChip model={model} colour={colour} size={132} />
        </div>

        <fieldset className="onboarding__group">
          <legend className="onboarding__legend">{COPY.onboarding.pickModel}</legend>
          <div className="onboarding__models">
            {TESLA_MODELS.map((m) => (
              <button
                key={m}
                type="button"
                data-touch
                className={`tile ${m === model ? 'tile--on' : ''}`.trim()}
                aria-pressed={m === model}
                onClick={() => setModel(m)}
              >
                <CarChip model={m} colour={colour} size={52} />
                <span className="tile__label">{MODEL_LABELS[m]}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="onboarding__group">
          <legend className="onboarding__legend">{COPY.onboarding.pickColour}</legend>
          <div className="onboarding__colours">
            {CAR_COLOURS.map((c) => (
              <button
                key={c.id}
                type="button"
                data-touch
                className={`swatch ${c.id === colour ? 'swatch--on' : ''}`.trim()}
                aria-pressed={c.id === colour}
                aria-label={c.label}
                title={c.label}
                onClick={() => setColour(c.id)}
              >
                <span className="swatch__dot" style={{ background: c.hex }} />
              </button>
            ))}
          </div>
        </fieldset>

        <label className="onboarding__nick">
          <span className="onboarding__legend">{COPY.onboarding.nick}</span>
          <input
            type="text"
            value={nick}
            maxLength={NICK_MAX_LEN}
            autoComplete="off"
            spellCheck={false}
            placeholder=" "
            onChange={(event) => setNick(event.target.value)}
          />
          <span className="onboarding__hint">{COPY.onboarding.nickHint}</span>
        </label>

        <div className="onboarding__actions">
          <Button
            variant="primary"
            className="onboarding__go"
            onClick={() => onGo({ model, colour, ...(nick.trim() ? { nick: nick.trim() } : {}) })}
          >
            {COPY.onboarding.go}
          </Button>
          <Button variant="ghost" onClick={onHaveCode}>
            {COPY.onboarding.havePairingCode}
          </Button>
        </div>

        <p className="onboarding__privacy">{COPY.onboarding.privacy}</p>
        <Disclaimer inline />
      </div>
    </div>
  );
}
