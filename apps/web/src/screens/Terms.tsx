import type { ReactNode } from 'react';
import { BRAND } from '@teslawave/protocol';
import { Disclaimer } from '../ui/Disclaimer';
import { useCopy } from '../i18n';
import { useDocumentMeta } from '../app/meta';
import './onboarding.css';

/**
 * The same page as privacy, in the same materials, for the same reason: every word comes from
 * the catalogue, because terms that are right in one language and stale in another are worse
 * than terms in one language only. Driving is the first section on purpose (ADR-0037).
 */
export function Terms(): ReactNode {
  const copy = useCopy();
  useDocumentMeta(`${copy.terms.title} · ${BRAND.name}`, copy.terms.lead(BRAND.name));

  const sections = [
    { title: copy.terms.drivingTitle, items: copy.terms.driving },
    { title: copy.terms.serviceTitle, items: copy.terms.service },
    { title: copy.terms.liabilityTitle, items: copy.terms.liability },
    { title: copy.terms.independenceTitle, items: copy.terms.independence },
    { title: copy.terms.changesTitle, items: copy.terms.changes },
  ];

  return (
    <div className="doc">
      <div className="doc__inner">
        <p className="eyebrow">{BRAND.name}</p>
        <h1>{copy.terms.title}</h1>
        <p className="onboarding__sub">{copy.terms.lead(BRAND.name)}</p>

        {sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            <ul className="privacy__list">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}

        <h2>{copy.terms.contactTitle}</h2>
        <p className="onboarding__sub">{copy.terms.contact(BRAND.contact)}</p>

        <p>
          <a href="/privacy">{copy.terms.privacyLink}</a>
        </p>
        <p>
          <a href="/">{copy.terms.back}</a>
        </p>
        <Disclaimer inline />
      </div>
    </div>
  );
}
