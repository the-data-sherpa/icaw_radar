import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { RadarLegend } from "@/components/RadarLegend.tsx";
import { VelocityLegend } from "@/components/VelocityLegend.tsx";
import { LayerControl } from "@/components/LayerControl.tsx";
import { AnimationControls } from "@/components/AnimationControls.tsx";
import { ZoomControls } from "@/components/ZoomControls.tsx";
import { AudioToggle } from "@/components/AudioToggle.tsx";
import { audioAlerts } from "@/lib/audio-alerts.ts";
import { type StormReport } from "@/components/StormReports.tsx";
import { FeatureToggles } from "@/components/FeatureToggles.tsx";
import HourlyForecast from "@/islands/HourlyForecast.tsx";

// ============================================================================
// Types
// ============================================================================

interface RadarFrame {
  id: string;
  suffix: string;
  minutesAgo: number;
  tileUrl: string;
  timestamp: string;
}

interface LeafletFallbackMapProps {
  latitude: number;
  longitude: number;
  zoom?: number;
}

// deno-lint-ignore no-explicit-any
type LeafletMap = any;
// deno-lint-ignore no-explicit-any
type LeafletTileLayer = any;
// deno-lint-ignore no-explicit-any
type LeafletGeoJSON = any;

/**
 * Leaflet-based radar map fallback for browsers without WebGL support.
 * Provides core functionality: basemap, radar animation, overlays, and layer switching.
 * Uses DOM/SVG rendering instead of WebGL.
 */
