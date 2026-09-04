import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WAVE_PROMPT_TTL_MS } from '@teslawave/protocol';
import { WaveButton } from './WaveButton';

/**
 * The button that only ever came once. Its ten-second window was a single `expired` flag that
 * nothing reset, so after the first car of the drive had passed, no later car got a prompt.
 */
describe('WaveButton', () => {
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

  const target = (id: string) => ({ id, model: 'Y' as const, colour: 'deepblue' });
  const show = (id: string | null, onWave = (): void => undefined): void => {
    // A fresh object each time, exactly as the summary hands it over twice a second.
    act(() => root.render(<WaveButton target={id ? target(id) : null} onWave={onWave} />));
  };
  const button = (): HTMLButtonElement | null => host.querySelector('button.wave');

  it('prompts for the next car after the first prompt has run out', () => {
    show('a');
    expect(button()).not.toBeNull();
    // The window runs out, then the exit animation: two timers, the second scheduled by the
    // render the first one causes, so they are advanced in two steps.
    act(() => vi.advanceTimersByTime(WAVE_PROMPT_TTL_MS + 1));
    expect(button()?.classList.contains('wave--leaving')).toBe(true);
    act(() => vi.advanceTimersByTime(1_000));
    expect(button()).toBeNull();

    show('b');
    expect(button()).not.toBeNull();
    expect(button()?.getAttribute('aria-label')).toMatch(/^Wave at the/);
  });

  it('keeps its window while the parent re-renders the same car', () => {
    show('a');
    for (let i = 0; i < 12; i++) {
      act(() => vi.advanceTimersByTime(1_000));
      show('a');
    }
    // Twelve seconds of re-renders: the window is ten, and it must not have been restarted.
    expect(button()).toBeNull();
  });

  it('goes after a wave, and comes back for the same car once it has been out of range', () => {
    const onWave = vi.fn();
    show('a', onWave);
    act(() => button()?.click());
    expect(onWave).toHaveBeenCalledWith('a');
    act(() => vi.advanceTimersByTime(1_000));
    expect(button()).toBeNull();

    // Still alongside: no second prompt for the same car.
    show('a', onWave);
    expect(button()).toBeNull();

    // Gone and back: a new approach, a new prompt.
    show(null, onWave);
    show('a', onWave);
    expect(button()).not.toBeNull();
  });

  it('disappears when the car goes out of range', () => {
    show('a');
    show(null);
    expect(button()).toBeNull();
  });
});
