import { type Signal, useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { LayerControl } from "@/components/LayerControl.tsx";
import { AnimationControls } from "@/components/AnimationControls.tsx";
import { ZoomControls } from "@/components/ZoomControls.tsx";
import { MiniMap } from "@/components/MiniMap.tsx";
import { WindField } from "@/components/WindField.tsx";
import { AudioToggle } from "@/components/AudioToggle.tsx";
import { audioAlerts } from "@/lib/audio-alerts.ts";
import { type StormReport, StormReports } from "@/components/StormReports.tsx";
import { AlertPolygons } from "@/components/AlertPolygons.tsx";
import { FeatureToggles } from "@/components/FeatureToggles.tsx";
import { RadarLegend } from "@/components/RadarLegend.tsx";
import { VelocityLegend } from "@/components/VelocityLegend.tsx";
import {
  generateLightningGeoJSON,
  getLightningLayerConfig,
  LightningOverlay,
} from "@/components/LightningOverlay.tsx";
import HourlyForecast from "@/islands/HourlyForecast.tsx";
import { isWebGLSupported } from "@/lib/webgl-detect.ts";
import { LeafletFallbackMap } from "@/components/LeafletFallbackMap.tsx";

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

/**
 * The saved view is bucketed by viewport width. A single key restored the
 * desktop zoom onto a phone (and vice versa), which is never the right frame.
 */
function getViewKey(): string {
  return `radar-map-view:${
    (globalThis.innerWidth ?? 1920) < 1024 ? "sm" : "lg"
  }`;
}

/**
 * setInterval that stops while the document is hidden and fires immediately
 * on return. A backgrounded tab polling four endpoints is pure battery burn on
 * a phone, and the data is stale the moment the user comes back anyway.
 */
function visibleInterval(fn: () => void, ms: number): () => void {
  let id = 0;
  const start = () => {
    if (id) return;
    id = setInterval(fn, ms) as unknown as number;
  };
  const stop = () => {
    if (id) {
      clearInterval(id);
      id = 0;
    }
  };
  const onVisibility = () => {
    if (document.hidden) {
      stop();
    } else {
      fn();
      start();
    }
  };
  if (!document.hidden) start();
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    stop();
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

// Cache WebGL detection at module level (runs once on client)
let _webglSupported: boolean | null = null;
function checkWebGL(): boolean {
  if (_webglSupported === null) {
    _webglSupported = typeof document !== "undefined"
      ? isWebGLSupported()
      : true;
  }
  return _webglSupported;
}

/**
 * Top-level RadarMap component that selects the rendering backend.
 * Uses MapLibre GL (WebGL) when available, falls back to Leaflet (DOM/SVG).
 */
export default function RadarMap(
  { latitude, longitude, zoom = 7 }: RadarMapProps,
) {
  if (!checkWebGL()) {
    return (
      <LeafletFallbackMap
        latitude={latitude}
        longitude={longitude}
        zoom={zoom}
      />
    );
  }

  return (
    <MapLibreRadarMap
      latitude={latitude}
      longitude={longitude}
      zoom={zoom}
    />
  );
}

// ============================================================================
// Mobile map sheets — split trigger / panel
// ============================================================================

/**
 * MARKUP CONTRACT (static/styles/deck.css:29-34): below 64rem all three
 * `.map-chrome` wrappers become `position: fixed` stacking contexts, and
 * `.map-chrome--rail` / `.map-chrome--bottom` additionally carry a `translate`,
 * which makes them the containing block for `position: fixed` descendants.
 * `.deck-tools-sheet`, `.deck-legend-sheet`, `.deck-backdrop` and
 * `.mini-map-container` must therefore be direct children of
 * `.radar-container`; only the `.deck-tools-btn` and `.deck-legend-chip`
 * triggers may live inside a chrome wrapper.
 *
 * So the tools sheet and the legend are each split into a trigger and a panel
 * that share one signal owned by MapLibreRadarMap, instead of being rendered as
 * one component. Every new element carries `deck-only` (or sits inside
 * `.deck-legend-sheet`, which is `display: contents` in broadcast.css), so
 * /overlay and desktop are unchanged.
 */

interface ToolRow {
  signal: Signal<boolean>;
  icon: string;
  label: string;
  badge?: number;
}

/** The `Layers` trigger. Lives inside `.map-chrome--top`. */
function MapToolsButton(
  { open, triggerRef }: {
    open: Signal<boolean>;
    triggerRef: { current: HTMLButtonElement | null };
  },
) {
  return (
    <button
      type="button"
      ref={triggerRef}
      class="deck-tools-btn deck-only"
      aria-expanded={open.value}
      aria-controls="deck-tools"
      onClick={() => (open.value = !open.value)}
    >
      <span aria-hidden="true">{String.fromCodePoint(0x2699, 0xFE0F)}</span>
      Layers
    </button>
  );
}

/**
 * The layers/data panel + its light-dismiss backdrop. Direct child of
 * `.radar-container` so its z-index is not trapped in the top rail's stacking
 * context. Bound to the SAME signals as components/FeatureToggles.tsx, so
 * there is no forked render path and no duplicated state.
 */
function MapToolsPanel(
  props: {
    open: Signal<boolean>;
    triggerRef: { current: HTMLButtonElement | null };
    showAlertPolygons: Signal<boolean>;
    showLightning: Signal<boolean>;
    showStormReports: Signal<boolean>;
    showWind: Signal<boolean>;
    showMiniMap: Signal<boolean>;
    showHourly: Signal<boolean>;
    stormReportCount?: number;
    lightningCount?: number;
  },
) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const wasOpen = useRef(false);
  const isOpen = props.open.value;

  // Row order matches components/FeatureToggles.tsx so the two UIs agree.
  const rows: ToolRow[] = [
    {
      signal: props.showAlertPolygons,
      icon: String.fromCodePoint(0x26A0, 0xFE0F),
      label: "Alert Zones",
    },
    {
      signal: props.showLightning,
      icon: String.fromCodePoint(0x26A1),
      label: "Lightning",
      badge: props.lightningCount,
    },
    {
      signal: props.showStormReports,
      icon: String.fromCodePoint(0x1F32A, 0xFE0F),
      label: "Storm Reports",
      badge: props.stormReportCount,
    },
    {
      signal: props.showWind,
      icon: String.fromCodePoint(0x1F4A8),
      label: "Wind Field",
    },
    {
      signal: props.showMiniMap,
      icon: String.fromCodePoint(0x1F5FA, 0xFE0F),
      label: "Regional View",
    },
    {
      signal: props.showHourly,
      icon: String.fromCodePoint(0x1F4CA),
      label: "Hourly Forecast",
    },
  ];

  useEffect(() => {
    if (isOpen === wasOpen.current) return;
    if (isOpen) {
      panelRef.current?.focus();
    } else if (wasOpen.current) {
      props.triggerRef.current?.focus();
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        class="deck-backdrop deck-only"
        data-open={isOpen ? "true" : "false"}
        aria-label="Close layers panel"
        tabIndex={isOpen ? 0 : -1}
        onClick={() => (props.open.value = false)}
      />

      <div
        id="deck-tools"
        ref={panelRef}
        class="deck-tools-sheet deck-only"
        data-open={isOpen ? "true" : "false"}
        role="group"
        aria-label="Map layers and data"
        tabIndex={-1}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === "Escape") {
            e.preventDefault();
            props.open.value = false;
          }
        }}
      >
        <h2 class="deck-tools-title">Layers &amp; data</h2>
        <div class="deck-tools-group">
          <div class="deck-tools-group-title">Overlays</div>
          {rows.map((r) => (
            <label key={r.label} class="deck-tools-row">
              <input
                type="checkbox"
                checked={r.signal.value}
                onChange={() => (r.signal.value = !r.signal.value)}
              />
              <span class="deck-tools-row-icon" aria-hidden="true">
                {r.icon}
              </span>
              <span class="deck-tools-row-label">{r.label}</span>
              {r.badge !== undefined && r.badge > 0 && (
                <span class="deck-tools-row-badge">{r.badge}</span>
              )}
              <span class="deck-tools-switch" aria-hidden="true" />
            </label>
          ))}
        </div>
        <button
          type="button"
          class="deck-tools-close"
          aria-label="Close layers panel"
          onClick={() => (props.open.value = false)}
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
    </>
  );
}

