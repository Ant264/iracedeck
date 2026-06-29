import { assembleIcon } from "@iracedeck/deck-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  generateSplitsDeltaCycleSvg,
  getShortDriverName,
  getSmartDriverNameLabel,
  GLOBAL_KEY_NAMES,
  resolveCarAccentColor,
  resolveCarNameLabel,
} from "./splits-delta-cycle.js";

vi.mock("@iracedeck/icons/splits-delta-cycle/next.svg", () => ({
  default: '<svg xmlns="http://www.w3.org/2000/svg">{{mainLabel}} {{subLabel}}</svg>',
}));
vi.mock("@iracedeck/icons/splits-delta-cycle/previous.svg", () => ({
  default: '<svg xmlns="http://www.w3.org/2000/svg">{{mainLabel}} {{subLabel}}</svg>',
}));
vi.mock("@iracedeck/icons/splits-delta-cycle/display-ref-car.svg", () => ({
  default: '<svg xmlns="http://www.w3.org/2000/svg" class="ref-car">{{mainLabel}} {{subLabel}}</svg>',
}));
vi.mock("@iracedeck/icons/splits-delta-cycle/custom-sector-start.svg", () => ({
  default: '<svg xmlns="http://www.w3.org/2000/svg" class="custom-sector-start">{{mainLabel}} {{subLabel}}</svg>',
}));
vi.mock("@iracedeck/icons/splits-delta-cycle/custom-sector-end.svg", () => ({
  default: '<svg xmlns="http://www.w3.org/2000/svg" class="custom-sector-end">{{mainLabel}} {{subLabel}}</svg>',
}));
vi.mock("@iracedeck/icons/splits-delta-cycle/active-reset-set.svg", () => ({
  default: '<svg xmlns="http://www.w3.org/2000/svg" class="active-reset-set">{{mainLabel}} {{subLabel}}</svg>',
}));
vi.mock("@iracedeck/icons/splits-delta-cycle/active-reset-run.svg", () => ({
  default: '<svg xmlns="http://www.w3.org/2000/svg" class="active-reset-run">{{mainLabel}} {{subLabel}}</svg>',
}));
vi.mock("@iracedeck/icons/splits-delta-cycle/select-ref-car.svg", () => ({
  default: '<svg xmlns="http://www.w3.org/2000/svg" class="select-ref-car"></svg>',
}));

