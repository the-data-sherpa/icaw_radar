import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { NewsTicker } from "./NewsTicker.tsx";

interface StreamOverlayProps {
  className?: string;
}

export default function StreamOverlay({ className }: StreamOverlayProps) {
  const tickerItems = useSignal<string[]>([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const [weatherRes, alertsRes] = await Promise.all([
          fetch("/api/weather"),
          fetch("/api/alerts"),
        ]);

        const items: string[] = [];

        if (weatherRes.ok) {
          const weather = await weatherRes.json();
          items.push(
            `CURRENTLY: ${weather.temperature}${weather.temperatureUnit} ${weather.conditions.toUpperCase()}  ///  WIND: ${weather.windDirection} ${weather.windSpeed} MPH`,
          );
          // Add additional spacing or items
          if (weather.feelsLike && weather.feelsLike !== weather.temperature) {
            items.push(
              `FEELS LIKE: ${weather.feelsLike}${weather.temperatureUnit}`,
            );
          }
        }

        if (alertsRes.ok) {
          const alerts = await alertsRes.json();
          if (Array.isArray(alerts) && alerts.length > 0) {
            // deno-lint-ignore no-explicit-any
            alerts.forEach((alert: any) => {
              if (typeof alert === "string") {
                items.push(`ALERT: ${alert.toUpperCase()}`);
              } else {
                items.push(
                  `ALERT: ${alert.event.toUpperCase()} - ${alert.areaDesc}`,
                );
              }
            });
          }
        }

        if (items.length === 0) {
          items.push("IREDELL COUNTY WEATHER RADAR");
        }

        tickerItems.value = items;
      } catch (e) {
        console.error("Failed to fetch stream data", e);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  // If className is provided, use it (grid layout).
  // If not, use fixed position (stream layout - deprecated but keeping compat for now)
  if (className) {
    return (
      <div class={className}>
        <NewsTicker items={tickerItems.value} speed={100} />
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        width: "100%",
        zIndex: 1000,
      }}
    >
      <NewsTicker items={tickerItems.value} speed={100} />
    </div>
  );
}
