import type { ReactNode } from 'react';
import { useCopy } from '../i18n';

/** Required on every screen (brief 1). Never the Tesla logo, wordmark or "T" mark. */
export function Disclaimer({ inline = false }: { inline?: boolean }): ReactNode {
  const copy = useCopy();
  return (
    <p className={`disclaimer ${inline ? 'disclaimer--static' : ''}`.trim()}>{copy.disclaimer}</p>
  );
}