vi.mock("@iracedeck/deck-core", () => ({
  CommonSettings: {
    extend: (_fields: unknown) => {
      // Return a mock Zod-like schema
      const schema = {
        parse: (data: Record<string, unknown>) => ({ ...data }),
        safeParse: (data: Record<string, unknown>) => ({ success: true, data: { ...data } }),
      };

      return schema;
    },
    parse: (data: Record<string, unknown>) => ({ ...data }),
    safeParse: (data: Record<string, unknown>) => ({ success: true, data: { ...data } }),
  },
  ConnectionStateAwareAction: class MockConnectionStateAwareAction {
    logger = { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    sdkController = { subscribe: vi.fn(), unsubscribe: vi.fn() };
    updateConnectionState = vi.fn();
    setKeyImage = vi.fn();
    setRegenerateCallback = vi.fn();
    isBindingMissing = vi.fn(() => false);
  },
  formatKeyBinding: vi.fn((b: { key: string; modifiers: string[] }) => {
    if (b.modifiers?.length) {
      return `${b.modifiers.join("+")}+${b.key}`;
    }

    return b.key;
  }),
  generateBorderParts: vi.fn(() => ({ defs: "", rects: "" })),
  getGlobalBorderSettings: vi.fn(() => ({})),
  getGlobalColors: vi.fn(() => ({})),
  getGlobalGraphicSettings: vi.fn(() => ({})),
  getGlobalSettings: vi.fn(() => ({})),
  getKeyboard: vi.fn(() => ({
    sendKeyCombination: vi.fn().mockResolvedValue(true),
  })),
  LogLevel: { Info: 2 },
  parseBinding: vi.fn(),
  parseKeyBinding: vi.fn(),
  isSimHubBinding: vi.fn(
    (v: unknown) => v !== null && typeof v === "object" && (v as Record<string, unknown>).type === "simhub",
  ),
  isSimHubInitialized: vi.fn(() => false),
  getSimHub: vi.fn(() => ({
    startRole: vi.fn().mockResolvedValue(true),
    stopRole: vi.fn().mockResolvedValue(true),
  })),
  setSelectedCar: vi.fn(),
  getSelectedCar: vi.fn(() => null),
  onSelectedCarChange: vi.fn(() => vi.fn()),
  clearSelectedCar: vi.fn(),
  getGlobalTitleSettings: vi.fn(() => ({})),
  resolveIconColors: vi.fn((_svg, _global, _overrides) => ({})),
  resolveBorderSettings: vi.fn((_svg: unknown, _global: unknown, _overrides?: unknown, _stateColor?: string) => ({
    enabled: false,
    borderWidth: 7,
    borderColor: "#00aaff",
    glowEnabled: true,
    glowWidth: 18,
  })),
  resolveGraphicSettings: vi.fn(() => ({ scale: 1 })),
  resolveTitleSettings: vi.fn((_svg: unknown, _global: unknown, _overrides: unknown, defaultTitle?: string) => ({
    showTitle: true,
    showGraphics: true,
    titleText: defaultTitle ?? "",
    bold: true,
    fontSize: 18,
    position: "bottom" as const,
    customPosition: 0,
  })),
  assembleIcon: vi.fn(
    ({ graphicSvg, title }: { graphicSvg: string; colors: unknown; title: { titleText: string } }) => {
      const encoded = encodeURIComponent(`<svg>${graphicSvg}${title?.titleText ?? ""}</svg>`);

      return `data:image/svg+xml,${encoded}`;
    },
  ),
}));

describe("SplitsDeltaCycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constants", () => {
    it("should have correct global key name for next", () => {
      expect(GLOBAL_KEY_NAMES.NEXT).toBe("splitsDeltaNext");
    });

    it("should have correct global key name for previous", () => {
      expect(GLOBAL_KEY_NAMES.PREVIOUS).toBe("splitsDeltaPrevious");
    });

    it("should have correct global key name for toggle ref car", () => {
      expect(GLOBAL_KEY_NAMES.TOGGLE_REF_CAR).toBe("toggleUiDisplayRefCar");
    });

    it("should have correct global key name for custom sector start", () => {
      expect(GLOBAL_KEY_NAMES.CUSTOM_SECTOR_START).toBe("splitsDeltaCustomSectorStart");
    });

    it("should have correct global key name for custom sector end", () => {
      expect(GLOBAL_KEY_NAMES.CUSTOM_SECTOR_END).toBe("splitsDeltaCustomSectorEnd");
    });

    it("should have correct global key name for active reset set", () => {
      expect(GLOBAL_KEY_NAMES.ACTIVE_RESET_SET).toBe("splitsDeltaActiveResetSet");
    });

    it("should have correct global key name for active reset run", () => {
      expect(GLOBAL_KEY_NAMES.ACTIVE_RESET_RUN).toBe("splitsDeltaActiveResetRun");
    });
  });

  describe("generateSplitsDeltaCycleSvg", () => {
    it("should generate a valid data URI for next direction", () => {
      const result = generateSplitsDeltaCycleSvg({ mode: "cycle", direction: "next" });

      expect(result).toContain("data:image/svg+xml");
    });

    it("should generate a valid data URI for previous direction", () => {
      const result = generateSplitsDeltaCycleSvg({ mode: "cycle", direction: "previous" });

      expect(result).toContain("data:image/svg+xml");
    });

    it("should produce different icons for next and previous", () => {
      const next = generateSplitsDeltaCycleSvg({ mode: "cycle", direction: "next" });
      const previous = generateSplitsDeltaCycleSvg({ mode: "cycle", direction: "previous" });

      expect(next).not.toBe(previous);
    });

    it("should include NEXT label for next direction", () => {
      const result = generateSplitsDeltaCycleSvg({ mode: "cycle", direction: "next" });

      expect(decodeURIComponent(result)).toContain("NEXT");
    });

    it("should include PREVIOUS label for previous direction", () => {
      const result = generateSplitsDeltaCycleSvg({ mode: "cycle", direction: "previous" });

      expect(decodeURIComponent(result)).toContain("PREVIOUS");
    });

    it("should include SPLITS DELTA label for cycle mode", () => {
      const next = generateSplitsDeltaCycleSvg({ mode: "cycle", direction: "next" });
      const previous = generateSplitsDeltaCycleSvg({ mode: "cycle", direction: "previous" });

      expect(decodeURIComponent(next)).toContain("SPLITS DELTA");
      expect(decodeURIComponent(previous)).toContain("SPLITS DELTA");
    });

    it("should generate ref car icon for toggle-ref-car mode", () => {
      const result = generateSplitsDeltaCycleSvg({ mode: "toggle-ref-car", direction: "next" });

      expect(result).toContain("data:image/svg+xml");
      expect(decodeURIComponent(result)).toContain("ref-car");
    });

    it("should show the selected target car for select-reference-car mode", () => {
      const result = generateSplitsDeltaCycleSvg(
        { mode: "select-reference-car", direction: "next", slotIndex: 0 },
        false,
        "42",
      );
      const decoded = decodeURIComponent(result);

      expect(result).toContain("data:image/svg+xml");
      expect(decoded).toContain("42");
    });

    it("should show em-dash for select-reference-car mode when no car resolved", () => {
      const result = generateSplitsDeltaCycleSvg(
        { mode: "select-reference-car", direction: "next", slotIndex: 0 },
        false,
        null,
      );
      const decoded = decodeURIComponent(result);

      expect(result).toContain("data:image/svg+xml");
      expect(decoded).toContain("—");
    });

    it("should apply dim background color when isOffline is true", () => {
      vi.mocked(assembleIcon).mockClear();

      generateSplitsDeltaCycleSvg(
        { mode: "select-reference-car", direction: "next", slotIndex: 2 },
        false,
        "7",
        false,
        true,
      );

      const call = vi.mocked(assembleIcon).mock.calls[0]?.[0] as { colors: Record<string, string> } | undefined;
      expect(call?.colors?.backgroundColor).toBe("#333333");
    });

    it("should include REFERENCE and CAR labels for toggle-ref-car mode", () => {
      const result = generateSplitsDeltaCycleSvg({ mode: "toggle-ref-car", direction: "next" });
      const decoded = decodeURIComponent(result);

      expect(decoded).toContain("REFERENCE");
      expect(decoded).toContain("CAR");
    });

    it("should produce different icons for cycle and toggle-ref-car modes", () => {
      const cycle = generateSplitsDeltaCycleSvg({ mode: "cycle", direction: "next" });
      const refCar = generateSplitsDeltaCycleSvg({ mode: "toggle-ref-car", direction: "next" });

      expect(cycle).not.toBe(refCar);
    });

    it("should generate custom-sector-start icon", () => {
      const result = generateSplitsDeltaCycleSvg({ mode: "custom-sector-start", direction: "next" });
      expect(result).toContain("data:image/svg+xml");
      expect(decodeURIComponent(result)).toContain("custom-sector-start");
    });

    it("should include SECTOR and START labels for custom-sector-start mode", () => {
      const result = generateSplitsDeltaCycleSvg({ mode: "custom-sector-start", direction: "next" });
      const decoded = decodeURIComponent(result);
      expect(decoded).toContain("START");
      expect(decoded).toContain("SECTOR");
    });

    it("should generate custom-sector-end icon", () => {
      const result = generateSplitsDeltaCycleSvg({ mode: "custom-sector-end", direction: "next" });
      expect(result).toContain("data:image/svg+xml");
      expect(decodeURIComponent(result)).toContain("custom-sector-end");
    });

    it("should include SECTOR and END labels for custom-sector-end mode", () => {
      const result = generateSplitsDeltaCycleSvg({ mode: "custom-sector-end", direction: "next" });
      const decoded = decodeURIComponent(result);
      expect(decoded).toContain("END");
      expect(decoded).toContain("SECTOR");
    });

    it("should generate active-reset-set icon", () => {
      const result = generateSplitsDeltaCycleSvg({ mode: "active-reset-set", direction: "next" });
      expect(result).toContain("data:image/svg+xml");
      expect(decodeURIComponent(result)).toContain("active-reset-set");
    });

    it("should include SET and RESET POINT labels for active-reset-set mode", () => {
      const result = generateSplitsDeltaCycleSvg({ mode: "active-reset-set", direction: "next" });
      const decoded = decodeURIComponent(result);
      expect(decoded).toContain("SET");
      expect(decoded).toContain("RESET POINT");
    });

    it("should generate active-reset-run icon", () => {
      const result = generateSplitsDeltaCycleSvg({ mode: "active-reset-run", direction: "next" });
      expect(result).toContain("data:image/svg+xml");
      expect(decodeURIComponent(result)).toContain("active-reset-run");
    });

    it("should include RESET and TO START labels for active-reset-run mode", () => {
      const result = generateSplitsDeltaCycleSvg({ mode: "active-reset-run", direction: "next" });
      const decoded = decodeURIComponent(result);
      expect(decoded).toContain("RESET");
      expect(decoded).toContain("TO START");
    });

    it("should produce different icons for all new modes", () => {
      const sectorStart = generateSplitsDeltaCycleSvg({ mode: "custom-sector-start", direction: "next" });
      const sectorEnd = generateSplitsDeltaCycleSvg({ mode: "custom-sector-end", direction: "next" });
      const resetSet = generateSplitsDeltaCycleSvg({ mode: "active-reset-set", direction: "next" });
      const resetRun = generateSplitsDeltaCycleSvg({ mode: "active-reset-run", direction: "next" });
      const allIcons = [sectorStart, sectorEnd, resetSet, resetRun];
      expect(new Set(allIcons).size).toBe(4);
    });
  });
});