function legendLabel(activeLayer: "radar" | "precip" | "velocity"): string {
  return activeLayer === "velocity"
    ? "Echo Tops (kft)"
    : activeLayer === "precip"
    ? "24h Precipitation"
    : "Reflectivity (dBZ)";
}

/** The legend trigger. Lives inside `.map-chrome--bottom`. */
function LegendChip(
  { open, activeLayer }: {
    open: Signal<boolean>;
    activeLayer: "radar" | "precip" | "velocity";
  },
) {
  return (
    <button
      type="button"
      class="deck-legend-chip deck-only"
      aria-expanded={open.value}
      aria-controls="deck-legend"
      onClick={() => (open.value = !open.value)}
    >
      {legendLabel(activeLayer)}
    </button>
  );
}

/**
 * The legend panel. `.deck-legend-sheet` is `display: contents` in
 * broadcast.css, so on desktop and /overlay it generates no box and
 * `.radar-legend` keeps its absolute bottom-right corner exactly as today.
 * The legend components are rendered exactly ONCE — never duplicate them.
 */
function LegendPanel(
  { open, activeLayer }: {
    open: Signal<boolean>;
    activeLayer: "radar" | "precip" | "velocity";
  },
) {
  return (
    <>
      <button
        type="button"
        class="deck-backdrop deck-only"
        data-open={open.value ? "true" : "false"}
        aria-label="Close legend"
        tabIndex={open.value ? 0 : -1}
        onClick={() => (open.value = false)}
      />

      <div
        id="deck-legend"
        class="deck-legend-sheet"
        data-open={open.value ? "true" : "false"}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === "Escape") {
            e.preventDefault();
            open.value = false;
          }
        }}
      >
        {activeLayer === "velocity" ? <VelocityLegend /> : <RadarLegend />}
        <button
          type="button"
          class="deck-legend-close deck-only"
          aria-label="Close legend"
          onClick={() => (open.value = false)}
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
    </>
  );
}

