/**
 * Race Control Alert Slot Action
 *
 * Populates fixed slot buttons from the shared race-control alert queue and
 * renders each slot using the same visual language as select-reference-car.
 */
import {
  CommonSettings,
  ConnectionStateAwareAction,
  getCommands,
  getSelectedCar,
  type IDeckDidReceiveSettingsEvent,
  type IDeckKeyDownEvent,
  type IDeckWillAppearEvent,
  type IDeckWillDisappearEvent,
  onSelectedCarChange,
} from "@iracedeck/deck-core";
import { type TelemetryData } from "@iracedeck/iracing-sdk";
import z from "zod";

import { type RaceControlAttentionState } from "../shared/race-control-attention.js";
import { applyReferenceCarSelection } from "../shared/reference-car-selection.js";
import { generateSplitsDeltaCycleSvg } from "../splits-delta-cycle/splits-delta-cycle.js";
import { getAlertForSlot, type RaceControlAlert, updateAlertQueue } from "./race-control-alert-service.js";

const RaceControlAlertSlotSettings = CommonSettings.extend({
  /** 0-based queue slot index. */
  slotIndex: z.coerce.number().int().min(0).max(7).default(0),
  /** Optional alert-type filter for this slot. */
  alertType: z.enum(["any", "blackFlag", "waveAround"]).default("any"),
  /**
   * - standard: select/deselect the alert driver as the reference car.
   * - instant: send the matching race-control chat command immediately.
   */
  actionMode: z.enum(["standard", "instant"]).default("standard"),
});

type RaceControlAlertSlotSettings = z.infer<typeof RaceControlAlertSlotSettings>;

export const RACE_CONTROL_ALERT_SLOT_UUID = "com.iracedeck.sd.core.race-control-alert-slot" as const;

/**
 * Build the RC slot key image using the exact select-reference-car rendering
 * path (same text layout, same selected border, same attention borders).
 *
 * @internal Exported for testing
 */
export function generateRaceControlAlertSlotSvg(
  settings: RaceControlAlertSlotSettings,
  alert: RaceControlAlert | null,
  isSelected = false,
): string {
  const attentionState: RaceControlAttentionState =
    alert?.type === "disqualify"
      ? "disqualify"
      : alert?.type === "blackFlag"
        ? "blackFlag"
        : alert?.type === "meatball"
          ? "meatball"
          : alert?.type === "waveAround"
            ? "waveAround"
            : "none";

  return generateSplitsDeltaCycleSvg(
    {
      addedWithVersion: "1.22.2",
      mode: "select-reference-car",
      direction: "next",
      slotIndex: settings.slotIndex,
      colorSource: "none",
      nameSource: "smartName",
      flagsOverlay: settings.flagsOverlay,
      colorOverrides: settings.colorOverrides,
      titleOverrides: settings.titleOverrides,
      borderOverrides: settings.borderOverrides,
      graphicOverrides: settings.graphicOverrides,
    },
    false,
    alert?.carNumber ?? null,
    isSelected,
    undefined,
    alert?.car,
    attentionState,
  );
}

export class RaceControlAlertSlot extends ConnectionStateAwareAction<RaceControlAlertSlotSettings> {
  private activeContexts = new Map<string, RaceControlAlertSlotSettings>();
  private lastRenderedAlertKeys = new Map<string, string | null>();
  private selectedCarUnsubscribers = new Map<string, () => void>();

  override async onWillAppear(ev: IDeckWillAppearEvent<RaceControlAlertSlotSettings>): Promise<void> {
    await super.onWillAppear(ev);
    const settings = this.parseSettings(ev.payload.settings);

    this.activeContexts.set(ev.action.id, settings);

    // Seed from current session to avoid waiting for the next telemetry tick.
    updateAlertQueue(this.sdkController.getSessionInfo(), null);
    const { svg, alertKey } = this.buildDisplayState(settings);

    this.lastRenderedAlertKeys.set(ev.action.id, alertKey);
    await this.setKeyImage(ev, svg);
    this.setRegenerateCallback(ev.action.id, () => {
      const latestAlert = getAlertForSlot(settings.slotIndex, settings.alertType);
      const latestIsSelected = latestAlert ? getSelectedCar()?.carIdx === latestAlert.carIdx : false;

      return generateRaceControlAlertSlotSvg(settings, latestAlert, latestIsSelected);
    });

    this.sdkController.subscribe(ev.action.id, (telemetry: TelemetryData | null) => {
      const currentSettings = this.activeContexts.get(ev.action.id);

      if (!currentSettings) return;

      updateAlertQueue(this.sdkController.getSessionInfo(), telemetry);
      this.checkAlertChange(ev.action.id, currentSettings);
    });

    const unsubscribe = onSelectedCarChange(() => {
      const currentSettings = this.activeContexts.get(ev.action.id);

      if (!currentSettings) return;

      void this.updateDisplay(ev.action.id, currentSettings);
    });

    this.selectedCarUnsubscribers.set(ev.action.id, unsubscribe);
  }

