import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toast, type ToastContent } from './index';

/**
 * The toast that would not go away: the parent re-rendered twice a second, the dismiss timers
 * depended on the `onDone` prop, and every render cancelled and restarted them. On a car screen
 * that meant "A red Model 3 waved at you" stayed up for the rest of the drive.
 */
describe('Toast', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  const mount = (node: ReactNode): void => {
    act(() => root.render(node));
  };

  it('dismisses itself even while the parent keeps re-rendering', () => {
    const toast: ToastContent = { id: 1, text: 'A red Model 3 waved at you' };
    let done = 0;
    let rerender = (): void => undefined;

    function Parent(): ReactNode {
      const [, setBeat] = useState(0);
      rerender = () => setBeat((n) => n + 1);
      // A fresh closure on every render, exactly as the app writes it.
      return <Toast toast={toast} onDone={() => (done += 1)} />;
    }

    mount(<Parent />);
    // The map ticks twice a second; the toast lives for 3.7 s.
    for (let i = 0; i < 10; i++) {
      act(() => {
        vi.advanceTimersByTime(500);
      });
      act(() => rerender());
    }
    expect(done).toBe(1);
    expect(host.textContent).toContain('A red Model 3 waved at you');
  });

  it('starts a fresh countdown for the next toast', () => {
    const done: number[] = [];
    mount(<Toast toast={{ id: 1, text: 'first' }} onDone={() => done.push(1)} />);
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    mount(<Toast toast={{ id: 2, text: 'second' }} onDone={() => done.push(2)} />);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    // The first toast's timer belonged to the first toast and left with it.
    expect(done).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(done).toEqual([2]);
  });

  it('renders nothing when there is no toast', () => {
    mount(<Toast toast={null} onDone={() => undefined} />);
    expect(host.textContent).toBe('');
  });
});
