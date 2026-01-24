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

export default function AlertBanner() {
  const alerts = useSignal<Alert[]>([]);
  const loading = useSignal(true);

  useEffect(() => {
    async function fetchAlerts() {
      try {
        const response = await fetch("/api/alerts");
        if (!response.ok) {
          throw new Error("Failed to fetch alerts");
        }
        const data = await response.json();
        alerts.value = data;
      } catch (e) {
        console.error("Alerts fetch error:", e);
      } finally {
        loading.value = false;
      }
    }

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading.value) {
    return (
      <div class="alert-ticker">
        <div class="ticker-empty">Loading alerts...</div>
      </div>
    );
  }

  if (alerts.value.length === 0) {
    return (
      <div class="alert-ticker">
        <div class="ticker-empty">No active weather alerts</div>
      </div>
    );
  }

  // Duplicate alerts for seamless scrolling
  const scrollAlerts = [...alerts.value, ...alerts.value];

  return (
    <div class="alert-ticker">
      <div class="ticker-label">Alerts</div>
      <div class="ticker-content">
        <div class="ticker-scroll">
          {scrollAlerts.map((alert, idx) => (
            <div key={`${alert.id}-${idx}`} class="ticker-item">
              <span
                class="alert-dot"
                style={{ backgroundColor: alert.color }}
              />
              <span>{alert.event.toUpperCase()} - {alert.areaDesc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
