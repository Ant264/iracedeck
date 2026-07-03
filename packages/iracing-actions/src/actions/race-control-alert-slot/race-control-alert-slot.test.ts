import type { ActiveSessionCar } from "@iracedeck/iracing-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RaceControlAlert } from "./race-control-alert-service.js";
import {
  generateRaceControlAlertSlotSvg,
  RACE_CONTROL_ALERT_SLOT_UUID,
  RaceControlAlertSlot,
} from "./race-control-alert-slot.js";

const {
  mockSendMessage,
  mockGetAlertForSlot,
  mockMarkWaveAroundCommandSent,
  mockUpdateAlertQueue,
  mockApplyReferenceCarSelection,
  mockGenerateSplitsDeltaCycleSvg,
} = vi.hoisted(() => ({
  mockSendMessage: vi.fn().mockResolvedValue(true),
  mockGetAlertForSlot: vi.fn(),
  mockMarkWaveAroundCommandSent: vi.fn(),
  mockUpdateAlertQueue: vi.fn(),
  mockApplyReferenceCarSelection: vi.fn(),
  mockGenerateSplitsDeltaCycleSvg: vi.fn(() => "data:image/svg+xml,mock"),
}));

let selectedCar: { carIdx: number } | null = null;

vi.mock("@iracedeck/deck-core", () => ({
  CommonSettings: {
    extend: (_fields: unknown) => ({
      parse: (data: Record<string, unknown>) => ({
        slotIndex: 0,
        alertType: "any",
        actionMode: "standard",
        ...data,
      }),
      safeParse: (data: Record<string, unknown>) => ({
        success: true,
        data: {
          slotIndex: 0,
          alertType: "any",
          actionMode: "standard",
          ...data,
        },
      }),
    }),
    parse: (data: Record<string, unknown>) => ({ ...data }),
    safeParse: (data: Record<string, unknown>) => ({ success: true, data: { ...data } }),
  },
  ConnectionStateAwareAction: class {
    logger = { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    sdkController = {
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      getSessionInfo: vi.fn(() => null),
    };
    setRegenerateCallback = vi.fn();
    setActiveBinding = vi.fn();
    tapBinding = vi.fn().mockResolvedValue(undefined);
    isBindingMissing = vi.fn(() => false);
    updateConnectionState = vi.fn();
    updateKeyImage = vi.fn().mockResolvedValue(undefined);
    setKeyImage = vi.fn().mockResolvedValue(undefined);
  },
  getCommands: vi.fn(() => ({
    chat: { sendMessage: mockSendMessage },
  })),
  getSelectedCar: vi.fn(() => selectedCar),
  onSelectedCarChange: vi.fn(() => vi.fn()),
}));

vi.mock("../splits-delta-cycle/splits-delta-cycle.js", () => ({
  generateSplitsDeltaCycleSvg: mockGenerateSplitsDeltaCycleSvg,
}));

vi.mock("../shared/reference-car-selection.js", () => ({
  applyReferenceCarSelection: mockApplyReferenceCarSelection,
}));

vi.mock("./race-control-alert-service.js", () => ({
  getAlertForSlot: mockGetAlertForSlot,
  markWaveAroundCommandSent: mockMarkWaveAroundCommandSent,
  updateAlertQueue: mockUpdateAlertQueue,
}));

function makeCar(overrides: Partial<ActiveSessionCar> = {}): ActiveSessionCar {
  return {
    carIdx: 5,
    carNumber: "42",
    carNumberRaw: 42,
    userName: "Test Driver",
    driverName: "Test Driver",
    abbrevName: "Driver, T",
    initials: "TD",
    carClassColor: "#ff0000",
    licenseColor: "#00ff00",
    designColor: "#0000ff",
    ...overrides,
  } as ActiveSessionCar;
}

function makeAlert(overrides: Partial<RaceControlAlert> = {}): RaceControlAlert {
  const car = makeCar();

  return {
    key: "blackFlag:5",
    type: "blackFlag",
    carIdx: car.carIdx,
    carNumber: car.carNumber,
    carNumberRaw: car.carNumberRaw,
    driverName: car.driverName,
    car,
    detectedAt: 1_000_000,
    ...overrides,
  } as RaceControlAlert;
}

function makeKeyDownEvent(settings: Record<string, unknown>) {
  return {
    action: { id: "ctx-1" },
    payload: { settings },
  } as unknown as Parameters<RaceControlAlertSlot["onKeyDown"]>[0];
}

beforeEach(() => {
  selectedCar = null;
  mockSendMessage.mockClear();
  mockGetAlertForSlot.mockReset();
  mockGetAlertForSlot.mockReturnValue(null);
  mockMarkWaveAroundCommandSent.mockClear();
  mockUpdateAlertQueue.mockClear();
  mockApplyReferenceCarSelection.mockReset();
  mockApplyReferenceCarSelection.mockReturnValue("selected");
  mockGenerateSplitsDeltaCycleSvg.mockClear();
  mockGenerateSplitsDeltaCycleSvg.mockReturnValue("data:image/svg+xml,mock");
});

describe("RACE_CONTROL_ALERT_SLOT_UUID", () => {
  it("has the correct action UUID", () => {
    expect(RACE_CONTROL_ALERT_SLOT_UUID).toBe("com.iracedeck.sd.core.race-control-alert-slot");
  });
});

describe("generateRaceControlAlertSlotSvg", () => {
  const baseSettings = {
    slotIndex: 1,
    alertType: "any" as const,
    actionMode: "standard" as const,
    flagsOverlay: false,
    colorOverrides: undefined,
    titleOverrides: undefined,
    borderOverrides: undefined,
    graphicOverrides: undefined,
  };

  it("renders empty slots with the select-reference-car placeholder path", () => {
    generateRaceControlAlertSlotSvg(baseSettings, null, false);

    expect(mockGenerateSplitsDeltaCycleSvg).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "select-reference-car", slotIndex: 1 }),
      false,
      null,
      false,
      undefined,
      undefined,
      "none",
      undefined,
    );
  });

  it("renders populated slots with select-reference-car layout data", () => {
    const alert = makeAlert({ carNumber: "88", carNumberRaw: 88, car: makeCar({ carNumber: "88", carNumberRaw: 88 }) });

    generateRaceControlAlertSlotSvg(baseSettings, alert, false);

    expect(mockGenerateSplitsDeltaCycleSvg).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "select-reference-car", slotIndex: 1, nameSource: "smartName" }),
      false,
      "88",
      false,
      undefined,
      alert.car,
      "blackFlag",
      undefined,
    );
  });

  it("uses the same orange highlight state as select-reference-car for black flag", () => {
    generateRaceControlAlertSlotSvg(baseSettings, makeAlert({ type: "blackFlag" }), false);

    const args = mockGenerateSplitsDeltaCycleSvg.mock.calls.at(-1);
    expect(args?.[6]).toBe("blackFlag");
  });

  it("uses disqualify highlight state for disqualified alerts", () => {
    generateRaceControlAlertSlotSvg(baseSettings, makeAlert({ key: "disqualify:5", type: "disqualify" }), false);

    const args = mockGenerateSplitsDeltaCycleSvg.mock.calls.at(-1);
    expect(args?.[6]).toBe("disqualify");
  });

  it("uses the darker pending highlight state for unsent wave-around", () => {
    generateRaceControlAlertSlotSvg(baseSettings, makeAlert({ key: "waveAround:5", type: "waveAround" }), false);

    const args = mockGenerateSplitsDeltaCycleSvg.mock.calls.at(-1);
    expect(args?.[6]).toBe("waveAroundPending");
  });

  it("uses the existing lighter highlight state after wave-around command is sent", () => {
    generateRaceControlAlertSlotSvg(
      baseSettings,
      makeAlert({ key: "waveAround:5", type: "waveAround", waveCommandSent: true }),
      false,
    );

    const args = mockGenerateSplitsDeltaCycleSvg.mock.calls.at(-1);
    expect(args?.[6]).toBe("waveAround");
  });

  it("passes laps-down count for wave-around alerts", () => {
    generateRaceControlAlertSlotSvg(
      baseSettings,
      makeAlert({ key: "waveAround:5", type: "waveAround", lapsDown: 2 }),
      false,
    );

    const args = mockGenerateSplitsDeltaCycleSvg.mock.calls.at(-1);
    expect(args?.[7]).toBe(2);
  });

  it("uses the same orange highlight state as select-reference-car for meatball", () => {
    generateRaceControlAlertSlotSvg(baseSettings, makeAlert({ key: "meatball:5", type: "meatball" }), false);

    const args = mockGenerateSplitsDeltaCycleSvg.mock.calls.at(-1);
    expect(args?.[6]).toBe("meatball");
  });
});

