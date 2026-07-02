import { Flags, hasFlag, type TelemetryData } from "@iracedeck/iracing-sdk";

/**
 * Describes the Race Control attention state for a car slot button.
 *
 * - `"none"` – no attention required.
 * - `"blackFlag"` – car has an active black flag via `CarIdxSessionFlags`.
 * - `"waveAround"` – car is at least 1 lap down under a caution/yellow.
 * - `"both"` – both conditions are true simultaneously.
 *
 * @internal Exported for testing
 */
export type RaceControlAttentionState = "none" | "blackFlag" | "waveAround" | "both";

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

  return hasFlag(flags[carIdx], Flags.Black);
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
  const blackFlag = hasBlackFlag(carIdx, telemetry);
  const waveAround = needsWaveAround(carIdx, telemetry);

  if (blackFlag && waveAround) return "both";

  if (blackFlag) return "blackFlag";

  if (waveAround) return "waveAround";

  return "none";
}

/** Orange colour used for black-flag and combined (`"both"`) attention borders. */
const BLACK_FLAG_COLOR = "#e67e22";
/** Blue colour used for wave-around attention borders. */
const WAVE_AROUND_COLOR = "#3498db";
/** Stroke width for the attention border — thicker than the default selected border (7 px). */
const ATTENTION_BORDER_WIDTH = 11;
/** Inset from the canvas edge = stroke-width / 2 (centres the stroke on the rect path). */
const ATTENTION_BORDER_INSET = ATTENTION_BORDER_WIDTH / 2;
/** Corner radius, derived from the 24 px canvas rx. */
const ATTENTION_BORDER_RX = Math.max(0, 24 - ATTENTION_BORDER_INSET);
/** Rect size = 144 − 2 × inset. */
const ATTENTION_BORDER_SIZE = 144 - 2 * ATTENTION_BORDER_INSET;

/**
 * Returns a raw SVG `<rect>` fragment representing the attention border for
 * the given state, or `""` for `"none"`.
 *
 * The fragment is intended to be placed in the `{{attentionBorderContent}}`
 * slot of `ICON_BASE_TEMPLATE`, which renders it below the selected-green
 * border so the green border always takes visual precedence.
 *
 * For `"both"`, the black-flag (orange) colour is used — highest-priority
 * wins, keeping v1 simple.
 *
 * @internal Exported for testing
 */
export function getAttentionBorderSvg(state: RaceControlAttentionState): string {
  let color: string;

  switch (state) {
    case "none":
      return "";
    case "blackFlag":
    case "both":
      color = BLACK_FLAG_COLOR;
      break;
    case "waveAround":
      color = WAVE_AROUND_COLOR;
      break;
  }

  return `<rect x="${ATTENTION_BORDER_INSET}" y="${ATTENTION_BORDER_INSET}" width="${ATTENTION_BORDER_SIZE}" height="${ATTENTION_BORDER_SIZE}" rx="${ATTENTION_BORDER_RX}" fill="none" stroke="${color}" stroke-width="${ATTENTION_BORDER_WIDTH}"/>`;
}
