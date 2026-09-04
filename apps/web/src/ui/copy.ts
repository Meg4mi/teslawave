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
    // Name the situation, not the mechanism: nobody has a mental model for "pairing".
    havePairingCode: 'I already set this up on my phone',
    havePairingCodeHint: 'Bring your name and wave count across with a short code.',
    howItWorks: 'How waving works',
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
    quietHow: 'How waving works',
    spectator: 'Location is off. You can see others, they cannot see you.',
    spectatorRetry: 'Turn it on',
    hidden: 'You are invisible. Nobody can see you or wave at you.',
    paused: 'TeslaWave is paused. Back shortly.',
    budget: (time: string): string =>
      `TeslaWave is over its free capacity for today. Back at ${time}.`,
    reconnecting: 'Reconnecting…',
    tilesOffline: 'Map tiles are not loading. Cars and waves still work.',
  },

  howTo: {
    title: 'How waving works',
    lead: 'It is the Tesla wave, on your screen. Nothing to learn.',
    steps: [
      'Drive. Other drivers running TeslaWave appear around you on the map.',
      'When one comes within about 150 m, a big Wave button appears at the bottom of the screen.',
      'Tap it. They see a ripple on your car and hear a chime. If they wave back within a few seconds, you both get a "Waved back".',
    ],
    tapHint: 'You can also tap any car on the map to see it and wave from there.',
    tryIt: 'Try it',
    tried: 'That is all there is to it.',
    close: 'Got it',
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
    showTitle: 'Use this on my car',
    showAction: 'Use this on my car',
    showHint: 'So you do not have to set it all up again on the car screen.',
    showBody:
      'On your car screen, open teslawave.app and tap "I already set this up on my phone". Then type this code. Your car keeps the same name, car and wave count.',
    expiresIn: (mmss: string): string => `Expires in ${mmss}`,
    enterTitle: 'Type the code from your phone',
    enterBody:
      'On your phone, open teslawave.app, tap "Use this on my car", and type the six characters it shows you here.',
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
    invisible: 'Invisible',
    visible: 'Visible',
    goInvisible: 'Go invisible',
    goVisible: 'Become visible',
    invisibleHint: 'Nobody can see you or wave at you.',
    visibleHint: 'Other drivers can see you and wave.',
    mute: 'Mute',
    unmute: 'Unmute',
    sound: 'Sound',
    muted: 'Muted',
    northUp: 'North up',
    trackUp: 'Track up',
    orientation: 'Map turns with you',
    orientationNorth: 'Map stays north up',
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
