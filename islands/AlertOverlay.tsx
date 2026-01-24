import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

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

          // Auto-dismiss after 60 seconds
          setTimeout(() => {
            dismissed.value = new Set([...dismissed.value, emergency.id]);
            visible.value = false;
          }, 60000);
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

  return (
    <div
      class="alert-overlay"
      // @ts-ignore - CSS custom property
      style={{ "--alert-color": alert.color }}
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
      </div>
    </div>
  );
}
