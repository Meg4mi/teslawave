import { useEffect, useMemo, useState, type ReactNode } from 'react';
import qrcode from 'qrcode-generator';
import {
  BRAND,
  PAIR_ALPHABET,
  PAIR_CODE_LEN,
  isValidCode,
  normaliseCode,
} from '@teslawave/protocol';
import { Button, Sheet } from '../ui/primitives';
import { COPY } from '../ui/copy';
import type { Identity } from '../identity/store';

const mmss = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** Phone side: make a code and a QR that carry this identity to the car. */
export function ShowPairingSheet({
  identity,
  onClose,
}: {
  identity: Identity;
  onClose: () => void;
}): ReactNode {
  const [state, setState] = useState<{ code: string; expiresAt: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: identity.id,
        model: identity.model,
        colour: identity.colour,
        ...(identity.nick === undefined ? {} : { nick: identity.nick }),
      }),
    })
      .then((res) => (res.ok ? (res.json() as Promise<{ code: string; expiresAt: number }>) : null))
      .then((body) => {
        if (cancelled) return;
        if (body) setState(body);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [identity]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const qrSvg = useMemo(() => {
    if (!state) return null;
    const qr = qrcode(0, 'M');
    qr.addData(`${BRAND.url}/?pair=${state.code}`);
    qr.make();
    return qr.createDataURL(6, 8);
  }, [state]);

  return (
    <Sheet label={COPY.pairing.showTitle} onClose={onClose}>
      <h2 className="card-sheet__title">{COPY.pairing.showTitle}</h2>
      <p className="hud__note">{COPY.pairing.showBody}</p>

      {failed ? <p className="pair__code">—</p> : null}
      {state ? (
        <>
          <p className="pair__code">{state.code}</p>
          {qrSvg ? <img className="pair__qr" src={qrSvg} alt="" /> : null}
          <p className="hud__note">{COPY.pairing.expiresIn(mmss(state.expiresAt - now))}</p>
        </>
      ) : null}

      <div className="card-sheet__actions">
        <Button variant="ghost" onClick={onClose}>
          {COPY.controls.close}
        </Button>
      </div>
    </Sheet>
  );
}

/** Car side: a keypad of our own, because the built-in keyboard is hostile while parked. */
export function EnterCodeSheet({
  onPaired,
  onClose,
}: {
  onPaired: (identity: { id: string; model: string; colour: string; nick?: string }) => void;
  onClose: () => void;
}): ReactNode {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const claim = async (value: string): Promise<void> => {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch('/api/pair/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: value }),
      });
      if (!res.ok) throw new Error('rejected');
      const body = (await res.json()) as {
        identity: { id: string; model: string; colour: string; nick?: string };
      };
      onPaired(body.identity);
    } catch {
      setError(true);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const press = (ch: string): void => {
    const next = normaliseCode(code + ch);
    setCode(next);
    setError(false);
    if (next.length === PAIR_CODE_LEN && isValidCode(next)) void claim(next);
  };

  const slots = Array.from({ length: PAIR_CODE_LEN }, (_, i) => code[i] ?? '·');

  return (
    <Sheet label={COPY.pairing.enterTitle} onClose={onClose}>
      <h2 className="card-sheet__title">{COPY.pairing.enterTitle}</h2>
      <p className="hud__note">{COPY.pairing.enterBody}</p>

      <div className="pair__entry" aria-label={code}>
        {slots.map((ch, i) => (
          <span key={i} className={`pair__slot ${ch === '·' ? '' : 'pair__slot--filled'}`.trim()}>
            {ch}
          </span>
        ))}
      </div>

      {error ? <p className="hud__note">{COPY.pairing.failed}</p> : null}

      <div className="keypad">
        {[...PAIR_ALPHABET].map((ch) => (
          <Button key={ch} onClick={() => press(ch)} disabled={busy}>
            {ch}
          </Button>
        ))}
        <Button className="keypad__wide" onClick={() => setCode(code.slice(0, -1))} disabled={busy}>
          ←
        </Button>
      </div>

      <div className="card-sheet__actions">
        <Button variant="ghost" onClick={onClose}>
          {COPY.controls.close}
        </Button>
        {busy ? <span className="hud__note">{COPY.pairing.claiming}</span> : null}
      </div>
    </Sheet>
  );
}
