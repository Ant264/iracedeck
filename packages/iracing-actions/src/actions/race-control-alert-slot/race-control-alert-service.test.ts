import type { TelemetryData } from "@iracedeck/iracing-sdk";
import { Flags } from "@iracedeck/iracing-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getAlertForSlot,
  getAlertQueueSnapshot,
  markWaveAroundCommandSent,
  resetAlertService,
  updateAlertQueue,
} from "./race-control-alert-service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockCar {
  carIdx: number;
  carNumber: string;
  carNumberRaw?: number;
  driverName?: string;
}

type SessionTypeLabel = "Race" | "Open Practice" | "Lone Qualify" | "Replay" | "AI Race";

/** Minimal session info shape that buildSessionRoster reads. */
function mkSessionInfo(cars: MockCar[], subSessionId = 1, eventType: SessionTypeLabel = "Race") {
  return {
    WeekendInfo: { SubSessionID: subSessionId, EventType: eventType },
    DriverInfo: {
      Drivers: cars.map((c) => ({
        CarIdx: c.carIdx,
        CarNumber: c.carNumber,
        CarNumberRaw: c.carNumberRaw ?? (parseInt(c.carNumber, 10) || 0),
        UserName: c.driverName ?? `Driver ${c.carIdx}`,
        IsSpectator: 0,
        CarIsPaceCar: 0,
      })),
    },
  };
}

function mkTelemetry(overrides: Partial<TelemetryData> = {}): TelemetryData {
  return overrides as TelemetryData;
}

// Deterministic clock helpers
let mockNow = 0;

