import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

export interface StormReport {
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

interface StormReportsProps {
  // deno-lint-ignore no-explicit-any
  map: any;
  visible: boolean;
}

// Report type styling configuration
const REPORT_CONFIG = {
  tornado: {
    emoji: "\uD83C\uDF2A\uFE0F", // tornado emoji
    color: "#ff0000",
    label: "Tornado",
  },
  hail: {
    emoji: "\uD83E\uDDCA", // ice cube emoji
    color: "#00aaff",
    label: "Hail",
  },
  wind: {
    emoji: "\uD83D\uDCA8", // wind emoji
    color: "#ff8800",
    label: "Wind Damage",
  },
  flood: {
    emoji: "\uD83C\uDF0A", // wave emoji
    color: "#00ff88",
    label: "Flood",
  },
  other: {
    emoji: "\u26A0\uFE0F", // warning emoji
    color: "#ffff00",
    label: "Other",
  },
};

export function StormReports({ map, visible }: StormReportsProps) {
  const reports = useSignal<StormReport[]>([]);
  const activePopup = useSignal<
    { report: StormReport; x: number; y: number } | null
  >(null);

  // Fetch storm reports
  useEffect(() => {
    async function fetchReports() {
      try {
        const response = await fetch("/api/storm-reports");
        const data = await response.json();
        reports.value = data;
      } catch (e) {
        console.error("Failed to fetch storm reports:", e);
        reports.value = [];
      }
    }

    fetchReports();
    // Refresh every 5 minutes
    const interval = setInterval(fetchReports, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Add/update map layers when reports or visibility changes
  useEffect(() => {
    if (!map || !map.loaded()) return;

    const sourceId = "storm-reports-source";
    const layerId = "storm-reports-layer";

    // Remove existing layers/sources if they exist
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }

    if (!visible || reports.value.length === 0) return;

    // Create GeoJSON from reports
    const geojson = {
      type: "FeatureCollection",
      features: reports.value.map((report, index) => ({
        type: "Feature",
        id: index,
        properties: {
          type: report.type,
          magnitude: report.magnitude,
          time: report.time,
          remarks: report.remarks,
          city: report.city,
          county: report.county,
          state: report.state,
          isRecent: isRecentReport(report.time),
        },
        geometry: {
          type: "Point",
          coordinates: [report.lon, report.lat],
        },
      })),
    };

    // Add source
    map.addSource(sourceId, {
      type: "geojson",
      data: geojson,
    });

    // Add circle layer for markers
    map.addLayer({
      id: layerId,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-radius": [
          "case",
          ["get", "isRecent"],
          10,
          8,
        ],
        "circle-color": [
          "match",
          ["get", "type"],
          "tornado",
          REPORT_CONFIG.tornado.color,
          "hail",
          REPORT_CONFIG.hail.color,
          "wind",
          REPORT_CONFIG.wind.color,
          "flood",
          REPORT_CONFIG.flood.color,
          REPORT_CONFIG.other.color,
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.9,
      },
    });

    // Handle click events
    map.on(
      "click",
      layerId,
      (
        e: {
          features?: { properties: Record<string, unknown> }[];
          lngLat: { lng: number; lat: number };
        },
      ) => {
        if (!e.features || e.features.length === 0) return;

        const feature = e.features[0];
        const props = feature.properties;

        const report: StormReport = {
          type: props.type as StormReport["type"],
          lat: e.lngLat.lat,
          lon: e.lngLat.lng,
          time: props.time as string,
          magnitude: props.magnitude as string | null,
          remarks: props.remarks as string,
          city: props.city as string | null,
          county: props.county as string | null,
          state: props.state as string | null,
        };

        const point = map.project([e.lngLat.lng, e.lngLat.lat]);
        activePopup.value = { report, x: point.x, y: point.y };
      },
    );

    // Change cursor on hover
    map.on("mouseenter", layerId, () => {
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = "";
    });

    return () => {
      if (map.getLayer(layerId)) {
        map.off("click", layerId);
        map.off("mouseenter", layerId);
        map.off("mouseleave", layerId);
      }
    };
  }, [map, visible, reports.value]);

  // Close popup when clicking elsewhere on the map
  useEffect(() => {
    if (!map) return;

    const handleMapClick = (
      e: { originalEvent: { target: EventTarget | null } },
    ) => {
      // Only close if not clicking on a storm report
      if (!e.originalEvent.target) return;
      activePopup.value = null;
    };

    map.on("click", handleMapClick);
    return () => map.off("click", handleMapClick);
  }, [map]);

  // Check if a report is recent (less than 1 hour old)
  function isRecentReport(time: string): boolean {
    const reportTime = new Date(time);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return reportTime > oneHourAgo;
  }

  // Format time for display
  function formatReportTime(time: string): string {
    const date = new Date(time);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  // Format magnitude for display
  function formatMagnitude(type: string, magnitude: string | null): string {
    if (!magnitude) return "";

    switch (type) {
      case "hail":
        return `${magnitude}" diameter`;
      case "wind":
        return `${magnitude} mph`;
      case "tornado":
        return magnitude.toUpperCase().startsWith("EF")
          ? magnitude
          : `EF${magnitude}`;
      default:
        return magnitude;
    }
  }

  // Render popup
  if (!activePopup.value) return null;

  const { report, x, y } = activePopup.value;
  const config = REPORT_CONFIG[report.type];
  const isRecent = isRecentReport(report.time);

  return (
    <div
      class={`storm-report-popup ${isRecent ? "report-recent" : ""}`}
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
      <div class="report-header" style={{ borderLeftColor: config.color }}>
        <span class="report-icon">{config.emoji}</span>
        <span class="report-type" style={{ color: config.color }}>
          {config.label}
        </span>
        {isRecent && <span class="report-recent-badge">RECENT</span>}
      </div>

      <div class="report-time">{formatReportTime(report.time)}</div>

      {report.magnitude && (
        <div class="report-magnitude">
          {formatMagnitude(report.type, report.magnitude)}
        </div>
      )}

      {(report.city || report.county) && (
        <div class="report-location">
          {report.city && <span>{report.city}</span>}
          {report.city && report.county && <span>,</span>}
          {report.county && <span>{report.county} County</span>}
          {report.state && <span>, {report.state}</span>}
        </div>
      )}

      {report.remarks && (
        <div class="report-details">
          {report.remarks}
        </div>
      )}

      <button
        type="button"
        class="popup-close"
        onClick={() => activePopup.value = null}
        aria-label="Close popup"
      >
        x
      </button>
    </div>
  );
}

// Export report count component for layer control badge
export function StormReportsBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <span class="storm-reports-badge">
      {count}
    </span>
  );
}
