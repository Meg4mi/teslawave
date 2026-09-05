import type { ReactNode } from 'react';
import { Button, Segmented, Sheet, Switch } from '../ui/primitives';
import { CarSvg } from '../ui/CarSvg';
import { ChevronRightIcon } from '../ui/icons';
import { LOCALES, LOCALE_NAMES, useCopy, useLocale, useSetLocale } from '../i18n';
import { Disclaimer } from '../ui/Disclaimer';
import type { Identity, Prefs } from '../identity/store';

/**
 * Settings, as rows: a label, a hint, one control on the right. Toggles are switches, as in
 * the car; anything that opens something else says so with a chevron.
 *
 * A row that opens something *is* the button: the whole 72 px strip, edge to edge. The
 * first version made only the chevron the target, a 24 px glyph at the far right of a wide
 * sheet, and on the car screen it was reported as too hard to hit. The chevron is now the
 * affordance, not the control.
 */
function LinkRow({
  title,
  hint,
  onClick,
}: {
  title: string;
  hint: string;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      data-touch
      className="settings__row settings__row--link"
      aria-label={title}
      onClick={onClick}
    >
      <span className="settings__label">
        {title}
        <span className="settings__hint">{hint}</span>
      </span>
      <span className="settings__chevron" aria-hidden>
        <ChevronRightIcon />
      </span>
    </button>
  );
}

export function SettingsSheet({
  identity,
  prefs,
  onChange,
  onShowPairing,
  onEnterCode,
  onHowItWorks,
  onEditCar,
  onClose,
}: {
  identity: Identity;
  prefs: Prefs;
  onChange: (patch: Partial<Prefs>) => void;
  onShowPairing: () => void;
  onEnterCode: () => void;
  onHowItWorks: () => void;
  onEditCar: () => void;
  onClose: () => void;
}): ReactNode {
  const copy = useCopy();
  const locale = useLocale();
  const setLocale = useSetLocale();
  return (
    <Sheet label={copy.controls.settings} title={copy.controls.settings} onClose={onClose}>
      <div className="settings">
        {/* First, because it is the one setting that is about you rather than about the app. */}
        {/* The whole row opens the garage; the button is the labelled control for it. */}
        <div className="settings__row settings__row--tap" onClick={onEditCar}>
          <span className="settings__car">
            <CarSvg model={identity.model} colour={identity.colour} size={96} heading={90} />
            <span className="settings__label">
              <span className="settings__name">
                {identity.nick ?? copy.cars.model(identity.model)}
              </span>
              <span className="settings__hint">
                {identity.nick ? `${copy.cars.model(identity.model)} · ` : ''}
                {copy.cars.colour(identity.colour)}
                <span className="settings__tap"> · {copy.garage.tapHint}</span>
              </span>
            </span>
          </span>
          <Button onClick={onEditCar}>{copy.garage.open}</Button>
        </div>

        <div className="settings__row">
          <span className="settings__label">
            {copy.settings.visible}
            <span className="settings__hint">
              {prefs.sharing ? copy.settings.visibleHint : copy.map.hidden}
            </span>
          </span>
          <Switch
            checked={prefs.sharing}
            label={copy.settings.visible}
            onChange={(sharing) => onChange({ sharing })}
          />
        </div>

        <div className="settings__row">
          <span className="settings__label">
            {copy.settings.sound}
            <span className="settings__hint">{copy.settings.soundHint}</span>
          </span>
          <Switch
            checked={!prefs.muted}
            label={copy.settings.sound}
            onChange={(on) => onChange({ muted: !on })}
          />
        </div>

        <div className="settings__row">
          <span className="settings__label">
            {copy.settings.northUp}
            <span className="settings__hint">{copy.settings.northUpHint}</span>
          </span>
          <Switch
            checked={prefs.northUp}
            label={copy.settings.northUp}
            onChange={(northUp) => onChange({ northUp })}
          />
        </div>

        <div className="settings__row">
          <span className="settings__label">
            {copy.settings.perf}
            <span className="settings__hint">{copy.settings.perfHint}</span>
          </span>
          <Switch
            checked={prefs.perfBeacon}
            label={copy.settings.perf}
            onChange={(perfBeacon) => onChange({ perfBeacon })}
          />
        </div>

        {/* Detected from the car to begin with, so this row is a correction rather than a
            question. Each language is named in itself: a driver who has landed in the wrong
            one cannot read the label that would get them out. */}
        <div className="settings__row">
          <span className="settings__label">
            {copy.language.title}
            <span className="settings__hint">{copy.language.hint}</span>
          </span>
          <Segmented
            label={copy.language.title}
            value={locale}
            options={LOCALES.map((code) => ({ value: code, label: LOCALE_NAMES[code] }))}
            onChange={setLocale}
          />
        </div>

        <LinkRow
          title={copy.pairing.showTitle}
          hint={copy.pairing.showHint}
          onClick={onShowPairing}
        />
        <LinkRow
          title={copy.onboarding.havePairingCode}
          hint={copy.onboarding.havePairingCodeHint}
          onClick={onEnterCode}
        />
        <LinkRow title={copy.howTo.title} hint={copy.howTo.lead} onClick={onHowItWorks} />
      </div>

      <Disclaimer inline />
    </Sheet>
  );
}