beforeEach(() => {
  resetAlertService();
  mockNow = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => mockNow);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Basic detection
// ---------------------------------------------------------------------------

describe("updateAlertQueue — black flag detection", () => {
  it("adds a black-flag entry when the flag is set", () => {
    const session = mkSessionInfo([{ carIdx: 3, carNumber: "42" }]);
    const telemetry = mkTelemetry({
      SessionTick: 1,
      CarIdxSessionFlags: [0, 0, 0, Flags.Black],
    });

    updateAlertQueue(session, telemetry);

    const snapshot = getAlertQueueSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({
      type: "blackFlag",
      carIdx: 3,
      carNumber: "42",
    });
  });

  it("does not duplicate an existing entry on the next tick", () => {
    const session = mkSessionInfo([{ carIdx: 3, carNumber: "42" }]);

    updateAlertQueue(session, mkTelemetry({ SessionTick: 1, CarIdxSessionFlags: [0, 0, 0, Flags.Black] }));
    // Different tick — should scan again but not add a duplicate
    updateAlertQueue(session, mkTelemetry({ SessionTick: 2, CarIdxSessionFlags: [0, 0, 0, Flags.Black] }));

    expect(getAlertQueueSnapshot()).toHaveLength(1);
  });

  it("tick deduplication: same tick does not re-scan", () => {
    const session = mkSessionInfo([
      { carIdx: 3, carNumber: "42" },
      { carIdx: 4, carNumber: "88" },
    ]);

    updateAlertQueue(session, mkTelemetry({ SessionTick: 5, CarIdxSessionFlags: [0, 0, 0, Flags.Black] }));
    // Same tick — second call should be a no-op even though a second car now has the flag
    updateAlertQueue(session, mkTelemetry({ SessionTick: 5, CarIdxSessionFlags: [0, 0, 0, Flags.Black, Flags.Black] }));

    expect(getAlertQueueSnapshot()).toHaveLength(1);
  });

  it("detects black-flag alerts in Race sessions", () => {
    const session = mkSessionInfo([{ carIdx: 3, carNumber: "42" }], 10, "Race");

    updateAlertQueue(session, mkTelemetry({ SessionTick: 1, CarIdxSessionFlags: [0, 0, 0, Flags.Black] }));

    const alert = getAlertForSlot(0, "blackFlag");
    expect(alert?.type).toBe("blackFlag");
    expect(alert?.carNumber).toBe("42");
  });

  it("detects black-flag alerts in Qualifying sessions", () => {
    const session = mkSessionInfo([{ carIdx: 3, carNumber: "42" }], 11, "Lone Qualify");

    updateAlertQueue(session, mkTelemetry({ SessionTick: 1, CarIdxSessionFlags: [0, 0, 0, Flags.Black] }));

    const alert = getAlertForSlot(0, "blackFlag");
    expect(alert?.type).toBe("blackFlag");
    expect(alert?.carNumber).toBe("42");
  });

  it("detects black-flag alerts in Practice sessions", () => {
    const session = mkSessionInfo([{ carIdx: 3, carNumber: "42" }], 12, "Open Practice");

    updateAlertQueue(session, mkTelemetry({ SessionTick: 1, CarIdxSessionFlags: [0, 0, 0, Flags.Black] }));

    const alert = getAlertForSlot(0, "blackFlag");
    expect(alert?.type).toBe("blackFlag");
    expect(alert?.carNumber).toBe("42");
  });
});

describe("updateAlertQueue — disqualify detection", () => {
  it("adds a disqualify entry when Disqualify is set", () => {
    const session = mkSessionInfo([{ carIdx: 3, carNumber: "42" }]);

    updateAlertQueue(session, mkTelemetry({ SessionTick: 1, CarIdxSessionFlags: [0, 0, 0, Flags.Disqualify] }));

    const alert = getAlertForSlot(0, "any");
    expect(alert?.type).toBe("disqualify");
    expect(alert?.carNumber).toBe("42");
  });

  it("suppresses blackFlag entry when Disqualify and Black are both set", () => {
    const session = mkSessionInfo([{ carIdx: 3, carNumber: "42" }]);

    updateAlertQueue(
      session,
      mkTelemetry({ SessionTick: 1, CarIdxSessionFlags: [0, 0, 0, Flags.Disqualify | Flags.Black] }),
    );

    expect(getAlertForSlot(0, "blackFlag")?.type).toBe("disqualify");
    expect(getAlertForSlot(1, "blackFlag")).toBeNull();
  });
});

describe("updateAlertQueue — wave-around detection", () => {
  it("adds a wave-around entry when conditions are met", () => {
    const session = mkSessionInfo([
      { carIdx: 0, carNumber: "01" }, // leader
      { carIdx: 1, carNumber: "77" }, // lap down
    ]);
    const telemetry = mkTelemetry({
      SessionTick: 1,
      SessionFlags: Flags.Yellow,
      CarIdxSessionFlags: [0, 0],
      CarIdxLap: [6, 5],
      CarIdxLapDistPct: [0.0, 0.0],
    });

    updateAlertQueue(session, telemetry);

    const snapshot = getAlertQueueSnapshot();
    const waveEntry = snapshot.find((e) => e.type === "waveAround");
    expect(waveEntry).toBeDefined();
    expect(waveEntry?.carIdx).toBe(1);
  });

  it("orders wave-around slots by leaderboard position", () => {
    const session = mkSessionInfo([
      { carIdx: 0, carNumber: "01" }, // leader
      { carIdx: 1, carNumber: "77" },
      { carIdx: 2, carNumber: "88" },
    ]);

    updateAlertQueue(
      session,
      mkTelemetry({
        SessionTick: 1,
        SessionFlags: Flags.Yellow,
        CarIdxSessionFlags: [0, 0, 0],
        CarIdxLap: [6, 5, 5],
        CarIdxLapDistPct: [0.0, 0.0, 0.0],
        CarIdxPosition: [1, 3, 2],
      }),
    );

    expect(getAlertForSlot(0, "waveAround")?.carIdx).toBe(2);
    expect(getAlertForSlot(1, "waveAround")?.carIdx).toBe(1);
  });
});

describe("updateAlertQueue — meatball detection", () => {
  it("adds a meatball entry when Repair is set", () => {
    const session = mkSessionInfo([{ carIdx: 3, carNumber: "42" }]);

    updateAlertQueue(session, mkTelemetry({ SessionTick: 1, CarIdxSessionFlags: [0, 0, 0, Flags.Repair] }));

    const alert = getAlertForSlot(0, "blackFlag");
    expect(alert?.type).toBe("meatball");
    expect(alert?.carNumber).toBe("42");
  });

  it("does not add a meatball entry when only Servicible is set", () => {
    const session = mkSessionInfo([{ carIdx: 3, carNumber: "42" }]);

    updateAlertQueue(session, mkTelemetry({ SessionTick: 1, CarIdxSessionFlags: [0, 0, 0, Flags.Servicible] }));

    const alert = getAlertForSlot(0, "blackFlag");
    expect(alert).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Stable ordering
// ---------------------------------------------------------------------------

describe("stable insertion order", () => {
  it("orders alerts as disqualify, black-flag, meatball, then wave-around", () => {
    const session = mkSessionInfo([
      { carIdx: 0, carNumber: "01" },
      { carIdx: 1, carNumber: "22" },
      { carIdx: 2, carNumber: "33" },
      { carIdx: 3, carNumber: "44" },
    ]);

    updateAlertQueue(
      session,
      mkTelemetry({
        SessionTick: 1,
        SessionFlags: Flags.Yellow,
        CarIdxSessionFlags: [0, Flags.Repair, 0, 0],
        CarIdxLap: [6, 5, 5, 5],
        CarIdxLapDistPct: [0.0, 0.0, 0.0, 0.0],
      }),
    );

    updateAlertQueue(
      session,
      mkTelemetry({
        SessionTick: 2,
        SessionFlags: Flags.Yellow,
        CarIdxSessionFlags: [0, Flags.Repair, Flags.Black, 0],
        CarIdxLap: [6, 5, 5, 5],
        CarIdxLapDistPct: [0.0, 0.0, 0.0, 0.0],
      }),
    );

    updateAlertQueue(
      session,
      mkTelemetry({
        SessionTick: 3,
        SessionFlags: Flags.Yellow,
        CarIdxSessionFlags: [0, Flags.Repair, Flags.Black, Flags.Disqualify],
        CarIdxLap: [6, 5, 5, 5],
        CarIdxLapDistPct: [0.0, 0.0, 0.0, 0.0],
      }),
    );

    const snapshot = getAlertQueueSnapshot();
    const dqIdx = snapshot.findIndex((e) => e.type === "disqualify");
    const bfIdx = snapshot.findIndex((e) => e.type === "blackFlag");
    const mbIdx = snapshot.findIndex((e) => e.type === "meatball");
    const waIdx = snapshot.findIndex((e) => e.type === "waveAround");

    expect(dqIdx).toBeGreaterThanOrEqual(0);
    expect(bfIdx).toBeGreaterThanOrEqual(0);
    expect(mbIdx).toBeGreaterThanOrEqual(0);
    expect(waIdx).toBeGreaterThanOrEqual(0);
    expect(dqIdx).toBeLessThan(bfIdx);
    expect(bfIdx).toBeLessThan(mbIdx);
    expect(mbIdx).toBeLessThan(waIdx);
  });

  it("orders alerts as black-flag, meatball, then wave-around", () => {
    const session = mkSessionInfo([
      { carIdx: 0, carNumber: "01" },
      { carIdx: 1, carNumber: "22" },
      { carIdx: 2, carNumber: "33" },
    ]);

    updateAlertQueue(
      session,
      mkTelemetry({
        SessionTick: 1,
        SessionFlags: Flags.Yellow,
        CarIdxSessionFlags: [0, Flags.Repair, 0],
        CarIdxLap: [6, 5, 5],
        CarIdxLapDistPct: [0.0, 0.0, 0.0],
      }),
    );

    updateAlertQueue(
      session,
      mkTelemetry({
        SessionTick: 2,
        SessionFlags: Flags.Yellow,
        CarIdxSessionFlags: [0, Flags.Repair, Flags.Black],
        CarIdxLap: [6, 5, 5],
        CarIdxLapDistPct: [0.0, 0.0, 0.0],
      }),
    );

    const snapshot = getAlertQueueSnapshot();
    const bfIdx = snapshot.findIndex((e) => e.type === "blackFlag");
    const mbIdx = snapshot.findIndex((e) => e.type === "meatball");
    const waIdx = snapshot.findIndex((e) => e.type === "waveAround");

    expect(bfIdx).toBeGreaterThanOrEqual(0);
    expect(mbIdx).toBeGreaterThanOrEqual(0);
    expect(waIdx).toBeGreaterThanOrEqual(0);
    expect(bfIdx).toBeLessThan(mbIdx);
    expect(mbIdx).toBeLessThan(waIdx);
  });

  it("inserts black flags before wave-arounds", () => {
    const session = mkSessionInfo([
      { carIdx: 0, carNumber: "01" },
      { carIdx: 1, carNumber: "22" },
      { carIdx: 2, carNumber: "33" },
    ]);

    // First add wave-around for car 1
    updateAlertQueue(
      session,
      mkTelemetry({
        SessionTick: 1,
        SessionFlags: Flags.Yellow,
        CarIdxSessionFlags: [0, 0, 0],
        CarIdxLap: [6, 5, 5],
        CarIdxLapDistPct: [0.0, 0.0, 0.0],
      }),
    );

    // Now add black flag for car 2 on a new tick
    updateAlertQueue(
      session,
      mkTelemetry({
        SessionTick: 2,
        SessionFlags: Flags.Yellow,
        CarIdxSessionFlags: [0, 0, Flags.Black],
        CarIdxLap: [6, 5, 5],
        CarIdxLapDistPct: [0.0, 0.0, 0.0],
      }),
    );

    const snapshot = getAlertQueueSnapshot();
    // Black flag should come before wave-around regardless of insertion order
    const bfIdx = snapshot.findIndex((e) => e.type === "blackFlag");
    const waIdx = snapshot.findIndex((e) => e.type === "waveAround");
    expect(bfIdx).toBeLessThan(waIdx);
  });

  it("does not reshuffle existing entries when a new black flag is added", () => {
    const session = mkSessionInfo([
      { carIdx: 0, carNumber: "01" },
      { carIdx: 1, carNumber: "22" },
      { carIdx: 2, carNumber: "33" },
    ]);

    // Add black flag for car 1
    updateAlertQueue(session, mkTelemetry({ SessionTick: 1, CarIdxSessionFlags: [0, Flags.Black, 0] }));

    const firstKey = getAlertQueueSnapshot()[0].key;

    // Add black flag for car 2 on a new tick
    updateAlertQueue(session, mkTelemetry({ SessionTick: 2, CarIdxSessionFlags: [0, Flags.Black, Flags.Black] }));

    // Car 1 must still be first
    expect(getAlertQueueSnapshot()[0].key).toBe(firstKey);
  });
});

// ---------------------------------------------------------------------------
// Grace period
// ---------------------------------------------------------------------------

describe("grace period", () => {
  it("keeps an entry visible during the grace window after condition clears", () => {
    const session = mkSessionInfo([{ carIdx: 3, carNumber: "42" }]);

    updateAlertQueue(session, mkTelemetry({ SessionTick: 1, CarIdxSessionFlags: [0, 0, 0, Flags.Black] }));

    expect(getAlertQueueSnapshot()).toHaveLength(1);

    // Condition clears on next tick
    mockNow += 500; // 0.5 s into grace period
    updateAlertQueue(session, mkTelemetry({ SessionTick: 2, CarIdxSessionFlags: [0, 0, 0, 0] }));

    // Should still be in the queue (grace period not expired)
    expect(getAlertQueueSnapshot()).toHaveLength(1);
  });

  it("removes the entry after the grace period expires", () => {
    const session = mkSessionInfo([{ carIdx: 3, carNumber: "42" }]);

    updateAlertQueue(session, mkTelemetry({ SessionTick: 1, CarIdxSessionFlags: [0, 0, 0, Flags.Black] }));

    // Condition clears
    const clearAt = mockNow + 100;
    mockNow = clearAt;
    updateAlertQueue(session, mkTelemetry({ SessionTick: 2, CarIdxSessionFlags: [0, 0, 0, 0] }));

    // Advance past 2 000 ms grace period
    mockNow = clearAt + 2100;
    updateAlertQueue(session, mkTelemetry({ SessionTick: 3, CarIdxSessionFlags: [0, 0, 0, 0] }));

    expect(getAlertQueueSnapshot()).toHaveLength(0);
  });

  it("re-activates an entry if the condition returns within the grace period", () => {
    const session = mkSessionInfo([{ carIdx: 3, carNumber: "42" }]);

    updateAlertQueue(session, mkTelemetry({ SessionTick: 1, CarIdxSessionFlags: [0, 0, 0, Flags.Black] }));

    // Condition clears briefly
    mockNow += 500;
    updateAlertQueue(session, mkTelemetry({ SessionTick: 2, CarIdxSessionFlags: [0, 0, 0, 0] }));

    // Condition returns before grace expires
    mockNow += 500;
    updateAlertQueue(session, mkTelemetry({ SessionTick: 3, CarIdxSessionFlags: [0, 0, 0, Flags.Black] }));

    // Advance past the original 2 s grace window — entry should still be there
    mockNow += 2500;
    updateAlertQueue(session, mkTelemetry({ SessionTick: 4, CarIdxSessionFlags: [0, 0, 0, Flags.Black] }));

    expect(getAlertQueueSnapshot()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Session reset
// ---------------------------------------------------------------------------

describe("session reset", () => {
  it("clears the queue when session identity changes", () => {
    const session1 = mkSessionInfo([{ carIdx: 3, carNumber: "42" }], 1);

    updateAlertQueue(session1, mkTelemetry({ SessionTick: 1, CarIdxSessionFlags: [0, 0, 0, Flags.Black] }));

    expect(getAlertQueueSnapshot()).toHaveLength(1);

    // New session
    const session2 = mkSessionInfo([{ carIdx: 3, carNumber: "42" }], 2);

    updateAlertQueue(session2, mkTelemetry({ SessionTick: 1 }));

    expect(getAlertQueueSnapshot()).toHaveLength(0);
  });

  it("clears stale alerts across practice, qualifying, race, replay, and AI session switches", () => {
    const cars = [{ carIdx: 3, carNumber: "42" }];

    const practice = mkSessionInfo(cars, 21, "Open Practice");
    updateAlertQueue(practice, mkTelemetry({ SessionTick: 1, CarIdxSessionFlags: [0, 0, 0, Flags.Black] }));
    expect(getAlertForSlot(0, "blackFlag")?.carNumber).toBe("42");

    const qualifying = mkSessionInfo(cars, 22, "Lone Qualify");
    updateAlertQueue(qualifying, mkTelemetry({ SessionTick: 1, CarIdxSessionFlags: [0, 0, 0, 0] }));
    expect(getAlertForSlot(0, "any")).toBeNull();

    const race = mkSessionInfo(cars, 23, "Race");
    updateAlertQueue(race, mkTelemetry({ SessionTick: 1, CarIdxSessionFlags: [0, 0, 0, Flags.Black] }));
    expect(getAlertForSlot(0, "blackFlag")?.carNumber).toBe("42");

    const replay = mkSessionInfo(cars, 24, "Replay");
    updateAlertQueue(replay, mkTelemetry({ SessionTick: 1, CarIdxSessionFlags: [0, 0, 0, 0] }));
    expect(getAlertForSlot(0, "any")).toBeNull();

    const ai = mkSessionInfo(cars, 25, "AI Race");
    updateAlertQueue(ai, mkTelemetry({ SessionTick: 1, CarIdxSessionFlags: [0, 0, 0, Flags.Black] }));
    expect(getAlertForSlot(0, "blackFlag")?.carNumber).toBe("42");
  });
});

// ---------------------------------------------------------------------------
// getAlertForSlot
// ---------------------------------------------------------------------------

describe("getAlertForSlot", () => {
  it("returns null when queue is empty", () => {
    expect(getAlertForSlot(0, "any")).toBeNull();
  });

  it("returns the correct alert by slot index", () => {
    const session = mkSessionInfo([
      { carIdx: 1, carNumber: "22" },
      { carIdx: 2, carNumber: "33" },
    ]);

    updateAlertQueue(session, mkTelemetry({ SessionTick: 1, CarIdxSessionFlags: [0, Flags.Black, Flags.Black] }));

    const slot0 = getAlertForSlot(0, "any");
    const slot1 = getAlertForSlot(1, "any");
    expect(slot0).not.toBeNull();
    expect(slot1).not.toBeNull();
    expect(slot0?.carIdx).not.toBe(slot1?.carIdx);
  });

  it("filters by grouped black-flag alert type", () => {
    const session = mkSessionInfo([
      { carIdx: 0, carNumber: "01" },
      { carIdx: 1, carNumber: "22" },
    ]);

    // Car 0 = leader, car 1 = black flag + meatball + lap down
    updateAlertQueue(
      session,
      mkTelemetry({
        SessionTick: 1,
        SessionFlags: Flags.Yellow,
        CarIdxSessionFlags: [0, Flags.Black | Flags.Repair],
        CarIdxLap: [6, 5],
        CarIdxLapDistPct: [0.0, 0.0],
      }),
    );

    const bfSlot = getAlertForSlot(0, "blackFlag");
    const mbSlot = getAlertForSlot(1, "blackFlag");
    const waSlot = getAlertForSlot(0, "waveAround");
    expect(bfSlot?.type).toBe("blackFlag");
    expect(mbSlot?.type).toBe("meatball");
    expect(waSlot?.type).toBe("waveAround");

    // No third grouped black-flag entry
    expect(getAlertForSlot(2, "blackFlag")).toBeNull();
  });

  it("includes disqualify in grouped black-flag filter", () => {
    const session = mkSessionInfo([{ carIdx: 1, carNumber: "22" }]);

    updateAlertQueue(session, mkTelemetry({ SessionTick: 1, CarIdxSessionFlags: [0, Flags.Disqualify] }));

    const dqSlot = getAlertForSlot(0, "blackFlag");
    expect(dqSlot?.type).toBe("disqualify");
    expect(getAlertForSlot(0, "waveAround")).toBeNull();
  });

  it("returns null for out-of-range slot index", () => {
    const session = mkSessionInfo([{ carIdx: 3, carNumber: "42" }]);

    updateAlertQueue(session, mkTelemetry({ SessionTick: 1, CarIdxSessionFlags: [0, 0, 0, Flags.Black] }));

    expect(getAlertForSlot(5, "any")).toBeNull();
  });

  it("keeps non-wave tiers first and sorts wave-around entries by leaderboard position in any mode", () => {
    const session = mkSessionInfo([
      { carIdx: 0, carNumber: "01" }, // leader
      { carIdx: 1, carNumber: "22" },
      { carIdx: 2, carNumber: "33" },
      { carIdx: 3, carNumber: "44" },
    ]);

    updateAlertQueue(
      session,
      mkTelemetry({
        SessionTick: 1,
        SessionFlags: Flags.Yellow,
        CarIdxSessionFlags: [0, Flags.Black, 0, 0],
        CarIdxLap: [6, 5, 5, 5],
        CarIdxLapDistPct: [0.0, 0.0, 0.0, 0.0],
        CarIdxPosition: [1, 4, 3, 2],
      }),
    );

    expect(getAlertForSlot(0, "any")?.type).toBe("blackFlag");
    expect(getAlertForSlot(1, "any")?.type).toBe("waveAround");
    expect(getAlertForSlot(1, "any")?.carIdx).toBe(3);
    expect(getAlertForSlot(2, "any")?.carIdx).toBe(2);
    expect(getAlertForSlot(3, "any")?.carIdx).toBe(1);
  });

  it("marks wave-around alerts as command-sent", () => {
    const session = mkSessionInfo([
      { carIdx: 0, carNumber: "01" },
      { carIdx: 1, carNumber: "22" },
    ]);

    updateAlertQueue(
      session,
      mkTelemetry({
        SessionTick: 1,
        SessionFlags: Flags.Yellow,
        CarIdxSessionFlags: [0, 0],
        CarIdxLap: [6, 5],
        CarIdxLapDistPct: [0.0, 0.0],
        CarIdxPosition: [1, 2],
      }),
    );

    const alert = getAlertForSlot(0, "waveAround");
    expect(alert?.waveCommandSent).not.toBe(true);

    markWaveAroundCommandSent(alert?.key ?? "");

    expect(getAlertForSlot(0, "waveAround")?.waveCommandSent).toBe(true);
  });
});
