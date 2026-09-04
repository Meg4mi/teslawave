import type { ReactNode } from 'react';
import { COPY } from './copy';

/** Required on every screen (brief 1). Never the Tesla logo, wordmark or "T" mark. */
export function Disclaimer({ inline = false }: { inline?: boolean }): ReactNode {
  return <p className={`disclaimer ${inline ? 'disclaimer--static' : ''}`.trim()}>{COPY.disclaimer}</p>;
}
