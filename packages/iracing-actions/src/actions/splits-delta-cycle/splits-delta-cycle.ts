import {
  assembleIcon,
  clearSelectedCar,
  CommonSettings,
  ConnectionStateAwareAction,
  getGlobalBorderSettings,
  getGlobalColors,
  getGlobalGraphicSettings,
  getGlobalTitleSettings,
  getSelectedCar,
  type IDeckDialDownEvent,
  type IDeckDialRotateEvent,
  type IDeckDidReceiveSettingsEvent,
  type IDeckKeyDownEvent,
  type IDeckWillAppearEvent,
  type IDeckWillDisappearEvent,
  onSelectedCarChange,
  resolveBorderSettings,
  resolveGraphicSettings,
  resolveIconColors,
  resolveTitleSettings,
} from "@iracedeck/deck-core";
import activeResetRunIconSvg from "@iracedeck/icons/splits-delta-cycle/active-reset-run.svg";
import activeResetSetIconSvg from "@iracedeck/icons/splits-delta-cycle/active-reset-set.svg";
import customSectorEndIconSvg from "@iracedeck/icons/splits-delta-cycle/custom-sector-end.svg";
import customSectorStartIconSvg from "@iracedeck/icons/splits-delta-cycle/custom-sector-start.svg";
import displayRefCarIconSvg from "@iracedeck/icons/splits-delta-cycle/display-ref-car.svg";
import nextIconSvg from "@iracedeck/icons/splits-delta-cycle/next.svg";
import previousIconSvg from "@iracedeck/icons/splits-delta-cycle/previous.svg";
import selectRefCarIconSvg from "@iracedeck/icons/splits-delta-cycle/select-ref-car.svg";
import { type ActiveSessionCar, type TelemetryData } from "@iracedeck/iracing-sdk";
import z from "zod";

import {
  getAttentionBorderSvg,
  getRaceControlAttentionState,
  type RaceControlAttentionState,
} from "../shared/race-control-attention.js";
import { applyReferenceCarSelection } from "../shared/reference-car-selection.js";
import { buildSessionRoster, type SessionRosterState } from "../shared/session-roster.js";

// Re-export shared helpers so existing tests continue to import from this module.
export { buildSessionRoster, computeSessionKey, type SessionRosterState } from "../shared/session-roster.js";

const DIRECTION_ICONS: Record<string, string> = {
  next: nextIconSvg,
  previous: previousIconSvg,
};

const MODE_ICONS: Record<string, string> = {
  "custom-sector-start": customSectorStartIconSvg,
  "custom-sector-end": customSectorEndIconSvg,
  "active-reset-set": activeResetSetIconSvg,
  "active-reset-run": activeResetRunIconSvg,
};

const MODE_TITLES: Record<string, string> = {
  "custom-sector-start": "SECTOR\nSTART",
  "custom-sector-end": "SECTOR\nEND",
  "active-reset-set": "RESET POINT\nSET",
  "active-reset-run": "TO START\nRESET",
};

const SplitsDeltaCycleSettings = CommonSettings.extend({
  mode: z
    .enum([
      "cycle",
      "toggle-ref-car",
      "select-reference-car",
      "custom-sector-start",
      "custom-sector-end",
      "active-reset-set",
      "active-reset-run",
    ])
    .default("cycle"),
  direction: z.enum(["next", "previous"]).default("next"),
  /**
   * 0-based index into the session car list sorted by car number.
   * Slot 0 = lowest car number, slot 1 = next lowest, etc.
   * The real carIdx for targeting is resolved at runtime from the sorted list.
   */
  slotIndex: z.coerce.number().int().min(0).default(0),
  /**
   * Which colour source to use for the subtle accent strip on
   * select-reference-car buttons. "none" disables the accent.
   */
  colorSource: z.enum(["none", "carDesign", "carClass", "license"]).default("none"),
  /**
   * Which driver name field to show on select-reference-car buttons.
   * "none" shows only the car number.
   */
  nameSource: z.enum(["none", "smartName", "initials"]).default("none"),
});

