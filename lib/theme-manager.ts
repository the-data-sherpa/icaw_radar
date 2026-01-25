/**
 * Theme Manager - Day/Night Auto-Theme System
 * Automatically shifts UI colors based on time of day:
 * - Warmer tones during golden hour
 * - Cooler at night
 * - Bright during day
 */

export type ThemeMode = "day" | "golden" | "night";

interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accentBlue: string;
  accentGreen: string;
  borderColor: string;
}

const THEMES: Record<ThemeMode, ThemeColors> = {
  day: {
    bgPrimary: "#1a1a2e",
    bgSecondary: "#16213e",
    bgTertiary: "#1f2b4d",
    textPrimary: "#ffffff",
    textSecondary: "#b8c5d9",
    textMuted: "#8899b3",
    accentBlue: "#00aaff",
    accentGreen: "#00ff88",
    borderColor: "#2a3a5e",
  },
  golden: {
    bgPrimary: "#1a1510",
    bgSecondary: "#231c14",
    bgTertiary: "#2d241a",
    textPrimary: "#fff8f0",
    textSecondary: "#d9c4a9",
    textMuted: "#a08060",
    accentBlue: "#ffaa00",
    accentGreen: "#ffcc44",
    borderColor: "#3d3020",
  },
  night: {
    bgPrimary: "#0a0a0a",
    bgSecondary: "#141414",
    bgTertiary: "#1e1e1e",
    textPrimary: "#ffffff",
    textSecondary: "#b0b0b0",
    textMuted: "#707070",
    accentBlue: "#00aaff",
    accentGreen: "#00ff88",
    borderColor: "#2a2a2a",
  },
};

/**
 * Parse a time string like "6:30 AM" or "7:45 PM" to decimal hours
 */
export function parseTimeToHours(timeStr: string): number {
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) {
    return 12; // Default to noon if parsing fails
  }

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();

  if (period === "PM" && hours !== 12) {
    hours += 12;
  } else if (period === "AM" && hours === 12) {
    hours = 0;
  }

  return hours + minutes / 60;
}

/**
 * Determine the theme mode based on current time and sunrise/sunset
 * Golden hour: ~30 min before to 1 hour after sunrise, 1 hour before to 30 min after sunset
 */
export function getThemeForTime(
  hour: number,
  sunrise: number,
  sunset: number,
): ThemeMode {
  // Golden hour windows
  const sunriseStart = sunrise - 0.5;
  const sunriseEnd = sunrise + 1;
  const sunsetStart = sunset - 1;
  const sunsetEnd = sunset + 0.5;

  // Check golden hour first (sunrise and sunset periods)
  if (hour >= sunriseStart && hour <= sunriseEnd) {
    return "golden";
  }
  if (hour >= sunsetStart && hour <= sunsetEnd) {
    return "golden";
  }

  // Day time: after sunrise golden hour ends, before sunset golden hour starts
  if (hour > sunriseEnd && hour < sunsetStart) {
    return "day";
  }

  // Night time: after sunset golden hour ends or before sunrise golden hour starts
  return "night";
}

/**
 * Apply theme colors to CSS custom properties with smooth transition
 */
export function applyTheme(mode: ThemeMode): void {
  if (typeof document === "undefined") return;

  const theme = THEMES[mode];
  const root = document.documentElement;

  // Enable smooth transition for theme changes
  root.style.setProperty("--theme-transition", "all 0.5s ease");

  // Apply all theme colors
  root.style.setProperty("--bg-primary", theme.bgPrimary);
  root.style.setProperty("--bg-secondary", theme.bgSecondary);
  root.style.setProperty("--bg-tertiary", theme.bgTertiary);
  root.style.setProperty("--text-primary", theme.textPrimary);
  root.style.setProperty("--text-secondary", theme.textSecondary);
  root.style.setProperty("--text-muted", theme.textMuted);
  root.style.setProperty("--accent-blue", theme.accentBlue);
  root.style.setProperty("--accent-green", theme.accentGreen);
  root.style.setProperty("--border-color", theme.borderColor);

  // Update body class for theme-specific CSS overrides
  document.body.classList.remove("theme-day", "theme-golden", "theme-night");
  document.body.classList.add(`theme-${mode}`);
}

/**
 * Get the current theme colors object
 */
export function getThemeColors(mode: ThemeMode): ThemeColors {
  return THEMES[mode];
}

/**
 * Calculate sunrise/sunset times using a simple solar calculation
 * This is a fallback when API is unavailable
 */
export function calculateSunTimes(
  latitude: number,
  dayOfYear: number,
): { sunrise: number; sunset: number } {
  // Simple sunrise/sunset calculation
  // This is an approximation that works reasonably well for most latitudes
  const latRad = (latitude * Math.PI) / 180;

  // Solar declination (approximate)
  const declination = (23.45 * Math.PI) / 180 *
    Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365);

  // Hour angle at sunrise/sunset
  const cosHourAngle = -Math.tan(latRad) * Math.tan(declination);

  // Clamp to valid range (handles polar day/night)
  const clampedCos = Math.max(-1, Math.min(1, cosHourAngle));
  const hourAngle = Math.acos(clampedCos);

  // Convert to hours from solar noon (12:00)
  const hoursFromNoon = (hourAngle * 180) / Math.PI / 15;

  const sunrise = 12 - hoursFromNoon;
  const sunset = 12 + hoursFromNoon;

  return { sunrise, sunset };
}

/**
 * Get the day of year (1-365)
 */
export function getDayOfYear(date: Date = new Date()): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

export interface AstronomyData {
  sunrise: string;
  sunset: string;
  sunriseHour: number;
  sunsetHour: number;
  dayLength: string;
}

/**
 * Initialize the auto-theme system
 * Fetches astronomy data and updates theme based on time of day
 * Returns an interval ID for cleanup
 */
export function initAutoTheme(
  latitude: number,
  _longitude: number,
): number | null {
  if (typeof window === "undefined") return null;

  let currentMode: ThemeMode | null = null;

  async function updateTheme() {
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;

    let sunrise: number;
    let sunset: number;

    try {
      const res = await fetch("/api/astronomy");
      if (res.ok) {
        const data: AstronomyData = await res.json();
        sunrise = data.sunriseHour;
        sunset = data.sunsetHour;
      } else {
        throw new Error("API unavailable");
      }
    } catch {
      // Fallback to calculated times
      const dayOfYear = getDayOfYear(now);
      const times = calculateSunTimes(latitude, dayOfYear);
      sunrise = times.sunrise;
      sunset = times.sunset;
    }

    const mode = getThemeForTime(hour, sunrise, sunset);

    // Only apply if mode changed (prevents unnecessary DOM updates)
    if (mode !== currentMode) {
      currentMode = mode;
      applyTheme(mode);
      console.log(
        `Theme changed to: ${mode} (hour: ${hour.toFixed(2)}, sunrise: ${
          sunrise.toFixed(2)
        }, sunset: ${sunset.toFixed(2)})`,
      );
    }
  }

  // Initial update
  updateTheme();

  // Update every 5 minutes (300000ms)
  const intervalId = setInterval(updateTheme, 300000) as unknown as number;

  return intervalId;
}