describe("RaceControlAlertSlot onKeyDown", () => {
  it("standard mode selects the alert driver via shared selection helper", async () => {
    const action = new RaceControlAlertSlot();
    const alert = makeAlert();

    mockGetAlertForSlot.mockReturnValue(alert);

    await action.onKeyDown(makeKeyDownEvent({ slotIndex: 0, alertType: "any", actionMode: "standard" }));

    expect(mockApplyReferenceCarSelection).toHaveBeenCalledWith({
      carIdx: alert.carIdx,
      carNumber: alert.carNumber,
      carNumberRaw: alert.carNumberRaw,
    });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("instant mode sends !clear for black-flag alerts", async () => {
    const action = new RaceControlAlertSlot();

    mockGetAlertForSlot.mockReturnValue(makeAlert({ type: "blackFlag", carNumber: "42" }));

    await action.onKeyDown(makeKeyDownEvent({ slotIndex: 0, alertType: "any", actionMode: "instant" }));

    expect(mockSendMessage).toHaveBeenCalledWith("!clear #42");
    expect(mockApplyReferenceCarSelection).not.toHaveBeenCalled();
  });

  it("instant mode sends !waveby for wave-around alerts", async () => {
    const action = new RaceControlAlertSlot();

    mockGetAlertForSlot.mockReturnValue(makeAlert({ key: "waveAround:5", type: "waveAround", carNumber: "88" }));

    await action.onKeyDown(makeKeyDownEvent({ slotIndex: 0, alertType: "any", actionMode: "instant" }));

    expect(mockSendMessage).toHaveBeenCalledWith("!waveby #88");
    expect(mockMarkWaveAroundCommandSent).toHaveBeenCalledWith("waveAround:5");
    expect(mockApplyReferenceCarSelection).not.toHaveBeenCalled();
  });

  it("instant mode sends !clear for meatball alerts", async () => {
    const action = new RaceControlAlertSlot();

    mockGetAlertForSlot.mockReturnValue(makeAlert({ key: "meatball:5", type: "meatball", carNumber: "15" }));

    await action.onKeyDown(makeKeyDownEvent({ slotIndex: 0, alertType: "any", actionMode: "instant" }));

    expect(mockSendMessage).toHaveBeenCalledWith("!clear #15");
    expect(mockMarkWaveAroundCommandSent).not.toHaveBeenCalled();
    expect(mockApplyReferenceCarSelection).not.toHaveBeenCalled();
  });

  it("instant mode sends !clear for disqualified alerts", async () => {
    const action = new RaceControlAlertSlot();

    mockGetAlertForSlot.mockReturnValue(makeAlert({ key: "disqualify:5", type: "disqualify", carNumber: "77" }));

    await action.onKeyDown(makeKeyDownEvent({ slotIndex: 0, alertType: "any", actionMode: "instant" }));

    expect(mockSendMessage).toHaveBeenCalledWith("!clear #77");
    expect(mockApplyReferenceCarSelection).not.toHaveBeenCalled();
  });

  it("does nothing in standard mode when slot is empty", async () => {
    const action = new RaceControlAlertSlot();

    mockGetAlertForSlot.mockReturnValue(null);

    await action.onKeyDown(makeKeyDownEvent({ slotIndex: 0, alertType: "any", actionMode: "standard" }));

    expect(mockApplyReferenceCarSelection).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("does nothing in instant mode when slot is empty", async () => {
    const action = new RaceControlAlertSlot();

    mockGetAlertForSlot.mockReturnValue(null);

    await action.onKeyDown(makeKeyDownEvent({ slotIndex: 0, alertType: "any", actionMode: "instant" }));

    expect(mockApplyReferenceCarSelection).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("does not send stale command after session reset clears the slot", async () => {
    const action = new RaceControlAlertSlot();

    mockGetAlertForSlot
      .mockReturnValueOnce(makeAlert({ type: "blackFlag", carNumber: "42" }))
      .mockReturnValueOnce(null);

    await action.onKeyDown(makeKeyDownEvent({ slotIndex: 0, alertType: "any", actionMode: "instant" }));
    await action.onKeyDown(makeKeyDownEvent({ slotIndex: 0, alertType: "any", actionMode: "instant" }));

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledWith("!clear #42");
  });
});