type SplitsDeltaCycleSettings = z.infer<typeof SplitsDeltaCycleSettings>;

/**
 * @internal Exported for testing
 */
export const GLOBAL_KEY_NAMES = {
  NEXT: "splitsDeltaNext",
  PREVIOUS: "splitsDeltaPrevious",
  TOGGLE_REF_CAR: "toggleUiDisplayRefCar",
  CUSTOM_SECTOR_START: "splitsDeltaCustomSectorStart",
  CUSTOM_SECTOR_END: "splitsDeltaCustomSectorEnd",
  ACTIVE_RESET_SET: "splitsDeltaActiveResetSet",
  ACTIVE_RESET_RUN: "splitsDeltaActiveResetRun",
} as const;

const MODE_KEY_MAP: Record<string, string> = {
  "custom-sector-start": GLOBAL_KEY_NAMES.CUSTOM_SECTOR_START,
  "custom-sector-end": GLOBAL_KEY_NAMES.CUSTOM_SECTOR_END,
  "active-reset-set": GLOBAL_KEY_NAMES.ACTIVE_RESET_SET,
  "active-reset-run": GLOBAL_KEY_NAMES.ACTIVE_RESET_RUN,
  "toggle-ref-car": GLOBAL_KEY_NAMES.TOGGLE_REF_CAR,
};

/**
 * Resolve the subtle accent colour for a car selector button given the user's
 * chosen colour source and the session car data at that slot.
 *
 * Returns `undefined` when the source is "none", the car is absent, or the
 * requested colour field is unavailable / unparseable.
 *
 * @internal Exported for testing
 */
export function resolveCarAccentColor(colorSource: string, car: ActiveSessionCar | undefined): string | undefined {
  if (!car || colorSource === "none") return undefined;

  switch (colorSource) {
    case "carDesign":
      return car.designColor;
    case "carClass":
      return car.carClassColor;
    case "license":
      return car.licenseColor;
    default:
      return undefined;
  }
}

/**
 * Extract a short surname from a driver's full name (max 5 chars, uppercase).
 * Prefers the last word (surname). Returns `undefined` for blank/missing input.
 *
 * @internal Exported for testing
 */
export function getShortDriverName(driverName?: string): string | undefined {
  if (!driverName) return undefined;

  const trimmed = driverName.trim();

  if (!trimmed) return undefined;

  const words = trimmed.split(/\s+/).filter(Boolean);
  const lastName = words[words.length - 1];

  if (!lastName) return undefined;

  const cleaned = lastName.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "");

  if (!cleaned) return undefined;

  return cleaned.substring(0, 5).toUpperCase();
}

/**
 * Derive a robust short label from a full driver name, accounting for league
 * suffix patterns like "Hammer A" where the trailing single letter is not
 * useful for on-button identification.
 *
 * @internal Exported for testing
 */
export function getSmartDriverNameLabel(driverName?: string): string | undefined {
  if (!driverName) return undefined;

  const trimmed = driverName.trim();

  if (!trimmed) return undefined;

  const words = trimmed.split(/\s+/).filter(Boolean);

  if (words.length === 0) return undefined;

  const maybeSuffix = words[words.length - 1];
  const hasSingleLetterSuffix = words.length > 1 && /^[A-Za-z]$/.test(maybeSuffix);
  const cleanedWords = hasSingleLetterSuffix ? words.slice(0, -1) : words;

  if (cleanedWords.length === 0) return undefined;

  const preferredIndex = cleanedWords.length - 1;
  let preferred = cleanedWords[preferredIndex] ?? "";

  // Preserve split surname prefixes.
  // Handles three cases:
  //   "D' Avoine"  → D' (letter + apostrophe already present) → "D'Avoine"
  //   "D'Avoine"   → treated as a single word, no action needed
  //   "D Avoine"   → D (standalone letter, apostrophe lost in storage) → "D'Avoine" (vowel elision)
  //   "D Martinez" → D (standalone letter, consonant) → "DMartinez"
  if (preferredIndex > 0) {
    const maybePrefixRaw = cleanedWords[preferredIndex - 1] ?? "";
    const maybePrefix = maybePrefixRaw.replace(/^[^a-zA-Z0-9]+/g, "");

    if (/^[A-Za-z]['\u2019]$/.test(maybePrefix)) {
      // letter + existing apostrophe: D' + Avoine = D'Avoine
      preferred = `${maybePrefix}${preferred}`;
    } else if (/^[A-Za-z]$/.test(maybePrefix)) {
      // Standalone single letter: reconstruct elision apostrophe for vowel-starting
      // surnames (French convention: D + Avoine = D'Avoine) or plain concat otherwise.
      const elision = /^[aeiouAEIOU]/.test(preferred);
      preferred = elision ? `${maybePrefix}'${preferred}` : `${maybePrefix}${preferred}`;
    }
  }

  const cleaned = preferred.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "");

  if (!cleaned) return undefined;

  return cleaned.substring(0, 16).toUpperCase();
}

