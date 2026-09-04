import type { CSSProperties, ReactNode } from 'react';
import {
  CAR_COLOURS,
  MODEL_LABELS,
  NICK_MAX_LEN,
  TESLA_MODELS,
  type CarColourId,
  type TeslaModel,
} from '@teslawave/protocol';
import { CheckIcon } from '../ui/icons';
import { COPY } from '../ui/copy';

export type CarChoice = { model: TeslaModel; colour: CarColourId; nick: string };

/**
 * Choosing your car: the model, the paint, the name. Shared by onboarding and by the garage
 * sheet, because a driver who picked the wrong colour once should be able to change it
 * without clearing site data — and because two copies of this would drift apart. The car
 * itself is drawn by whoever hosts the picker, large, and updates as you tap.
 */
export function CarPicker({
  value,
  onChange,
}: {
  value: CarChoice;
  onChange: (patch: Partial<CarChoice>) => void;
}): ReactNode {
  const { model, colour, nick } = value;

  return (
    <>
      <fieldset className="field">
        <legend className="field__label eyebrow">{COPY.onboarding.pickModel}</legend>
        <div className="seg" role="group">
          {TESLA_MODELS.map((m) => (
            <button
              key={m}
              type="button"
              data-touch
              className={`seg__item ${m === model ? 'seg__item--on' : ''}`.trim()}
              aria-pressed={m === model}
              aria-label={MODEL_LABELS[m]}
              onClick={() => onChange({ model: m })}
            >
              {/* "Model" is dropped on a phone, where five of them will not fit. */}
              {m === 'CT' ? (
                <>
                  <span className="seg__long">Cybertruck</span>
                  <span className="seg__short">Cyber</span>
                </>
              ) : (
                <>
                  <span className="seg__long">Model </span>
                  {m}
                </>
              )}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend className="field__label eyebrow">{COPY.onboarding.pickColour}</legend>
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
              <span className="swatch__paint" style={{ '--paint-hex': c.hex } as CSSProperties}>
                {c.id === colour ? (
                  <span className={`swatch__check ${isLight(c.hex) ? 'swatch__check--dark' : ''}`.trim()}>
                    <CheckIcon size={18} />
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span className="field__label eyebrow">{COPY.onboarding.nick}</span>
        <input
          type="text"
          className="field__input"
          value={nick}
          maxLength={NICK_MAX_LEN}
          autoComplete="off"
          spellCheck={false}
          placeholder={COPY.onboarding.nickPlaceholder}
          onChange={(event) => onChange({ nick: event.target.value })}
        />
      </label>
    </>
  );
}

const isLight = (hex: string): boolean => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150;
};
