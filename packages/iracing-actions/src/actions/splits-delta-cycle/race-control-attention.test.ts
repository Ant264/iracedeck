import { describe, expect, it } from "vitest";

import {
  getAttentionBorderSvg,
  getCarRaceProgress,
  getRaceControlAttentionState,
  hasBlackFlag,
  isCautionActive,
  isLapDown,
  needsWaveAround,
  type RaceControlAttentionState,
} from "./race-control-attention.js";

// Flag bit values (mirrored from @iracedeck/iracing-native Flags enum).
// Duplicated here so the test stays self-contained and doesn't rely on
// the native-addon import chain.
const FLAG_YELLOW = 0x0008;
const FLAG_YELLOW_WAVING = 0x0100;
const FLAG_CAUTION = 0x4000;
const FLAG_CAUTION_WAVING = 0x8000;
const FLAG_BLACK = 0x00010000;

type PartialTelemetry = {
  SessionFlags?: number;
  CarIdxSessionFlags?: number[];
  CarIdxLap?: number[];
  CarIdxLapDistPct?: number[];
};

function makeTelemetry(overrides: PartialTelemetry = {}) {
  return {
    SessionFlags: 0,
    CarIdxSessionFlags: new Array(64).fill(0) as number[],
    CarIdxLap: new Array(64).fill(-1) as number[],
    CarIdxLapDistPct: new Array(64).fill(0) as number[],
    ...overrides,
  } as unknown as import("@iracedeck/iracing-sdk").TelemetryData;
}

// ---------------------------------------------------------------------------
// hasBlackFlag
// ---------------------------------------------------------------------------

