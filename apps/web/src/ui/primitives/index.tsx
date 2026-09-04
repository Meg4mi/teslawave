import { useEffect, useRef, useState, type ReactNode } from 'react';
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

/**
 * A map control: icon plus a always-visible label. A car screen has no hover, so anything
 * that only explains itself in a tooltip explains itself to nobody.
 */
export function ControlButton({
  icon,
  label,
  title,
  active = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  active?: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      data-touch
      className="control"
      aria-pressed={active}
      aria-label={title}
      title={title}
      onClick={onClick}
    >
      <span className="control__icon">{icon}</span>
      <span className="control__label">{label}</span>
    </button>
  );
}

export type ToastContent = { id: number; text: string; icon?: ReactNode; warm?: boolean };

export function Toast({ toast, onDone }: { toast: ToastContent | null; onDone: () => void }): ReactNode {
  // The dismiss timers must depend on *which* toast this is and nothing else. They used to
  // depend on the `onDone` callback, which the parent re-creates on every render — and the map
  // re-renders twice a second, so the timers were cleared and restarted forever and the toast
  // stayed on screen for the rest of the drive. `leaving` is stored as an id rather than a
  // boolean for the same reason: it needs no reset when the next toast arrives.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  const [leavingId, setLeavingId] = useState<number | null>(null);
  const id = toast?.id ?? null;

  useEffect(() => {
    if (id === null) return;
    const hide = setTimeout(() => setLeavingId(id), 3_400);
    const finish = setTimeout(() => done.current(), 3_700);
    return () => {
      clearTimeout(hide);
      clearTimeout(finish);
    };
  }, [id]);

  if (!toast) return null;
  const leaving = leavingId === toast.id;
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
