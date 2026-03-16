import { alertCache } from "./cache.ts";
import { getAlertColor, isEmergencyAlert, WATCH_EVENTS } from "./alert-service.ts";

const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "ICAW-Radar/1.0 (weather@example.com)";

/** Geometry types that MapLibre fill/line layers can render. */
const SUPPORTED_GEOMETRY_TYPES = new Set(["Polygon", "MultiPolygon"]);

/**
 * Normalizes a GeoJSON geometry to a Polygon or MultiPolygon.
 * Extracts polygon members from GeometryCollections; returns null for unsupported types.
 */
// deno-lint-ignore no-explicit-any
function normalizeGeometry(geometry: any): any | null {
  if (!geometry) return null;

  if (SUPPORTED_GEOMETRY_TYPES.has(geometry.type)) {
    return geometry;
  }

  if (geometry.type === "GeometryCollection" && Array.isArray(geometry.geometries)) {
    const polygons = geometry.geometries.filter(
      // deno-lint-ignore no-explicit-any
      (g: any) => SUPPORTED_GEOMETRY_TYPES.has(g.type),
    );
    if (polygons.length === 0) return null;
    if (polygons.length === 1) return polygons[0];
    // Merge into a single MultiPolygon
    const coordinates = polygons.flatMap(
      // deno-lint-ignore no-explicit-any
      (g: any) => g.type === "Polygon" ? [g.coordinates] : g.coordinates,
    );
    return { type: "MultiPolygon", coordinates };
  }

  return null;
}

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

    // Filter to features with renderable polygon geometry, map to slim properties
    const features = (data.features || [])
      // deno-lint-ignore no-explicit-any
      .reduce((acc: any[], feature: any) => {
        const geometry = normalizeGeometry(feature.geometry);
        if (!geometry) return acc;

        const props = feature.properties;
        const event: string = props.event || "Unknown";
        const headline: string = props.headline || event;

        acc.push({
          type: "Feature" as const,
          geometry,
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
        });
        return acc;
      }, []);

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
