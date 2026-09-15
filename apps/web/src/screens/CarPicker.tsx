import type { CSSProperties, ReactNode } from 'react';
import {
  CAR_COLOURS,
  NICK_MAX_LEN,
  STATUSES,
  STATUS_MAX_LEN,
  TESLA_MODELS,
  type CarColourId,
  type StatusId,
  type TeslaModel,
} from '@teslawave/protocol';
import { CheckIcon } from '../ui/icons';
import { useCopy } from '../i18n';

export type CarChoice = {
  model: TeslaModel;
  colour: CarColourId;
  nick: string;
  /** Null is "none", which is the usual answer and the first chip. */
  status: StatusId | null;
  /** The driver's own words. Never set at the same time as `status`. */
  statusText: string;
};

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
  const copy = useCopy();
  const { model, colour, nick, status, statusText } = value;
  /** "None" is pressed only when neither half of the choice has been used. */
  const none = status === null && statusText.trim().length === 0;

  return (
    <>
      <fieldset className="field">
        <legend className="field__label eyebrow">{copy.onboarding.pickModel}</legend>
        <div className="seg" role="group">
          {TESLA_MODELS.map((m) => (
            <button
              key={m}
              type="button"
              data-touch
              className={`seg__item ${m === model ? 'seg__item--on' : ''}`.trim()}
              aria-pressed={m === model}
              aria-label={copy.cars.model(m)}
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
        <legend className="field__label eyebrow">{copy.onboarding.pickColour}</legend>
        <div className="swatches">
          {CAR_COLOURS.map((c) => (
            <button
              key={c.id}
              type="button"
              data-touch
              className={`swatch ${c.id === colour ? 'swatch--on' : ''}`.trim()}
              aria-pressed={c.id === colour}
              aria-label={copy.cars.colour(c.id)}
              title={copy.cars.colour(c.id)}
              onClick={() => onChange({ colour: c.id })}
            >
              <span className="swatch__paint" style={{ '--paint-hex': c.hex } as CSSProperties}>
                {c.id === colour ? (
                  <span
                    className={`swatch__check ${isLight(c.hex) ? 'swatch__check--dark' : ''}`.trim()}
                  >
                    <CheckIcon size={18} />
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span className="field__label eyebrow">{copy.onboarding.nick}</span>
        <input
          type="text"
          className="field__input"
          value={nick}
          maxLength={NICK_MAX_LEN}
          autoComplete="off"
          spellCheck={false}
          placeholder={copy.onboarding.nickPlaceholder}
          onChange={(event) => onChange({ nick: event.target.value })}
        />
      </label>

      {/* Chips first, because five taps cover most drives and nothing is typed on the car
          screen for them. The field under them is the one thing five options cannot do: say
          something nobody anticipated (ADR-0040, amended). The two are one choice — picking a
          chip clears the field, typing clears the chips — so a card never shows two statuses. */}
      <fieldset className="field">
        <legend className="field__label eyebrow">{copy.status.title}</legend>
        <div className="chips" role="group" aria-label={copy.status.title}>
          <button
            type="button"
            data-touch
            className={`chip ${none ? 'chip--on' : ''}`.trim()}
            aria-pressed={none}
            onClick={() => onChange({ status: null, statusText: '' })}
          >
            {copy.status.none}
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              data-touch
              className={`chip ${s === status ? 'chip--on' : ''}`.trim()}
              aria-pressed={s === status}
              onClick={() => onChange({ status: s, statusText: '' })}
            >
              {copy.status.label(s)}
            </button>
          ))}
        </div>
        <input
          type="text"
          className="field__input field__input--sub"
          value={statusText}
          maxLength={STATUS_MAX_LEN}
          autoComplete="off"
          aria-label={copy.status.own}
          placeholder={copy.status.ownPlaceholder}
          onChange={(event) => onChange({ statusText: event.target.value, status: null })}
        />
        <p className="field__hint">{copy.status.hint}</p>
      </fieldset>
    </>
  );
}

const isLight = (hex: string): boolean => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150;
};
