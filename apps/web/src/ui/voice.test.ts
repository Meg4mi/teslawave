import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setMuted } from './sound';
import { setVoice, setVoiceLang, speak } from './voice';

/**
 * The robot voice is the platform's synthesiser with the pitch dropped. What is worth
 * pinning is not the sound but the rules: it is silent under the mute, it speaks the
 * language in force, it cuts itself off rather than queueing, and a screen with no
 * synthesiser at all is simply quiet.
 */
describe('the robot voice', () => {
  const spoken: SpeechSynthesisUtterance[] = [];
  const synth = {
    cancel: vi.fn(),
    speak: vi.fn((u: SpeechSynthesisUtterance) => spoken.push(u)),
    getVoices: vi.fn(() => [
      { lang: 'en-US', name: 'Samantha' },
      { lang: 'fr-FR', name: 'Thomas' },
    ]),
  };

  beforeEach(() => {
    spoken.length = 0;
    synth.cancel.mockClear();
    synth.speak.mockClear();
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = class {
      text: string;
      lang = '';
      pitch = 1;
      rate = 1;
      volume = 1;
      voice: unknown = null;
      constructor(text: string) {
        this.text = text;
      }
    };
    setMuted(false);
    setVoice(true);
    setVoiceLang('en-GB');
  });

  afterEach(() => {
    delete (window as { speechSynthesis?: unknown }).speechSynthesis;
  });

  it('speaks an octave down, in the language in force, and cuts the last line off', () => {
    speak('Ghost waved at you.');
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(spoken[0]?.text).toBe('Ghost waved at you.');
    expect(spoken[0]?.pitch).toBeLessThan(0.7);
    expect(spoken[0]?.lang).toBe('en-GB');
    // No exact match for en-GB on this platform: the nearest English voice is taken.
    expect((spoken[0]?.voice as { name: string }).name).toBe('Samantha');

    setVoiceLang('fr-FR');
    speak('Ghost vous a fait signe.');
    expect((spoken[1]?.voice as { name: string }).name).toBe('Thomas');
  });

  it('is silent under the mute, and when switched off, unless forced', () => {
    setMuted(true);
    speak('nothing');
    expect(synth.speak).not.toHaveBeenCalled();
    setMuted(false);
    setVoice(false);
    speak('nothing');
    expect(synth.speak).not.toHaveBeenCalled();
    speak('Voice on.', true);
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it('is simply quiet on a screen with no synthesiser', () => {
    delete (window as { speechSynthesis?: unknown }).speechSynthesis;
    expect(() => speak('anything')).not.toThrow();
  });
});