export function LeafletFallbackMap(
  { latitude, longitude, zoom = 7 }: LeafletFallbackMapProps,
) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap>(null);
  const frameIndex = useSignal(-1);
  const frames = useSignal<RadarFrame[]>([]);
  const timestamp = useSignal("");
  const isPlaying = useSignal(false);
  const activeLayer = useSignal<"radar" | "precip" | "velocity">("radar");
  const animationSpeed = useSignal(1);
  const animationReady = useSignal(false);
  const layerLoading = useSignal(false);

  // Overlay refs
  const radarLayers = useRef<LeafletTileLayer[]>([]);
  const precipLayer = useRef<LeafletTileLayer>(null);
  const velocityLayer = useRef<LeafletTileLayer>(null);
  const boundaryLayer = useRef<LeafletGeoJSON>(null);
  const citiesLayer = useRef<LeafletGeoJSON>(null);
  const prevFrameIndex = useRef<number>(-1);

  // Feature toggles (simplified for fallback — no lightning glow, no wind particles)
  const showLightning = useSignal(false);
  const showHourly = useSignal(false);
  const windEnabled = useSignal(false);
  const stormReportsEnabled = useSignal(false);
  const showMiniMap = useSignal(false);
  const stormReports = useSignal<StormReport[]>([]);

  // Fetch radar frames
  useEffect(() => {
    async function fetchFrames() {
      try {
        const response = await fetch("/api/radar/frames");
        const data = await response.json();
        const currentFirst = frames.value[0]?.timestamp;
        const newFirst = data[0]?.timestamp;
        if (currentFirst !== newFirst || frames.value.length === 0) {
          frames.value = data;
        }
      } catch (e) {
        console.error("Failed to fetch radar frames:", e);
      }
    }
    fetchFrames();
    const interval = setInterval(fetchFrames, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch storm reports (for badge count)
  useEffect(() => {
    async function fetchStormReports() {
      try {
        const response = await fetch("/api/storm-reports");
        stormReports.value = await response.json();
      } catch {
        stormReports.value = [];
      }
    }
    fetchStormReports();
    const interval = setInterval(fetchStormReports, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainer.current) return;

    // deno-lint-ignore no-explicit-any
    const L = (globalThis as any).L;
    if (!L) {
      console.error("Leaflet not loaded");
      return;
    }

    // Load saved view state
    let initialZoom = zoom;
    let initialCenter: [number, number] = [latitude, longitude];
    try {
      const saved = localStorage.getItem("radar-map-view");
      if (saved) {
        const { lng, lat, zoom: savedZoom } = JSON.parse(saved);
        if (lng && lat && savedZoom) {
          initialZoom = savedZoom;
          initialCenter = [lat, lng];
        }
      }
    } catch { /* ignore */ }

    const map = L.map(mapContainer.current, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: false,
      attributionControl: false,
    });

    // Dark basemap
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
      { subdomains: "abc", maxZoom: 19 },
    ).addTo(map);

    // Labels on top (high zIndex)
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png",
      { subdomains: "abc", maxZoom: 19, pane: "overlayPane" },
    ).addTo(map);

    // 24h Precipitation layer (hidden by default)
    precipLayer.current = L.tileLayer(
      "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/q2-p24h/{z}/{x}/{y}.png",
      { opacity: 0.8, maxZoom: 19 },
    );

    // Echo Tops layer (hidden by default)
    velocityLayer.current = L.tileLayer(
      "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-eet/{z}/{x}/{y}.png",
      { opacity: 0.8, maxZoom: 19 },
    );

    // Iredell County Boundary
    fetch("/iredell-boundary.json")
      .then((r) => r.json())
      .then((data) => {
        boundaryLayer.current = L.geoJSON(data, {
          style: {
            color: "#FFFF00",
            weight: 2,
            opacity: 0.8,
            fillOpacity: 0,
          },
        }).addTo(map);
      })
      .catch((e) => console.error("Failed to load boundary:", e));

    // Iredell Cities
    fetch("/iredell-cities.json")
      .then((r) => r.json())
      .then((data) => {
        citiesLayer.current = L.geoJSON(data, {
          pointToLayer: (_feature: { properties: { name: string } }, latlng: { lat: number; lng: number }) => {
            return L.circleMarker(latlng, {
              radius: 3,
              fillColor: "#ffffff",
              color: "#000000",
              weight: 1,
              fillOpacity: 1,
            });
          },
          onEachFeature: (feature: { properties: { name: string } }, layer: { bindTooltip: (name: string, opts: Record<string, unknown>) => void }) => {
            if (feature.properties?.name) {
              layer.bindTooltip(feature.properties.name, {
                permanent: true,
                direction: "bottom",
                offset: [0, 8],
                className: "leaflet-city-label",
              });
            }
          },
        }).addTo(map);
      })
      .catch((e) => console.error("Failed to load cities:", e));

    // Range Rings
    const ringFeatures = [10, 25, 50].map((miles) => {
      const radiusKm = miles * 1.60934;
      const points = 64;
      const coords: [number, number][] = [];
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * 2 * Math.PI;
        const dx = (radiusKm / 111.32) * Math.cos(angle);
        const dy = (radiusKm /
          (111.32 * Math.cos((latitude * Math.PI) / 180))) *
          Math.sin(angle);
        coords.push([latitude + dx, longitude + dy]);
      }
      return coords;
    });

    ringFeatures.forEach((coords) => {
      L.polyline(coords, {
        color: "rgba(255, 255, 255, 0.3)",
        weight: 1,
        dashArray: "8, 8",
      }).addTo(map);
    });

    // Save view state on move
    map.on("moveend", () => {
      const center = map.getCenter();
      const z = map.getZoom();
      localStorage.setItem(
        "radar-map-view",
        JSON.stringify({ lng: center.lng, lat: center.lat, zoom: z }),
      );
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [latitude, longitude, zoom]);

  // Add/update radar frame layers when frames change
  useEffect(() => {
    // deno-lint-ignore no-explicit-any
    const L = (globalThis as any).L;
    const map = mapRef.current;
    if (!L || !map || frames.value.length === 0) return;

    // Remove old radar layers
    radarLayers.current.forEach((layer: LeafletTileLayer) => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    });

    // Create new radar tile layers (all hidden initially)
    radarLayers.current = frames.value.map((frame: RadarFrame) => {
      return L.tileLayer(frame.tileUrl, {
        opacity: 0,
        maxZoom: 19,
      });
    });

    // Show the oldest frame
    const oldestIdx = frames.value.length - 1;
    radarLayers.current[oldestIdx].setOpacity(0.7);
    radarLayers.current[oldestIdx].addTo(map);

    // Add all layers to map (hidden) so they preload
    radarLayers.current.forEach((layer: LeafletTileLayer, idx: number) => {
      if (idx !== oldestIdx) {
        layer.addTo(map);
      }
    });

    frameIndex.value = oldestIdx;
    prevFrameIndex.current = oldestIdx;
    updateTimestamp(frames.value[oldestIdx].timestamp);

    if (!animationReady.value) {
      setTimeout(() => {
        animationReady.value = true;
        isPlaying.value = true;
      }, 1500);
    }
  }, [frames.value]);

  // Layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (activeLayer.value === "precip") {
      // Hide radar layers
      radarLayers.current.forEach((l: LeafletTileLayer) => l.setOpacity(0));
      // Hide velocity
      if (map.hasLayer(velocityLayer.current)) {
        map.removeLayer(velocityLayer.current);
      }
      // Show precip
      if (!map.hasLayer(precipLayer.current)) {
        precipLayer.current.addTo(map);
      }
      timestamp.value = "24h Precipitation Accumulation";
    } else if (activeLayer.value === "velocity") {
      radarLayers.current.forEach((l: LeafletTileLayer) => l.setOpacity(0));
      if (map.hasLayer(precipLayer.current)) {
        map.removeLayer(precipLayer.current);
      }
      if (!map.hasLayer(velocityLayer.current)) {
        velocityLayer.current.addTo(map);
      }
      timestamp.value = "Echo Tops (Storm Height)";
    } else {
      // Radar mode
      if (map.hasLayer(precipLayer.current)) {
        map.removeLayer(precipLayer.current);
      }
      if (map.hasLayer(velocityLayer.current)) {
        map.removeLayer(velocityLayer.current);
      }
      // Restore current frame
      if (
        frameIndex.value >= 0 &&
        radarLayers.current[frameIndex.value]
      ) {
        radarLayers.current[frameIndex.value].setOpacity(0.7);
      }
      layerLoading.value = false;
    }
  }, [activeLayer.value]);

  // Animation loop
  useEffect(() => {
    if (activeLayer.value !== "radar") return;
    if (
      !isPlaying.value || frames.value.length === 0 || !animationReady.value
    ) {
      return;
    }

    const totalFrames = frames.value.length;
    let currentFrame = totalFrames - 1;
    let timeout: number;

    const animate = () => {
      const prevFrame = prevFrameIndex.current;

      // Hide previous frame
      if (
        prevFrame >= 0 && prevFrame !== currentFrame &&
        radarLayers.current[prevFrame]
      ) {
        radarLayers.current[prevFrame].setOpacity(0);
      }

      // Show current frame
      if (radarLayers.current[currentFrame]) {
        radarLayers.current[currentFrame].setOpacity(0.7);
      }

      prevFrameIndex.current = currentFrame;
      if (frames.value[currentFrame]) {
        updateTimestamp(frames.value[currentFrame].timestamp);
      }
      frameIndex.value = currentFrame;
    };

    const runAnimation = () => {
      animate();
      currentFrame--;
      if (currentFrame < 0) {
        currentFrame = totalFrames - 1;
        timeout = setTimeout(runAnimation, 2000 / animationSpeed.value);
      } else {
        timeout = setTimeout(runAnimation, 500 / animationSpeed.value);
      }
    };

    runAnimation();
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [
    isPlaying.value,
    frames.value,
    activeLayer.value,
    animationSpeed.value,
    animationReady.value,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (
        !animationReady.value &&
        ["ArrowLeft", "ArrowRight", " "].includes(e.key)
      ) {
        return;
      }

      switch (e.key) {
        case " ":
          e.preventDefault();
          isPlaying.value = !isPlaying.value;
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (frameIndex.value < frames.value.length - 1) {
            frameIndex.value++;
            isPlaying.value = false;
            updateFrameDisplay(frameIndex.value);
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (frameIndex.value > 0) {
            frameIndex.value--;
            isPlaying.value = false;
            updateFrameDisplay(frameIndex.value);
          }
          break;
        case "r":
        case "R":
          if (activeLayer.value === "radar") activeLayer.value = "precip";
          else if (activeLayer.value === "precip") {
            activeLayer.value = "velocity";
          } else activeLayer.value = "radar";
          break;
      }
    }

    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, []);

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
    const prevFrame = prevFrameIndex.current;
    if (
      prevFrame >= 0 && prevFrame !== idx && radarLayers.current[prevFrame]
    ) {
      radarLayers.current[prevFrame].setOpacity(0);
    }
    if (radarLayers.current[idx]) {
      radarLayers.current[idx].setOpacity(0.7);
    }
    prevFrameIndex.current = idx;
    if (frames.value[idx]) {
      updateTimestamp(frames.value[idx].timestamp);
    }
  }

  function handleZoomIn() {
    mapRef.current?.zoomIn();
  }

  function handleZoomOut() {
    mapRef.current?.zoomOut();
  }

  function handleRecenter() {
    mapRef.current?.setView([latitude, longitude], zoom);
    localStorage.removeItem("radar-map-view");
  }

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

  return (
    <div class="radar-container">
      <div ref={mapContainer} class="radar-map" />

      {layerLoading.value && (
        <div class="layer-loading-overlay">
          <div class="layer-loading-spinner" />
          <span class="layer-loading-text">
            Loading{" "}
            {activeLayer.value === "precip"
              ? "24h Precipitation"
              : "Echo Tops"}...
          </span>
        </div>
      )}

      <AudioToggle
        onToggle={(enabled) => {
          if (enabled) audioAlerts.enable();
          else audioAlerts.disable();
        }}
      />

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
          : timestamp.value || "Loading..."}
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

      <ZoomControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onRecenter={handleRecenter}
      />

      {activeLayer.value === "velocity" ? <VelocityLegend /> : <RadarLegend />}

      <FeatureToggles
        showLightning={showLightning}
        showStormReports={stormReportsEnabled}
        showWind={windEnabled}
        showMiniMap={showMiniMap}
        showHourly={showHourly}
      />

      {showHourly.value && <HourlyForecast />}
    </div>
  );
}
