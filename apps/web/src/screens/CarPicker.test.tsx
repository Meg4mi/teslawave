import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STATUS_MAX_LEN } from '@teslawave/protocol';
import { CarPicker, type CarChoice } from './CarPicker';

/**
 * The status is one choice made two ways: five chips, or the driver's own words. Whichever
 * they use has to clear the other, or a card would show two statuses and the wire would
 * carry a field the hub drops (ADR-0040, amended).
 */
describe('CarPicker: the status is one choice', () => {
  let host: HTMLDivElement;
  let root: Root;
  let value: CarChoice;

  const show = (over: Partial<CarChoice> = {}): void => {
    value = { model: '3', colour: 'pearl', nick: '', status: null, statusText: '', ...over };
    act(() =>
      root.render(
        <CarPicker
          value={value}
          onChange={(patch) => {
            value = { ...value, ...patch };
          }}
        />,
      ),
    );
  };

  const chip = (label: string): HTMLButtonElement => {
    const found = [...host.querySelectorAll<HTMLButtonElement>('button.chip')].find(
      (b) => b.textContent === label,
    );
    if (!found) throw new Error(`no chip called ${label}`);
    return found;
  };
  const ownField = (): HTMLInputElement => {
    const input = host.querySelector<HTMLInputElement>('.field__input--sub');
    if (!input) throw new Error('no field for the driver’s own words');
    return input;
  };

  /**
   * React tracks a controlled input's value on the node, so assigning to `value` and firing
   * an event is a change React has already seen and will not report. The value has to be set
   * through the prototype's own setter, which is what a real keystroke does.
   */
  const type = (input: HTMLInputElement, text: string): void => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      setter?.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('clears the written words when a chip is picked', () => {
    show({ statusText: 'towing a caravan' });
    act(() => chip('On a road trip').click());
    expect(value.status).toBe('roadtrip');
    expect(value.statusText).toBe('');
  });

  it('clears the chip when the driver writes their own', () => {
    show({ status: 'charging' });
    type(ownField(), 'towing a caravan');
    expect(value.statusText).toBe('towing a caravan');
    expect(value.status).toBeNull();
  });

  it('presses None only when neither half has been used', () => {
    show();
    expect(chip('None').getAttribute('aria-pressed')).toBe('true');
    show({ statusText: 'towing' });
    expect(chip('None').getAttribute('aria-pressed')).toBe('false');
    show({ status: 'commute' });
    expect(chip('None').getAttribute('aria-pressed')).toBe('false');
    expect(chip('Commuting').getAttribute('aria-pressed')).toBe('true');
  });

  it('clears both halves when None is tapped', () => {
    show({ statusText: 'towing a caravan' });
    act(() => chip('None').click());
    expect(value.status).toBeNull();
    expect(value.statusText).toBe('');
  });

  it('stops the field at the length the wire keeps', () => {
    show();
    expect(ownField().maxLength).toBe(STATUS_MAX_LEN);
  });
});
