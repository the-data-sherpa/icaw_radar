import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { LayerControl } from "@/components/LayerControl.tsx";
import { AnimationControls } from "@/components/AnimationControls.tsx";
import { ZoomControls } from "@/components/ZoomControls.tsx";
import { AudioToggle } from "@/components/AudioToggle.tsx";
import { audioAlerts } from "@/lib/audio-alerts.ts";
import { type StormReport } from "@/components/StormReports.tsx";
import { FeatureToggles } from "@/components/FeatureToggles.tsx";
import { MapToolsSheet } from "@/components/MapToolsSheet.tsx";
import { LegendSheet } from "@/components/LegendSheet.tsx";
import { WindField } from "@/components/WindField.tsx";
import { LightningOverlay } from "@/components/LightningOverlay.tsx";
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

interface WindPoint {
  lat: number;
  lon: number;
  speed: number;
  direction: number;
}

interface LightningStrike {
  lat: number;
  lon: number;
  time: number;
  intensity: number;
}

/** Mirrors islands/RadarMap.tsx — the saved view is bucketed by viewport width. */
function getViewKey(): string {
  return `radar-map-view:${
    (globalThis.innerWidth ?? 1920) < 1024 ? "sm" : "lg"
  }`;
}

const REPORT_COLORS: Record<string, string> = {
  tornado: "#ff0000",
  hail: "#00aaff",
  wind: "#ff8800",
  flood: "#00ff88",
  other: "#ffff00",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  const showAlertPolygons = useSignal(true);
  const windEnabled = useSignal(false);
  const stormReportsEnabled = useSignal(false);
  const showMiniMap = useSignal(false);
  const stormReports = useSignal<StormReport[]>([]);
  const toolsOpen = useSignal(false);
  const windData = useSignal<WindPoint[]>([]);
  const lightningStrikes = useSignal<LightningStrike[]>([]);
  const mapBounds = useSignal<
    { north: number; south: number; east: number; west: number } | null
  >(null);

  // Alert polygon Leaflet layer ref
  const alertLayer = useRef<LeafletGeoJSON>(null);
  const lightningGroup = useRef<LeafletGeoJSON>(null);
  const stormGroup = useRef<LeafletGeoJSON>(null);

  const reduceMotion =
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
      false;

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

  // Fetch and render alert polygons
  useEffect(() => {
    // deno-lint-ignore no-explicit-any
    const L = (globalThis as any).L;
    const map = mapRef.current;

    async function fetchAndRender() {
      if (!L || !map) return;
      try {
        const response = await fetch("/api/alerts/geo");
        const data = await response.json();

        // Remove old layer
        if (alertLayer.current && map.hasLayer(alertLayer.current)) {
          map.removeLayer(alertLayer.current);
        }

        if (!showAlertPolygons.value || !data.features?.length) return;

        alertLayer.current = L.geoJSON(data, {
          style: (
            feature: { properties: { color: string; isWatch: boolean } },
          ) => ({
            color: feature.properties.color,
            weight: 2.5,
            opacity: 1,
            fillColor: feature.properties.color,
            fillOpacity: feature.properties.isWatch ? 0.08 : 0.15,
            dashArray: feature.properties.isWatch ? "8, 6" : undefined,
          }),
          onEachFeature: (
            feature: {
              properties: {
                event: string;
                headline: string;
                color: string;
                areaDesc: string;
                expires: string;
              };
            },
            layer: {
              bindPopup: (html: string, opts?: Record<string, unknown>) => void;
            },
          ) => {
            const p = feature.properties;
            const expiryStr = p.expires
              ? new Date(p.expires).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })
              : "";
            // Escaped: this is third-party (NWS) text going into innerHTML.
            layer.bindPopup(
              `<div class="alert-popup-leaflet">
                <div style="color:${
                escapeHtml(p.color)
              };font-weight:700;font-size:14px;margin-bottom:4px">${
                escapeHtml(p.event)
              }</div>
                <div style="font-size:12px;margin-bottom:4px">${
                escapeHtml(p.headline)
              }</div>
                ${
                p.areaDesc
                  ? `<div style="font-size:11px;opacity:0.8;margin-bottom:4px">${
                    escapeHtml(p.areaDesc)
                  }</div>`
                  : ""
              }
                ${
                expiryStr
                  ? `<div style="font-size:11px;opacity:0.7">Expires: ${
                    escapeHtml(expiryStr)
                  }</div>`
                  : ""
              }
              </div>`,
              { maxWidth: 300 },
            );
          },
        }).addTo(map);
      } catch (e) {
        console.error("Failed to fetch alert polygons:", e);
      }
    }

    fetchAndRender();
    const interval = setInterval(fetchAndRender, 30_000);
    return () => {
      clearInterval(interval);
      if (alertLayer.current && map?.hasLayer(alertLayer.current)) {
        map.removeLayer(alertLayer.current);
      }
    };
  }, [showAlertPolygons.value]);

  // Wind data. The particle canvas is backend-agnostic — it only needs the
  // current lat/lon bounds — so the wind field is NOT a WebGL-only feature.
  useEffect(() => {
    async function fetchWindData() {
      try {
        const response = await fetch(
          `/api/wind?lat=${latitude}&lon=${longitude}`,
        );
        const data = await response.json();
        if (data.points) windData.value = data.points;
      } catch (e) {
        console.error("Failed to fetch wind data:", e);
      }
    }
    if (windEnabled.value) fetchWindData();
    const interval = setInterval(() => {
      if (windEnabled.value) fetchWindData();
    }, 600000);
    return () => clearInterval(interval);
  }, [latitude, longitude, windEnabled.value]);

  // Lightning strikes, drawn as plain vector circles (no WebGL glow).
  useEffect(() => {
    async function fetchLightning() {
      try {
        const response = await fetch(
          `/api/lightning?lat=${latitude}&lon=${longitude}`,
        );
        const data = await response.json();
        lightningStrikes.value = data.strikes || [];
      } catch {
        lightningStrikes.value = [];
      }
    }
    if (showLightning.value) fetchLightning();
    const interval = setInterval(() => {
      if (showLightning.value) fetchLightning();
    }, 120000);
    return () => clearInterval(interval);
  }, [latitude, longitude, showLightning.value]);

  useEffect(() => {
    // deno-lint-ignore no-explicit-any
    const L = (globalThis as any).L;
    const map = mapRef.current;
    if (!L || !map) return;

    if (lightningGroup.current && map.hasLayer(lightningGroup.current)) {
      map.removeLayer(lightningGroup.current);
    }
    if (!showLightning.value || lightningStrikes.value.length === 0) return;

    const now = Date.now();
    lightningGroup.current = L.layerGroup(
      lightningStrikes.value.map((strike: LightningStrike) => {
        const opacity = Math.max(0.15, 1 - (now - strike.time) / (180 * 1000));
        return L.circleMarker([strike.lat, strike.lon], {
          radius: 4 + strike.intensity,
          color: "#ffffff",
          weight: 1,
          fillColor: "#ffff00",
          fillOpacity: opacity,
          opacity,
          interactive: false,
        });
      }),
    ).addTo(map);

    return () => {
      if (lightningGroup.current && map.hasLayer(lightningGroup.current)) {
        map.removeLayer(lightningGroup.current);
      }
    };
  }, [showLightning.value, lightningStrikes.value]);

  // Storm reports. Each report gets a visible dot plus an oversized invisible
  // hit circle, so the tap target is ~44px instead of ~16px.
  useEffect(() => {
    // deno-lint-ignore no-explicit-any
    const L = (globalThis as any).L;
    const map = mapRef.current;
    if (!L || !map) return;

    if (stormGroup.current && map.hasLayer(stormGroup.current)) {
      map.removeLayer(stormGroup.current);
    }
    if (!stormReportsEnabled.value || stormReports.value.length === 0) return;

    // deno-lint-ignore no-explicit-any
    const markers: any[] = [];
    for (const report of stormReports.value) {
      const color = REPORT_COLORS[report.type] ?? REPORT_COLORS.other;
      markers.push(
        L.circleMarker([report.lat, report.lon], {
          radius: 8,
          color: "#ffffff",
          weight: 2,
          fillColor: color,
          fillOpacity: 0.9,
          interactive: false,
        }),
      );
      const when = new Date(report.time).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      const place = [report.city, report.county && `${report.county} County`]
        .filter(Boolean).join(", ");
      markers.push(
        L.circleMarker([report.lat, report.lon], {
          radius: 22,
          opacity: 0,
          fillOpacity: 0,
          interactive: true,
        }).bindPopup(
          `<div class="storm-report-popup-leaflet">
            <div style="color:${color};font-weight:700;font-size:14px">${
            escapeHtml(report.type)
          }</div>
            <div style="font-size:12px">${escapeHtml(when)}</div>
            ${
            report.magnitude
              ? `<div style="font-size:12px">${
                escapeHtml(report.magnitude)
              }</div>`
              : ""
          }
            ${
            place
              ? `<div style="font-size:11px;opacity:0.8">${
                escapeHtml(place)
              }</div>`
              : ""
          }
            ${
            report.remarks
              ? `<div style="font-size:11px;opacity:0.8">${
                escapeHtml(report.remarks)
              }</div>`
              : ""
          }
          </div>`,
          { maxWidth: 280 },
        ),
      );
    }
    stormGroup.current = L.layerGroup(markers).addTo(map);

    return () => {
      if (stormGroup.current && map.hasLayer(stormGroup.current)) {
        map.removeLayer(stormGroup.current);
      }
    };
  }, [stormReportsEnabled.value, stormReports.value]);

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
      const saved = localStorage.getItem(getViewKey());
      if (saved) {
        const { lng, lat, zoom: savedZoom } = JSON.parse(saved);
        if (lng && lat && savedZoom) {
          initialZoom = savedZoom;
          initialCenter = [lat, lng];
        }
      }
    } catch { /* ignore */ }

    // GESTURE POLICY: no cooperative-gesture equivalent is configured, and
    // none is wanted. The document does not scroll below 64rem, so one-finger
    // pan cannot steal a page scroll. Leaflet has no rotation or pitch at all,
    // so the MapLibre dragRotate/touchPitch lockdown has no counterpart here.
    // `tap` handling is left at Leaflet's default: it is what makes popups
    // openable on iOS.
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
          pointToLayer: (
            _feature: { properties: { name: string } },
            latlng: { lat: number; lng: number },
          ) => {
            return L.circleMarker(latlng, {
              radius: 3,
              fillColor: "#ffffff",
              color: "#000000",
              weight: 1,
              fillOpacity: 1,
            });
          },
          onEachFeature: (
            feature: { properties: { name: string } },
            layer: {
              bindTooltip: (
                name: string,
                opts: Record<string, unknown>,
              ) => void;
            },
          ) => {
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

    // Save view state on move (debounced — a touch flick settles repeatedly)
    // and publish bounds for the wind overlay.
    let saveTimer = 0;
    const publishBounds = () => {
      const b = map.getBounds();
      mapBounds.value = {
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      };
    };
    publishBounds();
    map.on("moveend", () => {
      const center = map.getCenter();
      const z = map.getZoom();
      publishBounds();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try {
          localStorage.setItem(
            getViewKey(),
            JSON.stringify({ lng: center.lng, lat: center.lat, zoom: z }),
          );
        } catch { /* private mode / quota */ }
      }, 400) as unknown as number;
    });

    mapRef.current = map;

    // Leaflet 1.9 binds only `window.resize`; it has NO ResizeObserver. A
    // detent change or an orientation change therefore leaves it with a stale
    // pixel origin (tiles offset, clicks landing in the wrong place).
    let resizeTimer = 0;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(
        () => map.invalidateSize({ animate: false }),
        80,
      ) as unknown as number;
    });
    ro.observe(mapContainer.current);

    const onDetent = () => map.invalidateSize({ animate: false });
    const onOrient = () =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => map.invalidateSize({ animate: false }))
      );
    globalThis.addEventListener("icaw:detent", onDetent);
    globalThis.addEventListener("orientationchange", onOrient);

    return () => {
      clearTimeout(saveTimer);
      clearTimeout(resizeTimer);
      ro.disconnect();
      globalThis.removeEventListener("icaw:detent", onDetent);
      globalThis.removeEventListener("orientationchange", onOrient);
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
        if (!reduceMotion) isPlaying.value = true;
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
        case "a":
        case "A":
          showAlertPolygons.value = !showAlertPolygons.value;
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
    mapRef.current?.setView([latitude, longitude], zoom, {
      animate: !reduceMotion,
    });
    try {
      localStorage.removeItem(getViewKey());
    } catch { /* private mode */ }
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
            Loading {activeLayer.value === "precip"
              ? "24h Precipitation"
              : "Echo Tops"}...
          </span>
        </div>
      )}

      {/* Wind particle field — canvas only, works without WebGL. */}
      <WindField
        windData={windData.value}
        mapBounds={mapBounds.value ?? {
          north: latitude + 4,
          south: latitude - 4,
          east: longitude + 4,
          west: longitude - 4,
        }}
        isVisible={windEnabled.value}
      />

      {
        /* TOP RAIL — same three `.map-chrome` wrappers, same order, as
          islands/RadarMap.tsx, so every responsive rule applies here too. */
      }
      <div class="map-chrome map-chrome--top">
        <div class="radar-timestamp">
          {frameIndex.value === 0 && activeLayer.value === "radar"
            ? (
              <div class="live-indicator">
                <div class="live-dot" />
                <span class="live-text">LIVE</span>
                <span class="live-time">{timestamp.value || "Loading..."}</span>
              </div>
            )
            : timestamp.value || "Loading..."}
        </div>

        <AudioToggle
          onToggle={(enabled) => {
            if (enabled) audioAlerts.enable();
            else audioAlerts.disable();
          }}
        />

        <MapToolsSheet
          open={toolsOpen}
          showAlertPolygons={showAlertPolygons}
          showLightning={showLightning}
          showStormReports={stormReportsEnabled}
          showWind={windEnabled}
          showMiniMap={showMiniMap}
          showHourly={showHourly}
          stormReportCount={stormReports.value.length}
          lightningCount={lightningStrikes.value.length}
        />

        <LayerControl
          activeLayer={activeLayer.value}
          onLayerChange={(l) => (activeLayer.value = l)}
          windEnabled={windEnabled.value}
          onWindToggle={() => (windEnabled.value = !windEnabled.value)}
          stormReportsEnabled={stormReportsEnabled.value}
          stormReportCount={stormReports.value.length}
          onStormReportsToggle={() => (stormReportsEnabled.value =
            !stormReportsEnabled.value)}
        />

        {
          /* Regional View is the ONE feature this path genuinely cannot
            provide: the mini-map is a second MapLibre instance. It is marked
            unavailable rather than left as a control that silently no-ops. */
        }
        <FeatureToggles
          showAlertPolygons={showAlertPolygons}
          showLightning={showLightning}
          showStormReports={stormReportsEnabled}
          showWind={windEnabled}
          showMiniMap={showMiniMap}
          showHourly={showHourly}
          unavailable={["Regional View"]}
        />

        {showLightning.value && lightningStrikes.value.length > 0 && (
          <LightningOverlay strikes={lightningStrikes.value} />
        )}
      </div>

      {/* RIGHT RAIL */}
      <div class="map-chrome map-chrome--rail">
        <ZoomControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onRecenter={handleRecenter}
        />
        {showMiniMap.value && (
          <div class="mini-map-container">
            <div class="mini-map-header">
              <span>Regional View</span>
              <button
                type="button"
                class="mini-map-close"
                onClick={() => (showMiniMap.value = false)}
                title="Close regional view"
                aria-label="Close regional view"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <span class="deck-unsupported-note">
              Not available without WebGL
            </span>
          </div>
        )}
      </div>

      {/* BOTTOM STACK */}
      <div class="map-chrome map-chrome--bottom">
        {showHourly.value && <HourlyForecast />}
        <LegendSheet
          activeLayer={activeLayer.value}
          windEnabled={windEnabled.value}
        />
        {activeLayer.value === "radar" && frames.value.length > 0 && (
          <AnimationControls
            isPlaying={isPlaying.value}
            onPlayPause={() => (isPlaying.value = !isPlaying.value)}
            frameIndex={frameIndex.value}
            totalFrames={frames.value.length}
            onFrameChange={handleFrameChange}
            speed={animationSpeed.value}
            onSpeedChange={(s) => (animationSpeed.value = s)}
            onStepBack={handleStepBack}
            onStepForward={handleStepForward}
          />
        )}
      </div>
    </div>
  );
}
