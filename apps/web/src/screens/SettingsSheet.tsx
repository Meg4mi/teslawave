import type { ReactNode } from 'react';
import { MODEL_LABELS, colourOf } from '@teslawave/protocol';
import { Button, Sheet, Switch } from '../ui/primitives';
import { CarSvg } from '../ui/CarSvg';
import { ChevronRightIcon } from '../ui/icons';
import { COPY } from '../ui/copy';
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
  return (
    <Sheet label={COPY.controls.settings} title={COPY.controls.settings} onClose={onClose}>
      <div className="settings">
        {/* First, because it is the one setting that is about you rather than about the app. */}
        {/* The whole row opens the garage; the button is the labelled control for it. */}
        <div className="settings__row settings__row--tap" onClick={onEditCar}>
          <span className="settings__car">
            <CarSvg model={identity.model} colour={identity.colour} size={96} heading={90} />
            <span className="settings__label">
              <span className="settings__name">{identity.nick ?? MODEL_LABELS[identity.model]}</span>
              <span className="settings__hint">
                {identity.nick ? `${MODEL_LABELS[identity.model]} · ` : ''}
                {colourOf(identity.colour).label}
                <span className="settings__tap"> · {COPY.garage.tapHint}</span>
              </span>
            </span>
          </span>
          <Button onClick={onEditCar}>{COPY.garage.open}</Button>
        </div>

        <div className="settings__row">
          <span className="settings__label">
            {COPY.settings.visible}
            <span className="settings__hint">
              {prefs.sharing ? COPY.settings.visibleHint : COPY.map.hidden}
            </span>
          </span>
          <Switch
            checked={prefs.sharing}
            label={COPY.settings.visible}
            onChange={(sharing) => onChange({ sharing })}
          />
        </div>

        <div className="settings__row">
          <span className="settings__label">
            {COPY.settings.sound}
            <span className="settings__hint">{COPY.settings.soundHint}</span>
          </span>
          <Switch
            checked={!prefs.muted}
            label={COPY.settings.sound}
            onChange={(on) => onChange({ muted: !on })}
          />
        </div>

        <div className="settings__row">
          <span className="settings__label">
            {COPY.settings.northUp}
            <span className="settings__hint">{COPY.settings.northUpHint}</span>
          </span>
          <Switch
            checked={prefs.northUp}
            label={COPY.settings.northUp}
            onChange={(northUp) => onChange({ northUp })}
          />
        </div>

        <LinkRow title={COPY.pairing.showTitle} hint={COPY.pairing.showHint} onClick={onShowPairing} />
        <LinkRow
          title={COPY.onboarding.havePairingCode}
          hint={COPY.onboarding.havePairingCodeHint}
          onClick={onEnterCode}
        />
        <LinkRow title={COPY.howTo.title} hint={COPY.howTo.lead} onClick={onHowItWorks} />
      </div>

      <Disclaimer inline />
    </Sheet>
  );
}
