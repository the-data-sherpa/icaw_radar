import { alertCache } from "./cache.ts";

const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "ICAW-Radar/1.0 (weather@example.com)";

export interface WeatherAlert {
  id: string;
  event: string;
  headline: string;
  description: string;
  severity: "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown";
  urgency: "Immediate" | "Expected" | "Future" | "Past" | "Unknown";
  certainty: "Observed" | "Likely" | "Possible" | "Unlikely" | "Unknown";
  onset: string;
  expires: string;
  senderName: string;
  areaDesc: string;
  color: string;
  isEmergency: boolean;
}

/** Alert severity colors for display. */
export const ALERT_COLORS: Record<string, string> = {
  // Tornado
  "Tornado Warning": "#FF0000",
  "Tornado Watch": "#FFFF00",
  "Tornado Emergency": "#FF0000",

  // Severe Thunderstorm
  "Severe Thunderstorm Warning": "#FFA500",
  "Severe Thunderstorm Watch": "#DB7093",

  // Flash Flood
  "Flash Flood Warning": "#8B0000",
  "Flash Flood Watch": "#2E8B57",
  "Flash Flood Emergency": "#8B0000",

  // Flood
  "Flood Warning": "#00FF00",
  "Flood Watch": "#2E8B57",

  // Winter
  "Winter Storm Warning": "#FF69B4",
  "Winter Storm Watch": "#4682B4",
  "Blizzard Warning": "#FF4500",
  "Ice Storm Warning": "#8B008B",
  "Winter Weather Advisory": "#7B68EE",

  // Wind
  "High Wind Warning": "#DAA520",
  "Wind Advisory": "#D2B48C",

  // Heat
  "Excessive Heat Warning": "#C71585",
  "Heat Advisory": "#FF7F50",

  // Default
  default: "#808080",
};

/** Events classified as watches (dashed outline, lighter fill). */
export const WATCH_EVENTS = [
  "Tornado Watch",
  "Severe Thunderstorm Watch",
  "Flash Flood Watch",
  "Flood Watch",
  "Winter Storm Watch",
];

/** Events that trigger full-screen overlay. */
const EMERGENCY_EVENTS = [
  "Tornado Warning",
  "Tornado Emergency",
  "Severe Thunderstorm Warning",
  "Flash Flood Emergency",
  "Particularly Dangerous Situation",
];

export function getAlertColor(event: string): string {
  return ALERT_COLORS[event] || ALERT_COLORS.default;
}

export function isEmergencyAlert(event: string, headline: string): boolean {
  if (EMERGENCY_EVENTS.some((e) => event.includes(e))) {
    return true;
  }
  // Check for PDS in headline
  if (headline.toLowerCase().includes("particularly dangerous situation")) {
    return true;
  }
  return false;
}

export async function getAlerts(
  lat: number,
  lon: number,
): Promise<WeatherAlert[]> {
  const cacheKey = `alerts-${lat}-${lon}`;
  const cached = alertCache.get(cacheKey) as WeatherAlert[] | null;
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(
      `${NWS_API_BASE}/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/geo+json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`NWS API error: ${response.status}`);
    }

    const data = await response.json();
    const alerts: WeatherAlert[] = (data.features || []).map(
      // deno-lint-ignore no-explicit-any
      (feature: any) => {
        const props = feature.properties;
        return {
          id: feature.id,
          event: props.event,
          headline: props.headline || props.event,
          description: props.description || "",
          severity: props.severity || "Unknown",
          urgency: props.urgency || "Unknown",
          certainty: props.certainty || "Unknown",
          onset: props.onset,
          expires: props.expires,
          senderName: props.senderName,
          areaDesc: props.areaDesc,
          color: getAlertColor(props.event),
          isEmergency: isEmergencyAlert(props.event, props.headline || ""),
        };
      },
    );

    // Sort by severity (emergencies first)
    alerts.sort((a, b) => {
      if (a.isEmergency && !b.isEmergency) return -1;
      if (!a.isEmergency && b.isEmergency) return 1;
      return 0;
    });

    alertCache.set(cacheKey, alerts, 30); // Cache for 30 seconds
    return alerts;
  } catch (error) {
    console.error("Failed to get alerts:", error);
    return [];
  }
}

export function formatAlertForTicker(alert: WeatherAlert): string {
  return `${alert.event.toUpperCase()} - ${alert.areaDesc}`;
}
