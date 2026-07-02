import type { TelemetryData } from "@iracedeck/iracing-sdk";
import { Flags } from "@iracedeck/iracing-sdk";
import { describe, expect, it } from "vitest";

import {
  getCarRaceProgress,
  getRaceControlAttentionState,
  hasBlackFlag,
  isCautionActive,
  isLapDown,
  needsWaveAround,
} from "./race-control-attention.js";

/** Minimal TelemetryData builder to keep tests concise. */
function mkTelemetry(overrides: Partial<TelemetryData> = {}): TelemetryData {
  return overrides as TelemetryData;
}

// ---------------------------------------------------------------------------
// hasBlackFlag
// ---------------------------------------------------------------------------
describe("hasBlackFlag", () => {
  it("returns false when telemetry is null", () => {
    expect(hasBlackFlag(0, null)).toBe(false);
  });

  it("returns false when CarIdxSessionFlags is absent", () => {
    expect(hasBlackFlag(0, mkTelemetry({}))).toBe(false);
  });

  it("returns false when carIdx is out of range", () => {
    const telemetry = mkTelemetry({ CarIdxSessionFlags: [Flags.Black] });
    expect(hasBlackFlag(5, telemetry)).toBe(false);
  });

  it("returns false when carIdx is negative", () => {
    const telemetry = mkTelemetry({ CarIdxSessionFlags: [Flags.Black] });
    expect(hasBlackFlag(-1, telemetry)).toBe(false);
  });

  it("returns true when the Black flag bit is set for the car", () => {
    const telemetry = mkTelemetry({ CarIdxSessionFlags: [0, Flags.Black, 0] });
    expect(hasBlackFlag(1, telemetry)).toBe(true);
    expect(hasBlackFlag(0, telemetry)).toBe(false);
    expect(hasBlackFlag(2, telemetry)).toBe(false);
  });

  it("handles combined flag values correctly", () => {
    const combined = Flags.Black | Flags.Yellow;
    const telemetry = mkTelemetry({ CarIdxSessionFlags: [combined] });
    expect(hasBlackFlag(0, telemetry)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isCautionActive
// ---------------------------------------------------------------------------
describe("isCautionActive", () => {
  it("returns false when telemetry is null", () => {
    expect(isCautionActive(null)).toBe(false);
  });

  it("returns false when SessionFlags is undefined", () => {
    expect(isCautionActive(mkTelemetry({}))).toBe(false);
  });

  it("returns true for Yellow flag", () => {
    expect(isCautionActive(mkTelemetry({ SessionFlags: Flags.Yellow }))).toBe(true);
  });

  it("returns true for YellowWaving flag", () => {
    expect(isCautionActive(mkTelemetry({ SessionFlags: Flags.YellowWaving }))).toBe(true);
  });

  it("returns true for Caution flag", () => {
    expect(isCautionActive(mkTelemetry({ SessionFlags: Flags.Caution }))).toBe(true);
  });

  it("returns true for CautionWaving flag", () => {
    expect(isCautionActive(mkTelemetry({ SessionFlags: Flags.CautionWaving }))).toBe(true);
  });

  it("returns false for unrelated flags", () => {
    expect(isCautionActive(mkTelemetry({ SessionFlags: Flags.Green }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getCarRaceProgress
// ---------------------------------------------------------------------------
describe("getCarRaceProgress", () => {
  it("returns undefined when telemetry is null", () => {
    expect(getCarRaceProgress(0, null)).toBeUndefined();
  });

  it("returns undefined when arrays are absent", () => {
    expect(getCarRaceProgress(0, mkTelemetry({}))).toBeUndefined();
  });

  it("returns undefined when CarIdxLap < 1", () => {
    const t = mkTelemetry({ CarIdxLap: [0], CarIdxLapDistPct: [0.5] });
    expect(getCarRaceProgress(0, t)).toBeUndefined();
  });

  it("returns undefined when CarIdxLapDistPct < 0", () => {
    const t = mkTelemetry({ CarIdxLap: [5], CarIdxLapDistPct: [-1] });
    expect(getCarRaceProgress(0, t)).toBeUndefined();
  });

  it("returns undefined when carIdx is out of range", () => {
    const t = mkTelemetry({ CarIdxLap: [5], CarIdxLapDistPct: [0.5] });
    expect(getCarRaceProgress(3, t)).toBeUndefined();
  });

  it("returns lap + lapDistPct for a valid entry", () => {
    const t = mkTelemetry({ CarIdxLap: [10], CarIdxLapDistPct: [0.75] });
    expect(getCarRaceProgress(0, t)).toBeCloseTo(10.75);
  });
});

// ---------------------------------------------------------------------------
// isLapDown
// ---------------------------------------------------------------------------
describe("isLapDown", () => {
  it("returns false when telemetry is null", () => {
    expect(isLapDown(0, null)).toBe(false);
  });

  it("returns false when target car progress is undefined", () => {
    const t = mkTelemetry({ CarIdxLap: [0], CarIdxLapDistPct: [0.5] });
    expect(isLapDown(0, t)).toBe(false);
  });

  it("returns false when lead car is less than threshold ahead", () => {
    const t = mkTelemetry({
      CarIdxLap: [5, 5],
      CarIdxLapDistPct: [0.5, 0.1], // leader at 5.5, target at 5.1 — diff 0.4 < 0.95
    });
    expect(isLapDown(1, t)).toBe(false);
  });

  it("returns true when lead car is threshold or more ahead", () => {
    const t = mkTelemetry({
      CarIdxLap: [6, 5],
      CarIdxLapDistPct: [0.0, 0.0], // leader at 6.0, target at 5.0 — diff 1.0 >= 0.95
    });
    expect(isLapDown(1, t)).toBe(true);
  });

  it("uses 0.95 threshold (not exactly 1.0)", () => {
    const t = mkTelemetry({
      CarIdxLap: [5, 5],
      CarIdxLapDistPct: [0.97, 0.0], // leader at 5.97, target at 5.0 — diff 0.97 >= 0.95
    });
    expect(isLapDown(1, t)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// needsWaveAround
// ---------------------------------------------------------------------------
describe("needsWaveAround", () => {
  it("returns false when no caution is active", () => {
    const t = mkTelemetry({
      SessionFlags: Flags.Green,
      CarIdxLap: [6, 5],
      CarIdxLapDistPct: [0.0, 0.0],
    });
    expect(needsWaveAround(1, t)).toBe(false);
  });

  it("returns false when caution is active but car is not lap down", () => {
    const t = mkTelemetry({
      SessionFlags: Flags.Yellow,
      CarIdxLap: [5, 5],
      CarIdxLapDistPct: [0.1, 0.0], // diff 0.1 < 0.95
    });
    expect(needsWaveAround(1, t)).toBe(false);
  });

  it("returns true when caution is active and car is lap down", () => {
    const t = mkTelemetry({
      SessionFlags: Flags.Yellow,
      CarIdxLap: [6, 5],
      CarIdxLapDistPct: [0.0, 0.0],
    });
    expect(needsWaveAround(1, t)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getRaceControlAttentionState
// ---------------------------------------------------------------------------
describe("getRaceControlAttentionState", () => {
  it("returns 'none' when no flag conditions are met", () => {
    const t = mkTelemetry({
      SessionFlags: Flags.Green,
      CarIdxSessionFlags: [0, 0],
      CarIdxLap: [5, 5],
      CarIdxLapDistPct: [0.5, 0.4],
    });
    expect(getRaceControlAttentionState(1, t)).toBe("none");
  });

  it("returns 'blackFlag' when only black flag is set", () => {
    const t = mkTelemetry({
      SessionFlags: Flags.Green,
      CarIdxSessionFlags: [0, Flags.Black],
      CarIdxLap: [5, 5],
      CarIdxLapDistPct: [0.5, 0.4],
    });
    expect(getRaceControlAttentionState(1, t)).toBe("blackFlag");
  });

  it("returns 'waveAround' when only wave-around conditions are met", () => {
    const t = mkTelemetry({
      SessionFlags: Flags.Yellow,
      CarIdxSessionFlags: [0, 0],
      CarIdxLap: [6, 5],
      CarIdxLapDistPct: [0.0, 0.0],
    });
    expect(getRaceControlAttentionState(1, t)).toBe("waveAround");
  });

  it("returns 'both' when black flag and wave-around are both present", () => {
    const t = mkTelemetry({
      SessionFlags: Flags.Yellow,
      CarIdxSessionFlags: [0, Flags.Black],
      CarIdxLap: [6, 5],
      CarIdxLapDistPct: [0.0, 0.0],
    });
    expect(getRaceControlAttentionState(1, t)).toBe("both");
  });

  it("returns 'none' when telemetry is null", () => {
    expect(getRaceControlAttentionState(0, null)).toBe("none");
  });
});
