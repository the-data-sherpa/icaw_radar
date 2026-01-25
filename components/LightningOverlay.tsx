export interface LightningStrike {
  lat: number;
  lon: number;
  time: number;
  intensity: number;
}

interface LightningOverlayProps {
  strikes: LightningStrike[];
}

// GeoJSON types for TypeScript
interface GeoJSONFeature {
  type: "Feature";
  id?: string | number;
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: Record<string, unknown>;
}

interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

/**
 * Lightning count badge component
 * Displays the number of recent lightning strikes in the area
 */
export function LightningOverlay({ strikes }: LightningOverlayProps) {
  if (strikes.length === 0) {
    return null;
  }

  return (
    <div class="lightning-count">
      <span class="bolt">&#9889;</span>
      <span>{strikes.length} strike{strikes.length !== 1 ? "s" : ""}</span>
    </div>
  );
}

/**
 * Generate GeoJSON data for lightning strikes
 * Used to add lightning layer to MapLibre map
 */
export function generateLightningGeoJSON(
  strikes: LightningStrike[],
): GeoJSONFeatureCollection {
  const now = Date.now();

  return {
    type: "FeatureCollection",
    features: strikes.map((strike, index) => ({
      type: "Feature",
      id: `strike-${index}-${strike.time}`,
      geometry: {
        type: "Point",
        coordinates: [strike.lon, strike.lat],
      },
      properties: {
        time: strike.time,
        intensity: strike.intensity,
        age: (now - strike.time) / 1000, // Age in seconds
        // Calculate opacity based on age (fade over 180 seconds = 3 minutes)
        opacity: Math.max(0.1, 1 - (now - strike.time) / (180 * 1000)),
        // Calculate radius based on intensity
        radius: 6 + strike.intensity * 2,
      },
    })),
  };
}

/**
 * Lightning layer configuration for MapLibre
 * Returns the layer style definitions for rendering lightning strikes
 */
export function getLightningLayerConfig() {
  return {
    source: {
      type: "geojson" as const,
      data: {
        type: "FeatureCollection" as const,
        features: [],
      },
    },
    layers: [
      // Outer glow layer (largest, most transparent)
      {
        id: "lightning-glow-outer",
        type: "circle" as const,
        source: "lightning",
        paint: {
          "circle-radius": ["*", ["get", "radius"], 3],
          "circle-color": "#ffffff",
          "circle-opacity": ["*", ["get", "opacity"], 0.15],
          "circle-blur": 1,
        },
      },
      // Middle glow layer
      {
        id: "lightning-glow-middle",
        type: "circle" as const,
        source: "lightning",
        paint: {
          "circle-radius": ["*", ["get", "radius"], 2],
          "circle-color": "#fffacd",
          "circle-opacity": ["*", ["get", "opacity"], 0.3],
          "circle-blur": 0.5,
        },
      },
      // Inner glow layer (brightest)
      {
        id: "lightning-glow-inner",
        type: "circle" as const,
        source: "lightning",
        paint: {
          "circle-radius": ["get", "radius"],
          "circle-color": "#ffff00",
          "circle-opacity": ["get", "opacity"],
          "circle-blur": 0.3,
        },
      },
      // Core strike point (white center)
      {
        id: "lightning-core",
        type: "circle" as const,
        source: "lightning",
        paint: {
          "circle-radius": ["*", ["get", "radius"], 0.4],
          "circle-color": "#ffffff",
          "circle-opacity": ["get", "opacity"],
        },
      },
    ],
  };
}
