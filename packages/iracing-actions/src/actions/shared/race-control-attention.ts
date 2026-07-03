import { Flags, hasFlag, type TelemetryData } from "@iracedeck/iracing-sdk";

/**
 * Describes the Race Control attention state for a car slot button.
 *
 * - `"none"` – no attention required.
 * - `"disqualify"` – car has an active disqualify flag via `CarIdxSessionFlags`.
 * - `"blackFlag"` – car has an active black flag via `CarIdxSessionFlags`.
 * - `"meatball"` – car has an active meatball/damage flag via `CarIdxSessionFlags`.
 * - `"waveAround"` – car is at least 1 lap down under a caution/yellow.
 *
 * @internal Exported for testing
 */
export type RaceControlAttentionState = "none" | "disqualify" | "blackFlag" | "meatball" | "waveAround";

/**
 * Returns `true` when the car at `carIdx` has an active disqualify flag set
 * in the per-car session flags bitfield (`CarIdxSessionFlags`).
 *
 * Safe: returns `false` when `telemetry` is null, `CarIdxSessionFlags` is
 * absent, or `carIdx` is out of range.
 *
 * @internal Exported for testing
 */
export function hasDisqualifyFlag(carIdx: number, telemetry: TelemetryData | null): boolean {
  const flags = telemetry?.CarIdxSessionFlags;

  if (!flags || carIdx < 0 || carIdx >= flags.length) return false;

  return hasFlag(flags[carIdx], Flags.Disqualify);
}

/**
 * Returns `true` when the car at `carIdx` has an active black flag set in
 * the per-car session flags bitfield (`CarIdxSessionFlags`).
 *
 * Safe: returns `false` when `telemetry` is null, `CarIdxSessionFlags` is
 * absent, or `carIdx` is out of range.
 *
 * @internal Exported for testing
 */
export function hasBlackFlag(carIdx: number, telemetry: TelemetryData | null): boolean {
  const flags = telemetry?.CarIdxSessionFlags;

  if (!flags || carIdx < 0 || carIdx >= flags.length) return false;

  // Disqualify is rendered separately; suppress black when both bits are set.
  return hasFlag(flags[carIdx], Flags.Black) && !hasFlag(flags[carIdx], Flags.Disqualify);
}

/**
 * Returns `true` when the car at `carIdx` has an active meatball/damage flag
 * set in the per-car session flags bitfield (`CarIdxSessionFlags`).
 *
 * Meatball maps to the `Repair` bit. `Servicible` is not a meatball signal
 * and can be broadly set, so it must not drive attention borders.
 *
 * Safe: returns `false` when `telemetry` is null, `CarIdxSessionFlags` is
 * absent, or `carIdx` is out of range.
 *
 * @internal Exported for testing
 */
export function hasMeatballFlag(carIdx: number, telemetry: TelemetryData | null): boolean {
  const flags = telemetry?.CarIdxSessionFlags;

  if (!flags || carIdx < 0 || carIdx >= flags.length) return false;

  return hasFlag(flags[carIdx], Flags.Repair);
}

/**
 * Returns `true` when any caution or yellow flag is active in the global
 * session flags bitfield (`SessionFlags`).
 *
 * Safe: returns `false` when `telemetry` is null or `SessionFlags` is absent.
 *
 * @internal Exported for testing
 */
export function isCautionActive(telemetry: TelemetryData | null): boolean {
  const sessionFlags = telemetry?.SessionFlags;

  if (sessionFlags === undefined || sessionFlags === null) return false;

  return (
    hasFlag(sessionFlags, Flags.Yellow) ||
    hasFlag(sessionFlags, Flags.YellowWaving) ||
    hasFlag(sessionFlags, Flags.Caution) ||
    hasFlag(sessionFlags, Flags.CautionWaving)
  );
}

/**
 * Minimum race-progress gap (lap + lap-fraction) that classifies a car as
 * lap-down. Using 0.95 rather than 1.0 absorbs the brief false-positive that
 * occurs when the leader crosses the start/finish line and increments their
 * `CarIdxLap` integer before the rest of the field does the same: with a
 * strict 1.0 threshold a car trailing the leader by only 0.05 laps would
 * appear lap-down for a split second. The 0.95 buffer ensures the car must be
 * genuinely 95% of a lap or more behind before highlighting is triggered.
 */
const LAP_DOWN_THRESHOLD = 0.95;

/**
 * Returns the car's overall race progress as `CarIdxLap + CarIdxLapDistPct`
 * (e.g., `51.98` = on lap 51, 98% around the track).
 *
 * Returns `undefined` when any required data is unavailable or invalid:
 * - `telemetry` is null
 * - `CarIdxLap` or `CarIdxLapDistPct` is absent
 * - `carIdx` is out of range for either array
 * - `CarIdxLap[carIdx] < 1` (−1 = not in world, 0 = race not yet started)
 * - `CarIdxLapDistPct[carIdx] < 0` (−1 = not in world)
 *
 * @internal Exported for testing
 */
export function getCarRaceProgress(carIdx: number, telemetry: TelemetryData | null): number | undefined {
  const laps = telemetry?.CarIdxLap;
  const dists = telemetry?.CarIdxLapDistPct;

  if (!laps || !dists || carIdx < 0 || carIdx >= laps.length || carIdx >= dists.length) return undefined;

  const lap = laps[carIdx];
  const dist = dists[carIdx];

  if (lap < 1) return undefined; // -1 = not in world, 0 = not yet started

  if (dist < 0) return undefined; // -1 = not in world

  return lap + dist;
}