  override async onWillDisappear(ev: IDeckWillDisappearEvent<RaceControlAlertSlotSettings>): Promise<void> {
    await super.onWillDisappear(ev);
    this.sdkController.unsubscribe(ev.action.id);
    this.selectedCarUnsubscribers.get(ev.action.id)?.();
    this.selectedCarUnsubscribers.delete(ev.action.id);
    this.activeContexts.delete(ev.action.id);
    this.lastRenderedAlertKeys.delete(ev.action.id);
  }

  override async onDidReceiveSettings(ev: IDeckDidReceiveSettingsEvent<RaceControlAlertSlotSettings>): Promise<void> {
    await super.onDidReceiveSettings(ev);
    const settings = this.parseSettings(ev.payload.settings);

    this.activeContexts.set(ev.action.id, settings);
    await this.updateDisplay(ev.action.id, settings);
  }

  override async onKeyDown(ev: IDeckKeyDownEvent<RaceControlAlertSlotSettings>): Promise<void> {
    this.logger.info("Key down received");
    const settings = this.parseSettings(ev.payload.settings);
    const alert = getAlertForSlot(settings.slotIndex, settings.alertType);

    if (!alert) {
      this.logger.debug("Key down: slot is empty, nothing to do");

      return;
    }

    if (settings.actionMode === "standard") {
      const selectionResult = applyReferenceCarSelection({
        carIdx: alert.carIdx,
        carNumber: alert.carNumber,
        carNumberRaw: alert.carNumberRaw,
      });

      if (selectionResult === "selected") {
        this.logger.info("Reference car selected from alert slot");
      } else {
        this.logger.info("Reference car deselected from alert slot");
      }

      return;
    }

    await this.sendInstantAlertCommand(alert);
  }

  private async updateDisplay(contextId: string, settings: RaceControlAlertSlotSettings): Promise<void> {
    const { svg, alertKey } = this.buildDisplayState(settings);

    this.lastRenderedAlertKeys.set(contextId, alertKey);
    await this.updateKeyImage(contextId, svg);
    this.setRegenerateCallback(contextId, () => {
      const latestAlert = getAlertForSlot(settings.slotIndex, settings.alertType);
      const latestIsSelected = latestAlert ? getSelectedCar()?.carIdx === latestAlert.carIdx : false;

      return generateRaceControlAlertSlotSvg(settings, latestAlert, latestIsSelected);
    });
  }

  private buildDisplayState(settings: RaceControlAlertSlotSettings): { svg: string; alertKey: string | null } {
    const alert = getAlertForSlot(settings.slotIndex, settings.alertType);
    const isSelected = alert ? getSelectedCar()?.carIdx === alert.carIdx : false;

    return {
      svg: generateRaceControlAlertSlotSvg(settings, alert, isSelected),
      alertKey: alert?.key ?? null,
    };
  }

  private checkAlertChange(contextId: string, settings: RaceControlAlertSlotSettings): void {
    const alert = getAlertForSlot(settings.slotIndex, settings.alertType);
    const prevKey = this.lastRenderedAlertKeys.get(contextId) ?? null;
    const newKey = alert?.key ?? null;

    if (newKey === prevKey) return;

    void this.updateDisplay(contextId, settings);
  }

  private async sendInstantAlertCommand(alert: RaceControlAlert): Promise<void> {
    const command = alert.type === "waveAround" ? `!waveby #${alert.carNumber}` : `!clear #${alert.carNumber}`;

    this.logger.info(`Sending instant alert command for car #${alert.carNumber}`);
    this.logger.debug(`Command: "${command}", alertType: ${alert.type}`);

    const success = await getCommands().chat.sendMessage(command);

    if (success) {
      this.logger.info("Instant alert command sent");
    } else {
      this.logger.warn("Failed to send instant alert command");
    }
  }

  private parseSettings(settings: unknown): RaceControlAlertSlotSettings {
    const parsed = RaceControlAlertSlotSettings.safeParse(settings);

    return parsed.success ? parsed.data : RaceControlAlertSlotSettings.parse({});
  }
}
