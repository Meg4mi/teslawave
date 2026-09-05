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
import type { Copy } from './copy.en';

/**
 * French. Typed as `Copy`, so this file stops compiling the moment English says something
 * it does not.
 *
 * The verb is "saluer" and the noun is "un salut": the Tesla wave is a greeting here, not a
 * hand gesture, and "faire un signe de la main" is far too long for a button read at 80 km/h.
 * Two things English never has to think about are handled below rather than left to the
 * caller: a colour follows its noun and agrees with its gender, and every model but the
 * Cybertruck is feminine.
 */

/** Model 3, Y, S and X are "la"; the Cybertruck is "le". */
const FEMININE: Record<TeslaModel, boolean> = { '3': true, Y: true, S: true, X: true, CT: false };

const COLOURS: Record<CarColourId, string> = {
  pearl: 'Blanc nacré',
  black: 'Noir uni',
  midnight: 'Gris minuit',
  deepblue: 'Bleu profond',
  red: 'Rouge',
  ultrared: 'Rouge intense',
  stealth: 'Gris furtif',
  quicksilver: 'Argent vif',
  diamond: 'Noir diamant',
  steel: 'Acier inoxydable',
};

/** The mid-sentence adjective, feminine and masculine. "Inox" does not decline. */
const SHORT: Record<CarColourId, readonly [feminine: string, masculine: string]> = {
  pearl: ['blanche', 'blanc'],
  black: ['noire', 'noir'],
  midnight: ['grise', 'gris'],
  deepblue: ['bleue', 'bleu'],
  red: ['rouge', 'rouge'],
  ultrared: ['rouge', 'rouge'],
  stealth: ['grise', 'gris'],
  quicksilver: ['argentée', 'argenté'],
  diamond: ['noire', 'noir'],
  steel: ['inox', 'inox'],
};

const NUMBERS = new Intl.NumberFormat('fr');
const n = (value: number): string => NUMBERS.format(value);

/** "Model Y bleue", "Cybertruck inox": the colour comes second here, and it agrees. */
const describe = (model: TeslaModel, colour: string): string => {
  const feminine = FEMININE[model];
  const adjective = isColourId(colour)
    ? SHORT[colour][feminine ? 0 : 1]
    : colourOf(colour).label.toLowerCase();
  return `${MODEL_LABELS[model]} ${adjective}`;
};

/** "la Model Y bleue" / "le Cybertruck inox". */
const theCar = (model: TeslaModel, colour: string): string =>
  `${FEMININE[model] ? 'la' : 'le'} ${describe(model, colour)}`;

/** "Une Model Y bleue" / "Un Cybertruck inox", at the start of a sentence. */
const aCar = (model: TeslaModel, colour: string): string =>
  `${FEMININE[model] ? 'Une' : 'Un'} ${describe(model, colour)}`;

