import { create } from 'zustand';
import { WAVE_MILESTONES, isColourId, isModel, type CarColourId, type TeslaModel } from '@teslawave/protocol';

export type Identity = {
  id: string;
  model: TeslaModel;
  colour: CarColourId;
  nick?: string;
  createdAt: number;
};

/** Stored identities are as untrusted as anything else: a stale or edited one is discarded. */
export function parseIdentity(value: unknown): Identity | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, model, colour, nick, createdAt } = value as Record<string, unknown>;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (!isModel(model) || !isColourId(colour)) return null;
  return {
    id,
    model,
    colour,
    createdAt: typeof createdAt === 'number' ? createdAt : Date.now(),
    ...(typeof nick === 'string' && nick.length > 0 ? { nick } : {}),
  };
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

export const newId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tw-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

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
  identity: parseIdentity(read<unknown>(IDENTITY_KEY)),
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
