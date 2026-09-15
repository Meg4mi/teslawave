import type { ReactNode } from 'react';
import type { ReportKind } from '@teslawave/protocol';
import { Button, Sheet, SheetActions } from '../ui/primitives';
import { BadgeIcon, WarningIcon } from '../ui/icons';
import { useCopy } from '../i18n';
import type { WorldReport } from '../sim/world';

const ICONS: Record<ReportKind, ReactNode> = {
  police: <BadgeIcon size={48} />,
  accident: <WarningIcon size={48} />,
};

/**
 * The card a pin raises when you tap it, and the only place the question gets asked: is it
 * still there? (ADR-0040, amended.)
 *
 * The two answers are the whole card, side by side at the foot where a sheet's actions
 * always are, because the driver is passing the thing right now. Everything above them is
 * what a driver needs to judge the pin: what it is, how old it is, how many people say it is
 * there, and how many say it is not.
 */
export function ReportCard({
  report,
  serverNow,
  onVote,
  onClose,
}: {
  report: WorldReport;
  serverNow: number;
  onVote: (there: boolean) => void;
  onClose: () => void;
}): ReactNode {
  const copy = useCopy();
  const title = copy.report.kind(report.kind);
  const ago = copy.agoLabel(report.at, serverNow);

  return (
    <Sheet label={title} title={title} onClose={onClose}>
      <div className="card-sheet__head">
        <span className={`report-card__icon report-card__icon--${report.kind}`} aria-hidden>
          {ICONS[report.kind]}
        </span>
        <p className="card-sheet__meta">
          {ago ? <span>{copy.report.seen(ago)}</span> : null}
          <span>{copy.report.confirmed(report.n)}</span>
          {/* Only when somebody has said otherwise: a pin nobody disputes says nothing here. */}
          {report.no > 0 ? (
            <span className="report-card__disputed">{copy.report.disputed(report.no)}</span>
          ) : null}
        </p>
      </div>
      <p className="sheet__note">{copy.report.cardNote}</p>
      <SheetActions>
        <Button onClick={() => onVote(false)}>{copy.report.gone}</Button>
        <Button variant="primary" onClick={() => onVote(true)}>
          {copy.report.stillThere}
        </Button>
      </SheetActions>
    </Sheet>
  );
}
