import type { ReactNode } from 'react';
import { BRAND } from '@teslawave/protocol';
import { Disclaimer } from '../ui/Disclaimer';
import { useCopy } from '../i18n';
import { useDocumentMeta } from '../app/meta';
import './onboarding.css';

/**
 * The whole page comes from the catalogue, the two blurring distances and the presence
 * expiry included: a privacy promise that is right in one language and stale in another is
 * worse than no translation at all.
 */
export function Privacy(): ReactNode {
  const copy = useCopy();
  useDocumentMeta(`${copy.privacy.title} · ${BRAND.name}`, copy.privacy.lead(BRAND.name));

  return (
    <div className="doc">
      <div className="doc__inner">
        <p className="eyebrow">{BRAND.name}</p>
        <h1>{copy.privacy.title}</h1>
        <p className="onboarding__sub">{copy.privacy.lead(BRAND.name)}</p>

        <h2>{copy.privacy.leavesTitle}</h2>
        <ul className="privacy__list">
          {copy.privacy.leaves.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <h2>{copy.privacy.keptTitle}</h2>
        <ul className="privacy__list">
          {copy.privacy.kept.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <h2>{copy.privacy.thirdPartiesTitle}</h2>
        <ul className="privacy__list">
          {copy.privacy.thirdParties.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <p className="onboarding__sub">{copy.privacy.invisible}</p>

        <p>
          <a href="/">{copy.privacy.back}</a>
        </p>
        <Disclaimer inline />
      </div>
    </div>
  );
}
