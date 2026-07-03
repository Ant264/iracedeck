import type { TelemetryData } from "@iracedeck/iracing-sdk";
import { Flags } from "@iracedeck/iracing-sdk";
import { describe, expect, it } from "vitest";

import {
  getAttentionBorderSvg,
  getCarRaceProgress,
  getLapsDown,
  getRaceControlAttentionState,
  hasBlackFlag,
  hasDisqualifyFlag,
  hasMeatballFlag,
  isCautionActive,
  isLapDown,
  needsWaveAround,
} from "./race-control-attention.js";

// ---------------------------------------------------------------------------
// hasDisqualifyFlag
// ---------------------------------------------------------------------------
describe("hasDisqualifyFlag", () => {
  it("returns false when telemetry is null", () => {
    expect(hasDisqualifyFlag(0, null)).toBe(false);
  });

  it("returns false when CarIdxSessionFlags is absent", () => {
    expect(hasDisqualifyFlag(0, mkTelemetry({}))).toBe(false);
  });

  it("returns true when the Disqualify flag bit is set for the car", () => {
    const telemetry = mkTelemetry({ CarIdxSessionFlags: [0, Flags.Disqualify, 0] });
    expect(hasDisqualifyFlag(1, telemetry)).toBe(true);
    expect(hasDisqualifyFlag(0, telemetry)).toBe(false);
    expect(hasDisqualifyFlag(2, telemetry)).toBe(false);
  });
});

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
// hasMeatballFlag
// ---------------------------------------------------------------------------
describe("hasMeatballFlag", () => {
  it("returns false when telemetry is null", () => {
    expect(hasMeatballFlag(0, null)).toBe(false);
  });

  it("returns false when CarIdxSessionFlags is absent", () => {
    expect(hasMeatballFlag(0, mkTelemetry({}))).toBe(false);
  });

  it("returns true when the Repair flag bit is set for the car", () => {
    const telemetry = mkTelemetry({ CarIdxSessionFlags: [0, Flags.Repair, 0] });
    expect(hasMeatballFlag(1, telemetry)).toBe(true);
    expect(hasMeatballFlag(0, telemetry)).toBe(false);
    expect(hasMeatballFlag(2, telemetry)).toBe(false);
  });

  it("returns false when only the Servicible flag bit is set for the car", () => {
    const telemetry = mkTelemetry({ CarIdxSessionFlags: [0, Flags.Servicible, 0] });
    expect(hasMeatballFlag(1, telemetry)).toBe(false);
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
// getLapsDown
// ---------------------------------------------------------------------------
describe("getLapsDown", () => {
  it("returns undefined when telemetry is null", () => {
    expect(getLapsDown(0, null)).toBeUndefined();
  });

  it("returns 0 when car is on lead lap", () => {
    const t = mkTelemetry({
      CarIdxLap: [5, 5],
      CarIdxLapDistPct: [0.4, 0.1], // diff 0.3 < 0.95 threshold
    });
    expect(getLapsDown(1, t)).toBe(0);
  });

  it("returns 1 for one lap down", () => {
    const t = mkTelemetry({
      CarIdxLap: [6, 5],
      CarIdxLapDistPct: [0.0, 0.0],
    });
    expect(getLapsDown(1, t)).toBe(1);
  });

  it("returns 2 for two laps down", () => {
    const t = mkTelemetry({
      CarIdxLap: [7, 5],
      CarIdxLapDistPct: [0.0, 0.0],
    });
    expect(getLapsDown(1, t)).toBe(2);
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

  it("returns 'disqualify' when disqualify is present", () => {
    const t = mkTelemetry({
      SessionFlags: Flags.Green,
      CarIdxSessionFlags: [0, Flags.Disqualify],
      CarIdxLap: [5, 5],
      CarIdxLapDistPct: [0.5, 0.4],
    });
    expect(getRaceControlAttentionState(1, t)).toBe("disqualify");
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

  it("returns 'meatball' when only meatball condition is present", () => {
    const t = mkTelemetry({
      SessionFlags: Flags.Green,
      CarIdxSessionFlags: [0, Flags.Repair],
      CarIdxLap: [5, 5],
      CarIdxLapDistPct: [0.5, 0.4],
    });
    expect(getRaceControlAttentionState(1, t)).toBe("meatball");
  });

  it("returns 'blackFlag' when black flag and wave-around are both present", () => {
    const t = mkTelemetry({
      SessionFlags: Flags.Yellow,
      CarIdxSessionFlags: [0, Flags.Black],
      CarIdxLap: [6, 5],
      CarIdxLapDistPct: [0.0, 0.0],
    });
    expect(getRaceControlAttentionState(1, t)).toBe("blackFlag");
  });

  it("returns 'blackFlag' when black flag and meatball are both present", () => {
    const t = mkTelemetry({
      SessionFlags: Flags.Green,
      CarIdxSessionFlags: [0, Flags.Black | Flags.Repair],
      CarIdxLap: [5, 5],
      CarIdxLapDistPct: [0.5, 0.4],
    });
    expect(getRaceControlAttentionState(1, t)).toBe("blackFlag");
  });

  it("returns 'disqualify' when disqualify and black are both present", () => {
    const t = mkTelemetry({
      SessionFlags: Flags.Green,
      CarIdxSessionFlags: [0, Flags.Disqualify | Flags.Black],
      CarIdxLap: [5, 5],
      CarIdxLapDistPct: [0.5, 0.4],
    });
    expect(getRaceControlAttentionState(1, t)).toBe("disqualify");
  });

  it("returns 'meatball' when meatball and wave-around are both present", () => {
    const t = mkTelemetry({
      SessionFlags: Flags.Yellow,
      CarIdxSessionFlags: [0, Flags.Repair],
      CarIdxLap: [6, 5],
      CarIdxLapDistPct: [0.0, 0.0],
    });
    expect(getRaceControlAttentionState(1, t)).toBe("meatball");
  });

  it("returns 'none' when telemetry is null", () => {
    expect(getRaceControlAttentionState(0, null)).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// getAttentionBorderSvg
// ---------------------------------------------------------------------------
describe("getAttentionBorderSvg", () => {
  it("returns empty string for none state", () => {
    expect(getAttentionBorderSvg("none")).toBe("");
  });

  it("renders a blue interior fill for wave-around", () => {
    const svg = getAttentionBorderSvg("waveAround");
    expect(svg).toContain('fill="#3498db"');
    expect(svg).toContain("<rect");
  });

  it("renders a darker blue interior fill for pending wave-around", () => {
    const svg = getAttentionBorderSvg("waveAroundPending");
    expect(svg).toContain('fill="#123f6b"');
    expect(svg).toContain("<rect");
  });

  it("renders a black interior fill for black flag", () => {
    const svg = getAttentionBorderSvg("blackFlag");
    expect(svg).toContain('fill="#1a1a1a"');
    expect(svg).toContain("<rect");
  });

  it("renders black interior plus white X for disqualify", () => {
    const svg = getAttentionBorderSvg("disqualify");
    expect(svg).toContain('fill="#1a1a1a"');
    expect(svg).toContain('stroke="#ffffff"');
    expect(svg).toContain("<line");
    expect(svg).toContain('stroke-width="3"');
    expect(svg).toContain('x1="116" y1="22" x2="28" y2="110"');
  });

  it("renders black interior plus orange center marker for meatball", () => {
    const svg = getAttentionBorderSvg("meatball");
    expect(svg).toContain('fill="#1a1a1a"');
    expect(svg).toContain('fill="#e67e22"');
    expect(svg).toContain("<circle");
  });
});
