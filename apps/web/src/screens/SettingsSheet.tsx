import type { ReactNode } from 'react';
import { Button, Sheet } from '../ui/primitives';
import { COPY } from '../ui/copy';
import { Disclaimer } from '../ui/Disclaimer';
import type { Prefs } from '../identity/store';

export function SettingsSheet({
  prefs,
  onChange,
  onShowPairing,
  onEnterCode,
  onHowItWorks,
  onEditCar,
  onClose,
}: {
  prefs: Prefs;
  onChange: (patch: Partial<Prefs>) => void;
  onShowPairing: () => void;
  onEnterCode: () => void;
  onHowItWorks: () => void;
  onEditCar: () => void;
  onClose: () => void;
}): ReactNode {
  return (
    <Sheet label={COPY.controls.settings} onClose={onClose}>
      <h2 className="card-sheet__title">{COPY.controls.settings}</h2>

      {/* First, because it is the one setting that is about you rather than about the app. */}
      <div className="settings__row">
        <span className="settings__label">
          {COPY.garage.title}
          <span className="settings__hint">{COPY.garage.hint}</span>
        </span>
        <Button onClick={onEditCar}>{COPY.garage.open}</Button>
      </div>

      <div className="settings__row">
        <span className="settings__label">
          {COPY.controls.invisible}
          <span className="settings__hint">{COPY.map.hidden}</span>
        </span>
        <Button onClick={() => onChange({ sharing: !prefs.sharing })}>
          {prefs.sharing ? COPY.controls.visible : COPY.controls.invisible}
        </Button>
      </div>

      <div className="settings__row">
        <span className="settings__label">
          {COPY.howTo.title}
          <span className="settings__hint">{COPY.howTo.lead}</span>
        </span>
        <Button onClick={onHowItWorks}>{COPY.howTo.tryIt}</Button>
      </div>

      <div className="settings__row">
        <span className="settings__label">Sounds</span>
        <Button onClick={() => onChange({ muted: !prefs.muted })}>
          {prefs.muted ? COPY.controls.unmute : COPY.controls.mute}
        </Button>
      </div>

      <div className="settings__row">
        <span className="settings__label">Map orientation</span>
        <Button onClick={() => onChange({ northUp: !prefs.northUp })}>
          {prefs.northUp ? COPY.controls.northUp : COPY.controls.trackUp}
        </Button>
      </div>

      <div className="settings__row">
        <span className="settings__label">
          {COPY.pairing.showAction}
          <span className="settings__hint">{COPY.pairing.showHint}</span>
        </span>
        <Button onClick={onShowPairing}>{COPY.pairing.showTitle}</Button>
      </div>

      <div className="card-sheet__actions">
        <Button variant="ghost" onClick={onEnterCode}>
          {COPY.onboarding.havePairingCode}
        </Button>
      </div>

      <Disclaimer inline />
    </Sheet>
  );
}
