/** Geohash precision used for presence cells: ~39 x 19.5 km at the equator. */
export const CELL_PRECISION = 4;

/**
 * Durable Object sharding key = cell.slice(0, HUB_PRECISION).
 * 2 => ~1250 x 625 km regions, at most 32^2 = 1024 hubs can ever exist.
 * Bounding the number of Durable Objects bounds the worst-case bill (ADR-0002).
 * Raise to 3 or 4 to shard further; nothing else changes, fan-out is already per cell.
 */
export const HUB_PRECISION = 2;

/** Geohash alphabet, exactly HUB_PRECISION characters. Anything else is rejected at the edge. */
export const HUB_ID_RE = /^[0-9b-hjkmnp-z]{2}$/;

/** A cell id is 1..12 geohash characters. */
export const CELL_ID_RE = /^[0-9b-hjkmnp-z]{1,12}$/;

/** Subscribe to cells whose box is within this distance of the driver. */
export const NEIGHBOUR_RADIUS_M = 10_000;

/** Home cell + up to 3 neighbours (a corner case). */
export const MAX_CELLS_PER_CLIENT = 4;

/** At most this many hub sockets open at once. */
export const MAX_SOCKETS_PER_CLIENT = 3;

export const POS_INTERVAL_MOVING_MS = 5_000;
export const POS_INTERVAL_STATIONARY_MS = 30_000;
export const STATIONARY_SPEED_KMH = 2;
/**
 * A car that has not moved for this long is hidden until it moves again. A parked car with
 * the tab open used to repeat its exact position for as long as the tab lived, which for a
 * car in a driveway is where its driver lives (ADR-0026).
 */
export const PARKED_HIDE_MS = 10 * 60_000;
export const POS_HEADING_DELTA_DEG = 20;
export const POS_SPEED_DELTA_KMH = 15;

/** Server broadcasts at most one diff per cell per tick. Message-driven, never a timer. */
export const SERVER_TICK_MS = 2_000;

/** Presence entries older than this are evicted (server) and hidden (client). */
export const PRESENCE_EXPIRY_MS = 60_000;

export const RATE_POS_MS = 2_000;
export const RATE_WAVE_MS = 5_000;
export const RATE_VIOLATIONS_TO_CLOSE = 5;
export const MAX_MSG_BYTES = 1_024;

/** Anything faster than this between two updates is a spoof or a bug. */
export const MAX_SPEED_KMH = 250;

/*
 * Measured, not guessed: `pnpm bench` drives one tick with every driver in one cell inside
 * interest range of every other, which is a city centre at rush hour. Serialising included,
 * because the Durable Object pays it once per socket.
 *
 * | drivers | old wire            | compact wire (ADR-0033) |
 * |---------|---------------------|-------------------------|
 * | 500     | 167 ms, 75 kB each  | 29 ms, 11.3 kB each     |
 * | 1,000   | 844 ms, 149 kB each | 117 ms, 22.3 kB each    |
 * | 2,000   | 2,954 ms, 297 kB    | 460 ms, 45 kB each      |
 *
 * The cell cap used to be 500, and it was a fan-out limit dressed up as a capacity limit: at
 * 500 the hub spent a sixth of every tick in one thread and put 75 kB on every socket every
 * two seconds, which an Intel Atom cannot parse and still hold 25 fps. The usable number was
 * a fraction of the stated one.
 *
 * 1,000 is where the compact wire stops being comfortable: 117 ms of a 2,000 ms tick, and
 * 22 kB a socket. 2,000 is not — half the tick, and twice the JSON a car can afford. So the
 * cap is 1,000 and it is a number the app can actually reach.
 *
 * Past that the lever is not this constant, it is HUB_PRECISION: 3 gives 32,768 possible
 * objects instead of 1,024, which divides a city between several of them. The per-tick cost
 * is per object, so that is the change that buys another order of magnitude.
 */
export const MAX_SOCKETS_PER_CELL = 1_000;
export const MAX_SOCKETS_PER_HUB = 2_000;

/**
 * Client shows the wave button below this distance, measured between reported positions. It
 * was 150 m, and on a real road that was too tight while positions still carried a 50-100 m
 * privacy fuzz each (ADR-0007, amended). Positions are exact now (ADR-0024); the range stays.
 */
export const WAVE_PROMPT_RANGE_M = 300;
export const WAVE_PROMPT_TTL_MS = 10_000;
/**
 * Server accepts a wave below this distance: the prompt range plus the same 150 m margin as
 * before, which covers the two seconds the client renders behind and a tick of latency.
 */
export const WAVE_VALIDATE_RANGE_M = 450;
/** Two waves within this window read as a "wave back". */
export const WAVE_BACK_WINDOW_MS = 4_000;

export const TRAIL_MS = 30_000;

export const PAIR_CODE_LEN = 6;
export const PAIR_TTL_MS = 600_000;
/** No 0/O/1/I: this is typed on a car touchscreen. */
export const PAIR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Personal milestones. No leaderboards, no ranking (brief 4.3). */
export const WAVE_MILESTONES = [1, 5, 10, 25, 50, 100] as const;

export const NICK_MAX_LEN = 16;

/** WebSocket close codes. */
export const CLOSE_BAD_HELLO = 4001;
export const CLOSE_PROTOCOL = 4008;
export const CLOSE_CAPACITY = 4029;
export const CLOSE_WRONG_HUB = 4030;

/**
 * The wire format's version. The client sends it in `hello`; a hub that speaks a newer one
 * answers with `upgrade`, and the client reloads at the next standstill (ADR-0029).
 *
 * Bump it whenever a change would make an old client and a new hub disagree — a new field
 * either side relies on, a changed meaning, a removed message. Adding a field that an old
 * client can ignore and a new hub can do without is not a bump.
 */
export const PROTOCOL_VERSION = 2;

/** A hello with no version is from before ADR-0029, which is every client already deployed. */
export const LEGACY_PROTOCOL_VERSION = 0;

/** The first version with interest filtering and the compact diff (ADR-0033). */
export const COMPACT_WIRE_VERSION = 2;

/**
 * A driver is sent only the cars within this of them.
 *
 * Nothing above it can be seen or waved at: the wave prompt is 300 m and the HUD's furthest
 * claim is "within 10 km", so this is that plus margin. Before it existed, every subscriber
 * in a cell got every car in that cell — 39 x 20 km of them — which is fine at twenty cars
 * and 102 kB per subscriber every two seconds at five hundred (ADR-0033).
 */
export const INTEREST_RADIUS_M = 12_000;

/**
 * A car already on your map is kept until it is this much further out, so one sitting near
 * the edge does not flicker on and off as the distance jitters across the line.
 */
export const INTEREST_DROP_RADIUS_M = 13_500;

/**
 * Coordinates on the compact wire are integers at this scale: 1e5 of a degree is about 1.1 m,
 * an order of magnitude under a good GPS fix. This is quantisation to save bytes, not the
 * fuzzing ADR-0024 removed — there is no offset and no direction to it, and a wave is still
 * validated against the exact position the client sent.
 */
export const WIRE_COORD_SCALE = 100_000;