/**
 * Returns `true` when the car at `carIdx` is at least `LAP_DOWN_THRESHOLD`
 * race-progress units behind the current leader.
 *
 * Race progress is computed as `CarIdxLap + CarIdxLapDistPct` so that
 * fractional lap position is taken into account. This prevents the
 * integer-only flicker that occurs every lap when the leader crosses the
 * start/finish line and increments their lap counter before the trailing
 * car does the same.
 *
 * If `CarIdxLapDistPct` is unavailable the function returns `false` rather
 * than falling back to the noisy integer-only comparison.
 *
 * Safe: returns `false` when `telemetry` is null, either lap array is absent,
 * `carIdx` is out of range, or no valid leader progress can be determined.
 *
 * @internal Exported for testing
 */
export function isLapDown(carIdx: number, telemetry: TelemetryData | null): boolean {
  const carProgress = getCarRaceProgress(carIdx, telemetry);

  if (carProgress === undefined) return false;

  const laps = telemetry?.CarIdxLap;
  const dists = telemetry?.CarIdxLapDistPct;

  if (!laps || !dists) return false;

  const count = Math.min(laps.length, dists.length);
  let leaderProgress = -Infinity;

  for (let i = 0; i < count; i++) {
    const p = getCarRaceProgress(i, telemetry);

    if (p !== undefined && p > leaderProgress) leaderProgress = p;
  }

  if (!Number.isFinite(leaderProgress)) return false;

  return leaderProgress - carProgress >= LAP_DOWN_THRESHOLD;
}

/**
 * Returns `true` when the car at `carIdx` is a wave-around candidate:
 * a caution is active **and** the car is at least 1 lap down.
 *
 * This is an approximate helper and does not replicate iRacing's official
 * wave-around eligibility rules precisely.
 *
 * @internal Exported for testing
 */
export function needsWaveAround(carIdx: number, telemetry: TelemetryData | null): boolean {
  return isCautionActive(telemetry) && isLapDown(carIdx, telemetry);
}

/**
 * Derives the Race Control attention state for a car from live telemetry.
 *
 * Evaluates black-flag and wave-around conditions independently and combines
 * them into the four-value `RaceControlAttentionState` union.
 *
 * @internal Exported for testing
 */
export function getRaceControlAttentionState(
  carIdx: number,
  telemetry: TelemetryData | null,
): RaceControlAttentionState {
  const disqualify = hasDisqualifyFlag(carIdx, telemetry);
  const blackFlag = hasBlackFlag(carIdx, telemetry);
  const meatball = hasMeatballFlag(carIdx, telemetry);
  const waveAround = needsWaveAround(carIdx, telemetry);

  // Priority: disqualify > black > meatball > wave-around.
  if (disqualify) return "disqualify";

  if (blackFlag) return "blackFlag";

  if (meatball) return "meatball";

  if (waveAround) return "waveAround";

  return "none";
}

/** Dark border used for black-flag attention. */
const BLACK_FLAG_COLOR = "#1a1a1a";
/** Orange border used for meatball attention. */
const MEATBALL_COLOR = "#e67e22";
/** Blue colour used for wave-around attention borders. */
const WAVE_AROUND_COLOR = "#3498db";
/** Inset for the inner attention fill so the normal border remains visible. */
const ATTENTION_FILL_INSET = 10;
/** Corner radius for the inner attention fill. */
const ATTENTION_FILL_RX = 12;
/** Size of the inner attention fill rect. */
const ATTENTION_FILL_SIZE = 144 - 2 * ATTENTION_FILL_INSET;

/**
 * Returns a raw SVG fragment representing the attention overlay for
 * the given state, or `""` for `"none"`.
 *
 * The fragment is intended to be placed in the `{{attentionBorderContent}}`
 * slot of `ICON_BASE_TEMPLATE`, which renders it below the normal border and
 * graphic layers so the border remains visible.
 *
 * @internal Exported for testing
 */
export function getAttentionBorderSvg(state: RaceControlAttentionState): string {
  switch (state) {
    case "none":
      return "";
    case "disqualify":
      return `<rect x="${ATTENTION_FILL_INSET}" y="${ATTENTION_FILL_INSET}" width="${ATTENTION_FILL_SIZE}" height="${ATTENTION_FILL_SIZE}" rx="${ATTENTION_FILL_RX}" fill="${BLACK_FLAG_COLOR}"/><line x1="28" y1="22" x2="116" y2="110" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/><line x1="116" y1="22" x2="28" y2="110" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>`;
    case "blackFlag":
      return `<rect x="${ATTENTION_FILL_INSET}" y="${ATTENTION_FILL_INSET}" width="${ATTENTION_FILL_SIZE}" height="${ATTENTION_FILL_SIZE}" rx="${ATTENTION_FILL_RX}" fill="${BLACK_FLAG_COLOR}"/>`;
    case "meatball":
      return `<rect x="${ATTENTION_FILL_INSET}" y="${ATTENTION_FILL_INSET}" width="${ATTENTION_FILL_SIZE}" height="${ATTENTION_FILL_SIZE}" rx="${ATTENTION_FILL_RX}" fill="${BLACK_FLAG_COLOR}"/><circle cx="72" cy="72" r="20" fill="${MEATBALL_COLOR}"/>`;
    case "waveAround":
      return `<rect x="${ATTENTION_FILL_INSET}" y="${ATTENTION_FILL_INSET}" width="${ATTENTION_FILL_SIZE}" height="${ATTENTION_FILL_SIZE}" rx="${ATTENTION_FILL_RX}" fill="${WAVE_AROUND_COLOR}"/>`;
  }
}
