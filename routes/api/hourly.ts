import { loadConfig } from "@/lib/config-loader.ts";

// Weather code to icon/conditions mapping (WMO codes used by Open-Meteo)
const WEATHER_CODES: Record<number, { icon: string; conditions: string }> = {
  0: { icon: "clear", conditions: "Clear" },
  1: { icon: "mostly-clear", conditions: "Mostly Clear" },
  2: { icon: "partly-cloudy", conditions: "Partly Cloudy" },
  3: { icon: "overcast", conditions: "Overcast" },
  45: { icon: "fog", conditions: "Fog" },
  48: { icon: "fog", conditions: "Rime Fog" },
  51: { icon: "drizzle", conditions: "Light Drizzle" },
  53: { icon: "drizzle", conditions: "Drizzle" },
  55: { icon: "drizzle", conditions: "Heavy Drizzle" },
  56: { icon: "freezing-drizzle", conditions: "Freezing Drizzle" },
  57: { icon: "freezing-drizzle", conditions: "Heavy Freezing Drizzle" },
  61: { icon: "rain", conditions: "Light Rain" },
  63: { icon: "rain", conditions: "Rain" },
  65: { icon: "rain", conditions: "Heavy Rain" },
  66: { icon: "freezing-rain", conditions: "Freezing Rain" },
  67: { icon: "freezing-rain", conditions: "Heavy Freezing Rain" },
  71: { icon: "snow", conditions: "Light Snow" },
  73: { icon: "snow", conditions: "Snow" },
  75: { icon: "snow", conditions: "Heavy Snow" },
  77: { icon: "snow", conditions: "Snow Grains" },
  80: { icon: "showers", conditions: "Light Showers" },
  81: { icon: "showers", conditions: "Showers" },
  82: { icon: "showers", conditions: "Heavy Showers" },
  85: { icon: "snow-showers", conditions: "Light Snow Showers" },
  86: { icon: "snow-showers", conditions: "Snow Showers" },
  95: { icon: "thunderstorm", conditions: "Thunderstorm" },
  96: { icon: "thunderstorm-hail", conditions: "Thunderstorm with Hail" },
  99: { icon: "thunderstorm-hail", conditions: "Heavy Thunderstorm with Hail" },
};

function getWeatherInfo(code: number): { icon: string; conditions: string } {
  return WEATHER_CODES[code] || { icon: "unknown", conditions: "Unknown" };
}

function formatHour(isoString: string): string {
  const date = new Date(isoString);
  const hours = date.getHours();
  if (hours === 0) return "12 AM";
  if (hours === 12) return "12 PM";
  if (hours < 12) return `${hours} AM`;
  return `${hours - 12} PM`;
}

interface HourlyData {
  hour: string;
  temp: number;
  precipChance: number;
  icon: string;
  conditions: string;
  isNow: boolean;
}

export async function handler(req: Request): Promise<Response> {
  try {
    const config = await loadConfig();
    const url = new URL(req.url);
    const lat = url.searchParams.get("lat")
      ? parseFloat(url.searchParams.get("lat")!)
      : config.location.latitude;
    const lon = url.searchParams.get("lon")
      ? parseFloat(url.searchParams.get("lon")!)
      : config.location.longitude;

    // Fetch hourly forecast from Open-Meteo
    const apiUrl = new URL("https://api.open-meteo.com/v1/forecast");
    apiUrl.searchParams.set("latitude", lat.toString());
    apiUrl.searchParams.set("longitude", lon.toString());
    apiUrl.searchParams.set(
      "hourly",
      "temperature_2m,precipitation_probability,weather_code",
    );
    apiUrl.searchParams.set("temperature_unit", "fahrenheit");
    apiUrl.searchParams.set("timezone", "America/New_York");
    apiUrl.searchParams.set("forecast_days", "2");

    const response = await fetch(apiUrl.toString());
    if (!response.ok) {
      throw new Error(`Open-Meteo API error: ${response.status}`);
    }

    const data = await response.json();
    const { hourly } = data;

    if (!hourly || !hourly.time || !hourly.temperature_2m) {
      throw new Error("Invalid API response format");
    }

    // Find current hour index
    const now = new Date();
    const currentHourStr = now.toISOString().slice(0, 13); // "2024-01-25T14"
    let startIndex = hourly.time.findIndex((t: string) =>
      t.startsWith(currentHourStr)
    );

    // If exact match not found, find closest hour
    if (startIndex === -1) {
      startIndex = hourly.time.findIndex((t: string) => new Date(t) >= now);
      if (startIndex === -1) startIndex = 0;
    }

    // Get next 24 hours
    const hourlyData: HourlyData[] = [];
    for (
      let i = startIndex;
      i < Math.min(startIndex + 24, hourly.time.length);
      i++
    ) {
      const weatherInfo = getWeatherInfo(hourly.weather_code[i]);
      hourlyData.push({
        hour: formatHour(hourly.time[i]),
        temp: Math.round(hourly.temperature_2m[i]),
        precipChance: hourly.precipitation_probability[i] || 0,
        icon: weatherInfo.icon,
        conditions: weatherInfo.conditions,
        isNow: i === startIndex,
      });
    }

    return new Response(JSON.stringify(hourlyData), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300", // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error("Hourly forecast API error:", error);
    return new Response(
      JSON.stringify({ error: "Unable to fetch hourly forecast" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
