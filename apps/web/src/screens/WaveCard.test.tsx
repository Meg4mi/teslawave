import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WaveCard, type WaveCardContent } from './WaveCard';

/**
 * A named car is named on the card its wave raises. The name never replaces the car: the
 * paint and the model are what you recognise across a lane, and half the drivers on the map
 * have no name at all, so the card without one has to be exactly what it was.
 */
describe('WaveCard', () => {
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

  const show = (card: Partial<WaveCardContent> = {}): void => {
    act(() =>
      root.render(
        <WaveCard
          card={{ id: 1, model: 'Y', colour: 'deepblue', back: false, ...card }}
          onDone={() => undefined}
        />,
      ),
    );
  };
  const text = (selector: string): string | null =>
    host.querySelector(selector)?.textContent ?? null;

  it('leads with the name, and keeps the car underneath it', () => {
    show({ nick: 'Ghost' });
    expect(text('.wave-card__who')).toBe('Ghost');
    expect(text('.wave-card__model')).toBe('blue Model Y');
    expect(text('.wave-card__what')).toBe('waved at you');
  });

  it('does not capitalise a name its owner wrote in lower case', () => {
    show({ nick: 'ghost' });
    const name = host.querySelector('.wave-card__who');
    expect(name?.textContent).toBe('ghost');
    expect(name?.className).toContain('wave-card__who--name');
  });

  it('is the card it always was for a car with no name', () => {
    show();
    expect(text('.wave-card__who')).toBe('blue Model Y');
    expect(host.querySelector('.wave-card__model')).toBeNull();
  });

  it('names the car on a wave back too', () => {
    show({ nick: 'Ghost', back: true });
    expect(text('.wave-card__who')).toBe('Ghost');
    expect(text('.wave-card__what')).toBe('waved back');
  });

  it('puts the whole news in the live region, in the order it is read', () => {
    show({ nick: 'Ghost' });
    const card = host.querySelector('.wave-card');
    expect(card?.getAttribute('role')).toBe('status');
    // The drawing is decoration and is hidden from it; the three lines are the sentence.
    expect(card?.querySelector('.wave-card__car')?.getAttribute('aria-hidden')).toBe('true');
    expect(
      [...(card?.querySelectorAll('.wave-card__text > span') ?? [])].map((s) => s.textContent),
    ).toEqual(['Ghost', 'blue Model Y', 'waved at you']);
  });
});
