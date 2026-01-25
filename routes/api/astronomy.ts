import { loadConfig } from "@/lib/config-loader.ts";

interface MoonPhaseData {
  phase: string;
  illumination: number;
  emoji: string;
}

interface AstronomyResponse {
  sunrise: string;
  sunset: string;
  sunriseHour: number;
  sunsetHour: number;
  moonPhase: string;
  moonEmoji: string;
  moonIllumination: number;
  isDaytime: boolean;
  sunProgress: number;
  solarNoon: string;
  dayLength: string;
}

/**
 * Calculate moon phase based on synodic month
 * Uses a known new moon date as reference
 */
function getMoonPhase(date: Date): MoonPhaseData {
  const synodicMonth = 29.53058867;
  const msPerDay = 24 * 60 * 60 * 1000;
  const knownNewMoon = new Date("2000-01-06T18:14:00Z");
  const days = (date.getTime() - knownNewMoon.getTime()) / msPerDay;
  const phaseRatio = ((days % synodicMonth) + synodicMonth) % synodicMonth /
    synodicMonth;

  // Calculate illumination as a smooth curve (0 at new, 100 at full)
  const illumination = Math.round(
    (1 - Math.cos(phaseRatio * 2 * Math.PI)) / 2 * 100,
  );

  if (phaseRatio < 0.0625) {
    return { phase: "New Moon", illumination, emoji: "\u{1F311}" };
  }
  if (phaseRatio < 0.1875) {
    return { phase: "Waxing Crescent", illumination, emoji: "\u{1F312}" };
  }
  if (phaseRatio < 0.3125) {
    return { phase: "First Quarter", illumination, emoji: "\u{1F313}" };
  }
  if (phaseRatio < 0.4375) {
    return { phase: "Waxing Gibbous", illumination, emoji: "\u{1F314}" };
  }
  if (phaseRatio < 0.5625) {
    return { phase: "Full Moon", illumination, emoji: "\u{1F315}" };
  }
  if (phaseRatio < 0.6875) {
    return { phase: "Waning Gibbous", illumination, emoji: "\u{1F316}" };
  }
  if (phaseRatio < 0.8125) {
    return { phase: "Last Quarter", illumination, emoji: "\u{1F317}" };
  }
  if (phaseRatio < 0.9375) {
    return { phase: "Waning Crescent", illumination, emoji: "\u{1F318}" };
  }
  return { phase: "New Moon", illumination, emoji: "\u{1F311}" };
}

/**
 * Format time string from ISO date
 */
function formatTime(isoDate: string): string {
  const date = new Date(isoDate);
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes} ${ampm}`;
}

/**
 * Calculate sun progress between sunrise and sunset
 */
function calculateSunProgress(
  now: Date,
  sunriseTime: Date,
  sunsetTime: Date,
): number {
  const currentMs = now.getTime();
  const sunriseMs = sunriseTime.getTime();
  const sunsetMs = sunsetTime.getTime();

  if (currentMs < sunriseMs) {
    return 0;
  }
  if (currentMs > sunsetMs) {
    return 100;
  }

  const progress = ((currentMs - sunriseMs) / (sunsetMs - sunriseMs)) * 100;
  return Math.round(progress);
}

/**
 * Calculate day length from sunrise/sunset
 */
function calculateDayLength(sunrise: Date, sunset: Date): string {
  const diffMs = sunset.getTime() - sunrise.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
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

    // Fetch from Open-Meteo API
    const apiUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=sunrise,sunset&timezone=auto&forecast_days=1`;

    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`Open-Meteo API error: ${response.status}`);
    }

    const data = await response.json();

    const now = new Date();
    const sunriseIso = data.daily?.sunrise?.[0];
    const sunsetIso = data.daily?.sunset?.[0];

    if (!sunriseIso || !sunsetIso) {
      throw new Error("Missing sunrise/sunset data from API");
    }

    const sunriseTime = new Date(sunriseIso);
    const sunsetTime = new Date(sunsetIso);

    // Calculate solar noon (midpoint between sunrise and sunset)
    const solarNoonMs = sunriseTime.getTime() +
      (sunsetTime.getTime() - sunriseTime.getTime()) / 2;
    const solarNoonTime = new Date(solarNoonMs);

    // Calculate moon phase
    const moonData = getMoonPhase(now);

    // Calculate if daytime
    const isDaytime = now.getTime() >= sunriseTime.getTime() &&
      now.getTime() <= sunsetTime.getTime();

    // Calculate sun progress
    const sunProgress = calculateSunProgress(now, sunriseTime, sunsetTime);

    // Calculate sunrise/sunset hours as decimal values for theme system
    const sunriseHour = sunriseTime.getHours() + sunriseTime.getMinutes() / 60;
    const sunsetHour = sunsetTime.getHours() + sunsetTime.getMinutes() / 60;

    const result: AstronomyResponse = {
      sunrise: formatTime(sunriseIso),
      sunset: formatTime(sunsetIso),
      sunriseHour,
      sunsetHour,
      moonPhase: moonData.phase,
      moonEmoji: moonData.emoji,
      moonIllumination: moonData.illumination,
      isDaytime,
      sunProgress,
      solarNoon: formatTime(solarNoonTime.toISOString()),
      dayLength: calculateDayLength(sunriseTime, sunsetTime),
    };

    return new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300", // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error("Astronomy API error:", error);
    return new Response(
      JSON.stringify({ error: "Unable to fetch astronomy data" }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
