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
 */
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
              {identity.nick ?? MODEL_LABELS[identity.model]}
              <span className="settings__hint">
                {identity.nick ? `${MODEL_LABELS[identity.model]} · ` : ''}
                {colourOf(identity.colour).label} · {COPY.garage.tapHint}
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

        <div className="settings__row">
          <span className="settings__label">
            {COPY.pairing.showAction}
            <span className="settings__hint">{COPY.pairing.showHint}</span>
          </span>
          <Button variant="icon" label={COPY.pairing.showTitle} onClick={onShowPairing}>
            <ChevronRightIcon />
          </Button>
        </div>

        <div className="settings__row">
          <span className="settings__label">
            {COPY.onboarding.havePairingCode}
            <span className="settings__hint">{COPY.onboarding.havePairingCodeHint}</span>
          </span>
          <Button variant="icon" label={COPY.pairing.enterTitle} onClick={onEnterCode}>
            <ChevronRightIcon />
          </Button>
        </div>

        <div className="settings__row">
          <span className="settings__label">
            {COPY.howTo.title}
            <span className="settings__hint">{COPY.howTo.lead}</span>
          </span>
          <Button variant="icon" label={COPY.howTo.title} onClick={onHowItWorks}>
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      <Disclaimer inline />
    </Sheet>
  );
}
