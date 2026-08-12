import type { VNode } from "preact";
import type { Signal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";

/**
 * MapToolsSheet — the mobile layers/data panel.
 *
 * Not an island: it renders inside islands/RadarMap.tsx, which is already an
 * island, so hooks work (components/AudioToggle.tsx does the same).
 *
 * It is bound to the SAME signals as components/FeatureToggles.tsx, so there
 * is no forked render path and no duplicated state. All three rendered
 * elements carry `deck-only`, which is `display: none` in broadcast.css, so
 * /overlay and desktop are byte-identical and keep using FeatureToggles.
 */

export interface MapToolsSheetProps {
  open: Signal<boolean>;
  showAlertPolygons: Signal<boolean>;
  showLightning: Signal<boolean>;
  showStormReports: Signal<boolean>;
  showWind: Signal<boolean>;
  showMiniMap: Signal<boolean>;
  showHourly: Signal<boolean>;
  stormReportCount?: number;
  lightningCount?: number;
}

interface ToolRow {
  signal: Signal<boolean>;
  icon: string;
  label: string;
  badge?: number;
}

export function MapToolsSheet(props: MapToolsSheetProps): VNode {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);

  // Row order matches components/FeatureToggles.tsx so the two UIs agree.
  const rows: ToolRow[] = [
    {
      signal: props.showAlertPolygons,
      icon: String.fromCodePoint(0x26A0, 0xFE0F),
      label: "Alert Zones",
    },
    {
      signal: props.showLightning,
      icon: String.fromCodePoint(0x26A1),
      label: "Lightning",
      badge: props.lightningCount,
    },
    {
      signal: props.showStormReports,
      icon: String.fromCodePoint(0x1F32A, 0xFE0F),
      label: "Storm Reports",
      badge: props.stormReportCount,
    },
    {
      signal: props.showWind,
      icon: String.fromCodePoint(0x1F4A8),
      label: "Wind Field",
    },
    {
      signal: props.showMiniMap,
      icon: String.fromCodePoint(0x1F5FA, 0xFE0F),
      label: "Regional View",
    },
    {
      signal: props.showHourly,
      icon: String.fromCodePoint(0x1F4CA),
      label: "Hourly Forecast",
    },
  ];

  const isOpen = props.open.value;

  useEffect(() => {
    if (isOpen === wasOpen.current) return;
    if (isOpen) {
      panelRef.current?.focus();
    } else if (wasOpen.current) {
      triggerRef.current?.focus();
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        class="deck-tools-btn deck-only"
        aria-expanded={isOpen}
        aria-controls="deck-tools"
        onClick={() => (props.open.value = !props.open.value)}
      >
        <span aria-hidden="true">{String.fromCodePoint(0x2699, 0xFE0F)}</span>
        Layers
      </button>

      <button
        type="button"
        class="deck-backdrop deck-only"
        data-open={isOpen ? "true" : "false"}
        aria-label="Close layers panel"
        tabIndex={isOpen ? 0 : -1}
        onClick={() => (props.open.value = false)}
      />

      <div
        id="deck-tools"
        ref={panelRef}
        class="deck-tools-sheet deck-only"
        data-open={isOpen ? "true" : "false"}
        role="group"
        aria-label="Map layers and data"
        tabIndex={-1}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === "Escape") {
            e.preventDefault();
            props.open.value = false;
          }
        }}
      >
        <h2 class="deck-tools-title">Layers &amp; data</h2>
        <div class="deck-tools-group">
          <div class="deck-tools-group-title">Overlays</div>
          {rows.map((r) => (
            <label key={r.label} class="deck-tools-row">
              <input
                type="checkbox"
                checked={r.signal.value}
                onChange={() => (r.signal.value = !r.signal.value)}
              />
              <span class="deck-tools-row-icon" aria-hidden="true">
                {r.icon}
              </span>
              <span class="deck-tools-row-label">{r.label}</span>
              {r.badge !== undefined && r.badge > 0 && (
                <span class="deck-tools-row-badge">{r.badge}</span>
              )}
              <span class="deck-tools-switch" aria-hidden="true" />
            </label>
          ))}
        </div>
        <button
          type="button"
          class="deck-tools-close"
          aria-label="Close layers panel"
          onClick={() => (props.open.value = false)}
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
    </>
  );
}
