import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
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

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return "1m ago";
  if (minutes < 60) return `${minutes}m ago`;
  return ">1h ago";
}

export default function CurrentConditions() {
  const conditions = useSignal<Conditions | null>(null);
  const initialLoading = useSignal(true); // Only true on first load
  const error = useSignal<string | null>(null);
  const lastUpdate = useSignal<Date>(new Date());
  const prevTemp = useRef<number | null>(null);
  const tempAnimating = useSignal(false);
  const freshnessText = useSignal("Just now");
  const isRefreshing = useSignal(false); // Track background refresh

  // Update freshness text every 30 seconds
  useEffect(() => {
    const updateFreshness = () => {
      freshnessText.value = formatTimeAgo(lastUpdate.value);
    };
    updateFreshness();
    const interval = setInterval(updateFreshness, 30000);
    return () => clearInterval(interval);
  }, [lastUpdate.value]);

  useEffect(() => {
    let isInitial = true;

    async function fetchConditions() {
      // Only show refreshing indicator, never clear existing data
      if (!isInitial) {
        isRefreshing.value = true;
      }

      try {
        const response = await fetch("/api/weather");
        if (!response.ok) {
          throw new Error("Failed to fetch weather");
        }
        const data = await response.json();

        // Check if temperature changed for animation
        if (
          prevTemp.current !== null && data.temperature !== prevTemp.current
        ) {
          tempAnimating.value = true;
          setTimeout(() => tempAnimating.value = false, 400);
        }
        prevTemp.current = data.temperature;

        // Update data (no flash because we never cleared it)
        conditions.value = data;
        lastUpdate.value = new Date();
        error.value = null;
      } catch (e) {
        console.error("Weather fetch error:", e);
        // Only show error on initial load, keep showing old data on refresh fail
        if (isInitial) {
          error.value = "Unable to load weather";
        }
      } finally {
        initialLoading.value = false;
        isRefreshing.value = false;
        isInitial = false;
      }
    }

    fetchConditions();
    const interval = setInterval(fetchConditions, 60000);
    return () => clearInterval(interval);
  }, []);

  if (initialLoading.value) {
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
  const isStale = (new Date().getTime() - lastUpdate.value.getTime()) > 600000; // 10 minutes

  return (
    <div class="conditions">
      <div class="temperature-display">
        <span
          class={`temperature-value ${
            tempAnimating.value ? "value-updating" : ""
          }`}
        >
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

      {/* Data Freshness Indicator */}
      <div class={`data-freshness ${isStale ? "stale" : "fresh"}`}>
        <span>Updated {freshnessText.value}</span>
        {isStale && <span title="Data may be stale">⚠</span>}
      </div>
    </div>
  );
}
