import { loadConfig } from "@/lib/config-loader.ts";

interface WindPoint {
  lat: number;
  lon: number;
  speed: number;
  direction: number;
}

interface WindGridResponse {
  points: WindPoint[];
  timestamp: string;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

// Generate a grid of coordinates for wind data
function generateWindGrid(
  centerLat: number,
  centerLon: number,
  radiusDeg: number = 3,
  gridSize: number = 5,
): { lat: number; lon: number }[] {
  const points: { lat: number; lon: number }[] = [];
  const step = (radiusDeg * 2) / (gridSize - 1);

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      points.push({
        lat: centerLat - radiusDeg + i * step,
        lon: centerLon - radiusDeg + j * step,
      });
    }
  }

  return points;
}

export async function handler(req: Request): Promise<Response> {
  try {
    const config = await loadConfig();
    const url = new URL(req.url);

    const centerLat = url.searchParams.get("lat")
      ? parseFloat(url.searchParams.get("lat")!)
      : config.location.latitude;
    const centerLon = url.searchParams.get("lon")
      ? parseFloat(url.searchParams.get("lon")!)
      : config.location.longitude;

    // Generate a 7x7 grid of points (49 points total for smooth interpolation)
    const gridPoints = generateWindGrid(centerLat, centerLon, 4, 7);

    // Build Open-Meteo API URL for all grid points
    const latitudes = gridPoints.map((p) => p.lat.toFixed(4)).join(",");
    const longitudes = gridPoints.map((p) => p.lon.toFixed(4)).join(",");

    const apiUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitudes}&longitude=${longitudes}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=mph&timezone=auto`;

    const response = await fetch(apiUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "ICAW-Radar/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Open-Meteo API error: ${response.status}`);
    }

    const data = await response.json();

    // Process the response - Open-Meteo returns an array for multiple locations
    const windPoints: WindPoint[] = [];

    if (Array.isArray(data)) {
      // Multiple locations response
      // deno-lint-ignore no-explicit-any
      data.forEach((location: Record<string, any>, idx: number) => {
        if (location.current) {
          windPoints.push({
            lat: gridPoints[idx].lat,
            lon: gridPoints[idx].lon,
            speed: location.current.wind_speed_10m || 0,
            direction: location.current.wind_direction_10m || 0,
          });
        }
      });
    } else if (data.current) {
      // Single location response (fallback)
      windPoints.push({
        lat: centerLat,
        lon: centerLon,
        speed: data.current.wind_speed_10m || 0,
        direction: data.current.wind_direction_10m || 0,
      });
    }

    const result: WindGridResponse = {
      points: windPoints,
      timestamp: new Date().toISOString(),
      bounds: {
        north: centerLat + 4,
        south: centerLat - 4,
        east: centerLon + 4,
        west: centerLon - 4,
      },
    };

    return new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300", // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error("Wind API error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch wind data" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
