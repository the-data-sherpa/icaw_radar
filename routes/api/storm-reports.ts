import { loadConfig } from "@/lib/config-loader.ts";

interface StormReport {
  type: "tornado" | "hail" | "wind" | "flood" | "other";
  lat: number;
  lon: number;
  time: string;
  magnitude: string | null;
  remarks: string;
  city: string | null;
  county: string | null;
  state: string | null;
}

interface LSRFeature {
  type: "Feature";
  properties: {
    valid: string;
    type: string;
    magnitude: string | null;
    city: string | null;
    county: string | null;
    state: string | null;
    remark: string | null;
    source: string | null;
    typetext: string | null;
  };
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
}

interface LSRGeoJSON {
  type: "FeatureCollection";
  features: LSRFeature[];
}

// Map LSR type codes to our simplified types
function mapLSRType(
  lsrType: string,
): "tornado" | "hail" | "wind" | "flood" | "other" {
  const typeUpper = lsrType.toUpperCase();

  // Tornado types
  if (typeUpper.includes("TORNADO")) {
    return "tornado";
  }

  // Hail types
  if (typeUpper.includes("HAIL")) {
    return "hail";
  }

  // Wind types
  if (
    typeUpper.includes("WIND") || typeUpper.includes("GUST") ||
    typeUpper.includes("TSTM WND")
  ) {
    return "wind";
  }

  // Flood types
  if (
    typeUpper.includes("FLOOD") || typeUpper.includes("FLASH") ||
    typeUpper.includes("SURGE")
  ) {
    return "flood";
  }

  return "other";
}

// Calculate distance between two points in miles using Haversine formula
function calculateDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const LSR_URL = "https://mesonet.agron.iastate.edu/geojson/lsr.geojson";

// Cache for storm reports (refresh every 5 minutes)
let cachedReports: StormReport[] | null = null;
let cacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function handler(_req: Request): Promise<Response> {
  try {
    const config = await loadConfig();
    const centerLat = config.location.latitude;
    const centerLon = config.location.longitude;

    // Check cache
    const now = Date.now();
    if (cachedReports && (now - cacheTime) < CACHE_DURATION) {
      return new Response(JSON.stringify(cachedReports), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    // Fetch from Iowa Environmental Mesonet
    // Get all recent LSRs - we filter by distance anyway
    const response = await fetch(LSR_URL);

    if (!response.ok) {
      console.error(
        `LSR API returned ${response.status}: ${response.statusText}`,
      );
      return new Response(JSON.stringify([]), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      });
    }

    const data = await response.json() as LSRGeoJSON;

    // Get timestamp for 24 hours ago
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);

    // Filter and transform the reports
    const reports: StormReport[] = data.features
      .filter((feature) => {
        // Filter by time (last 24 hours)
        const reportTime = new Date(feature.properties.valid);
        if (reportTime < twentyFourHoursAgo) {
          return false;
        }

        // Filter by distance (100 miles from center)
        const [lon, lat] = feature.geometry.coordinates;
        const distance = calculateDistanceMiles(centerLat, centerLon, lat, lon);
        if (distance > 100) {
          return false;
        }

        return true;
      })
      .map((feature) => {
        const [lon, lat] = feature.geometry.coordinates;
        const reportType = mapLSRType(feature.properties.type);

        return {
          type: reportType,
          lat,
          lon,
          time: feature.properties.valid,
          magnitude: feature.properties.magnitude,
          remarks: feature.properties.remark || "",
          city: feature.properties.city,
          county: feature.properties.county,
          state: feature.properties.state,
        };
      })
      // Sort by time (most recent first)
      .sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
      );

    // Update cache
    cachedReports = reports;
    cacheTime = now;

    return new Response(JSON.stringify(reports), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("Storm reports API error:", error);
    return new Response(JSON.stringify([]), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
      },
    });
  }
}
