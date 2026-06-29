/**
 * Colour parsing utilities for iRacing session info fields.
 *
 * All functions are defensive — they never throw and return `undefined`
 * for any invalid or missing input.
 */

const HEX_COLOR_RE = /^[0-9a-f]{6}$/i;

/**
 * Normalise a raw iRacing colour value to a `#rrggbb` CSS string.
 *
 * Accepts:
 * - A numeric integer in `0xRRGGBB` form (e.g. `0x0153db`)
 * - A bare 6-character hex string without prefix (e.g. `"ffffff"`)
 * - A `#`-prefixed 6-character hex string (e.g. `"#ffffff"`)
 *
 * Returns `undefined` for any other value, including `null`, `undefined`,
 * empty strings, non-hex characters, or wrong-length strings.
 *
 * @param value - The raw value from session info (unknown type for safety)
 * @returns Lowercase `#rrggbb` string, or `undefined` if the value cannot
 *   be parsed as a valid 6-digit hex colour.
 */
export function parseHexColorNumber(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || value > 0xffffff) return undefined;

    return "#" + Math.floor(value).toString(16).padStart(6, "0");
  }

  if (typeof value === "string") {
    const stripped = value.startsWith("#") ? value.slice(1) : value;

    if (!HEX_COLOR_RE.test(stripped)) return undefined;

    return "#" + stripped.toLowerCase();
  }

  return undefined;
}

/**
 * Extract the first valid colour from an iRacing `CarDesignStr` value.
 *
 * The format is `"<designIndex>,<color1>,<color2>,<color3>"` where
 * `designIndex` is an integer pattern/scheme selector and each colour
 * is a 6-character hex string without a `#` prefix.
 *
 * This function skips the first token (the design index) and returns the
 * first of the remaining tokens that is a valid 6-character hex colour.
 *
 * Returns `undefined` when the value is missing, not a string, has no
 * parseable colour tokens, or all colour tokens are invalid hex.
 *
 * @param carDesignStr - The raw `CarDesignStr` field value (unknown type
 *   for safety — YAML parsing may deliver it as a string or undefined)
 * @returns Lowercase `#rrggbb` string, or `undefined`.
 */
export function parseCarDesignColor(carDesignStr: unknown): string | undefined {
  if (typeof carDesignStr !== "string" || carDesignStr.length === 0) return undefined;

  const tokens = carDesignStr.split(",");

  // tokens[0] is the design/pattern index — skip it.
  // tokens[1..] are the colour slots; return the first valid one.
  for (let i = 1; i < tokens.length; i++) {
    const candidate = tokens[i].trim();

    if (HEX_COLOR_RE.test(candidate)) {
      return "#" + candidate.toLowerCase();
    }
  }

  return undefined;
}
