import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { RadarLegend } from "@/components/RadarLegend.tsx";
import { LayerControl } from "@/components/LayerControl.tsx";

interface RadarMapProps {
  latitude: number;
  longitude: number;
  zoom?: number;
}

interface RadarFrame {
  id: string;
  suffix: string;
  minutesAgo: number;
  tileUrl: string;
  timestamp: string;
}

// deno-lint-ignore no-explicit-any
type MapLibreMap = any;

export default function RadarMap(
  { latitude, longitude, zoom = 7 }: RadarMapProps,
) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<MapLibreMap>(null);
  const frameIndex = useSignal(0);
  const frames = useSignal<RadarFrame[]>([]);
  const timestamp = useSignal("");
  const isPlaying = useSignal(true);
  const activeLayer = useSignal<"radar" | "precip">("radar");

  useEffect(() => {
    async function fetchFrames() {
      try {
        const response = await fetch("/api/radar/frames");
        const data = await response.json();
        frames.value = data;
      } catch (e) {
        console.error("Failed to fetch radar frames:", e);
      }
    }
    fetchFrames();
    const frameRefresh = setInterval(fetchFrames, 60000);
    return () => clearInterval(frameRefresh);
  }, []);

  useEffect(() => {
    if (!mapContainer.current || frames.value.length === 0) return;

    // Get MapLibre GL from global scope (loaded via CDN)
    // deno-lint-ignore no-explicit-any
    const maplibregl = (globalThis as any).maplibregl;
    if (!maplibregl) {
      console.error("MapLibre GL not loaded");
      return;
    }

    // Load saved view state
    let initialZoom = zoom;
    let initialCenter = [longitude, latitude];

    try {
      const saved = localStorage.getItem("radar-map-view");
      if (saved) {
        const { lng, lat, zoom: savedZoom } = JSON.parse(saved);
        if (lng && lat && savedZoom) {
          initialZoom = savedZoom;
          initialCenter = [lng, lat];
        }
      }
    } catch { /* ignore error */ }

    // Create map
    const map = new maplibregl.Map({
      container: mapContainer.current!,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf", // Required for text labels
        sources: {
          "carto-dark": {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
              "https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
              "https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution: "&copy; CARTO",
          },
        },
        layers: [
          {
            id: "carto-dark-layer",
            type: "raster",
            source: "carto-dark",
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false,
      interactive: true, // Enable zoom/pan
    });

    // Save view state on move
    map.on("moveend", () => {
      const center = map.getCenter();
      const z = map.getZoom();
      localStorage.setItem("radar-map-view", JSON.stringify({
        lng: center.lng,
        lat: center.lat,
        zoom: z
      }));
    });

    map.on("load", () => {
      // Add radar layers for each frame
      frames.value.forEach((frame, idx) => {
        map.addSource(`radar-${idx}`, {
          type: "raster",
          tiles: [frame.tileUrl],
          tileSize: 256,
        });

        // Start with oldest frame visible (last index)
        const isOldestFrame = idx === frames.value.length - 1;
        map.addLayer({
          id: `radar-layer-${idx}`,
          type: "raster",
          source: `radar-${idx}`,
          paint: {
            "raster-opacity": isOldestFrame ? 0.7 : 0,
            "raster-opacity-transition": { duration: 500 }, // Smoother fade
          },
        });
      });

      // Add labels layer on top of radar
      map.addSource("carto-labels", {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
      });

      map.addLayer({
        id: "carto-labels-layer",
        type: "raster",
        source: "carto-labels",
        minzoom: 0,
        maxzoom: 19,
      });

      // Add Iredell County Boundary
      try {
        map.addSource("iredell-boundary", {
          type: "geojson",
          data: "/iredell-boundary.json",
        });

        map.addLayer({
          id: "iredell-boundary-layer",
          type: "line",
          source: "iredell-boundary",
          paint: {
            "line-color": "#FFFF00",
            "line-width": 2,
            "line-opacity": 0.8,
          },
        });
      } catch (e) {
        console.error("Failed to add boundary layer:", e);
      }

      // Add Iredell Cities
      try {
        map.addSource("iredell-cities", {
          type: "geojson",
          data: "/iredell-cities.json"
        });

        // City Dots
        map.addLayer({
          id: "iredell-cities-dots",
          type: "circle",
          source: "iredell-cities",
          paint: {
            "circle-color": "#ffffff",
            "circle-radius": 3,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#000000"
          }
        });

        // City Labels
        map.addLayer({
          id: "iredell-cities-labels",
          type: "symbol",
          source: "iredell-cities",
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-size": 12,
            "text-offset": [0, 1.2],
            "text-anchor": "top",
            "text-allow-overlap": true,    // Force display
            "text-ignore-placement": true  // Force display even if it collides
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "#000000",
            "text-halo-width": 2
          }
        });
      } catch (e) { console.error("Failed cities", e); }

      // Add 24h Precip Layer (Hidden by default)
      try {
        map.addSource("mrms-precip", {
          type: "raster",
          tiles: [
            "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/mrms_p24h/{z}/{x}/{y}.png"
          ],
          tileSize: 256
        });

        map.addLayer({
          id: "mrms-precip-layer",
          type: "raster",
          source: "mrms-precip",
          layout: { visibility: "none" },
          paint: { "raster-opacity": 0.8 }
        });
      } catch (e) { console.error("Failed precip", e); }

      // Update initial timestamp - show oldest frame first
      if (frames.value.length > 0) {
        updateTimestamp(frames.value[frames.value.length - 1].timestamp);
      }
    });

    mapInstance.current = map;

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
      }
    };
  }, [latitude, longitude, zoom, frames.value]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying.value || frames.value.length === 0) return;

    const map = mapInstance.current;
    if (!map) return;

    // Handle Layer Visibility
    if (activeLayer.value === "precip") {
      if (map.getLayer("mrms-precip-layer")) {
        map.setLayoutProperty("mrms-precip-layer", "visibility", "visible");
        // Hide radar layers
        frames.value.forEach((_, i) => {
          if (map.getLayer(`radar-layer-${i}`)) {
            map.setPaintProperty(`radar-layer-${i}`, "raster-opacity", 0);
          }
        });
        timestamp.value = "24h Precipitation Accumulation";
      }
      return; // Stop animation loop when viewing precip
    } else {
      if (map.getLayer("mrms-precip-layer")) {
        map.setLayoutProperty("mrms-precip-layer", "visibility", "none");
      }
    }

    const totalFrames = frames.value.length;
    // Start from oldest frame (last in array, highest index = furthest back in time)
    let currentFrame = totalFrames - 1;
    let timeout: number;

    const animate = () => {
      if (!map.loaded()) return;

      // Hide all frames
      for (let i = 0; i < totalFrames; i++) {
        if (map.getLayer(`radar-layer-${i}`)) {
          map.setPaintProperty(`radar-layer-${i}`, "raster-opacity", 0);
        }
      }

      // Show current frame
      if (map.getLayer(`radar-layer-${currentFrame}`)) {
        map.setPaintProperty(
          `radar-layer-${currentFrame}`,
          "raster-opacity",
          0.7,
        );
      }

      // Update timestamp display
      if (frames.value[currentFrame]) {
        updateTimestamp(frames.value[currentFrame].timestamp);
      }

      frameIndex.value = currentFrame;
    };

    // Frame timing: 500ms per frame, 2s pause on current (frame 0)
    const runAnimation = () => {
      animate();

      // Move toward present (decrement index since index 0 = current)
      currentFrame--;

      if (currentFrame < 0) {
        // We just showed frame 0 (current), pause then restart from oldest
        currentFrame = totalFrames - 1;
        timeout = setTimeout(runAnimation, 2000);
      } else {
        timeout = setTimeout(runAnimation, 500);
      }
    };

    runAnimation();

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [isPlaying.value, frames.value, activeLayer.value]);

  function updateTimestamp(isoString: string) {
    const date = new Date(isoString);
    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    timestamp.value = `Radar: ${timeStr}`;
  }

  return (
    <div class="radar-container">
      <div ref={mapContainer} class="radar-map" />
      <div class="radar-timestamp">{timestamp.value || "Loading..."}</div>
      <LayerControl activeLayer={activeLayer.value} onLayerChange={(l) => activeLayer.value = l} />
      <RadarLegend />
    </div>
  );
}
