import type { CarState, ServerMsg, TeslaModel } from '@teslawave/protocol';

/** Opaque handle for one connection. The Cloudflare adapter maps it to a WebSocket. */
export type SocketKey = string;

/** Everything about a connection that must survive hibernation (stored in the attachment). */
export type SocketProfile = {
  key: SocketKey;
  id: string;
  model: TeslaModel;
  colour: string;
  nick?: string;
  cells: string[];
  spectator: boolean;
  hidden: boolean;
  since: number;
};

/** Volatile per-socket state. Empty after a hibernation wake, which is fine. */
export type SocketRuntime = {
  lastPosAt: number;
  lastWaveAt: number;
  violations: number;
  lastSeen: { lat: number; lng: number; ts: number } | null;
};

export type Socket = SocketProfile & SocketRuntime;

export type Counters = {
  /** `w:<userId>` -> lifetime waves */
  wavesByUser: Map<string, number>;
  /**
   * `wt:<userId>` -> when that driver last waved. No place, just a time, so the daily
   * harvest can forget a driver who has not waved in USER_WAVES_TTL_MS and storage stays
   * bounded by drivers seen lately rather than drivers ever seen.
   */
  lastWaveByUser: Map<string, number>;
  /** `c:<cell>:<yyyy-mm-dd>` -> waves in that cell today */
  wavesByCellDay: Map<string, number>;
  lastWaveTsByCell: Map<string, number>;
  /**
   * Counter keys changed since the last write. Only these are persisted: writing every
   * counter on every flush would cost hundreds of row writes per tick and blow the
   * 100k rows/day free limit within the hour (ADR-0002).
   */
  dirtyKeys: Set<string>;
  lastWriteAt: number;
};

export type HubState = {
  hub: string;
  /** id -> last known state. Memory only: positions are never persisted (brief 2.3). */
  presence: Map<string, CarState>;
  sockets: Map<SocketKey, Socket>;
  socketsByCell: Map<string, Set<SocketKey>>;
  socketsById: Map<string, Set<SocketKey>>;
  dirty: Map<string, Set<string>>;
  gone: Map<string, Set<string>>;
  lastFlushAt: number;
  counters: Counters;
};

export type Effect =
  | { k: 'send'; to: SocketKey; msg: ServerMsg }
  | { k: 'close'; to: SocketKey; code: number; reason: string }
  /** Persist the profile in the WebSocket attachment so it survives hibernation. */
  | { k: 'attach'; to: SocketKey; profile: SocketProfile }
  /** Write counters to Durable Object storage. Debounced; never contains positions. */
  | { k: 'persist'; entries: [string, number][] };
