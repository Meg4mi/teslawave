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
import { BackspaceIcon } from '../ui/icons';
import { useCopy } from '../i18n';
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
  const copy = useCopy();
  const [state, setState] = useState<{ code: string; expiresAt: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // The secret crosses, not the id: the car derives the same id from it (ADR-0025).
      body: JSON.stringify({
        secret: identity.secret,
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
    <Sheet label={copy.pairing.showTitle} title={copy.pairing.showTitle} onClose={onClose}>
      <p className="sheet__note">{copy.pairing.showBody}</p>

      <div className="pair">
        {failed ? <p className="pair__error">{copy.pairing.failedToMake}</p> : null}
        {state ? (
          <>
            <p className="pair__code num">{state.code}</p>
            {qrSvg ? <img className="pair__qr" src={qrSvg} alt="" /> : null}
            <p className="settings__hint">{copy.pairing.expiresIn(mmss(state.expiresAt - now))}</p>
          </>
        ) : null}
      </div>
    </Sheet>
  );
}

/** Car side: a keypad of our own, because the built-in keyboard is hostile while parked. */
export function EnterCodeSheet({
  onPaired,
  onClose,
}: {
  onPaired: (identity: { secret: string; model: string; colour: string; nick?: string }) => void;
  onClose: () => void;
}): ReactNode {
  const copy = useCopy();
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
        identity: { secret: string; model: string; colour: string; nick?: string };
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

  const slots = Array.from({ length: PAIR_CODE_LEN }, (_, i) => code[i] ?? '');

  return (
    <Sheet label={copy.pairing.enterTitle} title={copy.pairing.enterTitle} onClose={onClose} wide>
      <p className="sheet__note">{copy.pairing.enterBody}</p>

      <div className="pair__entry" aria-label={code}>
        {slots.map((ch, i) => (
          <span key={i} className={`pair__slot ${ch ? 'pair__slot--filled' : ''}`.trim()}>
            {ch}
          </span>
        ))}
        <Button
          variant="icon"
          className="pair__backspace"
          label={copy.pairing.backspace}
          onClick={() => setCode(code.slice(0, -1))}
          disabled={busy || code.length === 0}
        >
          <BackspaceIcon />
        </Button>
      </div>

      {error ? <p className="pair__error">{copy.pairing.failed}</p> : null}
      {busy ? (
        <p className="settings__hint" style={{ textAlign: 'center' }}>
          {copy.pairing.claiming}
        </p>
      ) : null}

      <div className="keypad">
        {[...PAIR_ALPHABET].map((ch) => (
          <Button key={ch} onClick={() => press(ch)} disabled={busy}>
            {ch}
          </Button>
        ))}
      </div>
    </Sheet>
  );
}
