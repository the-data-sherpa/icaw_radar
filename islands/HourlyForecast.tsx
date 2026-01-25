import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";

interface HourData {
  hour: string; // "3 PM"
  temp: number;
  precipChance: number;
  icon: string;
  conditions: string;
  isNow: boolean;
}

// Map icon codes to emoji for display
const ICON_MAP: Record<string, string> = {
  "clear": "☀️",
  "mostly-clear": "🌤️",
  "partly-cloudy": "⛅",
  "overcast": "☁️",
  "fog": "🌫️",
  "drizzle": "🌧️",
  "freezing-drizzle": "🌧️",
  "rain": "🌧️",
  "freezing-rain": "🌧️",
  "showers": "🌧️",
  "snow": "🌨️",
  "snow-showers": "🌨️",
  "thunderstorm": "⛈️",
  "thunderstorm-hail": "⛈️",
  "unknown": "❓",
};

function getIconEmoji(icon: string): string {
  return ICON_MAP[icon] || "❓";
}

export default function HourlyForecast() {
  const hours = useSignal<HourData[]>([]);
  const loading = useSignal(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchHourly() {
      try {
        const res = await fetch("/api/hourly");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            hours.value = data;
          }
        }
      } catch (e) {
        console.error("Failed to fetch hourly forecast:", e);
      } finally {
        loading.value = false;
      }
    }

    fetchHourly();
    // Refresh every 10 minutes
    const interval = setInterval(fetchHourly, 600000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to "now" item on load
  useEffect(() => {
    if (hours.value.length > 0 && scrollRef.current) {
      const nowItem = scrollRef.current.querySelector(".hour-item.now");
      if (nowItem) {
        nowItem.scrollIntoView({ behavior: "smooth", inline: "start" });
      }
    }
  }, [hours.value]);

  if (loading.value) {
    return (
      <div class="hourly-forecast">
        <div class="hourly-header">
          <span class="hourly-title">Hourly Forecast</span>
        </div>
        <div class="hourly-loading">Loading...</div>
      </div>
    );
  }

  if (hours.value.length === 0) {
    return null;
  }

  return (
    <div class="hourly-forecast">
      <div class="hourly-header">
        <span class="hourly-title">Hourly Forecast</span>
      </div>
      <div class="hourly-scroll" ref={scrollRef}>
        {hours.value.map((h, i) => (
          <div
            key={i}
            class={`hour-item ${h.isNow ? "now" : ""}`}
            title={h.conditions}
          >
            <span class="hour-time">{h.isNow ? "Now" : h.hour}</span>
            <span class="hour-icon">{getIconEmoji(h.icon)}</span>
            <span class="hour-temp">{h.temp}°</span>
            {h.precipChance > 0 && (
              <span class="hour-precip">
                <span class="drop">💧</span>
                {h.precipChance}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