// ---------------------------------------------------------------------------
// resolveCarAccentColor
// ---------------------------------------------------------------------------

const makeCar = (overrides: Record<string, unknown> = {}) => ({
  carIdx: 0,
  carNumber: "42",
  carNumberRaw: 42,
  driverName: "Driver",
  carClass: "GT3",
  carDesignStr: "0,ff0000,ffffff,000000",
  designColor: "#ff0000",
  carClassColor: "#00c702",
  licenseColor: "#0153db",
  ...overrides,
});

describe("resolveCarAccentColor", () => {
  it("returns undefined when colorSource is 'none'", () => {
    expect(resolveCarAccentColor("none", makeCar())).toBeUndefined();
  });

  it("returns undefined when car is undefined", () => {
    expect(resolveCarAccentColor("carClass", undefined)).toBeUndefined();
  });

  it("returns designColor for colorSource 'carDesign'", () => {
    expect(resolveCarAccentColor("carDesign", makeCar())).toBe("#ff0000");
  });

  it("returns carClassColor for colorSource 'carClass'", () => {
    expect(resolveCarAccentColor("carClass", makeCar())).toBe("#00c702");
  });

  it("returns licenseColor for colorSource 'license'", () => {
    expect(resolveCarAccentColor("license", makeCar())).toBe("#0153db");
  });

  it("returns undefined when the requested field is absent on the car", () => {
    const car = makeCar({ designColor: undefined, carClassColor: undefined, licenseColor: undefined });
    expect(resolveCarAccentColor("carDesign", car)).toBeUndefined();
    expect(resolveCarAccentColor("carClass", car)).toBeUndefined();
    expect(resolveCarAccentColor("license", car)).toBeUndefined();
  });

  it("returns undefined for an unknown colorSource value", () => {
    expect(resolveCarAccentColor("unknown", makeCar())).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// generateSplitsDeltaCycleSvg — accentColor pass-through
// ---------------------------------------------------------------------------

describe("generateSplitsDeltaCycleSvg accentColor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes accentColor through to assembleIcon for select-reference-car", () => {
    generateSplitsDeltaCycleSvg(
      { mode: "select-reference-car", direction: "next", slotIndex: 0 },
      false,
      "42",
      false,
      false,
      "#00c702",
    );

    const call = vi.mocked(assembleIcon).mock.calls[0]?.[0] as { accentColor?: string } | undefined;
    expect(call?.accentColor).toBe("#00c702");
  });

  it("suppresses accentColor when isOffline is true", () => {
    generateSplitsDeltaCycleSvg(
      { mode: "select-reference-car", direction: "next", slotIndex: 0 },
      false,
      "42",
      false,
      true, // isOffline
      "#00c702",
    );

    const call = vi.mocked(assembleIcon).mock.calls[0]?.[0] as { accentColor?: string } | undefined;
    expect(call?.accentColor).toBeUndefined();
  });

  it("passes undefined accentColor when no accent is provided", () => {
    generateSplitsDeltaCycleSvg(
      { mode: "select-reference-car", direction: "next", slotIndex: 0 },
      false,
      "42",
      false,
      false,
      // no accentColor argument
    );

    const call = vi.mocked(assembleIcon).mock.calls[0]?.[0] as { accentColor?: string } | undefined;
    expect(call?.accentColor).toBeUndefined();
  });

  it("does not pass accentColor for non-select-reference-car modes", () => {
    generateSplitsDeltaCycleSvg(
      { mode: "toggle-ref-car", direction: "next", slotIndex: 0 },
      false,
      null,
      false,
      false,
      "#00c702",
    );

    // toggle-ref-car does not reach the select-reference-car branch —
    // assembleIcon is called once, but without the accentColor
    const call = vi.mocked(assembleIcon).mock.calls[0]?.[0] as { accentColor?: string } | undefined;
    expect(call?.accentColor).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getShortDriverName
// ---------------------------------------------------------------------------

describe("getShortDriverName", () => {
  it("extracts and uppercases the last word up to 5 chars", () => {
    expect(getShortDriverName("Anthony Cuthbertson")).toBe("CUTHB");
    expect(getShortDriverName("John Smith")).toBe("SMITH");
    expect(getShortDriverName("Max Verstappen")).toBe("VERST");
  });

  it("handles a single-word name", () => {
    expect(getShortDriverName("Bob")).toBe("BOB");
  });

  it("returns undefined for undefined input", () => {
    expect(getShortDriverName(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(getShortDriverName("")).toBeUndefined();
  });

  it("returns undefined for whitespace-only string", () => {
    expect(getShortDriverName("   ")).toBeUndefined();
  });

  it("trims leading/trailing whitespace before processing", () => {
    expect(getShortDriverName("  John Smith  ")).toBe("SMITH");
  });

  it("returns names shorter than 5 chars without padding", () => {
    expect(getShortDriverName("Li Wei")).toBe("WEI");
  });

  it("returns exactly 5 chars when surname is 5 chars", () => {
    expect(getShortDriverName("John Smith")).toBe("SMITH");
  });

  it("strips leading and trailing punctuation from the surname", () => {
    // Surname with trailing period (e.g. abbreviation)
    expect(getShortDriverName("John Jr.")).toBe("JR");
  });
});

// ---------------------------------------------------------------------------
// getSmartDriverNameLabel
// ---------------------------------------------------------------------------

describe("getSmartDriverNameLabel", () => {
  it("removes trailing class suffix and returns surname-like token", () => {
    expect(getSmartDriverNameLabel("Hammer A")).toBe("HAMMER");
    expect(getSmartDriverNameLabel("Smith B")).toBe("SMITH");
    expect(getSmartDriverNameLabel("John Smith A")).toBe("SMITH");
  });

  it("preserves apostrophe surname prefixes", () => {
    expect(getSmartDriverNameLabel("Nicholas D'Avoine")).toBe("D'AVOINE");
    expect(getSmartDriverNameLabel("Nicholas D' Avoine")).toBe("D'AVOINE");
    expect(getSmartDriverNameLabel("Nicholas D' Avoine A")).toBe("D'AVOINE");
  });

  it("reconstructs elision apostrophe when D is stored as standalone word", () => {
    // iRacing may store the name with the apostrophe lost: "Nicolas D Avoine"
    expect(getSmartDriverNameLabel("Nicolas D Avoine")).toBe("D'AVOINE");
    expect(getSmartDriverNameLabel("Nicolas D Avoine A")).toBe("D'AVOINE");
  });

  it("concatenates single-letter prefix without apostrophe for consonant surnames", () => {
    expect(getSmartDriverNameLabel("Nicolas D Smith")).toBe("DSMITH");
  });

  it("handles regular names", () => {
    expect(getSmartDriverNameLabel("Max Verstappen")).toBe("VERSTAPPEN");
    expect(getSmartDriverNameLabel("Bob")).toBe("BOB");
  });

  it("returns undefined for missing or blank values", () => {
    expect(getSmartDriverNameLabel(undefined)).toBeUndefined();
    expect(getSmartDriverNameLabel("")).toBeUndefined();
    expect(getSmartDriverNameLabel("   ")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveCarNameLabel
// ---------------------------------------------------------------------------

describe("resolveCarNameLabel", () => {
  const baseCar = {
    carIdx: 0,
    carNumber: "42",
    carNumberRaw: 42,
    driverName: "John Smith",
    carClass: "",
    userName: "John Smith",
    initials: "JS",
  };

  it("returns undefined for nameSource 'none'", () => {
    expect(resolveCarNameLabel("none", baseCar)).toBeUndefined();
  });

  it("returns undefined when car is undefined, regardless of nameSource", () => {
    expect(resolveCarNameLabel("smartName", undefined)).toBeUndefined();
    expect(resolveCarNameLabel("initials", undefined)).toBeUndefined();
  });

  it("returns smartName with class-suffix cleanup", () => {
    const car = { ...baseCar, userName: "Hammer A", driverName: "Hammer A" };
    expect(resolveCarNameLabel("smartName", car)).toBe("HAMMER");
  });

  it("prefers the richer smartName label when fields differ", () => {
    const car = { ...baseCar, userName: "Nicholas Avoine", driverName: "Nicholas D'Avoine" };
    expect(resolveCarNameLabel("smartName", car)).toBe("D'AVOINE");
  });

  it("uses abbrevName to preserve surname prefix when full names are flattened", () => {
    const car = {
      ...baseCar,
      userName: "Nicholas Avoine",
      driverName: "Nicholas Avoine",
      abbrevName: "D'Avoine, N.",
    };
    expect(resolveCarNameLabel("smartName", car)).toBe("D'AVOINE");
  });

  it("returns initials trimmed and uppercased, max 5 chars", () => {
    expect(resolveCarNameLabel("initials", baseCar)).toBe("JS");
  });

  it("returns undefined for smartName when userName and driverName are empty", () => {
    expect(resolveCarNameLabel("smartName", { ...baseCar, driverName: "", userName: "" })).toBeUndefined();
  });

  it("returns undefined for initials when field is empty", () => {
    const car = { ...baseCar, initials: "" };
    expect(resolveCarNameLabel("initials", car)).toBeUndefined();
  });

  it("returns undefined for unknown nameSource", () => {
    expect(resolveCarNameLabel("unknown", baseCar)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// generateSplitsDeltaCycleSvg — select-reference-car driver name
// ---------------------------------------------------------------------------

describe("generateSplitsDeltaCycleSvg select-reference-car driver name", () => {
  const smithCar = {
    carIdx: 0,
    carNumber: "42",
    carNumberRaw: 42,
    driverName: "John Smith",
    carClass: "",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders text-only graphic for select-reference-car mode", () => {
    const result = generateSplitsDeltaCycleSvg(
      { mode: "select-reference-car", direction: "next", slotIndex: 0 },
      false,
      "42",
    );
    const decoded = decodeURIComponent(result);

    expect(decoded).toContain('text-anchor="middle"');
    expect(decoded).not.toContain("ref-car");
  });
  it("uses smartName cleanup for class-suffixed names", () => {
    const car = { ...smithCar, userName: "Hammer A", driverName: "Hammer A" };
    const result = generateSplitsDeltaCycleSvg(
      { mode: "select-reference-car", direction: "next", slotIndex: 0, nameSource: "smartName" },
      false,
      "42",
      false,
      false,
      undefined,
      car,
    );
    const decoded = decodeURIComponent(result);

    expect(decoded).toContain("HAMMER");
    expect(decoded).toContain("#42");
  });

  it("does not render REF text for select-reference-car mode", () => {
    const result = generateSplitsDeltaCycleSvg(
      { mode: "select-reference-car", direction: "next", slotIndex: 0, nameSource: "smartName" },
      false,
      "42",
      false,
      false,
      undefined,
      smithCar,
    );
    const decoded = decodeURIComponent(result);

    // The old display-ref-car.svg embedded a hardcoded "REF" label in the
    // graphic artwork; select-ref-car.svg has no graphic elements at all.
    expect(decoded).not.toContain(">REF<");
  });

  it("shows shortened smart name and car number when nameSource is smartName", () => {
    const result = generateSplitsDeltaCycleSvg(
      { mode: "select-reference-car", direction: "next", slotIndex: 0, nameSource: "smartName" },
      false,
      "42",
      false,
      false,
      undefined,
      smithCar,
    );
    const decoded = decodeURIComponent(result);

    expect(decoded).toContain("SMITH");
    expect(decoded).toContain("#42");
  });

  it("renders apostrophe names correctly for smartName", () => {
    const car = { ...smithCar, userName: "Nicholas D'Avoine", driverName: "Nicholas D'Avoine" };
    const result = generateSplitsDeltaCycleSvg(
      { mode: "select-reference-car", direction: "next", slotIndex: 0, nameSource: "smartName" },
      false,
      "42",
      false,
      false,
      undefined,
      car,
    );
    const decoded = decodeURIComponent(result);

    expect(decoded).toContain("D&#39;AVOINE");
    expect(decoded).toContain("#42");
  });

  it("shows initials when nameSource is initials", () => {
    const car = { ...smithCar, initials: "JS" };
    const result = generateSplitsDeltaCycleSvg(
      { mode: "select-reference-car", direction: "next", slotIndex: 0, nameSource: "initials" },
      false,
      "42",
      false,
      false,
      undefined,
      car,
    );
    const decoded = decodeURIComponent(result);

    expect(decoded).toContain("JS");
    expect(decoded).toContain("#42");
  });

  it("shows car number only when nameSource is none", () => {
    const result = generateSplitsDeltaCycleSvg(
      { mode: "select-reference-car", direction: "next", slotIndex: 0, nameSource: "none" },
      false,
      "42",
      false,
      false,
      undefined,
      smithCar,
    );
    const decoded = decodeURIComponent(result);

    expect(decoded).toContain("#42");
    expect(decoded).not.toContain("SMITH");
  });

  it("falls back to car number only when selected name field is missing", () => {
    // initials not set on car — should degrade to number-only
    const result = generateSplitsDeltaCycleSvg(
      { mode: "select-reference-car", direction: "next", slotIndex: 0, nameSource: "initials" },
      false,
      "42",
      false,
      false,
      undefined,
      smithCar, // no abbrevName field
    );
    const decoded = decodeURIComponent(result);

    expect(decoded).toContain("#42");
    expect(decoded).not.toContain("SMITH");
  });

  it("shows em-dash for empty slot regardless of name source", () => {
    const result = generateSplitsDeltaCycleSvg(
      { mode: "select-reference-car", direction: "next", slotIndex: 0, nameSource: "smartName" },
      false,
      null,
      false,
      false,
      undefined,
      smithCar,
    );
    const decoded = decodeURIComponent(result);

    expect(decoded).toContain("—");
    expect(decoded).not.toContain("SMITH");
  });

  it("uses two-line name area for longer labels while keeping number anchored", () => {
    const car = { ...smithCar, userName: "Max Verstappen", driverName: "Max Verstappen" };
    generateSplitsDeltaCycleSvg(
      { mode: "select-reference-car", direction: "next", slotIndex: 0, nameSource: "smartName" },
      false,
      "1",
      false,
      false,
      undefined,
      car,
    );

    const call = vi.mocked(assembleIcon).mock.calls[0]?.[0] as { graphicSvg?: string } | undefined;
    expect(call?.graphicSvg).toContain("VERST");
    expect(call?.graphicSvg).toContain("APPEN");
    expect(call?.graphicSvg).toContain("#1");
  });

  it("keeps 8-character names on one line", () => {
    const car = { ...smithCar, userName: "Harrison" };
    generateSplitsDeltaCycleSvg(
      { mode: "select-reference-car", direction: "next", slotIndex: 0, nameSource: "smartName" },
      false,
      "77",
      false,
      false,
      undefined,
      car,
    );

    const call = vi.mocked(assembleIcon).mock.calls[0]?.[0] as { graphicSvg?: string } | undefined;
    expect(call?.graphicSvg).toContain("HARRISON");
    expect(call?.graphicSvg).toContain("#77");
  });

  it("renders larger car number text size", () => {
    generateSplitsDeltaCycleSvg(
      { mode: "select-reference-car", direction: "next", slotIndex: 0, nameSource: "none" },
      false,
      "888",
      false,
      false,
      undefined,
      smithCar,
    );

    const call = vi.mocked(assembleIcon).mock.calls[0]?.[0] as { graphicSvg?: string } | undefined;
    expect(call?.graphicSvg).toContain('font-size="51"');
    expect(call?.graphicSvg).toContain("#888");
  });

  it("applies green border and enabled flag when isSelected is true", () => {
    vi.mocked(assembleIcon).mockClear();

    generateSplitsDeltaCycleSvg(
      { mode: "select-reference-car", direction: "next", slotIndex: 0 },
      false,
      "42",
      true, // isSelected
      false,
    );

    // resolveBorderSettings mock returns { enabled: false }; the action spreads
    // it with enabled: true when the button is the active selected target.
    const call = vi.mocked(assembleIcon).mock.calls[0]?.[0] as { border: { enabled: boolean } } | undefined;
    expect(call?.border?.enabled).toBe(true);
  });

  it("passes accentColor to assembleIcon when online", () => {
    vi.mocked(assembleIcon).mockClear();

    generateSplitsDeltaCycleSvg(
      { mode: "select-reference-car", direction: "next", slotIndex: 0, nameSource: "smartName" },
      false,
      "42",
      false,
      false,
      "#00c702",
      smithCar,
    );

    const call = vi.mocked(assembleIcon).mock.calls[0]?.[0] as { accentColor?: string } | undefined;
    expect(call?.accentColor).toBe("#00c702");
  });

  it("suppresses accentColor when offline", () => {
    vi.mocked(assembleIcon).mockClear();

    generateSplitsDeltaCycleSvg(
      { mode: "select-reference-car", direction: "next", slotIndex: 0, nameSource: "smartName" },
      false,
      "42",
      false,
      true, // isOffline
      "#00c702",
      smithCar,
    );

    const call = vi.mocked(assembleIcon).mock.calls[0]?.[0] as { accentColor?: string } | undefined;
    expect(call?.accentColor).toBeUndefined();
  });

  it("dims the background when isOffline is true", () => {
    vi.mocked(assembleIcon).mockClear();

    generateSplitsDeltaCycleSvg(
      { mode: "select-reference-car", direction: "next", slotIndex: 0, nameSource: "smartName" },
      false,
      "7",
      false,
      true, // isOffline
      undefined,
      smithCar,
    );

    const call = vi.mocked(assembleIcon).mock.calls[0]?.[0] as { colors: Record<string, string> } | undefined;
    expect(call?.colors?.backgroundColor).toBe("#333333");
  });

  // Targeting note: button press uses resolvedCarIdxs.get(contextId) — the real
  // carIdx resolved from the session car list — not settings.slotIndex.
  // onKeyDown is unchanged and calls setSelectedCar({ carIdx: resolvedCarIdx, ... }).
});
