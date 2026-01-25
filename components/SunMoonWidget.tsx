import { useComputed, useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

interface SunMoonWidgetProps {
  latitude: number;
  longitude: number;
}

interface SunTimes {
  sunrise: Date;
  sunset: Date;
  solarNoon: Date;
}

// Calculate sun position using simplified algorithm
function calculateSunTimes(date: Date, lat: number, lng: number): SunTimes {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) /
      (1000 * 60 * 60 * 24),
  );

  // Solar declination
  const declination = 23.45 *
    Math.sin(((360 / 365) * (dayOfYear - 81) * Math.PI) / 180);

  // Hour angle for sunrise/sunset
  const latRad = (lat * Math.PI) / 180;
  const decRad = (declination * Math.PI) / 180;
  const cosHourAngle = -Math.tan(latRad) * Math.tan(decRad);

  // Clamp to valid range
  const clampedCosHA = Math.max(-1, Math.min(1, cosHourAngle));
  const hourAngle = (Math.acos(clampedCosHA) * 180) / Math.PI;

  // Convert to time
  const solarNoonMinutes = 720 - 4 * lng - date.getTimezoneOffset();
  const sunriseMinutes = solarNoonMinutes - (hourAngle * 4);
  const sunsetMinutes = solarNoonMinutes + (hourAngle * 4);

  const toDate = (minutes: number) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setMinutes(minutes);
    return d;
  };

  return {
    sunrise: toDate(sunriseMinutes),
    sunset: toDate(sunsetMinutes),
    solarNoon: toDate(solarNoonMinutes),
  };
}

// Get moon phase (0-1, where 0 and 1 are new moon, 0.5 is full moon)
function getMoonPhase(date: Date): number {
  const synodicMonth = 29.530588853;
  const knownNewMoon = new Date("2024-01-11T11:57:00Z").getTime();
  const diff = date.getTime() - knownNewMoon;
  const days = diff / (1000 * 60 * 60 * 24);
  return ((days % synodicMonth) + synodicMonth) % synodicMonth / synodicMonth;
}

function getMoonPhaseName(phase: number): string {
  if (phase < 0.0625 || phase >= 0.9375) return "New Moon";
  if (phase < 0.1875) return "Waxing Crescent";
  if (phase < 0.3125) return "First Quarter";
  if (phase < 0.4375) return "Waxing Gibbous";
  if (phase < 0.5625) return "Full Moon";
  if (phase < 0.6875) return "Waning Gibbous";
  if (phase < 0.8125) return "Last Quarter";
  return "Waning Crescent";
}

function getMoonEmoji(phase: number): string {
  if (phase < 0.0625 || phase >= 0.9375) return "\uD83C\uDF11";
  if (phase < 0.1875) return "\uD83C\uDF12";
  if (phase < 0.3125) return "\uD83C\uDF13";
  if (phase < 0.4375) return "\uD83C\uDF14";
  if (phase < 0.5625) return "\uD83C\uDF15";
  if (phase < 0.6875) return "\uD83C\uDF16";
  if (phase < 0.8125) return "\uD83C\uDF17";
  return "\uD83C\uDF18";
}

export function SunMoonWidget({ latitude, longitude }: SunMoonWidgetProps) {
  const now = useSignal(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      now.value = new Date();
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const sunTimes = useComputed(() =>
    calculateSunTimes(now.value, latitude, longitude)
  );
  const moonPhase = useComputed(() => getMoonPhase(now.value));
  const isDaytime = useComputed(() => {
    const current = now.value;
    return current >= sunTimes.value.sunrise && current < sunTimes.value.sunset;
  });

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const sunProgress = useComputed(() => {
    const current = now.value.getTime();
    const sunrise = sunTimes.value.sunrise.getTime();
    const sunset = sunTimes.value.sunset.getTime();

    if (current < sunrise) return 0;
    if (current > sunset) return 100;
    return ((current - sunrise) / (sunset - sunrise)) * 100;
  });

  return (
    <div class="sun-moon-widget">
      <div class="sun-section">
        <div class="sun-times">
          <div class="time-item">
            <span class="icon" aria-hidden="true">\u2600\uFE0F</span>
            <span class="label">Rise</span>
            <span class="value">{formatTime(sunTimes.value.sunrise)}</span>
          </div>
          <div class="time-item">
            <span class="icon" aria-hidden="true">\uD83C\uDF05</span>
            <span class="label">Set</span>
            <span class="value">{formatTime(sunTimes.value.sunset)}</span>
          </div>
        </div>
        {isDaytime.value && (
          <div class="sun-arc">
            <div class="sun-arc-track">
              <div
                class="sun-position"
                style={{ left: `${sunProgress.value}%` }}
                aria-label={`Sun at ${
                  Math.round(sunProgress.value)
                }% of daily arc`}
              >
                \u2600\uFE0F
              </div>
            </div>
          </div>
        )}
      </div>
      <div class="moon-section">
        <span class="moon-icon" aria-hidden="true">
          {getMoonEmoji(moonPhase.value)}
        </span>
        <span class="moon-phase">{getMoonPhaseName(moonPhase.value)}</span>
      </div>
    </div>
  );
}
