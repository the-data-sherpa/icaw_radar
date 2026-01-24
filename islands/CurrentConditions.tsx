import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { WeatherIcon } from "@/components/WeatherIcon.tsx";

interface Conditions {
  temperature: number | null;
  temperatureUnit: string;
  feelsLike: number | null;
  conditions: string;
  windSpeed: number | null;
  windDirection: string;
  windGust: number | null;
  humidity: number | null;
  icon: string | null;
}

export default function CurrentConditions() {
  const conditions = useSignal<Conditions | null>(null);
  const loading = useSignal(true);
  const error = useSignal<string | null>(null);

  useEffect(() => {
    async function fetchConditions() {
      try {
        const response = await fetch("/api/weather");
        if (!response.ok) {
          throw new Error("Failed to fetch weather");
        }
        const data = await response.json();
        conditions.value = data;
        error.value = null;
      } catch (e) {
        console.error("Weather fetch error:", e);
        error.value = "Unable to load weather";
      } finally {
        loading.value = false;
      }
    }

    fetchConditions();
    const interval = setInterval(fetchConditions, 60000); // Poll every 60 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading.value) {
    return (
      <div class="conditions">
        <div class="loading">
          <div class="loading-spinner" />
          Loading...
        </div>
      </div>
    );
  }

  if (error.value || !conditions.value) {
    return (
      <div class="conditions">
        <div class="error">{error.value || "No data"}</div>
      </div>
    );
  }

  const c = conditions.value;

  return (
    <div class="conditions">
      <div class="temperature-display">
        <span class="temperature-value">
          {c.temperature !== null ? c.temperature : "--"}
        </span>
        <span class="temperature-unit">{c.temperatureUnit}</span>
        {c.feelsLike !== null && c.feelsLike !== c.temperature && (
          <div class="feels-like">
            Feels like {c.feelsLike}
            {c.temperatureUnit}
          </div>
        )}
      </div>

      <WeatherIcon icon={c.icon} conditions={c.conditions} />

      <div class="conditions-text">{c.conditions}</div>

      <div class="weather-details">
        <div class="weather-detail">
          <span class="label">Wind</span>
          <span class="value">
            {c.windSpeed !== null ? `${c.windDirection} ${c.windSpeed}` : "--"}
            {" "}
            mph
            {c.windGust !== null && ` G${c.windGust}`}
          </span>
        </div>
        <div class="weather-detail">
          <span class="label">Humidity</span>
          <span class="value">
            {c.humidity !== null ? `${c.humidity}%` : "--"}
          </span>
        </div>
      </div>
    </div>
  );
}
