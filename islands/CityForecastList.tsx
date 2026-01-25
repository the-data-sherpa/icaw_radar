import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";

interface CityWeather {
  name: string;
  lat: number;
  lon: number;
  temp: number | string;
  unit: string;
  icon: string | null;
  conditions: string;
}

interface HourData {
  hour: string;
  temp: number;
  precipChance: number;
  icon: string;
  conditions: string;
  isNow: boolean;
}

const CITIES = [
  { name: "Statesville", lat: 35.7826, lon: -80.8873 },
  { name: "Mooresville", lat: 35.5849, lon: -80.8101 },
  { name: "Troutman", lat: 35.7007, lon: -80.8881 },
  { name: "Harmony", lat: 35.9570, lon: -80.7710 },
  { name: "Love Valley", lat: 35.9899, lon: -80.9881 },
];

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
  return ICON_MAP[icon] || "\u2753";
}

export default function CityForecastList() {
  const forecasts = useSignal<CityWeather[]>([]);
  const loading = useSignal(true);
  const selectedCity = useSignal<CityWeather | null>(null);
  const hourlyData = useSignal<HourData[]>([]);
  const hourlyLoading = useSignal(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchForecasts() {
      loading.value = true;
      const results: CityWeather[] = [];

      for (const city of CITIES) {
        try {
          const res = await fetch(
            `/api/weather?lat=${city.lat}&lon=${city.lon}`,
          );
          if (res.ok) {
            const data = await res.json();
            results.push({
              name: city.name,
              lat: city.lat,
              lon: city.lon,
              temp: data.temperature,
              unit: data.temperatureUnit,
              icon: data.icon,
              conditions: data.conditions,
            });
          } else {
            results.push({
              name: city.name,
              lat: city.lat,
              lon: city.lon,
              temp: "--",
              unit: "",
              icon: null,
              conditions: "Error",
            });
          }
        } catch (e) {
          console.error(`Failed to fetch for ${city.name}`, e);
          results.push({
            name: city.name,
            lat: city.lat,
            lon: city.lon,
            temp: "--",
            unit: "",
            icon: null,
            conditions: "Error",
          });
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      forecasts.value = results;
      loading.value = false;
    }

    fetchForecasts();
    const interval = setInterval(fetchForecasts, 300000);
    return () => clearInterval(interval);
  }, []);

  // Fetch hourly data when city is selected
  useEffect(() => {
    if (!selectedCity.value) {
      hourlyData.value = [];
      return;
    }

    async function fetchHourly() {
      hourlyLoading.value = true;
      try {
        const { lat, lon } = selectedCity.value!;
        const res = await fetch(`/api/hourly?lat=${lat}&lon=${lon}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            hourlyData.value = data;
          }
        }
      } catch (e) {
        console.error("Failed to fetch hourly:", e);
        hourlyData.value = [];
      } finally {
        hourlyLoading.value = false;
      }
    }

    fetchHourly();
  }, [selectedCity.value]);

  // Scroll to "Now" when hourly data loads
  useEffect(() => {
    if (hourlyData.value.length > 0 && scrollRef.current) {
      const nowItem = scrollRef.current.querySelector(".city-hourly-item.now");
      if (nowItem) {
        nowItem.scrollIntoView({ behavior: "smooth", inline: "start" });
      }
    }
  }, [hourlyData.value]);

  function handleCityClick(city: CityWeather) {
    if (selectedCity.value?.name === city.name) {
      // Toggle off if same city clicked
      selectedCity.value = null;
    } else {
      selectedCity.value = city;
    }
  }

  function handleClose() {
    selectedCity.value = null;
  }

  if (loading.value && forecasts.value.length === 0) {
    return <div class="city-list-loading">Loading forecasts...</div>;
  }

  return (
    <div class="city-forecast-list">
      <h3 class="city-list-header">Iredell Outlook</h3>
      <div class="city-list-items">
        {forecasts.value.map((city) => (
          <div
            key={city.name}
            class={`city-item ${selectedCity.value?.name === city.name ? "selected" : ""}`}
            onClick={() => handleCityClick(city)}
          >
            <div class="city-name">{city.name}</div>
            <div class="city-temp">
              {city.temp}
              {city.unit}
            </div>
            {city.icon && (
              <img src={city.icon} alt={city.conditions} class="city-icon" />
            )}
          </div>
        ))}
      </div>

      {/* Slide-out Hourly Panel */}
      <div class={`city-hourly-panel ${selectedCity.value ? "open" : ""}`}>
        {selectedCity.value && (
          <>
            <div class="city-hourly-header">
              <span class="city-hourly-title">{selectedCity.value.name} Hourly</span>
              <button
                type="button"
                class="city-hourly-close"
                onClick={handleClose}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            {hourlyLoading.value ? (
              <div class="city-hourly-loading">Loading...</div>
            ) : (
              <div class="city-hourly-scroll" ref={scrollRef}>
                {hourlyData.value.map((h, i) => {
                  // Detect day transition (12 AM = midnight = new day)
                  const showDaySeparator = i > 0 && h.hour === "12 AM";
                  const today = new Date();
                  const tomorrow = new Date(today);
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  const dayLabel = tomorrow.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  });

                  return (
                    <>
                      {showDaySeparator && (
                        <div class="city-hourly-day-separator tomorrow">
                          Tomorrow — {dayLabel}
                        </div>
                      )}
                      <div
                        key={i}
                        class={`city-hourly-item ${h.isNow ? "now" : ""}`}
                        title={h.conditions}
                      >
                        <span class="city-hourly-time">{h.isNow ? "Now" : h.hour}</span>
                        <span class="city-hourly-icon">{getIconEmoji(h.icon)}</span>
                        <span class="city-hourly-temp">{h.temp}&deg;</span>
                        {h.precipChance > 0 && (
                          <span class="city-hourly-precip">
                            <span class="drop">💧</span>
                            {h.precipChance}%
                          </span>
                        )}
                      </div>
                    </>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
