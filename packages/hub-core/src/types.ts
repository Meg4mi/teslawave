import type { CarState, Report, ServerMsg, StatusId, TeslaModel } from '@teslawave/protocol';

/** Opaque handle for one connection. The Cloudflare adapter maps it to a WebSocket. */
export type SocketKey = string;

/** Everything about a connection that must survive hibernation (stored in the attachment). */
export type SocketProfile = {
  key: SocketKey;
  id: string;
  model: TeslaModel;
  colour: string;
  nick?: string;
  status?: StatusId;
  statusText?: string;
  cells: string[];
  spectator: boolean;
  hidden: boolean;
  since: number;
  /** The wire format this connection speaks, so a wake keeps talking the same one. */
  v: number;
};

/**
 * Volatile per-socket state. Empty after a hibernation wake, which is fine: presence is
 * empty then too, so a connection that has forgotten what it was holding is in step with a
 * hub that has forgotten what there was to hold.
 */
export type SocketRuntime = {
  lastPosAt: number;
  lastWaveAt: number;
  /** When this connection last placed a report: one a minute (RATE_REPORT_MS). */
  lastReportAt: number;
  /** When it last voted on one: one every ten seconds (RATE_CONFIRM_MS). */
  lastConfirmAt: number;
  /** When this connection was last asked `where`, so a burst of waves asks it once. */
  askedAt: number;
  violations: number;
  lastSeen: { lat: number; lng: number; ts: number } | null;
  /**
   * The cars this connection currently has on its map, as handle -> the revision of that
   * driver's profile we last described to it. Presence in the map is what makes a car
   * "held"; the value is what makes a car whose driver edited it get a fresh description
   * (ADR-0033). Compact-wire connections only: a v1 connection is sent whole car states and
   * has nothing to remember.
   */
  holding: Map<number, number>;
};

export type Socket = SocketProfile & SocketRuntime;

/**
 * A wave the hub could not place when it arrived: the sender, the target, or both had no
 * presence yet. Held, in memory only, while the hub asks them where they are.
 */
export type HeldWave = {
  /** The connection the wave came in on, which is where the answer goes. */
  key: SocketKey;
  from: string;
  to: string;
  at: number;
};

/**
 * A report as the hub holds it.
 *
 * `by` is the drivers who say it is there and `against` those who say it is gone, kept only
 * so each driver counts once and can change their mind. They are memory only, never sent and
 * never written, and they go with the report (ADR-0040). `n` and `no` on the wire are their
 * sizes and nothing else, so the two can never drift apart.
 */
export type HubReport = Report & {
  cell: string;
  by: Set<string>;
  against: Set<string>;
};

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
  /**
   * cell -> the drivers in it. An index over `presence`, kept in step with it, because the
   * two hottest things the hub does — counting a cell and building its diff — were both a
   * scan of every driver in the whole hub (ADR-0033).
   */
  presenceByCell: Map<string, Set<string>>;
  /**
   * id -> the small integer that stands in for it on the compact wire, and the revision of
   * that driver's profile. Volatile and reassigned freely: a handle is a compression, never
   * an identity (ADR-0033).
   */
  handles: Map<string, { h: number; rev: number }>;
  nextHandle: number;
  sockets: Map<SocketKey, Socket>;
  socketsByCell: Map<string, Set<SocketKey>>;
  socketsById: Map<string, Set<SocketKey>>;
  dirty: Map<string, Set<string>>;
  gone: Map<string, Set<string>>;
  lastFlushAt: number;
  /** Waves waiting on a position. Settled by the next message, never by a timer. */
  held: HeldWave[];
  /**
   * What drivers have flagged on the road, by id. Memory only, like presence: a report is a
   * position, and positions are never written anywhere (ADR-0002). Gone on hibernation, as
   * presence is; a report that mattered was already on the screens that were there for it.
   */
  reports: Map<string, HubReport>;
  /** cell -> report ids changed since the last flush, and ids gone since. */
  reportsDirty: Map<string, Set<string>>;
  reportsGone: Map<string, Set<string>>;
  nextReportSeq: number;
  counters: Counters;
};

export type Effect =
  | { k: 'send'; to: SocketKey; msg: ServerMsg }
  | { k: 'close'; to: SocketKey; code: number; reason: string }
  /** Persist the profile in the WebSocket attachment so it survives hibernation. */
  | { k: 'attach'; to: SocketKey; profile: SocketProfile }
  /** Write counters to Durable Object storage. Debounced; never contains positions. */
  | { k: 'persist'; entries: [string, number][] };
