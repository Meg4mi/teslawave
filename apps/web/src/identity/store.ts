import { create } from 'zustand';
import {
  WAVE_MILESTONES,
  idFromSecret,
  isColourId,
  isModel,
  isSecret,
  type CarColourId,
  type TeslaModel,
} from '@teslawave/protocol';

export type Identity = {
  /**
   * The one thing that makes this browser this driver. It leaves the device only inside the
   * hello message and a pairing hand-over; everyone else sees `id`, its hash (ADR-0025).
   */
  secret: string;
  /** Derived from the secret, never chosen: what other drivers see and wave at. */
  id: string;
  model: TeslaModel;
  colour: CarColourId;
  nick?: string;
  createdAt: number;
};

/** Everything an identity holds apart from the secret and the id it derives. */
export type IdentityCar = Pick<Identity, 'model' | 'colour' | 'nick' | 'createdAt'>;

/** The whole identity, from a secret and the car: the id is always derived here. */
export const identityFrom = (secret: string, car: IdentityCar): Identity => ({
  secret,
  id: idFromSecret(secret),
  model: car.model,
  colour: car.colour,
  createdAt: car.createdAt,
  ...(car.nick === undefined ? {} : { nick: car.nick }),
});

/**
 * Stored identities are as untrusted as anything else: a stale or edited one is discarded.
 * One without a secret is from before ADR-0025, when the id was the whole identity; it gets
 * a fresh secret and therefore a fresh id, since the old one was never provably theirs.
 */
export function parseIdentity(value: unknown): Identity | null {
  if (typeof value !== 'object' || value === null) return null;
  const { secret, model, colour, nick, createdAt } = value as Record<string, unknown>;
  if (!isModel(model) || !isColourId(colour)) return null;
  return identityFrom(isSecret(secret) ? secret : newSecret(), {
    model,
    colour,
    createdAt: typeof createdAt === 'number' ? createdAt : Date.now(),
    ...(typeof nick === 'string' && nick.length > 0 ? { nick } : {}),
  });
}

export type Prefs = {
  sharing: boolean;
  muted: boolean;
  northUp: boolean;
  /** Highest milestone already celebrated, so it only ever happens once. */
  milestone: number;
};

const IDENTITY_KEY = 'tw.identity.v1';
const PREFS_KEY = 'tw.prefs.v1';

const DEFAULT_PREFS: Prefs = { sharing: false, muted: false, northUp: false, milestone: 0 };

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode, or storage full. The session still works, it just will not survive a reload.
  }
}

/** 122 bits from the platform; the fallback is only for a browser with no `randomUUID`. */
export const newSecret = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tw-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

type IdentityStore = {
  identity: Identity | null;
  prefs: Prefs;
  setIdentity: (identity: Identity) => void;
  updateIdentity: (patch: Partial<Identity>) => void;
  setPrefs: (patch: Partial<Prefs>) => void;
  /** Returns the milestone to celebrate, if this wave count crosses one. */
  claimMilestone: (waves: number) => number | null;
};

export const useIdentity = create<IdentityStore>((set, get) => ({
  identity: (() => {
    const stored = read<unknown>(IDENTITY_KEY);
    const identity = parseIdentity(stored);
    // A migrated identity is written back at once, so the new secret survives the reload.
    if (identity && (stored as { secret?: unknown } | null)?.secret !== identity.secret)
      write(IDENTITY_KEY, identity);
    return identity;
  })(),
  prefs: { ...DEFAULT_PREFS, ...(read<Partial<Prefs>>(PREFS_KEY) ?? {}) },

  setIdentity: (identity) => {
    write(IDENTITY_KEY, identity);
    set({ identity });
  },

  updateIdentity: (patch) => {
    const current = get().identity;
    if (!current) return;
    const next = { ...current, ...patch };
    write(IDENTITY_KEY, next);
    set({ identity: next });
  },

  setPrefs: (patch) => {
    const next = { ...get().prefs, ...patch };
    write(PREFS_KEY, next);
    set({ prefs: next });
  },

  claimMilestone: (waves) => {
    const { prefs } = get();
    const reached = [...WAVE_MILESTONES].filter((m) => waves >= m).pop() ?? 0;
    if (reached === 0 || reached <= prefs.milestone) return null;
    const next = { ...prefs, milestone: reached };
    write(PREFS_KEY, next);
    set({ prefs: next });
    return reached;
  },
}));
