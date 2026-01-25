import { loadConfig } from "@/lib/config-loader.ts";

export interface LightningStrike {
  lat: number;
  lon: number;
  time: number; // Unix timestamp in milliseconds
  intensity: number; // Strike intensity (1-5 scale)
}

interface BlitzortungStrike {
  time: number;
  lat: number;
  lon: number;
  alt?: number;
  pol?: number;
  mds?: number;
  mcg?: number;
  sta?: number[];
  status?: number;
  region?: number;
  delay?: number;
}

// In-memory cache for lightning data
let cachedStrikes: LightningStrike[] = [];
let cacheTimestamp = 0;
const CACHE_DURATION_MS = 30_000; // 30 seconds

/**
 * Calculate distance between two coordinates in miles using Haversine formula
 */
function distanceInMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3958.8; // Earth's radius in miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Fetch lightning strikes from Blitzortung-style API
 * Uses the lightningmaps.org geojson endpoint for real-time data
 */
async function fetchLightningStrikes(
  centerLat: number,
  centerLon: number,
  radiusMiles: number,
): Promise<LightningStrike[]> {
  const now = Date.now();

  // Return cached data if still valid
  if (cachedStrikes.length > 0 && now - cacheTimestamp < CACHE_DURATION_MS) {
    // Filter cached strikes to only those within radius and last 15 minutes
    const fifteenMinutesAgo = now - 15 * 60 * 1000;
    return cachedStrikes.filter((strike) => {
      const distance = distanceInMiles(
        centerLat,
        centerLon,
        strike.lat,
        strike.lon,
      );
      return distance <= radiusMiles && strike.time >= fifteenMinutesAgo;
    });
  }

  try {
    // Blitzortung/LightningMaps WebSocket data is real-time
    // We use their JSON endpoint for historical strikes
    // The API returns strikes from the last hour, we filter to 15 min
    const response = await fetch(
      "https://map.blitzortung.org/GEOjson/live_data.json",
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "ICAW-Radar/1.0",
        },
      },
    );

    if (!response.ok) {
      console.error(
        `Lightning API returned ${response.status}: ${response.statusText}`,
      );
      return cachedStrikes;
    }

    const data = await response.json();

    // Handle both array format and GeoJSON format
    let rawStrikes: BlitzortungStrike[] = [];

    if (Array.isArray(data)) {
      rawStrikes = data;
    } else if (data.features && Array.isArray(data.features)) {
      // GeoJSON format
      rawStrikes = data.features.map(
        (
          f: {
            geometry: { coordinates: number[] };
            properties: { time: number };
          },
        ) => ({
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
          time: f.properties.time,
        }),
      );
    }

    // Process and filter strikes
    const fifteenMinutesAgo = now - 15 * 60 * 1000;
    const strikes: LightningStrike[] = [];

    for (const strike of rawStrikes) {
      // Convert time to milliseconds if needed (Blitzortung uses nanoseconds)
      let strikeTime = strike.time;
      if (strikeTime > 1e15) {
        strikeTime = Math.floor(strikeTime / 1e6);
      } else if (strikeTime < 1e12) {
        strikeTime = strikeTime * 1000;
      }

      // Skip strikes older than 15 minutes
      if (strikeTime < fifteenMinutesAgo) continue;

      const distance = distanceInMiles(
        centerLat,
        centerLon,
        strike.lat,
        strike.lon,
      );

      // Only include strikes within radius
      if (distance <= radiusMiles) {
        // Calculate intensity based on number of detecting stations
        // or use a default value of 3
        const intensity = strike.sta
          ? Math.min(5, Math.max(1, Math.ceil((strike.sta.length || 3) / 5)))
          : 3;

        strikes.push({
          lat: strike.lat,
          lon: strike.lon,
          time: strikeTime,
          intensity,
        });
      }
    }

    // Update cache
    cachedStrikes = strikes;
    cacheTimestamp = now;

    return strikes;
  } catch (error) {
    console.error("Failed to fetch lightning data:", error);
    // Return cached data even if stale
    return cachedStrikes;
  }
}

export async function handler(req: Request): Promise<Response> {
  try {
    const config = await loadConfig();
    const url = new URL(req.url);

    // Allow overriding location via query params
    const lat = url.searchParams.get("lat")
      ? parseFloat(url.searchParams.get("lat")!)
      : config.location.latitude;
    const lon = url.searchParams.get("lon")
      ? parseFloat(url.searchParams.get("lon")!)
      : config.location.longitude;
    const radius = url.searchParams.get("radius")
      ? parseFloat(url.searchParams.get("radius")!)
      : 100; // Default 100 miles

    const strikes = await fetchLightningStrikes(lat, lon, radius);

    return new Response(JSON.stringify({ strikes, count: strikes.length }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Lightning API error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch lightning data" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
}
