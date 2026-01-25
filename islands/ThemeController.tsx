/**
 * ThemeController Island
 * Automatically manages day/night theme transitions based on time of day
 * Uses sunrise/sunset data from the astronomy API
 */

import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import {
  applyTheme,
  calculateSunTimes,
  getDayOfYear,
  getThemeForTime,
  type ThemeMode,
} from "@/lib/theme-manager.ts";

interface ThemeControllerProps {
  latitude: number;
  longitude: number;
  showIndicator?: boolean;
}

interface AstronomyData {
  sunrise: string;
  sunset: string;
  sunriseHour: number;
  sunsetHour: number;
}

export default function ThemeController({
  latitude,
  longitude,
  showIndicator = false,
}: ThemeControllerProps) {
  const currentMode = useSignal<ThemeMode>("night");
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
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

      // Only update if mode changed
      if (mode !== currentMode.value) {
        currentMode.value = mode;
        applyTheme(mode);
      }
    }

    // Initial update
    updateTheme();

    // Update every 5 minutes
    intervalRef.current = setInterval(updateTheme, 300000) as unknown as number;

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [latitude, longitude]);

  // Indicator component for debugging/display
  if (!showIndicator) {
    return null;
  }

  const modeEmoji = currentMode.value === "golden"
    ? "\u{1F305}" // sunrise/sunset emoji
    : currentMode.value === "day"
    ? "\u{2600}\u{FE0F}" // sun emoji
    : "\u{1F319}"; // crescent moon emoji

  return (
    <div
      class="theme-indicator"
      title={`Current theme: ${currentMode.value}`}
      style={{
        position: "fixed",
        top: "8px",
        left: "8px",
        fontSize: "18px",
        zIndex: 9999,
        opacity: 0.7,
        transition: "opacity 0.3s ease",
        cursor: "default",
      }}
    >
      {modeEmoji}
    </div>
  );
}
