import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { RadarLegend } from "@/components/RadarLegend.tsx";
import { VelocityLegend } from "@/components/VelocityLegend.tsx";
import { LayerControl } from "@/components/LayerControl.tsx";
import { AnimationControls } from "@/components/AnimationControls.tsx";
import { ZoomControls } from "@/components/ZoomControls.tsx";
import { MiniMap } from "@/components/MiniMap.tsx";
import { WindField } from "@/components/WindField.tsx";
import { AudioToggle } from "@/components/AudioToggle.tsx";
import { audioAlerts } from "@/lib/audio-alerts.ts";
import { type StormReport, StormReports } from "@/components/StormReports.tsx";
import { FeatureToggles } from "@/components/FeatureToggles.tsx";
import {
  generateLightningGeoJSON,
  getLightningLayerConfig,
  LightningOverlay,
} from "@/components/LightningOverlay.tsx";
import HourlyForecast from "@/islands/HourlyForecast.tsx";

// ============================================================================
// Interfaces
// ============================================================================

interface LightningStrike {
  lat: number;
  lon: number;
  time: number;
  intensity: number;
}

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

interface WindPoint {
  lat: number;
  lon: number;
  speed: number;
  direction: number;
}

// deno-lint-ignore no-explicit-any
type MapLibreMap = any;

