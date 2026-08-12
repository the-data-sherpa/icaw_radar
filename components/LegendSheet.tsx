import type { VNode } from "preact";
import { useSignal } from "@preact/signals";
import { RadarLegend } from "@/components/RadarLegend.tsx";
import { VelocityLegend } from "@/components/VelocityLegend.tsx";

/**
 * LegendSheet — the mobile wrapper around the radar legends.
 *
 * STRUCTURAL RULE: the legend components are rendered exactly ONCE, inside
 * `.deck-legend-sheet`, which is `display: contents` by default in
 * broadcast.css. On /overlay and on desktop the wrapper generates no box, so
 * `.radar-legend` keeps its absolute bottom-right corner exactly as today.
 * Below 64rem the CSS agent turns the wrapper into a real panel opened by
 * `.deck-legend-chip`. Never duplicate <RadarLegend />.
 */

export interface LegendSheetProps {
  activeLayer: "radar" | "precip" | "velocity";
  /**
   * Reserved. Nothing in the codebase currently renders `.wind-legend`, and
   * emitting an extra box here would be visible on desktop and /overlay
   * (the wrapper is `display: contents`), so this is intentionally unused.
   */
  windEnabled?: boolean;
}

export function LegendSheet({ activeLayer }: LegendSheetProps): VNode {
  const open = useSignal(false);
  const label = activeLayer === "velocity"
    ? "Echo Tops (kft)"
    : activeLayer === "precip"
    ? "24h Precipitation"
    : "Reflectivity (dBZ)";

  return (
    <>
      <button
        type="button"
        class="deck-legend-chip deck-only"
        aria-expanded={open.value}
        aria-controls="deck-legend"
        onClick={() => (open.value = !open.value)}
      >
        {label}
      </button>

      <button
        type="button"
        class="deck-backdrop deck-only"
        data-open={open.value ? "true" : "false"}
        aria-label="Close legend"
        tabIndex={open.value ? 0 : -1}
        onClick={() => (open.value = false)}
      />

      <div
        id="deck-legend"
        class="deck-legend-sheet"
        data-open={open.value ? "true" : "false"}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === "Escape") {
            e.preventDefault();
            open.value = false;
          }
        }}
      >
        {activeLayer === "velocity" ? <VelocityLegend /> : <RadarLegend />}
        <button
          type="button"
          class="deck-legend-close deck-only"
          aria-label="Close legend"
          onClick={() => (open.value = false)}
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
    </>
  );
}
