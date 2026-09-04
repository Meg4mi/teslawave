import type { ReactNode } from 'react';
import {
  CAR_COLOURS,
  colourOf,
  MODEL_LABELS,
  NICK_MAX_LEN,
  TESLA_MODELS,
  type CarColourId,
  type TeslaModel,
} from '@teslawave/protocol';
import { CarChip } from '../ui/CarChip';
import { COPY } from '../ui/copy';

export type CarChoice = { model: TeslaModel; colour: CarColourId; nick: string };

/**
 * Choosing your car: the hero, the model tiles, the paint, the name. Shared by onboarding and
 * by the garage sheet, because a driver who picked the wrong colour once should be able to
 * change it without clearing site data — and because two copies of this would drift apart.
 */
export function CarPicker({
  value,
  onChange,
  heroSize = 150,
}: {
  value: CarChoice;
  onChange: (patch: Partial<CarChoice>) => void;
  heroSize?: number;
}): ReactNode {
  const { model, colour, nick } = value;

  return (
    <>
      {/* The car you are, named. Everything below just edits this. */}
      <div className="hero">
        <div className="hero__stage">
          <CarChip model={model} colour={colour} size={heroSize} />
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
              onClick={() => onChange({ model: m })}
            >
              <CarChip model={m} colour={colour} size={46} />
              {/* Short, because five equal columns cannot fit "Cybertruck"; the hero caption
                  above always spells out the selected one. */}
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
              onClick={() => onChange({ colour: c.id })}
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
          onChange={(event) => onChange({ nick: event.target.value })}
        />
      </label>
    </>
  );
}
