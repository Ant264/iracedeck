/**
 * Race Control Alert Service
 *
 * Module-level singleton that tracks an ordered queue of active race-control
 * alerts (black flags and wave-around candidates) derived from live iRacing
 * telemetry.
 *
 * Design goals:
 * - Stable slot positions: existing alerts keep their queue index; new alerts
 *   are inserted at the correct priority tier without shifting earlier entries.
 * - Grace-period removal: when an alert condition clears, the entry is kept
 *   for GRACE_PERIOD_MS (2 s) before being removed. This prevents flicker
 *   caused by transient signal drops (e.g. the lap-down false-positive that
 *   occurs when the leader crosses the start/finish line).
 * - Tick deduplication: only scans cars once per simulation tick (keyed on
 *   `SessionTick`) when multiple alert-slot buttons are all subscribed.
 * - Session safety: when `sessionInfo` changes identity (different session /
 *   replay load) the queue is cleared immediately so stale car numbers never
 *   carry over.
 */
import { type TelemetryData } from "@iracedeck/iracing-sdk";
import { type ActiveSessionCar } from "@iracedeck/iracing-sdk";

import { hasBlackFlag, needsWaveAround } from "../shared/race-control-attention.js";
import { buildSessionRoster, type SessionRosterState } from "../shared/session-roster.js";

// ── Types ────────────────────────────────────────────────────────────────────

/** The two alert types this service tracks. */
export type AlertType = "blackFlag" | "waveAround";

