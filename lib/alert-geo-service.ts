import { alertCache } from "./cache.ts";
import { getAlertColor, isEmergencyAlert, WATCH_EVENTS } from "./alert-service.ts";

const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "ICAW-Radar/1.0 (weather@example.com)";

/** GeoJSON Feature properties for alert polygons. */
export interface AlertGeoProperties {
  event: string;
  headline: string;
  color: string;
  isWatch: boolean;
  isEmergency: boolean;
  severity: string;
  expires: string;
  areaDesc: string;
}

/** Minimal GeoJSON FeatureCollection shape. */
interface FeatureCollection {
  type: "FeatureCollection";
  // deno-lint-ignore no-explicit-any
  features: any[];
}

/**
 * Fetches active NWS alerts for a state and returns a GeoJSON FeatureCollection
 * with polygon geometries. Features with null geometry are excluded.
 */
export async function getAlertGeoJSON(
  state: string,
): Promise<FeatureCollection> {
  const cacheKey = `alerts-geo-${state}`;
  const cached = alertCache.get(cacheKey) as FeatureCollection | null;
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(
      `${NWS_API_BASE}/alerts/active?area=${state}`,
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

    // Filter to features with actual polygon geometry, map to slim properties
    const features = (data.features || [])
      // deno-lint-ignore no-explicit-any
      .filter((f: any) => f.geometry !== null)
      // deno-lint-ignore no-explicit-any
      .map((feature: any) => {
        const props = feature.properties;
        const event: string = props.event || "Unknown";
        const headline: string = props.headline || event;

        return {
          type: "Feature" as const,
          geometry: feature.geometry,
          properties: {
            event,
            headline,
            color: getAlertColor(event),
            isWatch: WATCH_EVENTS.includes(event),
            isEmergency: isEmergencyAlert(event, headline),
            severity: props.severity || "Unknown",
            expires: props.expires || "",
            areaDesc: props.areaDesc || "",
          } satisfies AlertGeoProperties,
        };
      });

    const collection: FeatureCollection = {
      type: "FeatureCollection",
      features,
    };

    alertCache.set(cacheKey, collection, 30);
    return collection;
  } catch (error) {
    console.error("Failed to get alert GeoJSON:", error);
    return { type: "FeatureCollection", features: [] };
  }
}
