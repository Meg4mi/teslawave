import { useState, type ReactNode } from 'react';
import {
  CAR_COLOURS,
  colourOf,
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
  onHowItWorks,
}: {
  onGo: (result: OnboardingResult) => void;
  onHaveCode: () => void;
  onHowItWorks: () => void;
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

        {/* The car you are about to become, named. Everything below just edits this. */}
        <div className="hero">
          <div className="hero__stage">
            <CarChip model={model} colour={colour} size={150} />
          </div>
          <p className="hero__caption">
            {MODEL_LABELS[model]}
            <span className="hero__dot">·</span>
            {colourOf(colour).label}
            {nick.trim() ? (
              <>
                <span className="hero__dot">·</span>
                {nick.trim()}
              </>
            ) : null}
          </p>
        </div>

        <fieldset className="field">
          <legend className="field__label">{COPY.onboarding.pickModel}</legend>
          <div className="models">
            {TESLA_MODELS.map((m) => (
              <button
                key={m}
                type="button"
                data-touch
                className={`tile ${m === model ? 'tile--on' : ''}`.trim()}
                aria-pressed={m === model}
                aria-label={MODEL_LABELS[m]}
                title={MODEL_LABELS[m]}
                onClick={() => setModel(m)}
              >
                <CarChip model={m} colour={colour} size={46} />
                {/* Short, because five equal columns cannot fit "Cybertruck"; the hero
                    caption above always spells out the selected one. */}
                <span className="tile__label">{m === 'CT' ? 'Cyber' : m}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend className="field__label">{COPY.onboarding.pickColour}</legend>
          <div className="swatches">
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

        <label className="field">
          <span className="field__label">{COPY.onboarding.nick}</span>
          <input
            type="text"
            className="field__input"
            value={nick}
            maxLength={NICK_MAX_LEN}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setNick(event.target.value)}
          />
        </label>

        <Button
          variant="primary"
          className="onboarding__go"
          onClick={() => onGo({ model, colour, ...(nick.trim() ? { nick: nick.trim() } : {}) })}
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
