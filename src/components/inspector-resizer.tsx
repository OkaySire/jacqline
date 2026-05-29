import type { MouseEvent as ReactMouseEvent } from "react";

import { clampInspectorWidth, useSettingsStore } from "@/stores/settings";

/**
 * Drag handle between MainPane and Inspector. Mounted in the
 * `.jq-main` grid where the old empty `.jq-track-spacer` used to live.
 *
 * During drag we mutate the `--jq-inspector-w` custom property on
 * `.jq-app-frame` directly (no React re-render per pixel), then commit
 * the final value to the settings store on mouseup — that re-renders
 * the inline style with the same value so there's no visual jump.
 *
 * Persisted as the `ui.inspector_width` setting (see
 * `src/stores/settings.ts`).
 */
export function InspectorResizer() {
  function onMouseDown(e: ReactMouseEvent<HTMLDivElement>): void {
    e.preventDefault();
    const startX: number = e.clientX;
    const startWidth: number = useSettingsStore.getState().inspectorWidth;
    const frame: HTMLElement | null = document.querySelector(".jq-app-frame");
    if (frame === null) {
      return;
    }

    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    function nextWidthFor(clientX: number): number {
      // Inspector is right-anchored: moving the cursor LEFT increases its width.
      return clampInspectorWidth(startWidth + (startX - clientX));
    }

    function onMove(ev: MouseEvent): void {
      if (frame === null) {
        return;
      }
      frame.style.setProperty("--jq-inspector-w", `${String(nextWidthFor(ev.clientX))}px`);
    }

    function onUp(ev: MouseEvent): void {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      void useSettingsStore.getState().update({ inspectorWidth: nextWidthFor(ev.clientX) });
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div
      className="jq-resizer-v"
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize inspector"
    />
  );
}
