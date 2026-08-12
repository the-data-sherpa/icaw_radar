import { type Signal, useSignal } from "@preact/signals";

interface FeatureTogglesProps {
  showAlertPolygons: Signal<boolean>;
  showLightning: Signal<boolean>;
  showStormReports: Signal<boolean>;
  showWind: Signal<boolean>;
  showMiniMap: Signal<boolean>;
  showHourly: Signal<boolean>;
  /**
   * Labels of features this rendering backend cannot provide. Matching rows
   * render disabled with a visible explanation instead of silently no-oping.
   * Empty/undefined on the WebGL path, so that render is unchanged.
   */
  unavailable?: string[];
}

export function FeatureToggles(props: FeatureTogglesProps) {
  const expanded = useSignal(false);
  const unavailable = props.unavailable ?? [];

  const features = [
    {
      signal: props.showAlertPolygons,
      icon: String.fromCodePoint(0x26A0, 0xFE0F),
      label: "Alert Zones",
    },
    {
      signal: props.showLightning,
      icon: String.fromCodePoint(0x26A1),
      label: "Lightning",
    },
    {
      signal: props.showStormReports,
      icon: String.fromCodePoint(0x1F32A, 0xFE0F),
      label: "Storm Reports",
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
      label: "Hourly",
    },
  ];

  return (
    <div class={`feature-toggles ${expanded.value ? "expanded" : ""}`}>
      <button
        type="button"
        class="feature-toggles-btn"
        onClick={() => (expanded.value = !expanded.value)}
        title="Toggle feature options"
        aria-label="Toggle feature options"
        aria-expanded={expanded.value}
        aria-controls="feature-options"
      >
        {String.fromCodePoint(0x2699, 0xFE0F)}
      </button>
      {expanded.value && (
        <div class="feature-toggles-panel" role="menu" id="feature-options">
          {features.map((f) => {
            const off = unavailable.includes(f.label);
            return (
              <label key={f.label} class="feature-toggle-item">
                <input
                  type="checkbox"
                  checked={f.signal.value && !off}
                  disabled={off}
                  onChange={() => (f.signal.value = !f.signal.value)}
                  aria-label={`Toggle ${f.label}`}
                />
                <span class="icon" aria-hidden="true">
                  {f.icon}
                </span>
                <span class="label">{f.label}</span>
                {off && (
                  <span class="deck-unsupported-note">
                    Not available without WebGL
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
