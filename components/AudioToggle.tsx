import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

interface AudioToggleProps {
  onToggle: (enabled: boolean) => void;
}

export function AudioToggle({ onToggle }: AudioToggleProps) {
  const enabled = useSignal(false);
  const hasInteracted = useSignal(false);

  useEffect(() => {
    // Load preference from localStorage
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("audio-alerts-enabled");
      enabled.value = saved === "true";
    }
  }, []);

  const toggle = () => {
    // First interaction - user gesture required for audio context
    if (!hasInteracted.value) {
      hasInteracted.value = true;
    }

    enabled.value = !enabled.value;

    if (typeof localStorage !== "undefined") {
      localStorage.setItem("audio-alerts-enabled", String(enabled.value));
    }

    onToggle(enabled.value);
  };

  return (
    <button
      type="button"
      class={`audio-toggle ${enabled.value ? "enabled" : ""}`}
      onClick={toggle}
      title={enabled.value ? "Disable alert sounds" : "Enable alert sounds"}
      aria-label={enabled.value
        ? "Disable alert sounds"
        : "Enable alert sounds"}
      aria-pressed={enabled.value}
    >
      {enabled.value ? "\u{1F50A}" : "\u{1F507}"}
    </button>
  );
}
