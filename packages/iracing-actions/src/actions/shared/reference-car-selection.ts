import { clearSelectedCar, getSelectedCar, setSelectedCar } from "@iracedeck/deck-core";

/**
 * Data required to select a reference car.
 *
 * @internal Exported for reuse by actions that need the Select Reference Car behavior.
 */
export interface ReferenceCarTarget {
  carIdx: number;
  carNumber: string;
  carNumberRaw: number;
}

/**
 * Apply the exact Select Reference Car toggle behavior:
 * - If `target` is already selected, clear it.
 * - Otherwise select `target`.
 *
 * @returns `"selected"` when a new target is selected, `"deselected"` when
 * the currently-selected target is cleared.
 *
 * @internal Exported for reuse by actions that need the Select Reference Car behavior.
 */
export function applyReferenceCarSelection(target: ReferenceCarTarget): "selected" | "deselected" {
  if (getSelectedCar()?.carIdx === target.carIdx) {
    clearSelectedCar();

    return "deselected";
  }

  setSelectedCar(target);

  return "selected";
}
