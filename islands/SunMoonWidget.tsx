import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

interface AstronomyData {
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

export default function SunMoonWidget() {
  const data = useSignal<AstronomyData | null>(null);
  const loading = useSignal(true);
  const error = useSignal<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/astronomy");
        if (!res.ok) {
          throw new Error("Failed to fetch astronomy data");
        }
        data.value = await res.json();
        error.value = null;
      } catch (e) {
        console.error("Astronomy fetch error:", e);
        // Don't clear existing data on refresh failure
        if (!data.value) {
          error.value = "Unable to load data";
        }
      } finally {
        loading.value = false;
      }
    }

    fetchData();
    // Refresh every minute to update sun position
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading.value) {
    return (
      <div class="sun-moon-widget">
        <div class="sun-moon-loading">
          <div class="loading-spinner" />
        </div>
      </div>
    );
  }

  if (error.value || !data.value) {
    return null; // Fail silently - not critical
  }

  const d = data.value;

  // Calculate sun position on the arc using quadratic bezier math
  // Arc: M 10 50 Q 60 -5 110 50
  // For bezier: P = (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
  const t = d.sunProgress / 100;
  const p0 = { x: 10, y: 50 };
  const p1 = { x: 60, y: -5 };
  const p2 = { x: 110, y: 50 };

  const sunX = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
  const sunY = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;

  return (
    <div class="sun-moon-widget">
      {/* Sun Arc Visualization */}
      <div class="sun-arc">
        <svg
          viewBox="0 0 120 55"
          class="sun-arc-svg"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Gradient definition for arc */}
          <defs>
            <linearGradient id="arcGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:#ff8c42;stop-opacity:0.4" />
              <stop offset="50%" style="stop-color:#ffd700;stop-opacity:0.6" />
              <stop offset="100%" style="stop-color:#ff6b6b;stop-opacity:0.4" />
            </linearGradient>
            <filter id="sunGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient
              id="moonGradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" style="stop-color:#e0e0e0" />
              <stop offset="100%" style="stop-color:#a0a0a0" />
            </linearGradient>
          </defs>

          {/* Horizon line */}
          <line
            x1="5"
            y1="50"
            x2="115"
            y2="50"
            stroke="rgba(255,255,255,0.15)"
            stroke-width="1"
          />

          {/* Arc path (dashed to show trajectory) */}
          <path
            d="M 10 50 Q 60 -5 110 50"
            fill="none"
            stroke="url(#arcGradient)"
            stroke-width="2"
            stroke-dasharray="4,3"
          />

          {/* Sun position indicator */}
          {d.isDaytime && (
            <g>
              {/* Sun rays (animated) */}
              <circle
                cx={sunX}
                cy={sunY}
                r="12"
                fill="#FFD700"
                opacity="0.3"
                class="sun-outer-glow"
              />
              {/* Sun body */}
              <circle
                cx={sunX}
                cy={sunY}
                r="7"
                fill="#FFD700"
                filter="url(#sunGlow)"
                class="sun-indicator"
              />
            </g>
          )}

          {/* Moon indicator (shown at night) */}
          {!d.isDaytime && (
            <g>
              <circle
                cx="60"
                cy="15"
                r="8"
                fill="url(#moonGradient)"
                class="moon-indicator"
              />
              {/* Moon shadow for phase effect */}
              <circle
                cx={60 + (d.moonIllumination < 50 ? 4 : -4)}
                cy="15"
                r="7"
                fill="rgba(10,10,10,0.8)"
                style={`opacity: ${Math.abs(50 - d.moonIllumination) / 50}`}
              />
            </g>
          )}

          {/* Sunrise marker */}
          <g class="sun-marker">
            <circle cx="10" cy="50" r="3" fill="#ff8c42" opacity="0.6" />
            <text
              x="10"
              y="53"
              class="sun-marker-emoji"
              text-anchor="middle"
              dominant-baseline="hanging"
            >
              {"\u{1F305}"}
            </text>
          </g>

          {/* Sunset marker */}
          <g class="sun-marker">
            <circle cx="110" cy="50" r="3" fill="#ff6b6b" opacity="0.6" />
            <text
              x="110"
              y="53"
              class="sun-marker-emoji"
              text-anchor="middle"
              dominant-baseline="hanging"
            >
              {"\u{1F307}"}
            </text>
          </g>
        </svg>
      </div>

      {/* Sun Times Row */}
      <div class="sun-times">
        <div class="sun-time-item">
          <span class="sun-time-label">Rise</span>
          <span class="sun-time-value">{d.sunrise}</span>
        </div>
        <div class="sun-time-item sun-time-center">
          <span class="sun-time-label">Day</span>
          <span class="sun-time-value">{d.dayLength}</span>
        </div>
        <div class="sun-time-item">
          <span class="sun-time-label">Set</span>
          <span class="sun-time-value">{d.sunset}</span>
        </div>
      </div>

      {/* Moon Display */}
      <div class="moon-display">
        <span class="moon-emoji">{d.moonEmoji}</span>
        <div class="moon-info">
          <span class="moon-phase-name">{d.moonPhase}</span>
          <div class="moon-illum-bar">
            <div
              class="moon-illum-fill"
              style={`width: ${d.moonIllumination}%`}
            />
          </div>
          <span class="moon-illum-text">{d.moonIllumination}% illuminated</span>
        </div>
      </div>
    </div>
  );
}