export default function RadarMap(
  { latitude, longitude, zoom = 7 }: RadarMapProps,
) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<MapLibreMap>(null);
  const frameIndex = useSignal(-1); // -1 = not initialized, will be set to oldest frame on load
  const frames = useSignal<RadarFrame[]>([]);
  const timestamp = useSignal("");
  const isPlaying = useSignal(false); // Start paused until map is ready
  const activeLayer = useSignal<"radar" | "precip" | "velocity">("radar");
  const mapError = useSignal<string | null>(null);
  const animationSpeed = useSignal(1); // 0.5, 1, or 2
  const lastUpdateTime = useSignal<Date>(new Date());
  const prevFrameIndex = useRef<number>(-1); // Track previous frame for cross-fade
  const animationReady = useSignal(false); // Track when animation can safely start
  const showMiniMap = useSignal(false); // Mini-map visibility toggle - default off, toggle via feature panel
  const mapBounds = useSignal<
    { north: number; south: number; east: number; west: number } | null
  >(null);
  const windEnabled = useSignal(false); // Wind particle overlay toggle
  const windData = useSignal<WindPoint[]>([]); // Wind data for particle animation
  const stormReportsEnabled = useSignal(false); // Storm reports overlay toggle
  const stormReports = useSignal<StormReport[]>([]); // Storm reports data
  const mapLoaded = useSignal(false); // Track if map is loaded for storm reports component
  const layerLoading = useSignal(false); // Track when layer tiles are loading
  const prevLayer = useRef<"radar" | "precip" | "velocity">("radar"); // Track previous layer for loading detection

  // Feature toggle signals for FeatureToggles panel
  const showLightning = useSignal(false);
  const showHourly = useSignal(false);
  const lightningStrikes = useSignal<LightningStrike[]>([]);

  useEffect(() => {
    async function fetchFrames() {
      try {
        const response = await fetch("/api/radar/frames");
        const data = await response.json();

        // Only update if frames actually changed (compare first frame timestamp)
        // This prevents unnecessary map rebuilds every 60 seconds
        const currentFirst = frames.value[0]?.timestamp;
        const newFirst = data[0]?.timestamp;

        if (currentFirst !== newFirst || frames.value.length === 0) {
          frames.value = data;
          lastUpdateTime.value = new Date();
        }
      } catch (e) {
        console.error("Failed to fetch radar frames:", e);
      }
    }
    fetchFrames();
    const frameRefresh = setInterval(fetchFrames, 60000);
    return () => clearInterval(frameRefresh);
  }, []);

  // Fetch wind data for particle animation
  useEffect(() => {
    async function fetchWindData() {
      try {
        const response = await fetch(
          `/api/wind?lat=${latitude}&lon=${longitude}`,
        );
        const data = await response.json();
        if (data.points) {
          windData.value = data.points;
        }
      } catch (e) {
        console.error("Failed to fetch wind data:", e);
      }
    }

    // Fetch immediately if wind is enabled
    if (windEnabled.value) {
      fetchWindData();
    }

    // Set up periodic refresh (every 10 minutes)
    const windRefresh = setInterval(() => {
      if (windEnabled.value) {
        fetchWindData();
      }
    }, 600000);

    return () => clearInterval(windRefresh);
  }, [latitude, longitude, windEnabled.value]);

  // Fetch storm reports data
  useEffect(() => {
    async function fetchStormReports() {
      try {
        const response = await fetch("/api/storm-reports");
        const data = await response.json();
        stormReports.value = data;
      } catch (e) {
        console.error("Failed to fetch storm reports:", e);
        stormReports.value = [];
      }
    }

    // Always fetch storm reports on mount (for badge count)
    fetchStormReports();

    // Refresh every 5 minutes
    const stormRefresh = setInterval(fetchStormReports, 5 * 60 * 1000);

    return () => clearInterval(stormRefresh);
  }, []);

  // Fetch lightning data
  useEffect(() => {
    async function fetchLightning() {
      try {
        const response = await fetch(
          `/api/lightning?lat=${latitude}&lon=${longitude}`,
        );
        const data = await response.json();
        lightningStrikes.value = data.strikes || [];
      } catch (e) {
        console.error("Failed to fetch lightning data:", e);
        lightningStrikes.value = [];
      }
    }

    if (showLightning.value) {
      fetchLightning();
    }

    // Refresh every 2 minutes when enabled
    const lightningRefresh = setInterval(() => {
      if (showLightning.value) {
        fetchLightning();
      }
    }, 120000);

    return () => clearInterval(lightningRefresh);
  }, [latitude, longitude, showLightning.value]);

  // Update lightning layer on the map when strikes change
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !map.loaded()) return;

    const source = map.getSource("lightning");
    if (!source) return;

    // Generate GeoJSON from lightning strikes
    const geoJSON = generateLightningGeoJSON(lightningStrikes.value);

    // Update the source data
    source.setData(geoJSON);

    // Control layer visibility based on showLightning toggle
    const layers = [
      "lightning-glow-outer",
      "lightning-glow-middle",
      "lightning-glow-inner",
      "lightning-core",
    ];
    layers.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(
          layerId,
          "visibility",
          showLightning.value ? "visible" : "none",
        );
      }
    });
  }, [lightningStrikes.value, showLightning.value]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return; // Ignore when typing
      if (!animationReady.value && ["ArrowLeft", "ArrowRight", " "].includes(e.key)) return; // Wait for map ready

      switch (e.key) {
        case " ": // Space - play/pause
          e.preventDefault();
          isPlaying.value = !isPlaying.value;
          break;
        case "ArrowLeft": // Previous (older) frame
          e.preventDefault();
          if (frameIndex.value < frames.value.length - 1) {
            frameIndex.value++;
            isPlaying.value = false;
            updateFrameDisplay(frameIndex.value);
          }
          break;
        case "ArrowRight": // Next (newer) frame
          e.preventDefault();
          if (frameIndex.value > 0) {
            frameIndex.value--;
            isPlaying.value = false;
            updateFrameDisplay(frameIndex.value);
          }
          break;
        case "r":
        case "R":
          // Cycle through layers: radar -> precip -> velocity -> radar
          if (activeLayer.value === "radar") {
            activeLayer.value = "precip";
          } else if (activeLayer.value === "precip") {
            activeLayer.value = "velocity";
          } else {
            activeLayer.value = "radar";
          }
          break;
        case "w":
        case "W":
          // Toggle wind particle overlay
          windEnabled.value = !windEnabled.value;
          break;
        case "s":
        case "S":
          // Toggle storm reports overlay
          stormReportsEnabled.value = !stormReportsEnabled.value;
          break;
      }
    }

    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
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
    let map;
    try {
      map = new maplibregl.Map({
        container: mapContainer.current!,
        style: {
          version: 8,
          glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf", // Required for text labels
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
    } catch (e) {
      console.error("Failed to initialize map:", e);
      mapError.value = e instanceof Error
        ? e.message
        : "WebGL context creation failed";
      return;
    }

    // Save view state on move and update mini-map bounds
    map.on("moveend", () => {
      const center = map.getCenter();
      const z = map.getZoom();
      localStorage.setItem(
        "radar-map-view",
        JSON.stringify({
          lng: center.lng,
          lat: center.lat,
          zoom: z,
        }),
      );

      // Update mini-map viewport indicator
      const bounds = map.getBounds();
      mapBounds.value = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      };
    });

    map.on("load", () => {
      // Set initial bounds for mini-map
      const bounds = map.getBounds();
      mapBounds.value = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      };

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
            "raster-opacity-transition": { duration: 400, delay: 0 }, // Smooth cross-fade
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
          data: "/iredell-cities.json",
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
            "circle-stroke-color": "#000000",
          },
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
            "text-allow-overlap": true, // Force display
            "text-ignore-placement": true, // Force display even if it collides
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "#000000",
            "text-halo-width": 2,
          },
        });
      } catch (e) {
        console.error("Failed cities", e);
      }

      // Add Range Rings (10mi, 25mi, 50mi from county center)
      try {
        const countyCenter = [longitude, latitude];
        const rings = [10, 25, 50]; // miles
        const ringFeatures = rings.map((miles) => {
          const radiusKm = miles * 1.60934;
          const points = 64;
          const coords = [];
          for (let i = 0; i <= points; i++) {
            const angle = (i / points) * 2 * Math.PI;
            const dx = radiusKm / 111.32 * Math.cos(angle);
            const dy = radiusKm /
              (111.32 * Math.cos(countyCenter[1] * Math.PI / 180)) *
              Math.sin(angle);
            coords.push([countyCenter[0] + dy, countyCenter[1] + dx]);
          }
          return {
            type: "Feature",
            properties: { miles },
            geometry: { type: "LineString", coordinates: coords },
          };
        });

        map.addSource("range-rings", {
          type: "geojson",
          data: { type: "FeatureCollection", features: ringFeatures },
        });

        map.addLayer({
          id: "range-rings-layer",
          type: "line",
          source: "range-rings",
          paint: {
            "line-color": "rgba(255, 255, 255, 0.3)",
            "line-width": 1,
            "line-dasharray": [4, 4],
          },
        });
      } catch (e) {
        console.error("Failed to add range rings:", e);
      }

      // Add 24h Precip Layer (Hidden by default)
      // Using IEM's Q2 (MRMS) precipitation products
      // Ref: https://mesonet.agron.iastate.edu/ogc/
      try {
        map.addSource("mrms-precip", {
          type: "raster",
          tiles: [
            "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/q2-p24h/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
        });

        map.addLayer({
          id: "mrms-precip-layer",
          type: "raster",
          source: "mrms-precip",
          layout: { visibility: "none" },
          paint: { "raster-opacity": 0.8 },
        });
      } catch (e) {
        console.error("Failed precip", e);
      }

      // Add Echo Tops Layer (EET - Enhanced Echo Tops, Hidden by default)
      // Note: IEM does not provide national velocity mosaic, only per-radar
      // Echo Tops shows storm height which is useful for severe weather spotting
      // Ref: https://mesonet.agron.iastate.edu/GIS/ridge.phtml
      try {
        map.addSource("mrms-velocity", {
          type: "raster",
          tiles: [
            "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-eet/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
        });

        map.addLayer({
          id: "mrms-velocity-layer",
          type: "raster",
          source: "mrms-velocity",
          layout: { visibility: "none" },
          paint: {
            "raster-opacity": 0.8,
            "raster-opacity-transition": { duration: 400 },
          },
        });
      } catch (e) {
        console.error("Failed echo tops", e);
      }

      // Add Lightning Layers
      try {
        map.addSource("lightning", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        // Outer glow layer (largest, most transparent)
        map.addLayer({
          id: "lightning-glow-outer",
          type: "circle",
          source: "lightning",
          paint: {
            "circle-radius": ["*", ["get", "radius"], 3],
            "circle-color": "#ffffff",
            "circle-opacity": ["*", ["get", "opacity"], 0.15],
            "circle-blur": 1,
          },
        });

        // Middle glow layer
        map.addLayer({
          id: "lightning-glow-middle",
          type: "circle",
          source: "lightning",
          paint: {
            "circle-radius": ["*", ["get", "radius"], 2],
            "circle-color": "#fffacd",
            "circle-opacity": ["*", ["get", "opacity"], 0.3],
            "circle-blur": 0.5,
          },
        });

        // Inner glow layer (brightest)
        map.addLayer({
          id: "lightning-glow-inner",
          type: "circle",
          source: "lightning",
          paint: {
            "circle-radius": ["get", "radius"],
            "circle-color": "#ffff00",
            "circle-opacity": ["get", "opacity"],
            "circle-blur": 0.3,
          },
        });

        // Core strike point (white center)
        map.addLayer({
          id: "lightning-core",
          type: "circle",
          source: "lightning",
          paint: {
            "circle-radius": ["*", ["get", "radius"], 0.4],
            "circle-color": "#ffffff",
            "circle-opacity": ["get", "opacity"],
          },
        });
      } catch (e) {
        console.error("Failed to add lightning layers:", e);
      }

      // Initialize frame state - show oldest frame first
      if (frames.value.length > 0) {
        const oldestFrameIdx = frames.value.length - 1;
        frameIndex.value = oldestFrameIdx;
        prevFrameIndex.current = oldestFrameIdx;
        updateTimestamp(frames.value[oldestFrameIdx].timestamp);

        // Wait for tiles to load before starting animation
        // This prevents jarring transition on first load
        setTimeout(() => {
          animationReady.value = true;
          isPlaying.value = true;
        }, 1500); // Give tiles time to render
      }

      // Mark map as loaded for storm reports component
      mapLoaded.value = true;
    });

    mapInstance.current = map;

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
      }
    };
  }, [latitude, longitude, zoom, frames.value]);

  // Layer visibility - responds IMMEDIATELY to layer changes (separate from animation)
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !mapLoaded.value) return;

    // Detect if we're switching to a different layer type
    const switchingLayer = prevLayer.current !== activeLayer.value;
    const switchingToStatic = switchingLayer && activeLayer.value !== "radar";

    // Show loading indicator when switching to static layers (they need to load tiles)
    if (switchingToStatic) {
      layerLoading.value = true;

      // Listen for map idle to know when tiles are loaded
      const onIdle = () => {
        layerLoading.value = false;
        map.off("idle", onIdle);
      };
      map.on("idle", onIdle);

      // Fallback timeout in case idle never fires
      setTimeout(() => {
        layerLoading.value = false;
        map.off("idle", onIdle);
      }, 5000);
    }

    prevLayer.current = activeLayer.value;

    if (activeLayer.value === "precip") {
      // Show 24h precip, hide others
      if (map.getLayer("mrms-precip-layer")) {
        map.setLayoutProperty("mrms-precip-layer", "visibility", "visible");
      }
      if (map.getLayer("mrms-velocity-layer")) {
        map.setLayoutProperty("mrms-velocity-layer", "visibility", "none");
      }
      frames.value.forEach((_, i) => {
        if (map.getLayer(`radar-layer-${i}`)) {
          map.setPaintProperty(`radar-layer-${i}`, "raster-opacity", 0);
        }
      });
      timestamp.value = "24h Precipitation Accumulation";
    } else if (activeLayer.value === "velocity") {
      // Show echo tops, hide others
      if (map.getLayer("mrms-velocity-layer")) {
        map.setLayoutProperty("mrms-velocity-layer", "visibility", "visible");
      }
      if (map.getLayer("mrms-precip-layer")) {
        map.setLayoutProperty("mrms-precip-layer", "visibility", "none");
      }
      frames.value.forEach((_, i) => {
        if (map.getLayer(`radar-layer-${i}`)) {
          map.setPaintProperty(`radar-layer-${i}`, "raster-opacity", 0);
        }
      });
      timestamp.value = "Echo Tops (Storm Height)";
    } else {
      // Show radar, hide static layers
      if (map.getLayer("mrms-precip-layer")) {
        map.setLayoutProperty("mrms-precip-layer", "visibility", "none");
      }
      if (map.getLayer("mrms-velocity-layer")) {
        map.setLayoutProperty("mrms-velocity-layer", "visibility", "none");
      }
      // Restore current radar frame visibility
      if (frameIndex.value >= 0 && map.getLayer(`radar-layer-${frameIndex.value}`)) {
        map.setPaintProperty(`radar-layer-${frameIndex.value}`, "raster-opacity", 0.7);
      }
      // No loading needed for radar - frames are already loaded
      layerLoading.value = false;
    }
  }, [activeLayer.value, mapLoaded.value]);

  // Animation loop - only runs for radar layer
  useEffect(() => {
    // Don't animate for static layers
    if (activeLayer.value !== "radar") return;
    if (!isPlaying.value || frames.value.length === 0 || !animationReady.value) return;

    const map = mapInstance.current;
    if (!map || !map.loaded()) return;

    const totalFrames = frames.value.length;
    // Start from oldest frame (last in array, highest index = furthest back in time)
    let currentFrame = totalFrames - 1;
    let timeout: number;

    const animate = () => {
      if (!map.loaded()) return;

      const prevFrame = prevFrameIndex.current;

      // True cross-fade: only change the previous and current frame
      // This creates a smooth blend between two frames
      if (
        prevFrame >= 0 && prevFrame !== currentFrame &&
        map.getLayer(`radar-layer-${prevFrame}`)
      ) {
        map.setPaintProperty(`radar-layer-${prevFrame}`, "raster-opacity", 0);
      }

      if (map.getLayer(`radar-layer-${currentFrame}`)) {
        map.setPaintProperty(
          `radar-layer-${currentFrame}`,
          "raster-opacity",
          0.7,
        );
      }

      prevFrameIndex.current = currentFrame;

      // Update timestamp display
      if (frames.value[currentFrame]) {
        updateTimestamp(frames.value[currentFrame].timestamp);
      }

      frameIndex.value = currentFrame;
    };

    // Frame timing: adjusted by animation speed, 2s pause on current (frame 0)
    const runAnimation = () => {
      animate();

      // Move toward present (decrement index since index 0 = current)
      currentFrame--;

      if (currentFrame < 0) {
        // We just showed frame 0 (current), pause then restart from oldest
        currentFrame = totalFrames - 1;
        timeout = setTimeout(runAnimation, 2000 / animationSpeed.value);
      } else {
        const frameDelay = 500 / animationSpeed.value;
        timeout = setTimeout(runAnimation, frameDelay);
      }
    };

    runAnimation();

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [isPlaying.value, frames.value, activeLayer.value, animationSpeed.value, animationReady.value]);

  // Lightning layer management
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !mapLoaded.value) return;

    const layerConfig = getLightningLayerConfig();

    // Add or update lightning source and layers
    if (showLightning.value && lightningStrikes.value.length > 0) {
      const geojson = generateLightningGeoJSON(lightningStrikes.value);

      if (map.getSource("lightning")) {
        // Update existing source
        map.getSource("lightning").setData(geojson);
      } else {
        // Add new source and layers
        map.addSource("lightning", {
          type: "geojson",
          data: geojson,
        });

        layerConfig.layers.forEach((layer) => {
          if (!map.getLayer(layer.id)) {
            map.addLayer(layer);
          }
        });
      }

      // Make sure layers are visible
      layerConfig.layers.forEach((layer) => {
        if (map.getLayer(layer.id)) {
          map.setLayoutProperty(layer.id, "visibility", "visible");
        }
      });
    } else {
      // Hide lightning layers if disabled or no strikes
      layerConfig.layers.forEach((layer) => {
        if (map.getLayer(layer.id)) {
          map.setLayoutProperty(layer.id, "visibility", "none");
        }
      });
    }
  }, [showLightning.value, lightningStrikes.value, mapLoaded.value]);

  function updateTimestamp(isoString: string) {
    const date = new Date(isoString);
    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    timestamp.value = `Radar: ${timeStr}`;
  }

  function updateFrameDisplay(idx: number) {
    const map = mapInstance.current;
    if (!map || !map.loaded()) return;

    const prevFrame = prevFrameIndex.current;

    // Cross-fade: only change previous and new frame
    if (
      prevFrame >= 0 && prevFrame !== idx &&
      map.getLayer(`radar-layer-${prevFrame}`)
    ) {
      map.setPaintProperty(`radar-layer-${prevFrame}`, "raster-opacity", 0);
    }

    if (map.getLayer(`radar-layer-${idx}`)) {
      map.setPaintProperty(`radar-layer-${idx}`, "raster-opacity", 0.7);
    }

    prevFrameIndex.current = idx;

    if (frames.value[idx]) {
      updateTimestamp(frames.value[idx].timestamp);
    }
  }

  // Zoom control handlers
  function handleZoomIn() {
    mapInstance.current?.zoomIn();
  }

  function handleZoomOut() {
    mapInstance.current?.zoomOut();
  }

  function handleRecenter() {
    mapInstance.current?.flyTo({
      center: [longitude, latitude],
      zoom: zoom,
    });
    localStorage.removeItem("radar-map-view");
  }

  // Animation control handlers
  function handleStepBack() {
    if (frameIndex.value < frames.value.length - 1) {
      isPlaying.value = false;
      frameIndex.value++;
      updateFrameDisplay(frameIndex.value);
    }
  }

  function handleStepForward() {
    if (frameIndex.value > 0) {
      isPlaying.value = false;
      frameIndex.value--;
      updateFrameDisplay(frameIndex.value);
    }
  }

  function handleFrameChange(newFrame: number) {
    isPlaying.value = false;
    frameIndex.value = newFrame;
    updateFrameDisplay(newFrame);
  }

  if (mapError.value) {
    return (
      <div
        class="radar-container"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          height: "100%",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <h3 style={{ marginBottom: "1rem" }}>Map Unavailable</h3>
        <p>{mapError.value}</p>
        <p style={{ marginTop: "1rem", opacity: 0.8, fontSize: "0.9em" }}>
          Your device or browser appears to have WebGL disabled or unavailable.
        </p>
      </div>
    );
  }

  return (
    <div class="radar-container">
      <div ref={mapContainer} class="radar-map" />

      {/* Layer Loading Overlay */}
      {layerLoading.value && (
        <div class="layer-loading-overlay">
          <div class="layer-loading-spinner" />
          <span class="layer-loading-text">
            Loading {activeLayer.value === "precip" ? "24h Precipitation" : "Echo Tops"}...
          </span>
        </div>
      )}

      {/* Wind Particle Field Overlay */}
      <WindField
        windData={windData.value}
        mapBounds={mapBounds.value ??
          {
            north: latitude + 4,
            south: latitude - 4,
            east: longitude + 4,
            west: longitude - 4,
          }}
        isVisible={windEnabled.value}
      />

      {/* Audio Toggle for Alert Sounds */}
      <AudioToggle
        onToggle={(enabled) => {
          if (enabled) {
            audioAlerts.enable();
          } else {
            audioAlerts.disable();
          }
        }}
      />

      {/* Top right: Timestamp with LIVE indicator */}
      <div class="radar-timestamp">
        {frameIndex.value === 0 && activeLayer.value === "radar"
          ? (
            <div class="live-indicator">
              <div class="live-dot" />
              <span class="live-text">LIVE</span>
              <span style={{ marginLeft: "8px" }}>
                {timestamp.value || "Loading..."}
              </span>
            </div>
          )
          : (
            timestamp.value || "Loading..."
          )}
      </div>

      <LayerControl
        activeLayer={activeLayer.value}
        onLayerChange={(l) => activeLayer.value = l}
        windEnabled={windEnabled.value}
        onWindToggle={() => windEnabled.value = !windEnabled.value}
        stormReportsEnabled={stormReportsEnabled.value}
        stormReportCount={stormReports.value.length}
        onStormReportsToggle={() =>
          stormReportsEnabled.value = !stormReportsEnabled.value}
      />

      {/* Animation Controls - only show for radar layer */}
      {activeLayer.value === "radar" && frames.value.length > 0 && (
        <AnimationControls
          isPlaying={isPlaying.value}
          onPlayPause={() => isPlaying.value = !isPlaying.value}
          frameIndex={frameIndex.value}
          totalFrames={frames.value.length}
          onFrameChange={handleFrameChange}
          speed={animationSpeed.value}
          onSpeedChange={(s) => animationSpeed.value = s}
          onStepBack={handleStepBack}
          onStepForward={handleStepForward}
        />
      )}

      {/* Zoom Controls */}
      <ZoomControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onRecenter={handleRecenter}
      />

      {/* Mini Map (Picture-in-Picture Regional View) */}
      <MiniMap
        latitude={latitude}
        longitude={longitude}
        mainMapBounds={mapBounds.value ?? undefined}
        isVisible={showMiniMap.value}
        onClose={() => showMiniMap.value = false}
      />

      {/* Mini Map Toggle Button - only show when mini-map is hidden */}
      {!showMiniMap.value && (
        <button
          type="button"
          class="mini-map-toggle"
          onClick={() => showMiniMap.value = true}
          title="Show regional view"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <rect x="12" y="3" width="9" height="9" rx="1" />
          </svg>
        </button>
      )}

      {activeLayer.value === "velocity" ? <VelocityLegend /> : <RadarLegend />}

      {/* Storm Reports Overlay */}
      {mapLoaded.value && mapInstance.current && (
        <StormReports
          map={mapInstance.current}
          visible={stormReportsEnabled.value}
        />
      )}

      {/* Lightning Count Badge */}
      {showLightning.value && lightningStrikes.value.length > 0 && (
        <LightningOverlay strikes={lightningStrikes.value} />
      )}

      {/* Feature Toggles Panel */}
      <FeatureToggles
        showLightning={showLightning}
        showStormReports={stormReportsEnabled}
        showWind={windEnabled}
        showMiniMap={showMiniMap}
        showHourly={showHourly}
      />

      {/* Hourly Forecast Strip - shown when enabled via feature toggle */}
      {showHourly.value && <HourlyForecast />}
    </div>
  );
}
