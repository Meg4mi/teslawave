import { useEffect, useState, type ReactNode } from 'react';
import './primitives.css';

export function Sheet({
  children,
  onClose,
  label,
}: {
  children: ReactNode;
  onClose?: () => void;
  label: string;
}): ReactNode {
  return (
    <>
      {onClose ? <div className="scrim" onPointerDown={onClose} /> : null}
      <section className="surface sheet" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </section>
    </>
  );
}

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled,
  label,
  className = '',
}: {
  children?: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'ghost' | 'icon';
  disabled?: boolean;
  label?: string;
  className?: string;
}): ReactNode {
  const variantClass =
    variant === 'default' ? '' : variant === 'icon' ? 'btn--icon btn--ghost' : `btn--${variant}`;
  return (
    <button
      type="button"
      data-touch
      className={`btn ${variantClass} ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      {children}
    </button>
  );
}

/**
 * A number whose digits roll up when it changes, and flash warm when told to celebrate.
 * The whole reward beat after a wave is this component plus a sound.
 */
export function Counter({
  value,
  celebrate = false,
  className = '',
}: {
  value: number;
  celebrate?: boolean;
  className?: string;
}): ReactNode {
  // The documented "adjust state during render" pattern: no refs, no effect, no extra frame.
  const [previous, setPrevious] = useState(value);
  const changed = previous !== value;
  if (changed) setPrevious(value);
  const digits = String(value).split('');
  return (
    <span
      className={`counter num ${celebrate && changed ? 'counter--celebrate' : ''} ${className}`.trim()}
      aria-label={String(value)}
    >
      {digits.map((digit, i) => (
        <span
          className="counter__digit"
          // Re-keying on the value restarts the roll for every digit that moved.
          key={`${i}-${digit}-${changed ? value : 'stable'}`}
          aria-hidden
        >
          {digit}
        </span>
      ))}
    </span>
  );
}

export type ToastContent = { id: number; text: string; icon?: ReactNode; warm?: boolean };

export function Toast({ toast, onDone }: { toast: ToastContent | null; onDone: () => void }): ReactNode {
  // Keyed by toast id in the parent, so every toast mounts fresh and starts un-dismissed.
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const hide = setTimeout(() => setLeaving(true), 3_400);
    const done = setTimeout(onDone, 3_700);
    return () => {
      clearTimeout(hide);
      clearTimeout(done);
    };
  }, [toast, onDone]);

  if (!toast) return null;
  return (
    <div
      className={`toast ${leaving ? 'toast--leaving' : ''}`.trim()}
      role="status"
      style={toast.warm ? { borderColor: 'var(--accent-warm)' } : undefined}
    >
      {toast.icon}
      <span>{toast.text}</span>
    </div>
  );
}
