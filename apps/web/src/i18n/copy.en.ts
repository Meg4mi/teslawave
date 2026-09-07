import {
  BRAND,
  MODEL_LABELS,
  PARKED_HIDE_MS,
  PRESENCE_EXPIRY_MS,
  colourOf,
  isColourId,
  type CarColourId,
  type TeslaModel,
} from '@teslawave/protocol';

/**
 * Every user-facing string in English, in one file, so the voice can be reviewed in one
 * sitting. Short, warm, no exclamation marks, no emoji in chrome, never lectures (brief 7).
 *
 * This file is also the contract: `Copy` is inferred from it, so every other language is a
 * compile error until it says all of the same things. Anything that bends with grammar —
 * articles, plurals, the order of a colour and a noun — is a function here rather than a
 * template assembled by the caller, because the caller cannot know a language's rules.
 */

/** The paint, as the configurator names it. */
const COLOURS: Record<CarColourId, string> = {
  pearl: 'Pearl White',
  black: 'Solid Black',
  midnight: 'Midnight Silver',
  deepblue: 'Deep Blue',
  red: 'Red',
  ultrared: 'Ultra Red',
  stealth: 'Stealth Grey',
  quicksilver: 'Quicksilver',
  diamond: 'Diamond Black',
  steel: 'Stainless',
};

/** The one word a driver would actually use for that paint, mid-sentence. */
const SHORT: Record<CarColourId, string> = {
  pearl: 'white',
  black: 'black',
  midnight: 'silver',
  deepblue: 'blue',
  red: 'red',
  ultrared: 'red',
  stealth: 'grey',
  quicksilver: 'quicksilver',
  diamond: 'black',
  steel: 'stainless',
};

/** Counts read as the language writes them: 1 234, not 1234. */
const NUMBERS = new Intl.NumberFormat('en');
const n = (value: number): string => NUMBERS.format(value);

/** "blue Model Y". Lowercase and short, so it drops into the middle of a sentence. */
const describe = (model: TeslaModel, colour: string): string =>
  `${isColourId(colour) ? SHORT[colour] : colourOf(colour).label.toLowerCase()} ${MODEL_LABELS[model]}`;

