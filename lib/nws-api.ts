import { stationCache, weatherCache } from "./cache.ts";

const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "ICAW-Radar/1.0 (weather@example.com)";

interface NWSStation {
  id: string;
  name: string;
  stationIdentifier: string;
}

interface NWSObservation {
  timestamp: string;
  textDescription: string;
  temperature: { value: number | null; unitCode: string };
  dewpoint: { value: number | null; unitCode: string };
  windDirection: { value: number | null; unitCode: string };
  windSpeed: { value: number | null; unitCode: string };
  windGust: { value: number | null; unitCode: string };
  barometricPressure: { value: number | null; unitCode: string };
  relativeHumidity: { value: number | null; unitCode: string };
  heatIndex: { value: number | null; unitCode: string };
  windChill: { value: number | null; unitCode: string };
  icon: string | null;
}

export interface CurrentConditions {
  temperature: number | null;
  temperatureUnit: string;
  feelsLike: number | null;
  conditions: string;
  windSpeed: number | null;
  windDirection: string;
  windGust: number | null;
  humidity: number | null;
  dewpoint: number | null;
  pressure: number | null;
  icon: string | null;
  stationName: string;
  observationTime: string;
}

async function fetchNWS(url: string): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/geo+json",
    },
  });

  if (!response.ok) {
    throw new Error(`NWS API error: ${response.status} ${response.statusText}`);
  }

  return response;
}

export async function findNearestStation(
  lat: number,
  lon: number,
): Promise<NWSStation | null> {
  const cacheKey = `station-${lat}-${lon}`;
  const cached = stationCache.get(cacheKey) as NWSStation | null;
  if (cached) {
    return cached;
  }

  try {
    // First, get the grid point
    const pointResponse = await fetchNWS(
      `${NWS_API_BASE}/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
    );
    const pointData = await pointResponse.json();

    // Get observation stations for this grid
    const stationsUrl = pointData.properties.observationStations;
    const stationsResponse = await fetchNWS(stationsUrl);
    const stationsData = await stationsResponse.json();

    if (stationsData.features && stationsData.features.length > 0) {
      const station: NWSStation = {
        id: stationsData.features[0].properties.stationIdentifier,
        name: stationsData.features[0].properties.name,
        stationIdentifier:
          stationsData.features[0].properties.stationIdentifier,
      };
      stationCache.set(cacheKey, station);
      return station;
    }

    return null;
  } catch (error) {
    console.error("Failed to find nearest station:", error);
    return null;
  }
}

function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

function metersPerSecondToMph(mps: number): number {
  return mps * 2.237;
}

function degreesToCardinal(degrees: number): string {
  const directions = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

export async function getCurrentConditions(
  lat: number,
  lon: number,
  temperatureUnit: "F" | "C" = "F",
): Promise<CurrentConditions | null> {
  const cacheKey = `conditions-${lat}-${lon}`;
  const cached = weatherCache.get(cacheKey) as CurrentConditions | null;
  if (cached) {
    return cached;
  }

  try {
    const station = await findNearestStation(lat, lon);
    if (!station) {
      return null;
    }

    const obsResponse = await fetchNWS(
      `${NWS_API_BASE}/stations/${station.id}/observations/latest`,
    );
    const obsData = await obsResponse.json();
    const obs: NWSObservation = obsData.properties;

    // Convert temperature
    let temperature: number | null = null;
    if (obs.temperature.value !== null) {
      temperature = temperatureUnit === "F"
        ? Math.round(celsiusToFahrenheit(obs.temperature.value))
        : Math.round(obs.temperature.value);
    }

    // Calculate feels like (heat index or wind chill)
    let feelsLike: number | null = null;
    if (obs.heatIndex.value !== null) {
      feelsLike = temperatureUnit === "F"
        ? Math.round(celsiusToFahrenheit(obs.heatIndex.value))
        : Math.round(obs.heatIndex.value);
    } else if (obs.windChill.value !== null) {
      feelsLike = temperatureUnit === "F"
        ? Math.round(celsiusToFahrenheit(obs.windChill.value))
        : Math.round(obs.windChill.value);
    }

    // Convert wind speed
    let windSpeed: number | null = null;
    if (obs.windSpeed.value !== null) {
      windSpeed = Math.round(metersPerSecondToMph(obs.windSpeed.value));
    }

    let windGust: number | null = null;
    if (obs.windGust.value !== null) {
      windGust = Math.round(metersPerSecondToMph(obs.windGust.value));
    }

    // Convert wind direction
    const windDirection = obs.windDirection.value !== null
      ? degreesToCardinal(obs.windDirection.value)
      : "Calm";

    const conditions: CurrentConditions = {
      temperature,
      temperatureUnit: temperatureUnit === "F" ? "°F" : "°C",
      feelsLike,
      conditions: obs.textDescription || "Unknown",
      windSpeed,
      windDirection,
      windGust,
      humidity: obs.relativeHumidity.value !== null
        ? Math.round(obs.relativeHumidity.value)
        : null,
      dewpoint: obs.dewpoint.value !== null
        ? temperatureUnit === "F"
          ? Math.round(celsiusToFahrenheit(obs.dewpoint.value))
          : Math.round(obs.dewpoint.value)
        : null,
      pressure: obs.barometricPressure.value !== null
        ? Math.round(obs.barometricPressure.value / 100) // Convert Pa to hPa
        : null,
      icon: obs.icon,
      stationName: station.name,
      observationTime: obs.timestamp,
    };

    weatherCache.set(cacheKey, conditions, 300); // Cache for 5 minutes
    return conditions;
  } catch (error) {
    console.error("Failed to get current conditions:", error);
    return null;
  }
}

export async function getActiveAlerts(
  lat: number,
  lon: number,
): Promise<string[]> {
  const cacheKey = `alerts-${lat}-${lon}`;
  // Simple in-memory cache for alerts (5 minutes)
  const cached = weatherCache.get(cacheKey) as
    | { alerts: string[]; time: number }
    | undefined;
  const now = Date.now();

  if (cached && cached.time && (now - cached.time < 300000)) {
    return cached.alerts;
  }

  try {
    const response = await fetchNWS(
      `${NWS_API_BASE}/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`,
    );
    const data = await response.json();

    if (data.features && data.features.length > 0) {
      // deno-lint-ignore no-explicit-any
      const alerts = data.features.map((f: any) => f.properties.headline);
      weatherCache.set(cacheKey, { alerts, time: now });
      return alerts;
    }

    return [];
  } catch (error) {
    console.error("Failed to fetch alerts:", error);
    return [];
  }
}
