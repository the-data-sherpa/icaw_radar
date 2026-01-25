import { useComputed, useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

interface HourlyData {
  time: string;
  temperature: number;
  icon: string;
  precipitation: number;
  windSpeed: number;
  windDir: string;
}

interface HourlyForecastProps {
  visible: boolean;
}

export function HourlyForecast({ visible }: HourlyForecastProps) {
  const hourlyData = useSignal<HourlyData[]>([]);
  const loading = useSignal(true);
  const error = useSignal<string | null>(null);

  useEffect(() => {
    if (!visible) return;

    async function fetchHourly() {
      try {
        loading.value = true;
        const response = await fetch("/api/weather/hourly");
        if (!response.ok) throw new Error("Failed to fetch hourly data");
        const data = await response.json();
        hourlyData.value = data.hourly || [];
        error.value = null;
      } catch (e) {
        console.error("Failed to fetch hourly forecast:", e);
        error.value = "Unable to load forecast";
      } finally {
        loading.value = false;
      }
    }

    fetchHourly();
    const interval = setInterval(fetchHourly, 600000); // 10 minutes
    return () => clearInterval(interval);
  }, [visible]);

  const displayHours = useComputed(() => hourlyData.value.slice(0, 12));

  if (!visible) return null;

  if (loading.value) {
    return (
      <div class="hourly-forecast loading">
        <div class="loading-spinner" />
        <span>Loading forecast...</span>
      </div>
    );
  }

  if (error.value) {
    return (
      <div class="hourly-forecast error">
        <span>{error.value}</span>
      </div>
    );
  }

  return (
    <div class="hourly-forecast">
      <div class="hourly-scroll">
        {displayHours.value.map((hour, idx) => (
          <div key={idx} class="hourly-item">
            <div class="hour-time">{formatHour(hour.time)}</div>
            <div class="hour-icon" aria-hidden="true">
              {getWeatherEmoji(hour.icon)}
            </div>
            <div class="hour-temp">{Math.round(hour.temperature)}°</div>
            {hour.precipitation > 0 && (
              <div class="hour-precip">
                <span class="precip-icon">\uD83D\uDCA7</span>
                <span>{hour.precipitation}%</span>
              </div>
            )}
            <div class="hour-wind">
              <span class="wind-speed">{hour.windSpeed}</span>
              <span class="wind-unit">mph</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatHour(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday && Math.abs(date.getTime() - now.getTime()) < 3600000) {
    return "Now";
  }

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    hour12: true,
  });
}

function getWeatherEmoji(icon: string): string {
  const iconMap: Record<string, string> = {
    "clear-day": "\u2600\uFE0F",
    "clear-night": "\uD83C\uDF19",
    "partly-cloudy-day": "\u26C5",
    "partly-cloudy-night": "\uD83C\uDF24\uFE0F",
    "cloudy": "\u2601\uFE0F",
    "rain": "\uD83C\uDF27\uFE0F",
    "snow": "\uD83C\uDF28\uFE0F",
    "sleet": "\uD83C\uDF28\uFE0F",
    "wind": "\uD83D\uDCA8",
    "fog": "\uD83C\uDF2B\uFE0F",
    "thunderstorm": "\u26C8\uFE0F",
  };
  return iconMap[icon] || "\u2601\uFE0F";
}
