import type { ReactNode } from 'react';
import { REPORT_KINDS, type ReportKind } from '@teslawave/protocol';
import { Sheet } from '../ui/primitives';
import { BadgeIcon, WarningIcon } from '../ui/icons';
import { useCopy } from '../i18n';

const ICONS: Record<ReportKind, ReactNode> = {
  police: <BadgeIcon size={40} />,
  accident: <WarningIcon size={40} />,
};

/**
 * Two big buttons and one sentence. It opens from a control on the map, at speed, so there
 * is nothing to read before tapping and nothing to type after: the kind is the whole report,
 * and the position is where the car is (ADR-0040). The sentence under them says what will
 * happen — where it goes, for how long, and that nobody is named — because that is the one
 * thing a driver might want to know before tapping, and it is shorter than a confirmation.
 */
export function ReportSheet({
  onReport,
  onClose,
}: {
  onReport: (kind: ReportKind) => void;
  onClose: () => void;
}): ReactNode {
  const copy = useCopy();
  return (
    <Sheet label={copy.report.title} title={copy.report.title} onClose={onClose}>
      <div className="report" role="group" aria-label={copy.report.title}>
        {REPORT_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            data-touch
            className={`report__option report__option--${kind}`}
            onClick={() => onReport(kind)}
          >
            <span className="report__icon" aria-hidden>
              {ICONS[kind]}
            </span>
            <span className="report__label">{copy.report.kind(kind)}</span>
            <span className="report__hint">{copy.report[`${kind}Hint`]}</span>
          </button>
        ))}
      </div>
      <p className="sheet__note">{copy.report.hint}</p>
    </Sheet>
  );
}
