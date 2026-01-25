import { type Signal, useSignal } from "@preact/signals";

interface FeatureTogglesProps {
  showLightning: Signal<boolean>;
  showStormReports: Signal<boolean>;
  showWind: Signal<boolean>;
  showMiniMap: Signal<boolean>;
  showHourly: Signal<boolean>;
}

export function FeatureToggles(props: FeatureTogglesProps) {
  const expanded = useSignal(false);

  const features = [
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
      >
        {String.fromCodePoint(0x2699, 0xFE0F)}
      </button>
      {expanded.value && (
        <div class="feature-toggles-panel" role="menu">
          {features.map((f) => (
            <label key={f.label} class="feature-toggle-item">
              <input
                type="checkbox"
                checked={f.signal.value}
                onChange={() => (f.signal.value = !f.signal.value)}
                aria-label={`Toggle ${f.label}`}
              />
              <span class="icon" aria-hidden="true">
                {f.icon}
              </span>
              <span class="label">{f.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