export const EN = {
  brand: BRAND.name,
  disclaimer: BRAND.disclaimer,

  /** The tab title and the description a search result shows. English is the brand's own. */
  seo: {
    title: BRAND.title,
    description: BRAND.description,
  },

  language: {
    title: 'Language',
    hint: 'Picked from your car to start with.',
  },

  cars: {
    /** A model name is a product name: the same in every language. */
    model: (model: TeslaModel): string => MODEL_LABELS[model],
    colour: (colour: string): string =>
      isColourId(colour) ? COLOURS[colour] : colourOf(colour).label,
    describe,
  },

  onboarding: {
    intro: 'Wave at other Teslas',
    sub: 'See who is around you, and say hi.',
    pickModel: 'Model',
    pickColour: 'Colour',
    nick: 'Name (optional)',
    nickPlaceholder: 'What other drivers see',
    nickHint: 'Easier to type on your phone.',
    go: 'Go',
    // Name the situation, not the mechanism: nobody has a mental model for "pairing".
    havePairingCode: 'I already set this up on my phone',
    havePairingCodeHint: 'Bring your name and wave count across with a short code.',
    howItWorks: 'How waving works',
    privacy: `Your position is shared only while you are visible, never stored, and hidden once you have been parked ${n(PARKED_HIDE_MS / 60_000)} minutes.`,
    /**
     * Shown before Go, and only when there is somebody. A landing page saying "0 drivers
     * online" is worse than one that says nothing, so there is no zero case here on purpose.
     */
    liveNow: (drivers: number, waves: number): string =>
      waves > 0
        ? `${n(drivers)} ${drivers === 1 ? 'driver' : 'drivers'} out there now · ${n(waves)} ${waves === 1 ? 'wave' : 'waves'} today`
        : `${n(drivers)} ${drivers === 1 ? 'driver' : 'drivers'} out there right now`,
  },

  map: {
    online: (count: number): string => `${n(count)} online`,
    near: (count: number): string => `${n(count)} within 10 km`,
    /** The same two facts as above, next to a counter that draws the digits itself. */
    onlineLabel: 'online',
    nearLabel: 'within 10 km',
    lastWave: (label: string): string => `last wave ${label}`,
    noWaveYet: 'no waves yet today',
    quiet: (count: number): string =>
      count > 0
        ? `Quiet road. ${n(count)} ${count === 1 ? 'driver' : 'drivers'} online in the area — say hi when you cross one.`
        : 'Quiet road. Nobody else out here right now.',
    quietHow: 'How waving works',
    spectator: 'Location is off. You can see others, they cannot see you.',
    spectatorRetry: 'Turn it on',
    hidden: 'You are invisible. Nobody can see you or wave at you.',
    parked: 'Parked for a while, so you are hidden. You are back on the map when you move.',
    paused: 'TeslaWave is paused. Back shortly.',
    budget: (time: string): string =>
      `TeslaWave is over its free capacity for today. Back at ${time}.`,
    /** Three different reasons the map has nobody on it yet, said as three different lines. */
    locating: 'Waiting for your location…',
    connecting: 'Connecting…',
    reconnecting: 'Reconnecting…',
    recentre: 'Back to my car',
    nearby: 'nearby',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    tilesOffline: 'Map tiles are not loading. Cars and waves still work.',
    /* Says what will happen and when. Nothing to tap: a driver has better things to do. */
    upgrading: 'A new version is ready. It loads the next time you stop.',
  },

  garage: {
    title: 'Your car',
    hint: 'Change what other drivers see. Takes effect for everyone around you straight away.',
    open: 'Change',
    tapHint: 'Tap to change model, colour or name',
    save: 'Save',
    cancel: 'Cancel',
    saved: 'Your car is updated.',
  },

  howTo: {
    title: 'How waving works',
    lead: 'It is the Tesla wave, on your screen. Nothing to learn.',
    steps: [
      'Drive. Other drivers running TeslaWave appear around you on the map.',
      'When one comes within about 300 m, a big Wave button appears at the bottom of the screen.',
      'Tap it. Your wave flies over and lands on their car. On their screen it washes across the whole map, with your car and a chime, and a warm Wave back button for a few seconds.',
      'Wave back within those seconds and you both get a "Waved back". A wave you receive looks the same on your screen: hard to miss, even with the sound off.',
    ],
    tapHint:
      'You can also tap any car on the map to see it and wave from there. Tap your own car to change it.',
    tryIt: 'Try it',
    tried: 'That is all there is to it.',
    close: 'Got it',
  },

  wave: {
    verb: 'Wave',
    backVerb: 'Wave back',
    promptTarget: (model: TeslaModel, colour: string): string =>
      `at the ${describe(model, colour)}`,
    prompt: (model: TeslaModel, colour: string): string => `Wave at the ${describe(model, colour)}`,
    received: (model: TeslaModel, colour: string): string =>
      `A ${describe(model, colour)} waved at you`,
    back: 'Waved back.',
    /* The received card: the beat is the title, the car is the drawing next to it. */
    cardTitle: 'waved at you',
    cardBackTitle: 'waved back',
    tooFar: 'Too far now.',
    offline: 'They just went off the map.',
    tooSoon: 'One at a time.',
    hidden: 'Turn yourself back on to wave.',
    counter: 'waves',
    /** Within a range the protocol decides, so the number is passed in. */
    within: (label: string, metres: number): string => `${label} (within ${n(metres)} m)`,
  },

  card: {
    onlineFor: (minutes: number): string =>
      minutes < 1 ? 'just joined' : `online for ${n(minutes)} min`,
    waves: (count: number): string => `${n(count)} ${count === 1 ? 'wave' : 'waves'}`,
    /** The count is drawn separately, so this is the noun on its own. */
    wavesLabel: (count: number): string => (count === 1 ? 'wave' : 'waves'),
    wave: 'Wave',
  },

  pulse: {
    title: 'Around you',
    online: 'Drivers online',
    waves: 'Waves today',
    mine: 'Your waves',
    note: 'Counted across the map cells you are in, never a database of people.',
    share: 'Share your card',
  },

  share: {
    title: 'Your card',
    headline: (waves: number): string => `${n(waves)} ${waves === 1 ? 'wave' : 'waves'}`,
    sub: 'exchanged with other Teslas on the road',
    /** The words that go with the picture in a share sheet, address included. */
    message: (waves: number): string =>
      `${n(waves)} ${waves === 1 ? 'wave' : 'waves'} exchanged with other Teslas on the road. See who is around you: ${BRAND.domain}`,
    action: 'Share',
    save: 'Save image',
    /* Says what is in the image, because what people worry about is a place being in it. */
    note: 'Your car and your count. No map, no route, nowhere you have been.',
    unavailable: 'This screen cannot save images. Open TeslaWave on your phone to send it.',
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
    failedToMake: 'Could not make a code right now. Try again in a moment.',
    backspace: 'Delete the last character',
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

  settings: {
    car: 'Your car',
    visible: 'Visible to others',
    visibleHint: 'Drivers around you can see your car and wave.',
    sound: 'Sounds',
    soundHint: 'The chime when a wave lands.',
    northUp: 'North up',
    northUpHint: 'Off, the map turns with you.',
    phone: 'Use this on my car',
    perf: 'Share performance data',
    perfHint:
      'Now and then, send how smoothly the map runs on this screen. Anonymous: no position, no name, no id.',
  },

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

  privacy: {
    title: 'Privacy',
    lead: (brand: string): string =>
      `${brand} is built so that there is nothing to leak. No account, no email, no trip history.`,
    leavesTitle: 'What leaves your car',
    leaves: [
      `Your GPS position, as it is, while you are visible and moving. A car parked for ${n(PARKED_HIDE_MS / 60_000)} minutes is hidden until it moves, so nobody can watch where you stop. The position is used only to show you to the drivers around you.`,
      'Your heading and speed, so other cars glide instead of jumping.',
      'The model and colour you picked, and a nickname if you typed one.',
      'A random secret generated in your browser. Other drivers see only a hash of it, which is not linked to you or to Tesla and cannot be used to pose as you.',
    ],
    keptTitle: 'What is kept',
    kept: [
      `Positions live in memory for ${n(PRESENCE_EXPIRY_MS / 1000)} seconds and are never written to a database.`,
      'Wave counts, as numbers. Yours, and a daily total per map area.',
      'No trip history, no routes, no timestamps of where you were.',
      'If you turn on "Share performance data": screen density and size, frame timings, and how many cars were on the map. Nothing that says who or where you are. Kept 30 days.',
    ],
    thirdPartiesTitle: 'Third parties',
    thirdParties: [
      'Map tiles are served by OpenFreeMap, which sees the tiles your browser asks for.',
      'Cloudflare Web Analytics counts page views without cookies.',
      'No advertising, no tracking pixels, no cookie banner because there are no cookies.',
    ],
    invisible:
      'Turn on invisible mode any time and you disappear from every other screen within two seconds.',
    back: 'Back to the map',
  },

  /** "2 min ago", kept short enough to read at a glance while driving. */
  agoLabel: (ts: number | null, now: number): string | null => {
    if (ts === null) return null;
    const seconds = Math.max(0, Math.round((now - ts) / 1000));
    if (seconds < 45) return 'just now';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${n(minutes)} min ago`;
    return `${n(Math.round(minutes / 60))} h ago`;
  },
};

/**
 * The shape every language must fill. Inferred rather than written out, so adding a string
 * to English is all it takes to make the other catalogues fail to compile until they have it.
 */
export type Copy = typeof EN;
