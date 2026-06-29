import { describe, expect, it } from "vitest";

import { parseCarDesignColor, parseHexColorNumber } from "./color-utils.js";

// ---------------------------------------------------------------------------
// parseHexColorNumber
// ---------------------------------------------------------------------------

describe("parseHexColorNumber", () => {
  describe("numeric input", () => {
    it("converts 0xffffff to #ffffff", () => {
      expect(parseHexColorNumber(0xffffff)).toBe("#ffffff");
    });

    it("converts 0x0153db to #0153db", () => {
      expect(parseHexColorNumber(0x0153db)).toBe("#0153db");
    });

    it("converts 0x00c702 to #00c702", () => {
      expect(parseHexColorNumber(0x00c702)).toBe("#00c702");
    });

    it("converts 0 to #000000", () => {
      expect(parseHexColorNumber(0)).toBe("#000000");
    });

    it("pads short values to 6 digits", () => {
      expect(parseHexColorNumber(0xff)).toBe("#0000ff");
    });

    it("returns undefined for negative numbers", () => {
      expect(parseHexColorNumber(-1)).toBeUndefined();
    });

    it("returns undefined for values above 0xffffff", () => {
      expect(parseHexColorNumber(0x1000000)).toBeUndefined();
    });

    it("returns undefined for NaN", () => {
      expect(parseHexColorNumber(NaN)).toBeUndefined();
    });

    it("returns undefined for Infinity", () => {
      expect(parseHexColorNumber(Infinity)).toBeUndefined();
    });
  });

  describe("bare hex string input", () => {
    it("converts 'ffffff' to #ffffff", () => {
      expect(parseHexColorNumber("ffffff")).toBe("#ffffff");
    });

    it("converts 'FF0000' to #ff0000 (normalises case)", () => {
      expect(parseHexColorNumber("FF0000")).toBe("#ff0000");
    });

    it("converts '0153db' to #0153db", () => {
      expect(parseHexColorNumber("0153db")).toBe("#0153db");
    });

    it("converts '000000' to #000000", () => {
      expect(parseHexColorNumber("000000")).toBe("#000000");
    });

    it("returns undefined for 5-character string", () => {
      expect(parseHexColorNumber("fffff")).toBeUndefined();
    });

    it("returns undefined for 7-character string", () => {
      expect(parseHexColorNumber("fffffff")).toBeUndefined();
    });

    it("returns undefined for non-hex characters", () => {
      expect(parseHexColorNumber("gggggg")).toBeUndefined();
    });

    it("returns undefined for empty string", () => {
      expect(parseHexColorNumber("")).toBeUndefined();
    });
  });

  describe("#-prefixed string input", () => {
    it("converts '#ffffff' to #ffffff", () => {
      expect(parseHexColorNumber("#ffffff")).toBe("#ffffff");
    });

    it("converts '#FF0000' to #ff0000 (normalises case)", () => {
      expect(parseHexColorNumber("#FF0000")).toBe("#ff0000");
    });

    it("converts '#000000' to #000000", () => {
      expect(parseHexColorNumber("#000000")).toBe("#000000");
    });

    it("returns undefined for '#fffff' (5 digits after #)", () => {
      expect(parseHexColorNumber("#fffff")).toBeUndefined();
    });

    it("returns undefined for '#' only", () => {
      expect(parseHexColorNumber("#")).toBeUndefined();
    });
  });

  describe("invalid / missing input", () => {
    it("returns undefined for undefined", () => {
      expect(parseHexColorNumber(undefined)).toBeUndefined();
    });

    it("returns undefined for null", () => {
      expect(parseHexColorNumber(null)).toBeUndefined();
    });

    it("returns undefined for boolean", () => {
      expect(parseHexColorNumber(true)).toBeUndefined();
    });

    it("returns undefined for array", () => {
      expect(parseHexColorNumber(["ff0000"])).toBeUndefined();
    });

    it("returns undefined for object", () => {
      expect(parseHexColorNumber({})).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// parseCarDesignColor
// ---------------------------------------------------------------------------

describe("parseCarDesignColor", () => {
  it("returns the first colour token for a standard design string", () => {
    expect(parseCarDesignColor("0,ffffff,ff0000,000000")).toBe("#ffffff");
  });

  it("returns the first colour token regardless of design index value", () => {
    expect(parseCarDesignColor("1,0000ff,ffffff,ff0000")).toBe("#0000ff");
  });

  it("returns the first colour for design index 3", () => {
    expect(parseCarDesignColor("3,aabbcc,112233,445566")).toBe("#aabbcc");
  });

  it("normalises colour tokens to lowercase", () => {
    expect(parseCarDesignColor("0,FFFFFF,000000,000000")).toBe("#ffffff");
  });

  it("skips invalid first colour and returns next valid one", () => {
    expect(parseCarDesignColor("0,GGGGGG,ff0000,000000")).toBe("#ff0000");
  });

  it("skips multiple invalid tokens and returns first valid one", () => {
    expect(parseCarDesignColor("0,INVALID,ALSO_BAD,aabbcc")).toBe("#aabbcc");
  });

  it("returns undefined when all colour tokens are invalid", () => {
    expect(parseCarDesignColor("0,INVALID,ALSO_BAD,STILL_BAD")).toBeUndefined();
  });

  it("returns undefined when there are no colour tokens (only index)", () => {
    expect(parseCarDesignColor("0")).toBeUndefined();
  });

  it("handles extra whitespace around tokens", () => {
    expect(parseCarDesignColor("0, ffffff ,ff0000,000000")).toBe("#ffffff");
  });

  it("returns undefined for empty string", () => {
    expect(parseCarDesignColor("")).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(parseCarDesignColor(undefined)).toBeUndefined();
  });

  it("returns undefined for null", () => {
    expect(parseCarDesignColor(null)).toBeUndefined();
  });

  it("returns undefined for a number", () => {
    expect(parseCarDesignColor(42)).toBeUndefined();
  });

  it("returns undefined for an object", () => {
    expect(parseCarDesignColor({})).toBeUndefined();
  });

  it("handles a real-world CarDesignStr with leading zeros in colour", () => {
    // Design index 1, primary colour 00aaff (blue)
    expect(parseCarDesignColor("1,00aaff,ffffff,000000")).toBe("#00aaff");
  });
});