/** WebGL-based radar map using MapLibre GL JS. */
function MapLibreRadarMap(
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
  const showAlertPolygons = useSignal(true);
  const lightningStrikes = useSignal<LightningStrike[]>([]);
  const toolsOpen = useSignal(false); // Mobile map-tools sheet
  const legendOpen = useSignal(false); // Mobile legend sheet
  const toolsTrigger = useRef<HTMLButtonElement | null>(null);

  // Capability gates, read once. `coarse` changes tile/render policy for
  // touch devices ONLY — the desktop and OBS paths are untouched.
  const coarse = globalThis.matchMedia?.("(pointer: coarse)").matches ?? false;
  const reduceMotion =
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
      false;

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
    return visibleInterval(fetchFrames, 60000);
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
    return visibleInterval(() => {
      if (windEnabled.value) {
        fetchWindData();
      }
    }, 600000);
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
    return visibleInterval(fetchStormReports, 5 * 60 * 1000);
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
    return visibleInterval(() => {
      if (showLightning.value) {
        fetchLightning();
      }
    }, 120000);
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
      if (
        !animationReady.value &&
        ["ArrowLeft", "ArrowRight", " "].includes(e.key)
      ) return; // Wait for map ready

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
        case "a":
        case "A":
          // Toggle alert polygon overlay
          showAlertPolygons.value = !showAlertPolygons.value;
          break;
      }
    }

    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Track how many radar frame layers are currently on the map
  const radarFrameCount = useRef(0);

  // Create map once — does NOT depend on frames
  useEffect(() => {
    if (!mapContainer.current) return;

    // deno-lint-ignore no-explicit-any
    const maplibregl = (globalThis as any).maplibregl;
    if (!maplibregl) {
      console.error("MapLibre GL not loaded");
      return;
    }

    // Load saved view state
    const viewKey = getViewKey();
    let initialZoom = zoom;
    let initialCenter = [longitude, latitude];

    try {
      const saved = localStorage.getItem(viewKey);
      if (saved) {
        const { lng, lat, zoom: savedZoom } = JSON.parse(saved);
        if (lng && lat && savedZoom) {
          initialZoom = savedZoom;
          initialCenter = [lng, lat];
        }
      }
    } catch { /* ignore error */ }

    let map;
    try {
      map = new maplibregl.Map({
        container: mapContainer.current!,
        style: {
          version: 8,
          glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
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
        interactive: true,
        // A 2D radar has no use for 3D. An accidental twist is unrecoverable:
        // there is no compass control, so a rotated map can only be fixed by
        // recentering.
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        renderWorldCopies: false,
        // DELIBERATELY FALSE. The document does not scroll below 64rem
        // (html.web body { overflow: clip }), so there is no page scroll to
        // steal, and requiring two fingers would tax the app's PRIMARY
        // interaction — one-finger pan of the radar. If page scrolling is ever
        // reintroduced below 64rem this MUST become true.
        cooperativeGestures: false,
        // Cap the render resolution on phones: a 3x DPR canvas at full size is
        // ~9x the fragment work for no visible gain on raster radar tiles.
        pixelRatio: coarse
          ? Math.min(globalThis.devicePixelRatio || 1, 2)
          : (globalThis.devicePixelRatio || 1),
        fadeDuration: coarse ? 0 : 300,
      });
      // Belt and braces: dragRotate:false does not cover the two-finger
      // rotate gesture on touch.
      map.touchZoomRotate.disableRotation();
    } catch (e) {
      console.error("Failed to initialize map:", e);
      mapError.value = e instanceof Error
        ? e.message
        : "WebGL context creation failed";
      return;
    }

    // Save view state on move and update mini-map bounds.
    // The write is debounced: a touch flick plus inertia settles repeatedly,
    // and a synchronous JSON.stringify + setItem on each settle is main-thread
    // storage I/O in the middle of a pan.
    let saveTimer = 0;
    map.on("moveend", () => {
      const center = map.getCenter();
      const z = map.getZoom();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try {
          localStorage.setItem(
            getViewKey(),
            JSON.stringify({
              lng: center.lng,
              lat: center.lat,
              zoom: z,
            }),
          );
        } catch { /* private mode / quota */ }
      }, 400) as unknown as number;

      const bounds = map.getBounds();
      mapBounds.value = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      };
    });

    map.on("load", async () => {
      // Set initial bounds for mini-map
      const bounds = map.getBounds();
      mapBounds.value = {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      };

      // Add labels layer on top of radar (will be above radar frames added later)
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

      // Add Iredell Cities — fetch and inline to avoid worker-XHR edge cases
      try {
        const citiesData = await fetch("/iredell-cities.json").then((r) =>
          r.json()
        );
        map.addSource("iredell-cities", {
          type: "geojson",
          data: citiesData,
        });

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

        map.addLayer({
          id: "iredell-cities-labels",
          type: "symbol",
          source: "iredell-cities",
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Open Sans Bold"],
            "text-size": 12,
            "text-offset": [0, 1.2],
            "text-anchor": "top",
            "text-allow-overlap": true,
            "text-ignore-placement": true,
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

      // Add Echo Tops Layer (Hidden by default)
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

      // Mark map as loaded so the frames effect can add radar layers
      mapLoaded.value = true;
    });

    mapInstance.current = map;

    return () => {
      clearTimeout(saveTimer);
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [latitude, longitude, zoom]);

  // The mobile sheet covers the bottom of the map. Without this, recenter
  // would frame Iredell County underneath it. The detent controller dispatches
  // `icaw:detent` with the covered height in CSS px — an event, not a shared
  // module, so neither side imports the other.
  useEffect(() => {
    function onDetent(e: Event) {
      const map = mapInstance.current;
      if (!map) return;
      const covered = (e as CustomEvent<{ covered: number }>).detail?.covered ??
        0;
      map.setPadding({ top: 96, right: 16, bottom: covered, left: 16 });
      map.resize();
    }
    // The controller stops dispatching when the deck deactivates, so a
    // desktop-sized window would otherwise keep the last mobile padding.
    const deckQuery = globalThis.matchMedia?.("(max-width: 63.999rem)") ?? null;
    function onDeckChange() {
      const map = mapInstance.current;
      if (!map || deckQuery?.matches) return;
      map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
      map.resize();
    }
    globalThis.addEventListener("icaw:detent", onDetent);
    deckQuery?.addEventListener("change", onDeckChange);
    return () => {
      globalThis.removeEventListener("icaw:detent", onDetent);
      deckQuery?.removeEventListener("change", onDeckChange);
    };
  }, []);

  // Orientation change. NOT a ResizeObserver: maplibre-gl 4.7.1 already
  // installs a throttled one on the container (trackResize defaults true).
  // Two rAFs let the visual viewport settle before we measure.
  useEffect(() => {
    function onOrient() {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => mapInstance.current?.resize())
      );
    }
    globalThis.addEventListener("orientationchange", onOrient);
    return () => globalThis.removeEventListener("orientationchange", onOrient);
  }, []);

  // Add/update radar frame layers when frames change — without recreating the map
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !mapLoaded.value || frames.value.length === 0) return;

    // Remove old radar frame layers and sources
    for (let i = 0; i < radarFrameCount.current; i++) {
      if (map.getLayer(`radar-layer-${i}`)) map.removeLayer(`radar-layer-${i}`);
      if (map.getSource(`radar-${i}`)) map.removeSource(`radar-${i}`);
    }

    // Add new radar frame layers (insert below labels layer)
    frames.value.forEach((frame: RadarFrame, idx: number) => {
      map.addSource(`radar-${idx}`, {
        type: "raster",
        tiles: [frame.tileUrl],
        tileSize: 256,
      });

      const isOldestFrame = idx === frames.value.length - 1;
      map.addLayer(
        {
          id: `radar-layer-${idx}`,
          type: "raster",
          source: `radar-${idx}`,
          // See setCoarseFrameVisibility(): opacity 0 does not stop tile
          // fetching, so on touch we start every non-visible frame hidden.
          layout: coarse && !isOldestFrame
            ? { visibility: "none" }
            : { visibility: "visible" },
          paint: {
            "raster-opacity": isOldestFrame ? 0.7 : 0,
            "raster-opacity-transition": { duration: 400, delay: 0 },
          },
        },
        "carto-labels-layer", // Insert below labels
      );
    });

    radarFrameCount.current = frames.value.length;

    // Initialize frame state — show oldest frame first
    const oldestFrameIdx = frames.value.length - 1;
    frameIndex.value = oldestFrameIdx;
    prevFrameIndex.current = oldestFrameIdx;
    updateTimestamp(frames.value[oldestFrameIdx].timestamp);

    if (!animationReady.value) {
      setTimeout(() => {
        animationReady.value = true;
        // Reduced motion: never auto-play. The loop stays fully operable from
        // the transport controls.
        if (!reduceMotion) isPlaying.value = true;
      }, 1500);
    }
  }, [frames.value, mapLoaded.value]);

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
      setCoarseFrameVisibility(map, -1, -1);
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
      setCoarseFrameVisibility(map, -1, -1);
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
      if (
        frameIndex.value >= 0 && map.getLayer(`radar-layer-${frameIndex.value}`)
      ) {
        setCoarseFrameVisibility(map, frameIndex.value, frameIndex.value);
        map.setPaintProperty(
          `radar-layer-${frameIndex.value}`,
          "raster-opacity",
          0.7,
        );
      }
      // No loading needed for radar - frames are already loaded
      layerLoading.value = false;
    }
  }, [activeLayer.value, mapLoaded.value]);

  // Animation loop - only runs for radar layer
  useEffect(() => {
    // Don't animate for static layers
    if (activeLayer.value !== "radar") return;
    if (
      !isPlaying.value || frames.value.length === 0 || !animationReady.value
    ) return;

    const map = mapInstance.current;
    if (!map) return;

    const totalFrames = frames.value.length;
    // Start from oldest frame (last in array, highest index = furthest back in time)
    let currentFrame = totalFrames - 1;
    let timeout: number;

    const animate = () => {
      if (!map.loaded()) return;

      const prevFrame = prevFrameIndex.current;

      // Make the incoming frame renderable BEFORE its opacity transition
      // starts, otherwise it pops in mid-fade on touch devices.
      setCoarseFrameVisibility(map, currentFrame, prevFrame);

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

    // A backgrounded tab keeps burning timers and tile requests otherwise.
    const onVisibility = () => {
      clearTimeout(timeout);
      if (!document.hidden) runAnimation();
    };
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) runAnimation();

    return () => {
      if (timeout) clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [
    isPlaying.value,
    frames.value,
    activeLayer.value,
    animationSpeed.value,
    animationReady.value,
  ]);

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

    setCoarseFrameVisibility(map, idx, prevFrame);

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

  /**
   * COARSE POINTERS ONLY — this changes cross-fade behaviour, so it must never
   * reach the OBS capture.
   *
   * StyleLayer.isHidden() in maplibre-gl 4.7.1 checks only minzoom/maxzoom and
   * layout visibility, so `raster-opacity: 0` does NOT stop tile fetching: all
   * 11 frame sources stay "used" and refetch NEXRAD tiles on every pan. Hiding
   * everything except the current and previous frame cuts that to two.
   * Pass -1/-1 to hide all frames.
   */
  function setCoarseFrameVisibility(
    map: MapLibreMap,
    current: number,
    prev: number,
  ) {
    if (!coarse) return;
    for (let i = 0; i < radarFrameCount.current; i++) {
      const id = `radar-layer-${i}`;
      if (!map.getLayer(id)) continue;
      const want = i === current || i === prev ? "visible" : "none";
      if (map.getLayoutProperty(id, "visibility") !== want) {
        map.setLayoutProperty(id, "visibility", want);
      }
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
    // bearing/pitch are reset explicitly: rotation is disabled, but a view
    // restored from an older saved state could still be off-north.
    const opts = {
      center: [longitude, latitude] as [number, number],
      zoom,
      bearing: 0,
      pitch: 0,
    };
    if (reduceMotion) mapInstance.current?.jumpTo(opts);
    else mapInstance.current?.flyTo(opts);
    try {
      localStorage.removeItem(getViewKey());
    } catch { /* private mode */ }
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
      <div class="radar-container map-error">
        <h3>Map Unavailable</h3>
        <p>{mapError.value}</p>
        <p>
          Your device or browser appears to have WebGL disabled or unavailable.
        </p>
      </div>
    );
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

      {/* Wind Particle Field Overlay */}
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
        /* TOP RAIL. `.map-chrome` is `display: contents` in broadcast.css, so
          it generates no box and is never a containing block — every child
          keeps resolving its absolute position against `.radar-container`
          exactly as before. Below 64rem deck.css turns it into a real flex
          rail. */
      }
      <div class="map-chrome map-chrome--top">
        {
          /* .radar-timestamp is right-anchored and grows leftward when the LIVE
            badge appears, so a fixed `right` on .audio-toggle collides with it.
            The cluster lays them out as one right-anchored row instead. It is
            `display: contents` below 64rem so the deck's flex rail is
            unaffected. */
        }
        <div class="map-status-cluster">
          <div class="radar-timestamp">
            {frameIndex.value === 0 && activeLayer.value === "radar"
              ? (
                <div class="live-indicator">
                  <div class="live-dot" />
                  <span class="live-text">LIVE</span>
                  <span class="live-time">
                    {timestamp.value || "Loading..."}
                  </span>
                </div>
              )
              : (timestamp.value || "Loading...")}
          </div>

          <AudioToggle
            onToggle={(enabled) => {
              if (enabled) audioAlerts.enable();
              else audioAlerts.disable();
            }}
          />
        </div>

        <MapToolsButton open={toolsOpen} triggerRef={toolsTrigger} />

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

        <FeatureToggles
          showAlertPolygons={showAlertPolygons}
          showLightning={showLightning}
          showStormReports={stormReportsEnabled}
          showWind={windEnabled}
          showMiniMap={showMiniMap}
          showHourly={showHourly}
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
        {!showMiniMap.value && (
          <button
            type="button"
            class="mini-map-toggle"
            onClick={() => (showMiniMap.value = true)}
            title="Show regional view"
            aria-label="Show regional view"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <rect x="12" y="3" width="9" height="9" rx="1" />
            </svg>
          </button>
        )}
      </div>

      {/* BOTTOM STACK */}
      <div class="map-chrome map-chrome--bottom">
        {showHourly.value && <HourlyForecast />}
        <LegendChip open={legendOpen} activeLayer={activeLayer.value} />
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

      {
        /* HOISTED OUT OF THE CHROME WRAPPERS. `.map-chrome--rail` and
          `.map-chrome--bottom` carry a `translate` below 64rem, which makes
          them the containing block for `position: fixed` descendants and traps
          their z-index. These three must resolve against the viewport, so they
          are direct children of `.radar-container` (deck.css:29-34). */
      }
      <MiniMap
        latitude={latitude}
        longitude={longitude}
        mainMapBounds={mapBounds.value ?? undefined}
        isVisible={showMiniMap.value}
        onClose={() => (showMiniMap.value = false)}
      />

      <LegendPanel open={legendOpen} activeLayer={activeLayer.value} />

      <MapToolsPanel
        open={toolsOpen}
        triggerRef={toolsTrigger}
        showAlertPolygons={showAlertPolygons}
        showLightning={showLightning}
        showStormReports={stormReportsEnabled}
        showWind={windEnabled}
        showMiniMap={showMiniMap}
        showHourly={showHourly}
        stormReportCount={stormReports.value.length}
        lightningCount={lightningStrikes.value.length}
      />

      {mapLoaded.value && mapInstance.current && (
        <AlertPolygons
          map={mapInstance.current}
          visible={showAlertPolygons.value}
        />
      )}
      {mapLoaded.value && mapInstance.current && (
        <StormReports
          map={mapInstance.current}
          visible={stormReportsEnabled.value}
        />
      )}
    </div>
  );
}
