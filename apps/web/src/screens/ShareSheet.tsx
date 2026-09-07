import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BRAND, type TeslaModel } from '@teslawave/protocol';
import { Button, Sheet, SheetActions } from '../ui/primitives';
import { useCopy } from '../i18n';
import { cardBlob, drawShareCard, shareAbility, type ShareAbility } from '../share/card';

/**
 * The card, on screen, with whatever this browser can do with it.
 *
 * Reached from "Around you", which is a sheet a driver opens deliberately — never from the
 * wave itself. A wave lasts two seconds and happens at speed; putting a share button on it
 * would be asking someone to compose a post at 100 km/h. This is the parked interaction, and
 * it is the only place the card is offered.
 *
 * On a phone this ends in the share sheet. On the car browser it very likely ends in neither
 * a share nor a download, which is why the image is drawn on screen regardless: the phone
 * that paired to this car can send it properly, and the card is worth seeing either way.
 */
export function ShareSheet({
  car,
  waves,
  onClose,
}: {
  car: { model: TeslaModel; colour: string };
  waves: number;
  onClose: () => void;
}): ReactNode {
  const copy = useCopy();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ability, setAbility] = useState<ShareAbility | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawShareCard(canvas, {
      model: car.model,
      colour: car.colour,
      headline: copy.share.headline(waves),
      sub: copy.share.sub,
      brand: BRAND.name,
      domain: BRAND.domain,
      disclaimer: copy.disclaimer,
    });
    setAbility(shareAbility(new File([], 'teslawave.png', { type: 'image/png' })));
  }, [car.model, car.colour, waves, copy]);

  const act = async (): Promise<void> => {
    const canvas = canvasRef.current;
    if (!canvas || busy) return;
    setBusy(true);
    try {
      const blob = await cardBlob(canvas);
      if (!blob) {
        setNote(copy.share.unavailable);
        return;
      }
      const file = new File([blob], 'teslawave.png', { type: 'image/png' });
      if (ability === 'share') {
        // The picture is what travels; the address is how anyone who sees it gets here.
        await navigator.share({
          files: [file],
          text: copy.share.message(waves),
          url: BRAND.url,
        });
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'teslawave.png';
      link.click();
      // Let the click be handled before the URL stops meaning anything.
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      // A share the driver cancelled is not a failure, and neither is a download the car
      // browser refused. Say the one thing that is true on every screen.
      setNote(copy.share.unavailable);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet label={copy.share.title} title={copy.share.title} onClose={onClose} wide>
      <canvas className="share__card" ref={canvasRef} aria-label={copy.share.headline(waves)} />
      <p className="sheet__note">{note ?? copy.share.note}</p>
      {ability !== 'none' ? (
        <SheetActions>
          <Button variant="primary" onClick={() => void act()} disabled={busy}>
            {ability === 'share' ? copy.share.action : copy.share.save}
          </Button>
        </SheetActions>
      ) : null}
    </Sheet>
  );
}