/**
 * Extract surname-like token from iRacing AbbrevName values like
 * "D'Avoine, N." or "Smith, J".
 */
function getSmartLabelFromAbbrevName(abbrevName?: string): string | undefined {
  if (!abbrevName) return undefined;

  const trimmed = abbrevName.trim();

  if (!trimmed) return undefined;

  const surnamePart = trimmed.split(",")[0]?.trim();

  if (!surnamePart) return undefined;

  return getSmartDriverNameLabel(surnamePart);
}

/**
 * Resolve the short name label to display on a `select-reference-car` button
 * based on the user's chosen name source and the car's session data.
 *
 * - `"none"` always returns `undefined`.
 * - `"userName"` and `"teamName"` apply {@link getShortDriverName} (last-word, max 5 chars, uppercase).
 * - `"abbrevName"` and `"initials"` use the raw field trimmed and uppercased, truncated to 5 chars.
 * - Returns `undefined` when the field is absent, empty, or produces no useful text.
 *
 * @internal Exported for testing
 */
export function resolveCarNameLabel(nameSource: string, car: ActiveSessionCar | undefined): string | undefined {
  if (nameSource === "none" || !car) return undefined;

  switch (nameSource) {
    case "smartName": {
      const userNameLabel = getSmartDriverNameLabel(car.userName);
      const driverNameLabel = getSmartDriverNameLabel(car.driverName);
      const abbrevNameLabel = getSmartLabelFromAbbrevName(car.abbrevName);

      const candidates = [userNameLabel, driverNameLabel, abbrevNameLabel].filter((value): value is string => !!value);

      if (candidates.length === 0) return undefined;

      if (candidates.length === 1) return candidates[0];

      // Prefer labels that preserve punctuation/prefixes (for example
      // "D'AVOINE" over "AVOINE"), then fall back to length.
      candidates.sort((a, b) => {
        const punctuationScore = (value: string) => (/[''-]/.test(value) ? 1 : 0);
        const punctDiff = punctuationScore(b) - punctuationScore(a);

        if (punctDiff !== 0) return punctDiff;

        return b.length - a.length;
      });

      return candidates[0];
    }
    case "initials": {
      const trimmed = car.initials?.trim();

      return trimmed ? trimmed.toUpperCase().substring(0, 5) : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Compute a stable identity string for the current iRacing session.
 *
 * Used to detect when the user switches between replays or sessions so the
 * selector roster can be reset and rebuilt from the new session info.
 *
 * Priority: `SubSessionID` → `SessionID + TrackName + EventType` → `null`.
 * Returns `null` when no identifying information is available (e.g. not yet
 * connected to a session).
 *
// The following helpers moved to ../shared/session-roster.ts.
// computeSessionKey, SessionRosterState, buildSessionRoster are re-exported above.

/**
 * @internal Exported for testing
 */
export function generateSplitsDeltaCycleSvg(
  settings: SplitsDeltaCycleSettings,
  bindingMissing = false,
  resolvedCarNumber: string | null = null,
  isSelected = false,
  accentColor?: string,
  car?: ActiveSessionCar,
  attentionState: RaceControlAttentionState = "none",
): string {
  const { mode, direction } = settings;

  // toggle-ref-car uses a dedicated icon from splits-delta-cycle
  if (mode === "toggle-ref-car") {
    const colors = resolveIconColors(displayRefCarIconSvg, getGlobalColors(), settings.colorOverrides);
    const title = resolveTitleSettings(
      displayRefCarIconSvg,
      getGlobalTitleSettings(),
      settings.titleOverrides,
      "CAR\nREFERENCE",
    );

    const border = resolveBorderSettings(displayRefCarIconSvg, getGlobalBorderSettings(), settings.borderOverrides);

    const graphic = resolveGraphicSettings(getGlobalGraphicSettings(), settings.graphicOverrides);

    return assembleIcon({ graphicSvg: displayRefCarIconSvg, colors, title, border, graphic, bindingMissing });
  }

  if (mode === "select-reference-car") {
    const baseColors = resolveIconColors(selectRefCarIconSvg, getGlobalColors(), settings.colorOverrides);
    const colors = baseColors;

    // Build text lines for custom graphic layout: optional name line(s) above a
    // larger anchored car-number line.
    const label = resolveCarNameLabel(settings.nameSource, car);
    const hasCarNumber = resolvedCarNumber?.trim();
    const topLine = hasCarNumber ? label : undefined;
    const bottomLine = hasCarNumber ? `#${hasCarNumber}` : "—";

    // Text-only graphic layout for select-reference-car.
    // - Name area in top/middle (supports up to 2 lines)
    // - Number anchored at bottom in larger type for quick scanning
    const escapeText = (value: string): string =>
      value.replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c] ?? c,
      );
    const escapedBottom = escapeText(bottomLine);

    const nameLines = (() => {
      if (!topLine) return [] as string[];

      // Keep short names on one line; split longer labels into two compact
      // chunks to create breathing room above the anchored car number.
      if (topLine.length <= 8) return [escapeText(topLine)];

      const splitIndex = Math.ceil(topLine.length / 2);

      return [escapeText(topLine.slice(0, splitIndex)), escapeText(topLine.slice(splitIndex))];
    })();

    const topText =
      nameLines.length === 0
        ? ""
        : nameLines.length === 1
          ? `<text x="72" y="62" text-anchor="middle" fill="{{textColor}}" font-size="24" font-family="Arial" font-weight="700">${nameLines[0]}</text>`
          : `<text x="72" y="48" text-anchor="middle" fill="{{textColor}}" font-size="20" font-family="Arial" font-weight="700">${nameLines[0]}</text><text x="72" y="72" text-anchor="middle" fill="{{textColor}}" font-size="20" font-family="Arial" font-weight="700">${nameLines[1]}</text>`;

    const selectRefTextGraphic = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144">${topText}<text x="72" y="130" text-anchor="middle" fill="{{textColor}}" font-size="51" font-family="Arial" font-weight="800">${escapedBottom}</text></svg>`;

    const title = {
      showTitle: false,
      showGraphics: true,
      titleText: "",
      bold: true,
      fontSize: 18,
      position: "bottom" as const,
      customPosition: 0,
    };

    // Green border forced on when this button is the active selected target
    const stateColor = isSelected ? "#2ecc71" : undefined;
    const resolvedBorder = resolveBorderSettings(
      selectRefCarIconSvg,
      getGlobalBorderSettings(),
      settings.borderOverrides,
      stateColor,
    );
    const border = isSelected ? { ...resolvedBorder, enabled: true } : resolvedBorder;

    const graphic = resolveGraphicSettings(getGlobalGraphicSettings(), settings.graphicOverrides);

    // Attention border is suppressed when the slot is empty.
    const attentionBorderContent = hasCarNumber ? getAttentionBorderSvg(attentionState) : "";

    return assembleIcon({
      graphicSvg: selectRefTextGraphic,
      colors,
      title,
      border,
      graphic,
      bindingMissing,
      // Accent is suppressed when offline (grey state takes priority) or when
      // the slot is empty (no car assigned).
      accentColor,
      attentionBorderContent,
    });
  }

  const modeIconSvg = MODE_ICONS[mode];

  if (modeIconSvg) {
    const colors = resolveIconColors(modeIconSvg, getGlobalColors(), settings.colorOverrides);
    const title = resolveTitleSettings(
      modeIconSvg,
      getGlobalTitleSettings(),
      settings.titleOverrides,
      MODE_TITLES[mode],
    );

    const border = resolveBorderSettings(modeIconSvg, getGlobalBorderSettings(), settings.borderOverrides);

    const graphic = resolveGraphicSettings(getGlobalGraphicSettings(), settings.graphicOverrides);

    return assembleIcon({ graphicSvg: modeIconSvg, colors, title, border, graphic, bindingMissing });
  }

  const iconSvg = DIRECTION_ICONS[direction] || DIRECTION_ICONS.next;
  const colors = resolveIconColors(iconSvg, getGlobalColors(), settings.colorOverrides);
  const defaultTitle = direction === "next" ? "SPLITS DELTA\nNEXT" : "SPLITS DELTA\nPREVIOUS";
  const title = resolveTitleSettings(iconSvg, getGlobalTitleSettings(), settings.titleOverrides, defaultTitle);

  const border = resolveBorderSettings(iconSvg, getGlobalBorderSettings(), settings.borderOverrides);

  const graphic = resolveGraphicSettings(getGlobalGraphicSettings(), settings.graphicOverrides);

  return assembleIcon({ graphicSvg: iconSvg, colors, title, border, graphic, bindingMissing });
}

/**
 * Splits & Reference Action
 * Cycles through iRacing split-time delta display modes or toggles the reference car display.
 */
export const SPLITS_DELTA_CYCLE_UUID = "com.iracedeck.sd.core.splits-delta-cycle" as const;

export class SplitsDeltaCycle extends ConnectionStateAwareAction<SplitsDeltaCycleSettings> {
  private activeContexts = new Map<string, SplitsDeltaCycleSettings>();
  private resolvedCarNumbers = new Map<string, string | null>();
  private resolvedCarRaws = new Map<string, number | null>();
  private resolvedCarIdxs = new Map<string, number | null>();
  private resolvedAttentionStates = new Map<string, RaceControlAttentionState>();
  private selectedCarUnsubscribers = new Map<string, () => void>();

  /**
   * Stable session car roster.
   * Cars are never removed within a session — disconnected drivers remain so
   * that slot assignments don't shift unexpectedly.
   * Cleared and rebuilt when the session identity changes.
   */
  private rosterState: SessionRosterState = { carList: [], knownSet: new Set(), lastKey: null };

  override async onWillAppear(ev: IDeckWillAppearEvent<SplitsDeltaCycleSettings>): Promise<void> {
    await super.onWillAppear(ev);
    const settings = this.parseSettings(ev.payload.settings);
    this.activeContexts.set(ev.action.id, settings);
    this.setActiveBinding(this.resolveSettingKey(settings));
    await this.updateDisplay(ev, settings);
    // Subscribe to telemetry to keep slot data current (car list + offline status)
    this.sdkController.subscribe(ev.action.id, (telemetry: TelemetryData | null) => {
      const currentSettings = this.activeContexts.get(ev.action.id);

      if (currentSettings?.mode !== "select-reference-car") return;

      const listChanged = this.updateSessionCarList(this.sdkController.getSessionInfo());

      if (listChanged) {
        // A new driver joined — refresh all visible select-reference-car buttons
        for (const [ctxId, ctxSettings] of this.activeContexts) {
          if (ctxSettings.mode === "select-reference-car") {
            this.updateCarFromSession(ctxId, ctxSettings, telemetry);
          }
        }
      } else {
        this.updateCarFromSession(ev.action.id, currentSettings, telemetry);
      }
    });
    // Subscribe to selected-car changes to refresh the active/inactive state
    const unsubscribe = onSelectedCarChange(() => {
      const currentSettings = this.activeContexts.get(ev.action.id);

      if (currentSettings?.mode !== "select-reference-car") return;

      const carNum = this.resolvedCarNumbers.get(ev.action.id) ?? null;
      const resolvedCarIdx = this.resolvedCarIdxs.get(ev.action.id) ?? null;
      const isSelected = resolvedCarIdx !== null && getSelectedCar()?.carIdx === resolvedCarIdx;
      const attentionState = this.resolvedAttentionStates.get(ev.action.id) ?? "none";
      const car = this.rosterState.carList[currentSettings.slotIndex];
      const accentColor = resolveCarAccentColor(currentSettings.colorSource, car);
      const svg = generateSplitsDeltaCycleSvg(
        currentSettings,
        false,
        carNum,
        isSelected,
        accentColor,
        car,
        attentionState,
      );
      void this.updateKeyImage(ev.action.id, svg);
    });
    this.selectedCarUnsubscribers.set(ev.action.id, unsubscribe);

    // Initial resolution: seed the car list from current session info.
    // This fires even when no telemetry is available so buttons populate as
    // soon as iRacing reports a valid session (no need to be on track).
    if (settings.mode === "select-reference-car") {
      this.updateSessionCarList(this.sdkController.getSessionInfo());
      this.updateCarFromSession(ev.action.id, settings, null);
    }
  }

  override async onWillDisappear(ev: IDeckWillDisappearEvent<SplitsDeltaCycleSettings>): Promise<void> {
    await super.onWillDisappear(ev);
    this.sdkController.unsubscribe(ev.action.id);
    this.selectedCarUnsubscribers.get(ev.action.id)?.();
    this.selectedCarUnsubscribers.delete(ev.action.id);
    this.activeContexts.delete(ev.action.id);
    this.resolvedCarNumbers.delete(ev.action.id);
    this.resolvedCarRaws.delete(ev.action.id);
    this.resolvedCarIdxs.delete(ev.action.id);
    this.resolvedAttentionStates.delete(ev.action.id);
  }

  override async onDidReceiveSettings(ev: IDeckDidReceiveSettingsEvent<SplitsDeltaCycleSettings>): Promise<void> {
    await super.onDidReceiveSettings(ev);
    const settings = this.parseSettings(ev.payload.settings);
    this.activeContexts.set(ev.action.id, settings);
    this.setActiveBinding(this.resolveSettingKey(settings));

    if (settings.mode === "select-reference-car") {
      this.updateCarFromSession(ev.action.id, settings, null);
    }

    await this.updateDisplay(ev, settings);
  }

  override async onKeyDown(ev: IDeckKeyDownEvent<SplitsDeltaCycleSettings>): Promise<void> {
    this.logger.info("Key down received");
    const settings = this.parseSettings(ev.payload.settings);

    if (settings.mode === "select-reference-car") {
      const carNumber = this.resolvedCarNumbers.get(ev.action.id) ?? null;
      const carNumberRaw = this.resolvedCarRaws.get(ev.action.id) ?? null;
      const resolvedCarIdx = this.resolvedCarIdxs.get(ev.action.id) ?? null;

      if (resolvedCarIdx === null || carNumber === null || carNumberRaw === null) {
        this.logger.warn("Cannot select reference car: no car assigned to this slot");

        return;
      }

      const selectionResult = applyReferenceCarSelection({
        carIdx: resolvedCarIdx,
        carNumber,
        carNumberRaw,
      });

      if (selectionResult === "deselected") {
        this.logger.info("Reference car deselected");

        return;
      }

      this.logger.info("Reference car selected");
      this.logger.debug(
        `slotIndex: ${settings.slotIndex}, carIdx: ${resolvedCarIdx}, carNumber: ${carNumber}, carNumberRaw: ${carNumberRaw}`,
      );

      return;
    }

    const settingKey = this.resolveSettingKey(settings);

    if (settingKey) {
      await this.tapBinding(settingKey);
    }
  }

  override async onDialDown(ev: IDeckDialDownEvent<SplitsDeltaCycleSettings>): Promise<void> {
    this.logger.info("Dial down received");
    const settings = this.parseSettings(ev.payload.settings);

    if (settings.mode === "select-reference-car") return;

    const settingKey = MODE_KEY_MAP[settings.mode];

    if (!settingKey) return;

    await this.tapBinding(settingKey);
  }

  override async onDialRotate(ev: IDeckDialRotateEvent<SplitsDeltaCycleSettings>): Promise<void> {
    const settings = this.parseSettings(ev.payload.settings);

    if (settings.mode !== "cycle") return;

    this.logger.info(`Dial rotated: ${ev.payload.ticks} ticks`);
    const settingKey = ev.payload.ticks > 0 ? GLOBAL_KEY_NAMES.NEXT : GLOBAL_KEY_NAMES.PREVIOUS;
    await this.tapBinding(settingKey);
  }

  private parseSettings(settings: unknown): SplitsDeltaCycleSettings {
    const parsed = SplitsDeltaCycleSettings.safeParse(settings);

    return parsed.success ? parsed.data : SplitsDeltaCycleSettings.parse({});
  }

  private resolveSettingKey(settings: SplitsDeltaCycleSettings): string | null {
    if (settings.mode === "select-reference-car") return null;

    return (
      MODE_KEY_MAP[settings.mode] ?? (settings.direction === "next" ? GLOBAL_KEY_NAMES.NEXT : GLOBAL_KEY_NAMES.PREVIOUS)
    );
  }

  private resolveTargetCarNumber(contextId: string, settings: SplitsDeltaCycleSettings): string | null {
    if (settings.mode !== "select-reference-car") return null;

    return this.resolvedCarNumbers.get(contextId) ?? null;
  }

  private async updateDisplay(
    ev: IDeckWillAppearEvent<SplitsDeltaCycleSettings> | IDeckDidReceiveSettingsEvent<SplitsDeltaCycleSettings>,
    settings: SplitsDeltaCycleSettings,
  ): Promise<void> {
    const carNum = this.resolveTargetCarNumber(ev.action.id, settings);
    const resolvedCarIdx = this.resolvedCarIdxs.get(ev.action.id) ?? null;
    const isSelected =
      settings.mode === "select-reference-car"
        ? resolvedCarIdx !== null && getSelectedCar()?.carIdx === resolvedCarIdx
        : false;
    const attentionState = this.resolvedAttentionStates.get(ev.action.id) ?? "none";
    const car = settings.mode === "select-reference-car" ? this.rosterState.carList[settings.slotIndex] : undefined;
    const accentColor = resolveCarAccentColor(settings.colorSource, car);
    const svgDataUri = generateSplitsDeltaCycleSvg(
      settings,
      this.isBindingMissing(this.resolveSettingKey(settings)),
      carNum,
      isSelected,
      accentColor,
      car,
      attentionState,
    );
    await ev.action.setTitle("");
    await this.setKeyImage(ev, svgDataUri);
    this.setRegenerateCallback(ev.action.id, () => {
      const currentCarNum = this.resolveTargetCarNumber(ev.action.id, settings);
      const currentResolvedCarIdx = this.resolvedCarIdxs.get(ev.action.id) ?? null;
      const currentIsSelected =
        settings.mode === "select-reference-car"
          ? currentResolvedCarIdx !== null && getSelectedCar()?.carIdx === currentResolvedCarIdx
          : false;
      const currentAttentionState = this.resolvedAttentionStates.get(ev.action.id) ?? "none";
      const currentCar =
        settings.mode === "select-reference-car" ? this.rosterState.carList[settings.slotIndex] : undefined;
      const currentAccentColor = resolveCarAccentColor(settings.colorSource, currentCar);

      return generateSplitsDeltaCycleSvg(
        settings,
        this.isBindingMissing(this.resolveSettingKey(settings)),
        currentCarNum,
        currentIsSelected,
        currentAccentColor,
        currentCar,
        currentAttentionState,
      );
    });
  }

  /**
   * Apply the latest session info to the roster.
   *
   * Delegates the pure update logic to {@link buildSessionRoster}. When the
   * session identity changes (different replay / new session), all per-context
   * resolved state is cleared, the selected car is reset, and every visible
   * selector button is re-rendered from the new session's driver list.
   *
   * @returns `true` when the roster changed (callers should refresh all slots).
   */
  private updateSessionCarList(sessionInfo: unknown): boolean {
    const prevCount = this.rosterState.carList.length;
    const { roster, changed, sessionReset } = buildSessionRoster(sessionInfo, this.rosterState);

    this.rosterState = roster;

    if (sessionReset) {
      this.logger.info("Session changed, selector roster reset");
      this.logger.debug(`New session key: ${roster.lastKey ?? "(none)"}`);

      // Clear all per-context state so stale car data is not shown.
      for (const contextId of this.activeContexts.keys()) {
        this.resolvedCarNumbers.set(contextId, null);
        this.resolvedCarRaws.set(contextId, null);
        this.resolvedCarIdxs.set(contextId, null);
        this.resolvedAttentionStates.set(contextId, "none");
      }

      // Clear the selected car — it belonged to the previous session.
      clearSelectedCar();
    }

    if (changed) {
      const addedCount = roster.carList.length - (sessionReset ? 0 : prevCount);

      this.logger.debug(
        `Session car list updated: ${roster.carList.length} cars${sessionReset ? " (session reset)" : ` (added ${addedCount})`}`,
      );
    }

    return changed;
  }

  /**
   * Resolve the car assigned to a button's slot, check its attention state,
   * and re-render the button if anything has changed.
   *
   * Offline/grey state is intentionally not computed here — `NotInWorld` on
   * `CarIdxTrackSurface` is not a reliable disconnect signal. Cars in the pit
   * stall, garage, or pre-session holding area remain selectable and render
   * at full brightness.
   */
  private updateCarFromSession(
    contextId: string,
    settings: SplitsDeltaCycleSettings,
    telemetry: TelemetryData | null,
  ): void {
    const car = this.rosterState.carList[settings.slotIndex] ?? null;

    const carNumber = car?.carNumber ?? null;
    const carNumberRaw = car?.carNumberRaw ?? null;
    const carIdx = car?.carIdx ?? null;

    // Attention state is derived from live telemetry. Missing telemetry returns
    // "none" so roster buttons render immediately without waiting for on-track data.
    const attentionState: RaceControlAttentionState =
      carIdx !== null ? getRaceControlAttentionState(carIdx, telemetry) : "none";

    const prevCarNumber = this.resolvedCarNumbers.get(contextId);
    const prevCarIdx = this.resolvedCarIdxs.get(contextId) ?? null;
    const prevAttentionState = this.resolvedAttentionStates.get(contextId) ?? "none";

    this.resolvedCarNumbers.set(contextId, carNumber);
    this.resolvedCarRaws.set(contextId, carNumberRaw);
    this.resolvedCarIdxs.set(contextId, carIdx);
    this.resolvedAttentionStates.set(contextId, attentionState);

    // Only re-render when something visible has changed.
    if (carNumber === prevCarNumber && carIdx === prevCarIdx && attentionState === prevAttentionState) return;

    const isSelected = carIdx !== null && getSelectedCar()?.carIdx === carIdx;
    const accentColor = resolveCarAccentColor(settings.colorSource, car ?? undefined);
    const svg = generateSplitsDeltaCycleSvg(
      settings,
      this.isBindingMissing(this.resolveSettingKey(settings)),
      carNumber,
      isSelected,
      accentColor,
      car ?? undefined,
      attentionState,
    );
    void this.updateKeyImage(contextId, svg);
  }
}
