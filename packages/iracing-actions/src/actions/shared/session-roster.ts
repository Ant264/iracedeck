/**
 * Shared session car roster helpers.
 *
 * Originally part of the splits-delta-cycle action; extracted so that other
 * actions (e.g. race-control-alert-slot) can share the same session-aware
 * car-list management without coupling to the splits-delta-cycle module.
 */
import { type ActiveSessionCar, getActiveSessionCars } from "@iracedeck/iracing-sdk";

/**
 * Compute a stable identity string for the current iRacing session.
 *
 * Used to detect when the user switches between replays or sessions so the
 * selector roster can be reset and rebuilt from the new session info.
 *
 * Priority: `SubSessionID` → `SessionID + TrackName + EventType` → `null`.
 * Returns `null` when no identifying information is available (e.g. not yet
 * connected to a session).
 *
 * @internal Exported for testing
 */
export function computeSessionKey(sessionInfo: unknown): string | null {
  const weekend = (sessionInfo as Record<string, unknown>)?.WeekendInfo as Record<string, unknown> | undefined;

  if (!weekend) return null;

  const subSessionId = weekend.SubSessionID;

  if (subSessionId !== undefined && subSessionId !== 0) return `sub:${subSessionId}`;

  const sessionId = weekend.SessionID;
  const trackName = weekend.TrackName ?? weekend.TrackDisplayName ?? "";
  const eventType = weekend.EventType ?? "";

  if (sessionId !== undefined) return `s:${sessionId}:${trackName}:${eventType}`;

  return null;
}

/**
 * Mutable state bag for the session car roster.
 * Held on the action class (or service) and passed into {@link buildSessionRoster} on each update.
 *
 * @internal Exported for testing
 */
export interface SessionRosterState {
  carList: ActiveSessionCar[];
  knownSet: Set<number>;
  lastKey: string | null;
}

/**
 * Pure roster update: merges new drivers from `sessionInfo` into `state` and
 * detects session changes.
 *
 * - If the session key changes, the car list and known-set are cleared first
 *   so the new session's drivers replace the old ones.
 * - Within the same session, new drivers are appended and the combined list
 *   is re-sorted. Existing drivers are never removed.
 * - When `sessionInfo` is null (iRacing disconnected / no active session) and
 *   the roster already has cars, clears the roster and returns
 *   `changed = true, sessionReset = true`. When the roster is already empty,
 *   returns unchanged state with `changed = false`.
 *
 * The function never mutates `state`; it always returns a fresh object.
 *
 * @internal Exported for testing
 */
export function buildSessionRoster(
  sessionInfo: unknown,
  state: SessionRosterState,
): { roster: SessionRosterState; changed: boolean; sessionReset: boolean } {
  // Session info absent: iRacing disconnected or no active session.
  // Clear any cars from the previous session so buttons revert to empty slots.
  if (!sessionInfo) {
    if (state.carList.length > 0) {
      return {
        roster: { carList: [], knownSet: new Set(), lastKey: null },
        changed: true,
        sessionReset: true,
      };
    }

    return { roster: state, changed: false, sessionReset: false };
  }

  const currentKey = computeSessionKey(sessionInfo);
  let workingList = state.carList;
  let workingSet = state.knownSet;
  let sessionReset = false;

  // Session identity changed — start a clean slate for this session.
  if (currentKey !== null && currentKey !== state.lastKey) {
    workingList = [];
    workingSet = new Set<number>();
    sessionReset = true;
  }

  const snapshot = getActiveSessionCars(sessionInfo);
  const newCars = snapshot.filter((c) => !workingSet.has(c.carIdx));
  const nextKey = currentKey ?? state.lastKey;

  if (newCars.length === 0) {
    return {
      roster: { carList: workingList, knownSet: workingSet, lastKey: nextKey },
      changed: sessionReset,
      sessionReset,
    };
  }

  const updatedList = [...workingList, ...newCars];
  const updatedSet = new Set(workingSet);

  for (const car of newCars) {
    updatedSet.add(car.carIdx);
  }

  // Re-sort: numeric car numbers first (ascending), then alphabetic.
  updatedList.sort((a, b) => {
    const aNum = Number(a.carNumber);
    const bNum = Number(b.carNumber);
    const aIsNum = a.carNumber !== "" && !Number.isNaN(aNum);
    const bIsNum = b.carNumber !== "" && !Number.isNaN(bNum);

    if (aIsNum && bIsNum) return aNum - bNum;

    if (aIsNum) return -1;

    if (bIsNum) return 1;

    return a.carNumber.localeCompare(b.carNumber);
  });

  return {
    roster: { carList: updatedList, knownSet: updatedSet, lastKey: nextKey },
    changed: true,
    sessionReset,
  };
}