/** Public shape of an alert returned to callers via {@link getAlertForSlot}. */
export interface RaceControlAlert {
  /** Stable composite key, e.g. `"blackFlag:5"`. */
  readonly key: string;
  readonly type: AlertType;
  readonly carIdx: number;
  readonly carNumber: string;
  readonly carNumberRaw: number;
  readonly driverName: string;
  /** Snapshot of the roster car used to render the select-reference-car style icon. */
  readonly car: ActiveSessionCar;
  /** Millisecond timestamp from `Date.now()` when the alert was first detected. */
  readonly detectedAt: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * How long (ms) an alert entry survives in the queue after its condition
 * clears. Long enough to absorb transient signal drops without causing
 * visible flicker on the button.
 */
const GRACE_PERIOD_MS = 2000;

// ── Module-level state ───────────────────────────────────────────────────────

/**
 * Internal alert entry (superset of the public {@link RaceControlAlert}).
 */
interface AlertEntry extends RaceControlAlert {
  /**
   * Wall-clock ms when the condition was last observed as cleared.
   * `undefined` = condition is currently active.
   * Defined = entry is in the grace-period countdown; will be removed once
   * `Date.now() - clearingAt >= GRACE_PERIOD_MS`.
   */
  clearingAt?: number;
}

let alertQueue: AlertEntry[] = [];
let rosterState: SessionRosterState = { carList: [], knownSet: new Set(), lastKey: null };
/** Last `SessionTick` value seen — used to skip redundant per-car scans. */
let lastProcessedTick = -1;

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Find the index at which a new alert entry should be inserted to maintain the
 * priority ordering (black flags before wave-arounds). New black-flag entries
 * are placed immediately after the last existing black-flag entry; new
 * wave-around entries are appended at the tail.
 *
 * Crucially, existing entries are *never* reordered — this keeps slot
 * positions stable for the user.
 */
function findInsertIndex(queue: AlertEntry[], type: AlertType): number {
  if (type === "waveAround") return queue.length;

  // Black flag: insert after the last existing black-flag entry.
  let lastBfIndex = -1;

  for (let i = 0; i < queue.length; i++) {
    if (queue[i].type === "blackFlag") lastBfIndex = i;
  }

  return lastBfIndex + 1;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Process the latest session info and telemetry snapshot, updating the internal
 * alert queue.
 *
 * Safe to call from multiple button subscribers on every tick — the `SessionTick`
 * guard skips the expensive per-car scan when the same tick has already been
 * processed. Session-change handling always runs (it is cheap and idempotent).
 *
 * @internal Exported for testing
 */
export function updateAlertQueue(sessionInfo: unknown, telemetry: TelemetryData | null): void {
  // 1. Update session roster (cheap, idempotent)
  const { roster, sessionReset } = buildSessionRoster(sessionInfo, rosterState);

  rosterState = roster;

  if (sessionReset) {
    // Session identity changed — wipe the queue immediately so stale car
    // numbers are never shown on buttons.
    alertQueue = [];
    lastProcessedTick = -1;
    // Do NOT return: continue scanning so the first tick of the new session
    // can immediately populate alerts without requiring a second call.
  }

  // 2. Tick deduplication — skip per-car scan when same frame already handled
  const sessionTick = telemetry?.SessionTick ?? -1;

  if (sessionTick >= 0 && sessionTick === lastProcessedTick) return;

  lastProcessedTick = sessionTick;

  const now = Date.now();

  // 3. Compute the set of keys for currently active alert conditions
  const activeKeys = new Set<string>();

  for (const car of rosterState.carList) {
    if (hasBlackFlag(car.carIdx, telemetry)) {
      activeKeys.add(`blackFlag:${car.carIdx}`);
    }

    if (needsWaveAround(car.carIdx, telemetry)) {
      activeKeys.add(`waveAround:${car.carIdx}`);
    }
  }

  // 4. Re-activate entries whose condition has returned within the grace window
  for (const entry of alertQueue) {
    if (entry.clearingAt !== undefined && activeKeys.has(entry.key)) {
      entry.clearingAt = undefined; // condition came back — cancel removal
    }
  }

  // 5. Start the grace-period countdown for newly-cleared conditions
  for (const entry of alertQueue) {
    if (!activeKeys.has(entry.key) && entry.clearingAt === undefined) {
      entry.clearingAt = now;
    }
  }

  // 6. Remove entries that have been past their grace period
  alertQueue = alertQueue.filter((e) => {
    if (e.clearingAt === undefined) return true; // still active

    return now - e.clearingAt < GRACE_PERIOD_MS;
  });

  // 7. Insert newly detected alerts that are not already in the queue
  const existingKeys = new Set(alertQueue.map((e) => e.key));

  for (const key of activeKeys) {
    if (existingKeys.has(key)) continue;

    const colonIdx = key.indexOf(":");
    const typeStr = key.slice(0, colonIdx) as AlertType;
    const carIdxNum = Number(key.slice(colonIdx + 1));
    const car = rosterState.carList.find((c) => c.carIdx === carIdxNum);

    if (!car) continue;

    const entry: AlertEntry = {
      key,
      type: typeStr,
      carIdx: carIdxNum,
      carNumber: car.carNumber,
      carNumberRaw: car.carNumberRaw,
      driverName: car.driverName ?? "",
      car,
      detectedAt: now,
    };

    const idx = findInsertIndex(alertQueue, typeStr);

    alertQueue.splice(idx, 0, entry);
  }
}

/**
 * Returns the alert for the given slot position, or `null` if the slot is
 * empty.
 *
 * Slot indices are 0-based across the filtered view. When `alertType` is
 * `"any"`, all alerts (including those still in their grace period) occupy
 * consecutive slots. When a specific type is requested, only entries of that
 * type are counted.
 *
 * Grace-period entries are included so buttons do not blank out prematurely
 * during transient signal drops.
 *
 * @internal Exported for testing
 */
export function getAlertForSlot(slotIndex: number, alertType: "any" | AlertType): RaceControlAlert | null {
  const visible = alertType === "any" ? alertQueue : alertQueue.filter((e) => e.type === alertType);

  return visible[slotIndex] ?? null;
}

/**
 * Returns a shallow copy of the current alert queue (all entries, including
 * those in the grace period). Intended for testing and diagnostics only.
 *
 * @internal Exported for testing
 */
export function getAlertQueueSnapshot(): readonly RaceControlAlert[] {
  return [...alertQueue];
}

/**
 * Reset all module-level state. **Tests only** — never call in production code.
 *
 * @internal Exported for testing
 */
export function resetAlertService(): void {
  alertQueue = [];
  rosterState = { carList: [], knownSet: new Set(), lastKey: null };
  lastProcessedTick = -1;
}
