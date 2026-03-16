import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { audioAlerts } from "@/lib/audio-alerts.ts";

interface Alert {
  id: string;
  event: string;
  headline: string;
  areaDesc: string;
  color: string;
  isEmergency: boolean;
}

export default function AlertOverlay() {
  const emergencyAlert = useSignal<Alert | null>(null);
  const dismissed = useSignal<Set<string>>(new Set());
  const visible = useSignal(false);
  const audioActive = useSignal(false);
  const audioInitialized = useRef(false);

  // Initialize audio system on mount
  useEffect(() => {
    if (!audioInitialized.current) {
      audioAlerts.loadPreference();
      audioInitialized.current = true;
    }
  }, []);

  useEffect(() => {
    async function fetchAlerts() {
      try {
        const response = await fetch("/api/alerts");
        if (!response.ok) return;

        const alerts: Alert[] = await response.json();

        // Find first emergency alert that hasn't been dismissed
        const emergency = alerts.find(
          (a) => a.isEmergency && !dismissed.value.has(a.id),
        );

        if (emergency) {
          emergencyAlert.value = emergency;
          visible.value = true;

          // Play audio alert if enabled and not already played for this alert
          if (audioAlerts.isEnabled() && !audioAlerts.hasPlayed(emergency.id)) {
            audioActive.value = true;
            await audioAlerts.playAlert(emergency.event, emergency.id);
            // Visual feedback duration matches audio pattern
            setTimeout(() => {
              audioActive.value = false;
            }, 3000);
          }

          // Auto-dismiss after 15 seconds
          setTimeout(() => {
            if (visible.value && emergencyAlert.value?.id === emergency.id) {
              dismissed.value = new Set([...dismissed.value, emergency.id]);
              visible.value = false;
              audioAlerts.clearPlayed(emergency.id);
            }
          }, 15000);
        }
      } catch (e) {
        console.error("Emergency alert fetch error:", e);
      }
    }

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!visible.value || !emergencyAlert.value) {
    return null;
  }

  const alert = emergencyAlert.value;

  // Determine icon based on event type
  let icon = "!";
  if (alert.event.toLowerCase().includes("tornado")) {
    icon = "T";
  } else if (alert.event.toLowerCase().includes("thunderstorm")) {
    icon = "ST";
  } else if (alert.event.toLowerCase().includes("flood")) {
    icon = "FL";
  }

  /** Dismiss the current alert overlay. */
  function handleDismiss() {
    dismissed.value = new Set([...dismissed.value, alert.id]);
    visible.value = false;
    audioAlerts.clearPlayed(alert.id);
  }

  return (
    <div
      class={`alert-overlay ${audioActive.value ? "audio-active" : ""}`}
      // @ts-ignore - CSS custom property
      style={{ "--alert-color": alert.color }}
      onClick={handleDismiss}
    >
      <div class="alert-overlay-content">
        <div class="alert-overlay-icon" style={{ color: alert.color }}>
          {icon}
        </div>
        <div class="alert-overlay-event" style={{ color: alert.color }}>
          {alert.event}
        </div>
        <div class="alert-overlay-headline">{alert.headline}</div>
        <div class="alert-overlay-area">{alert.areaDesc}</div>
        <div class="alert-overlay-dismiss">Click anywhere to dismiss</div>
      </div>
      <button
        type="button"
        class="alert-overlay-close"
        onClick={handleDismiss}
        aria-label="Dismiss alert"
      >
        X
      </button>
    </div>
  );
}
