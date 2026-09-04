import { BRAND, describeCar, type TeslaModel } from '@teslawave/protocol';

/**
 * Every user-facing string, in one file, so the voice can be reviewed in one sitting.
 * Short, warm, no exclamation marks, no emoji in chrome, never lectures (brief 7).
 */
export const COPY = {
  brand: BRAND.name,
  disclaimer: BRAND.disclaimer,

  onboarding: {
    intro: 'Wave at other Teslas',
    sub: 'See who is around you, and say hi.',
    pickModel: 'Your car',
    pickColour: 'Colour',
    nick: 'Name (optional)',
    nickHint: 'Easier to type on your phone.',
    go: 'Go',
    havePairingCode: 'I have a code',
    privacy: 'Your position is blurred before it leaves your car, and never stored.',
  },

  map: {
    online: (n: number): string => `${n} online`,
    near: (n: number): string => `${n} within 10 km`,
    lastWave: (label: string): string => `last wave ${label}`,
    noWaveYet: 'no waves yet today',
    quiet: (n: number): string =>
      n > 0
        ? `Quiet road. ${n} ${n === 1 ? 'driver' : 'drivers'} online in the area — say hi when you cross one.`
        : 'Quiet road. Nobody else out here right now.',
    spectator: 'Location is off. You can see others, they cannot see you.',
    spectatorRetry: 'Turn it on',
    hidden: 'You are invisible. Nobody can see you or wave at you.',
    paused: 'TeslaWave is paused. Back shortly.',
    budget: (time: string): string =>
      `TeslaWave is over its free capacity for today. Back at ${time}.`,
    reconnecting: 'Reconnecting…',
  },

  wave: {
    prompt: (model: TeslaModel, colour: string): string => `Wave at the ${describeCar(model, colour)}`,
    received: (model: TeslaModel, colour: string): string =>
      `A ${describeCar(model, colour)} waved at you`,
    back: 'Waved back.',
    tooFar: 'Too far now.',
    offline: 'They just went off the map.',
    tooSoon: 'One at a time.',
    hidden: 'Turn yourself back on to wave.',
    counter: 'waves',
  },

  card: {
    onlineFor: (minutes: number): string =>
      minutes < 1 ? 'just joined' : `online for ${minutes} min`,
    waves: (n: number): string => `${n} ${n === 1 ? 'wave' : 'waves'}`,
    wave: 'Wave',
  },

  pulse: {
    title: 'Around you',
    online: 'Drivers online',
    waves: 'Waves today',
    note: 'Counted across the map cells you are in, never a database of people.',
  },

  pairing: {
    showTitle: 'Show on my Tesla',
    showBody: 'Open teslawave.app on your car screen, tap "I have a code", and type this.',
    expiresIn: (mmss: string): string => `Expires in ${mmss}`,
    enterTitle: 'Enter your code',
    enterBody: 'Six characters, from your phone.',
    claim: 'Continue',
    claiming: 'Checking…',
    failed: 'That code is not valid any more. Make a new one on your phone.',
    done: 'Paired. Same car, same waves.',
  },

  milestones: {
    1: 'First wave. That is how it starts.',
    5: 'Five waves. The road knows you.',
    10: 'Ten waves. You are part of the road now.',
    25: 'Twenty-five. Reliable presence out there.',
    50: 'Fifty waves. Quietly prolific.',
    100: 'A hundred waves. Genuinely one of the regulars.',
  } as Record<number, string>,

  controls: {
    invisible: 'Invisible mode',
    visible: 'Visible',
    mute: 'Mute sounds',
    unmute: 'Unmute',
    northUp: 'North up',
    trackUp: 'Track up',
    settings: 'Settings',
    close: 'Close',
  },
} as const;

/** "2 min ago", kept short enough to read at a glance while driving. */
export function agoLabel(ts: number | null, now: number): string | null {
  if (ts === null) return null;
  const seconds = Math.max(0, Math.round((now - ts) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
}
