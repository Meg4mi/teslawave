/**
 * Three cues, generated in code, no audio assets. Under 300 ms each, and audibly
 * different from one another: you are driving, so you must be able to tell a wave you
 * sent from a wave you received without looking at the screen.
 *
 * The context is unlocked by the "Go" tap, which is the only gesture we are guaranteed.
 */
type Voice = { freqs: number[]; ms: number; gain: number; detune?: number };

const VOICES = {
  sent: { freqs: [660, 880], ms: 180, gain: 0.16 },
  received: { freqs: [880, 1320], ms: 240, gain: 0.18, detune: 4 },
  milestone: { freqs: [880, 1320, 1760], ms: 320, gain: 0.2 },
} satisfies Record<string, Voice>;

export type Cue = keyof typeof VOICES;

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(value: boolean): void {
  muted = value;
}

/** Call from a user gesture, once. Safe to call again. */
export function unlockAudio(): void {
  if (ctx) {
    void ctx.resume();
    return;
  }
  try {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function play(cue: Cue): void {
  const audio = ctx;
  if (muted || !audio || audio.state !== 'running') return;
  const voice: Voice = VOICES[cue];
  const now = audio.currentTime;
  const seconds = voice.ms / 1000;

  const master = audio.createGain();
  master.gain.setValueAtTime(0, now);
  master.gain.linearRampToValueAtTime(voice.gain, now + 0.012);
  master.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
  master.connect(audio.destination);

  voice.freqs.forEach((freq, i) => {
    const osc = audio.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    if (voice.detune) osc.detune.setValueAtTime(i === 0 ? -voice.detune : voice.detune, now);
    const start = now + i * (seconds / (voice.freqs.length * 2.5));
    osc.connect(master);
    osc.start(start);
    osc.stop(now + seconds + 0.02);
  });
}