describe("hasBlackFlag", () => {
  it("returns true when the black flag bit is set for the queried car", () => {
    const t = makeTelemetry({ CarIdxSessionFlags: [0, FLAG_BLACK, 0] });

    expect(hasBlackFlag(1, t)).toBe(true);
  });

  it("returns false when the black flag bit is not set", () => {
    const t = makeTelemetry({ CarIdxSessionFlags: [0, 0, 0] });

    expect(hasBlackFlag(1, t)).toBe(false);
  });

  it("returns false when telemetry is null", () => {
    expect(hasBlackFlag(0, null)).toBe(false);
  });

  it("returns false when CarIdxSessionFlags is absent", () => {
    const t = makeTelemetry({ CarIdxSessionFlags: undefined });

    expect(hasBlackFlag(0, t)).toBe(false);
  });

  it("returns false when carIdx is beyond the array length", () => {
    const t = makeTelemetry({ CarIdxSessionFlags: [FLAG_BLACK] });

    expect(hasBlackFlag(99, t)).toBe(false);
  });

  it("returns false when carIdx is negative", () => {
    const t = makeTelemetry({ CarIdxSessionFlags: [FLAG_BLACK] });

    expect(hasBlackFlag(-1, t)).toBe(false);
  });

  it("returns false when other flags are set but not the black flag", () => {
    const t = makeTelemetry({ CarIdxSessionFlags: [FLAG_YELLOW, 0] });

    expect(hasBlackFlag(0, t)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isCautionActive
// ---------------------------------------------------------------------------

describe("isCautionActive", () => {
  it("returns true when the Yellow flag is set", () => {
    expect(isCautionActive(makeTelemetry({ SessionFlags: FLAG_YELLOW }))).toBe(true);
  });

  it("returns true when the YellowWaving flag is set", () => {
    expect(isCautionActive(makeTelemetry({ SessionFlags: FLAG_YELLOW_WAVING }))).toBe(true);
  });

  it("returns true when the Caution flag is set", () => {
    expect(isCautionActive(makeTelemetry({ SessionFlags: FLAG_CAUTION }))).toBe(true);
  });

  it("returns true when the CautionWaving flag is set", () => {
    expect(isCautionActive(makeTelemetry({ SessionFlags: FLAG_CAUTION_WAVING }))).toBe(true);
  });

  it("returns false when no caution flags are set", () => {
    expect(isCautionActive(makeTelemetry({ SessionFlags: 0 }))).toBe(false);
  });

  it("returns false when telemetry is null", () => {
    expect(isCautionActive(null)).toBe(false);
  });

  it("returns false when SessionFlags is absent", () => {
    expect(isCautionActive(makeTelemetry({ SessionFlags: undefined }))).toBe(false);
  });

  it("returns true when multiple caution bits are set simultaneously", () => {
    expect(isCautionActive(makeTelemetry({ SessionFlags: FLAG_CAUTION | FLAG_YELLOW_WAVING }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getCarRaceProgress
// ---------------------------------------------------------------------------

describe("getCarRaceProgress", () => {
  it("returns lap + dist for a valid car", () => {
    const dists = new Array(64).fill(0) as number[];

    dists[2] = 0.75;
    const t = makeTelemetry({ CarIdxLap: [-1, -1, 5, -1], CarIdxLapDistPct: dists });

    expect(getCarRaceProgress(2, t)).toBeCloseTo(5.75);
  });

  it("returns exactly the lap number when dist is 0", () => {
    const t = makeTelemetry({ CarIdxLap: [-1, 3], CarIdxLapDistPct: [0, 0] });

    expect(getCarRaceProgress(1, t)).toBe(3);
  });

  it("returns undefined for null telemetry", () => {
    expect(getCarRaceProgress(0, null)).toBeUndefined();
  });

  it("returns undefined when CarIdxLap is absent", () => {
    const t = makeTelemetry({ CarIdxLap: undefined });

    expect(getCarRaceProgress(0, t)).toBeUndefined();
  });

  it("returns undefined when CarIdxLapDistPct is absent", () => {
    const t = makeTelemetry({ CarIdxLapDistPct: undefined, CarIdxLap: [5] });

    expect(getCarRaceProgress(0, t)).toBeUndefined();
  });

  it("returns undefined when carIdx is out of range", () => {
    const t = makeTelemetry({ CarIdxLap: [5], CarIdxLapDistPct: [0] });

    expect(getCarRaceProgress(99, t)).toBeUndefined();
  });

  it("returns undefined when carIdx is negative", () => {
    const t = makeTelemetry({ CarIdxLap: [5], CarIdxLapDistPct: [0] });

    expect(getCarRaceProgress(-1, t)).toBeUndefined();
  });

  it("returns undefined when lap is -1 (not in world)", () => {
    const t = makeTelemetry({ CarIdxLap: [-1, 5], CarIdxLapDistPct: [0, 0] });

    expect(getCarRaceProgress(0, t)).toBeUndefined();
  });

  it("returns undefined when lap is 0 (race not yet started)", () => {
    const t = makeTelemetry({ CarIdxLap: [0, 5], CarIdxLapDistPct: [0, 0] });

    expect(getCarRaceProgress(0, t)).toBeUndefined();
  });

  it("returns undefined when dist is negative (-1 = not in world)", () => {
    const t = makeTelemetry({ CarIdxLap: [5, 5], CarIdxLapDistPct: [-1, 0] });

    expect(getCarRaceProgress(0, t)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isLapDown
// ---------------------------------------------------------------------------

describe("isLapDown", () => {
  it("returns true when the car is 1 full lap behind the leader", () => {
    // Car 2 is on lap 4; leader (car 3) is on lap 5. Both at start of lap.
    const t = makeTelemetry({ CarIdxLap: [-1, -1, 4, 5, -1] });

    expect(isLapDown(2, t)).toBe(true);
  });

  it("returns true when the car is 2 or more laps behind the leader", () => {
    const t = makeTelemetry({ CarIdxLap: [5, 3, -1] });

    expect(isLapDown(1, t)).toBe(true);
  });

  it("does NOT flag a car as lap-down when the leader just crossed the S/F line (flicker prevention)", () => {
    // Leader crossed the line: lap 51, dist 0.02.
    // Trailing car is close behind: lap 50, dist 0.98.
    // Integer-only: 51 − 50 = 1 → would falsely mark as lap-down.
    // Progress: 51.02 − 50.98 = 0.04, which is well below the 0.95 threshold.
    const dists = new Array(64).fill(0) as number[];

    dists[0] = 0.02; // leader just crossed the line
    dists[1] = 0.98; // trailing car approaching the line
    const t = makeTelemetry({ CarIdxLap: [51, 50, -1], CarIdxLapDistPct: dists });

    expect(isLapDown(1, t)).toBe(false);
  });

  it("flags a car as truly lap-down even when both cars are near the line", () => {
    // Leader: lap 51, dist 0.02. Car: lap 49, dist 0.98.
    // Progress gap: 51.02 − 49.98 = 1.04 ≥ 0.95 → lap-down.
    const dists = new Array(64).fill(0) as number[];

    dists[0] = 0.02;
    dists[1] = 0.98;
    const t = makeTelemetry({ CarIdxLap: [51, 49, -1], CarIdxLapDistPct: dists });

    expect(isLapDown(1, t)).toBe(true);
  });

  it("returns false when the car is the leader", () => {
    const t = makeTelemetry({ CarIdxLap: [5, 4, 3] });

    expect(isLapDown(0, t)).toBe(false);
  });

  it("returns false when the car is on the same lap as the leader", () => {
    const t = makeTelemetry({ CarIdxLap: [5, 5, 5] });

    expect(isLapDown(1, t)).toBe(false);
  });

  it("returns false when telemetry is null", () => {
    expect(isLapDown(0, null)).toBe(false);
  });

  it("returns false when CarIdxLap is absent", () => {
    const t = makeTelemetry({ CarIdxLap: undefined });

    expect(isLapDown(0, t)).toBe(false);
  });

  it("returns false when CarIdxLapDistPct is absent", () => {
    const t = makeTelemetry({ CarIdxLapDistPct: undefined, CarIdxLap: [5, 4] });

    expect(isLapDown(1, t)).toBe(false);
  });

  it("returns false when the car's lap count is -1 (not in world)", () => {
    const t = makeTelemetry({ CarIdxLap: [5, -1, 3] });

    expect(isLapDown(1, t)).toBe(false);
  });

  it("returns false when the car's lap count is 0 (race not yet started)", () => {
    const t = makeTelemetry({ CarIdxLap: [5, 0, 3] });

    expect(isLapDown(1, t)).toBe(false);
  });

  it("returns false when all lap counts are invalid (-1)", () => {
    const t = makeTelemetry({ CarIdxLap: [-1, -1, -1] });

    expect(isLapDown(0, t)).toBe(false);
  });

  it("returns false when carIdx is out of range", () => {
    const t = makeTelemetry({ CarIdxLap: [5, 4], CarIdxLapDistPct: [0, 0] });

    expect(isLapDown(99, t)).toBe(false);
  });

  it("returns false when carIdx is negative", () => {
    const t = makeTelemetry({ CarIdxLap: [5, 4], CarIdxLapDistPct: [0, 0] });

    expect(isLapDown(-1, t)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// needsWaveAround
// ---------------------------------------------------------------------------

describe("needsWaveAround", () => {
  it("returns true when caution is active and the car is lap down", () => {
    const t = makeTelemetry({ SessionFlags: FLAG_CAUTION, CarIdxLap: [5, 4, -1] });

    expect(needsWaveAround(1, t)).toBe(true);
  });

  it("returns false when caution is active but the car is not lap down", () => {
    const t = makeTelemetry({ SessionFlags: FLAG_CAUTION, CarIdxLap: [5, 5, -1] });

    expect(needsWaveAround(1, t)).toBe(false);
  });

  it("returns false when the car is lap down but there is no caution", () => {
    const t = makeTelemetry({ SessionFlags: 0, CarIdxLap: [5, 4, -1] });

    expect(needsWaveAround(1, t)).toBe(false);
  });

  it("returns false when telemetry is null", () => {
    expect(needsWaveAround(0, null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getRaceControlAttentionState
// ---------------------------------------------------------------------------

describe("getRaceControlAttentionState", () => {
  it("returns 'none' when neither condition applies", () => {
    const t = makeTelemetry({
      SessionFlags: 0,
      CarIdxSessionFlags: [0],
      CarIdxLap: [5],
    });

    expect(getRaceControlAttentionState(0, t)).toBe("none");
  });

  it("returns 'blackFlag' when only the black flag is set (no caution)", () => {
    const t = makeTelemetry({
      SessionFlags: 0,
      CarIdxSessionFlags: [FLAG_BLACK],
      CarIdxLap: [5],
    });

    expect(getRaceControlAttentionState(0, t)).toBe("blackFlag");
  });

  it("returns 'waveAround' when only the wave-around condition is met", () => {
    const t = makeTelemetry({
      SessionFlags: FLAG_CAUTION,
      CarIdxSessionFlags: [0, 0],
      CarIdxLap: [5, 4],
    });

    expect(getRaceControlAttentionState(1, t)).toBe("waveAround");
  });

  it("returns 'both' when both black flag and wave-around conditions are met", () => {
    const t = makeTelemetry({
      SessionFlags: FLAG_CAUTION,
      CarIdxSessionFlags: [0, FLAG_BLACK],
      CarIdxLap: [5, 4],
    });

    expect(getRaceControlAttentionState(1, t)).toBe("both");
  });

  it("returns 'none' for null telemetry", () => {
    expect(getRaceControlAttentionState(0, null)).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// getAttentionBorderSvg
// ---------------------------------------------------------------------------

describe("getAttentionBorderSvg", () => {
  it("returns an empty string for 'none'", () => {
    expect(getAttentionBorderSvg("none")).toBe("");
  });

  it("returns an SVG rect with orange stroke for 'blackFlag'", () => {
    const result = getAttentionBorderSvg("blackFlag");

    expect(result).toContain("<rect");
    expect(result).toContain("#e67e22");
    expect(result).toContain('stroke-width="11"');
    expect(result).not.toContain("#3498db");
  });

  it("returns an SVG rect with blue stroke for 'waveAround'", () => {
    const result = getAttentionBorderSvg("waveAround");

    expect(result).toContain("<rect");
    expect(result).toContain("#3498db");
    expect(result).toContain('stroke-width="11"');
    expect(result).not.toContain("#e67e22");
  });

  it("returns orange stroke for 'both' (black flag takes priority for v1)", () => {
    const result = getAttentionBorderSvg("both");

    expect(result).toContain("#e67e22");
    expect(result).not.toContain("#3498db");
  });

  it("returns a well-formed SVG rect attribute for non-none states", () => {
    const states: Exclude<RaceControlAttentionState, "none">[] = ["blackFlag", "waveAround", "both"];

    for (const state of states) {
      const result = getAttentionBorderSvg(state);

      expect(result).toMatch(/^<rect /);
      expect(result).toContain('fill="none"');
      expect(result).toContain("rx=");
    }
  });
});
