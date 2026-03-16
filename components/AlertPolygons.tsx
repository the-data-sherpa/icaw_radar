import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

interface AlertPolygonsProps {
  // deno-lint-ignore no-explicit-any
  map: any;
  visible: boolean;
}

const SOURCE_ID = "alert-polygons-source";
const FILL_LAYER = "alert-polygons-fill";
const OUTLINE_LAYER = "alert-polygons-outline";
const DASH_LAYER = "alert-polygons-outline-dash";

/** Formats an ISO expiry string for display in popups. */
function formatExpiry(expires: string): string {
  if (!expires) return "";
  const date = new Date(expires);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Renders NWS alert polygons on a MapLibre map.
 * Follows the StormReports component pattern: props-driven visibility, polling, click popups.
 */
export function AlertPolygons({ map, visible }: AlertPolygonsProps) {
  // deno-lint-ignore no-explicit-any
  const geojson = useSignal<any>(null);
  const activePopup = useSignal<{
    event: string;
    headline: string;
    color: string;
    areaDesc: string;
    expires: string;
    x: number;
    y: number;
  } | null>(null);

  const hoverTooltip = useSignal<{
    event: string;
    color: string;
    x: number;
    y: number;
  } | null>(null);

  // Poll /api/alerts/geo every 30 seconds
  useEffect(() => {
    async function fetchAlerts() {
      try {
        const response = await fetch("/api/alerts/geo");
        const data = await response.json();
        geojson.value = data;
      } catch (e) {
        console.error("Failed to fetch alert polygons:", e);
        geojson.value = { type: "FeatureCollection", features: [] };
      }
    }

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Add/update map layers when data or visibility changes
  useEffect(() => {
    if (!map || !map.loaded()) return;

    // Clean up existing layers/source
    for (const layerId of [DASH_LAYER, OUTLINE_LAYER, FILL_LAYER]) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    }
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);

    if (!visible || !geojson.value || geojson.value.features.length === 0) {
      return;
    }

    // Add GeoJSON source
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: geojson.value,
    });

    // Semi-transparent fill — lighter for watches, heavier for warnings
    map.addLayer(
      {
        id: FILL_LAYER,
        type: "fill",
        source: SOURCE_ID,
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": [
            "case",
            ["==", ["get", "isWatch"], true],
            0.08,
            0.15,
          ],
        },
      },
      "carto-labels-layer",
    );

    // Solid colored outline for warnings (non-watches)
    map.addLayer(
      {
        id: OUTLINE_LAYER,
        type: "line",
        source: SOURCE_ID,
        filter: ["==", ["get", "isWatch"], false],
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2.5,
        },
      },
      "carto-labels-layer",
    );

    // Dashed outline for watches
    map.addLayer(
      {
        id: DASH_LAYER,
        type: "line",
        source: SOURCE_ID,
        filter: ["==", ["get", "isWatch"], true],
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2.5,
          "line-dasharray": [4, 3],
        },
      },
      "carto-labels-layer",
    );

    // Click handler for popups
    const handleClick = (
      e: {
        // deno-lint-ignore no-explicit-any
        features?: any[];
        lngLat: { lng: number; lat: number };
      },
    ) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      const point = map.project([e.lngLat.lng, e.lngLat.lat]);
      activePopup.value = {
        event: props.event,
        headline: props.headline,
        color: props.color,
        areaDesc: props.areaDesc,
        expires: props.expires,
        x: point.x,
        y: point.y,
      };
    };

    map.on("click", FILL_LAYER, handleClick);

    // Hover tooltip with alert name
    const onMouseMove = (
      e: {
        // deno-lint-ignore no-explicit-any
        features?: any[];
        lngLat: { lng: number; lat: number };
      },
    ) => {
      if (!e.features || e.features.length === 0) return;
      map.getCanvas().style.cursor = "pointer";
      const props = e.features[0].properties;
      const point = map.project([e.lngLat.lng, e.lngLat.lat]);
      hoverTooltip.value = {
        event: props.event,
        color: props.color,
        x: point.x,
        y: point.y,
      };
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = "";
      hoverTooltip.value = null;
    };
    map.on("mousemove", FILL_LAYER, onMouseMove);
    map.on("mouseleave", FILL_LAYER, onLeave);

    return () => {
      if (map.getLayer(FILL_LAYER)) {
        map.off("click", FILL_LAYER, handleClick);
        map.off("mousemove", FILL_LAYER, onMouseMove);
        map.off("mouseleave", FILL_LAYER, onLeave);
      }
    };
  }, [map, visible, geojson.value]);

  // Close popup when clicking elsewhere
  useEffect(() => {
    if (!map) return;
    const handleMapClick = () => {
      activePopup.value = null;
    };
    map.on("click", handleMapClick);
    return () => map.off("click", handleMapClick);
  }, [map]);

  return (
    <>
      {/* Hover tooltip - lightweight label that follows cursor */}
      {hoverTooltip.value && !activePopup.value && (
        <div
          class="alert-tooltip"
          style={{
            position: "absolute",
            left: `${hoverTooltip.value.x}px`,
            top: `${hoverTooltip.value.y - 8}px`,
            transform: "translate(-50%, -100%)",
            zIndex: 199,
          }}
        >
          <span
            class="alert-tooltip-dot"
            style={{ background: hoverTooltip.value.color }}
          />
          {hoverTooltip.value.event}
        </div>
      )}

      {/* Click popup - full detail card */}
      {activePopup.value && (() => {
        const { event, headline, color, areaDesc, expires, x, y } =
          activePopup.value!;
        return (
          <div
            class="alert-popup"
            style={{
              position: "absolute",
              left: `${x}px`,
              top: `${y - 10}px`,
              transform: "translate(-50%, -100%)",
              zIndex: 200,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div class="popup-arrow" />
            <div class="alert-popup-event" style={{ color }}>
              {event}
            </div>
            <div class="alert-popup-headline">{headline}</div>
            {areaDesc && <div class="alert-popup-area">{areaDesc}</div>}
            {expires && (
              <div class="alert-popup-expires">
                Expires: {formatExpiry(expires)}
              </div>
            )}
            <button
              type="button"
              class="popup-close"
              onClick={() => (activePopup.value = null)}
              aria-label="Close popup"
            >
              x
            </button>
          </div>
        );
      })()}
    </>
  );
}