export const FR: Copy = {
  brand: BRAND.name,
  disclaimer:
    'Projet indépendant. Sans affiliation avec Tesla, Inc., ni approbation ou parrainage de sa part. TESLA est une marque de Tesla, Inc.',

  language: {
    title: 'Langue',
    hint: 'Choisie d’après votre voiture au départ.',
  },

  cars: {
    model: (model: TeslaModel): string => MODEL_LABELS[model],
    colour: (colour: string): string =>
      isColourId(colour) ? COLOURS[colour] : colourOf(colour).label,
    describe,
  },

  onboarding: {
    intro: 'Saluez les autres Tesla',
    sub: 'Voyez qui roule autour de vous, et dites bonjour.',
    pickModel: 'Modèle',
    pickColour: 'Couleur',
    nick: 'Nom (facultatif)',
    nickPlaceholder: 'Ce que voient les autres conducteurs',
    nickHint: 'Plus simple à saisir sur votre téléphone.',
    go: 'Démarrer',
    havePairingCode: 'J’ai déjà tout réglé sur mon téléphone',
    havePairingCodeHint: 'Reprenez votre nom et vos saluts avec un code court.',
    howItWorks: 'Comment saluer',
    privacy: `Votre position n’est partagée que lorsque vous êtes visible, jamais conservée, et masquée après ${n(PARKED_HIDE_MS / 60_000)} minutes à l’arrêt.`,
  },

  map: {
    online: (count: number): string => `${n(count)} en ligne`,
    near: (count: number): string => `${n(count)} à moins de 10 km`,
    onlineLabel: 'en ligne',
    nearLabel: 'à moins de 10 km',
    lastWave: (label: string): string => `dernier salut ${label}`,
    noWaveYet: 'aucun salut aujourd’hui',
    quiet: (count: number): string =>
      count > 0
        ? `Route calme. ${n(count)} ${count === 1 ? 'conducteur' : 'conducteurs'} en ligne dans la zone — dites bonjour quand vous en croisez un.`
        : 'Route calme. Personne d’autre dans le coin pour l’instant.',
    quietHow: 'Comment saluer',
    spectator: 'La localisation est désactivée. Vous voyez les autres, ils ne vous voient pas.',
    spectatorRetry: 'L’activer',
    hidden: 'Vous êtes invisible. Personne ne vous voit ni ne peut vous saluer.',
    parked: 'À l’arrêt depuis un moment, vous êtes donc masqué. Vous réapparaissez sur la carte dès que vous roulez.',
    paused: 'TeslaWave est en pause. De retour très vite.',
    budget: (time: string): string =>
      `TeslaWave a dépassé sa capacité gratuite pour aujourd’hui. De retour à ${time}.`,
    reconnecting: 'Reconnexion…',
    recentre: 'Revenir à ma voiture',
    nearby: 'à proximité',
    zoomIn: 'Zoom avant',
    zoomOut: 'Zoom arrière',
    tilesOffline:
      'Les tuiles de carte ne se chargent pas. Les voitures et les saluts fonctionnent toujours.',
  },

  garage: {
    title: 'Votre voiture',
    hint: 'Changez ce que voient les autres conducteurs. Effet immédiat pour tout le monde autour de vous.',
    open: 'Modifier',
    tapHint: 'Touchez pour changer de modèle, de couleur ou de nom',
    save: 'Enregistrer',
    cancel: 'Annuler',
    saved: 'Votre voiture est à jour.',
  },

  howTo: {
    title: 'Comment saluer',
    lead: 'C’est le salut Tesla, sur votre écran. Rien à apprendre.',
    steps: [
      'Roulez. Les autres conducteurs sur TeslaWave apparaissent autour de vous sur la carte.',
      'Quand l’un d’eux passe à moins de 300 m environ, un grand bouton Saluer apparaît en bas de l’écran.',
      'Touchez-le. Votre salut traverse et se pose sur leur voiture. Sur leur écran, il déferle sur toute la carte, avec votre voiture et un carillon, et un bouton Saluer en retour pendant quelques secondes.',
      'Saluez en retour dans ces quelques secondes et vous obtenez tous les deux un « Salut rendu ». Un salut reçu a le même effet sur votre écran : difficile à manquer, même sans le son.',
    ],
    tapHint:
      'Vous pouvez aussi toucher n’importe quelle voiture sur la carte pour la voir et la saluer de là. Touchez la vôtre pour la modifier.',
    tryIt: 'Essayer',
    tried: 'C’est tout ce qu’il y a à savoir.',
    close: 'Compris',
  },

  wave: {
    verb: 'Saluer',
    backVerb: 'Saluer en retour',
    promptTarget: (model: TeslaModel, colour: string): string => theCar(model, colour),
    prompt: (model: TeslaModel, colour: string): string => `Saluer ${theCar(model, colour)}`,
    received: (model: TeslaModel, colour: string): string =>
      `${aCar(model, colour)} vous a fait signe`,
    back: 'Salut rendu.',
    cardTitle: 'vous a fait signe',
    cardBackTitle: 'a répondu à votre salut',
    tooFar: 'Trop loin maintenant.',
    offline: 'Ils viennent de quitter la carte.',
    tooSoon: 'Un à la fois.',
    hidden: 'Redevenez visible pour saluer.',
    counter: 'saluts',
    within: (label: string, metres: number): string => `${label} (à moins de ${n(metres)} m)`,
  },

  card: {
    onlineFor: (minutes: number): string =>
      minutes < 1 ? 'vient d’arriver' : `en ligne depuis ${n(minutes)} min`,
    waves: (count: number): string => `${n(count)} ${count === 1 ? 'salut' : 'saluts'}`,
    wavesLabel: (count: number): string => (count === 1 ? 'salut' : 'saluts'),
    wave: 'Saluer',
  },

  pulse: {
    title: 'Autour de vous',
    online: 'Conducteurs en ligne',
    waves: 'Saluts aujourd’hui',
    mine: 'Vos saluts',
    note: 'Comptés sur les zones de carte où vous êtes, jamais dans un fichier de personnes.',
  },

  pairing: {
    showTitle: 'Utiliser sur ma voiture',
    showAction: 'Utiliser sur ma voiture',
    showHint: 'Pour ne pas tout refaire sur l’écran de la voiture.',
    showBody:
      'Sur l’écran de votre voiture, ouvrez teslawave.app et touchez « J’ai déjà tout réglé sur mon téléphone ». Saisissez ensuite ce code. Votre voiture garde le même nom, la même voiture et le même nombre de saluts.',
    expiresIn: (mmss: string): string => `Expire dans ${mmss}`,
    enterTitle: 'Saisissez le code de votre téléphone',
    enterBody:
      'Sur votre téléphone, ouvrez teslawave.app, touchez « Utiliser sur ma voiture », et saisissez ici les six caractères affichés.',
    claim: 'Continuer',
    claiming: 'Vérification…',
    failed: 'Ce code n’est plus valide. Créez-en un nouveau sur votre téléphone.',
    failedToMake: 'Impossible de créer un code pour l’instant. Réessayez dans un moment.',
    backspace: 'Supprimer le dernier caractère',
    done: 'Appairé. Même voiture, mêmes saluts.',
  },

  milestones: {
    1: 'Premier salut. C’est comme ça que ça commence.',
    5: 'Cinq saluts. La route vous connaît.',
    10: 'Dix saluts. Vous faites partie de la route maintenant.',
    25: 'Vingt-cinq. Une présence fidèle sur la route.',
    50: 'Cinquante saluts. Discrètement prolifique.',
    100: 'Cent saluts. Vraiment l’un des habitués.',
  },

  settings: {
    car: 'Votre voiture',
    visible: 'Visible par les autres',
    visibleHint: 'Les conducteurs autour de vous voient votre voiture et peuvent vous saluer.',
    sound: 'Sons',
    soundHint: 'Le carillon quand un salut arrive.',
    northUp: 'Nord en haut',
    northUpHint: 'Désactivé, la carte tourne avec vous.',
    phone: 'Utiliser sur ma voiture',
  },

  controls: {
    invisible: 'Invisible',
    visible: 'Visible',
    goInvisible: 'Devenir invisible',
    goVisible: 'Devenir visible',
    invisibleHint: 'Personne ne vous voit ni ne peut vous saluer.',
    visibleHint: 'Les autres conducteurs vous voient et peuvent vous saluer.',
    mute: 'Couper le son',
    unmute: 'Activer le son',
    sound: 'Son',
    muted: 'Son coupé',
    northUp: 'Nord en haut',
    trackUp: 'Cap en haut',
    orientation: 'La carte tourne avec vous',
    orientationNorth: 'La carte garde le nord en haut',
    settings: 'Réglages',
    close: 'Fermer',
  },

  privacy: {
    title: 'Confidentialité',
    lead: (brand: string): string =>
      `${brand} est conçu pour qu’il n’y ait rien à divulguer. Pas de compte, pas d’e-mail, pas d’historique de trajets.`,
    leavesTitle: 'Ce qui quitte votre voiture',
    leaves: [
      `Votre position GPS, telle quelle, tant que vous êtes visible et en mouvement. Une voiture à l’arrêt depuis ${n(PARKED_HIDE_MS / 60_000)} minutes est masquée jusqu’à ce qu’elle roule, pour que personne ne puisse voir où vous vous arrêtez. La position sert uniquement à vous afficher aux conducteurs autour de vous.`,
      'Votre cap et votre vitesse, pour que les autres voitures glissent au lieu de sauter.',
      'Le modèle et la couleur que vous avez choisis, et un pseudo si vous en avez saisi un.',
      'Un secret aléatoire généré dans votre navigateur. Les autres conducteurs n’en voient qu’une empreinte, qui n’est liée ni à vous ni à Tesla et ne permet pas de se faire passer pour vous.',
    ],
    keptTitle: 'Ce qui est conservé',
    kept: [
      `Les positions vivent en mémoire pendant ${n(PRESENCE_EXPIRY_MS / 1000)} secondes et ne sont jamais écrites dans une base de données.`,
      'Les nombres de saluts. Les vôtres, et un total quotidien par zone de carte.',
      'Pas d’historique de trajets, pas d’itinéraires, pas d’horodatage de vos passages.',
    ],
    thirdPartiesTitle: 'Tiers',
    thirdParties: [
      'Les tuiles de carte sont servies par OpenFreeMap, qui voit les tuiles demandées par votre navigateur.',
      'Cloudflare Web Analytics compte les pages vues sans cookies.',
      'Pas de publicité, pas de pixels de suivi, pas de bandeau cookies puisqu’il n’y a pas de cookies.',
    ],
    invisible:
      'Activez le mode invisible à tout moment et vous disparaissez de tous les autres écrans en deux secondes.',
    back: 'Retour à la carte',
  },

  agoLabel: (ts: number | null, now: number): string | null => {
    if (ts === null) return null;
    const seconds = Math.max(0, Math.round((now - ts) / 1000));
    if (seconds < 45) return 'à l’instant';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `il y a ${n(minutes)} min`;
    return `il y a ${n(Math.round(minutes / 60))} h`;
  },
};
