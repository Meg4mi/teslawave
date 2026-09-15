import { isMuted } from './sound';

/**
 * The robot voice: the browser's own synthesiser, dropped most of an octave and hurried a
 * little, so it sounds like the computer in a film rather than a satnav. No audio assets,
 * no network, nothing to load — and nothing to do on a screen that has no voices at all,
 * which a headless browser and possibly the car are. Every call is guarded for that: the
 * chime still plays and the card still shows, the voice is a garnish on top.
 *
 * Chromium only speaks after a user gesture on the page, the same rule as the chime's audio
 * context, and the Go tap satisfies both. A `speak` before that is silently dropped.
 */
const ROBOT = { pitch: 0.55, rate: 1.08, volume: 1 } as const;

let enabled = true;
let lang = 'en-GB';

export function setVoice(on: boolean): void {
  enabled = on;
}

/** A BCP 47 tag; the catalogue in force supplies it. */
export function setVoiceLang(tag: string): void {
  lang = tag;
}

const synth = (): SpeechSynthesis | null => {
  try {
    return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  } catch {
    return null;
  }
};

/**
 * The voice that speaks the language in force, if the platform has one. The list is often
 * empty until the platform has loaded it, so this is asked each time rather than once.
 */
function voiceFor(s: SpeechSynthesis, tag: string): SpeechSynthesisVoice | null {
  const voices = s.getVoices();
  const primary = tag.slice(0, 2).toLowerCase();
  return (
    voices.find((v) => v.lang.toLowerCase() === tag.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(primary)) ??
    null
  );
}

/**
 * Say one line. A line already being said is cut off: a burst of waves is one line each,
 * never a queue that is still talking a minute later. `force` is for the settings switch,
 * which should be heard even when the driver has just turned the voice on.
 */
export function speak(text: string, force = false): void {
  if (!force && !enabled) return;
  if (isMuted()) return;
  const s = synth();
  if (!s) return;
  try {
    s.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.pitch = ROBOT.pitch;
    utterance.rate = ROBOT.rate;
    utterance.volume = ROBOT.volume;
    const voice = voiceFor(s, lang);
    if (voice) utterance.voice = voice;
    s.speak(utterance);
  } catch {
    // No voices, or a platform that refuses without a gesture: the card and the chime carry it.
  }
}

/** Whether this screen can speak at all. Reported in the perf beacon's company, not here. */
export const canSpeak = (): boolean => synth() !== null;
