interface LayerControlProps {
  activeLayer: "radar" | "precip" | "velocity";
  onLayerChange: (layer: "radar" | "precip" | "velocity") => void;
  windEnabled?: boolean;
  onWindToggle?: () => void;
  stormReportsEnabled?: boolean;
  stormReportCount?: number;
  onStormReportsToggle?: () => void;
}

export function LayerControl({
  activeLayer,
  onLayerChange,
  windEnabled = false,
  onWindToggle,
  stormReportsEnabled = false,
  stormReportCount = 0,
  onStormReportsToggle,
}: LayerControlProps) {
  const buttonBase = {
    border: "1px solid rgba(255, 255, 255, 0.2)",
    padding: "6px 12px",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "12px",
    textTransform: "uppercase" as const,
    transition: "all 0.2s ease",
  };

  const layers = [
    {
      id: "radar",
      label: "Live Radar",
      activeColor: "#00aaff",
      textColor: "#fff",
    },
    {
      id: "precip",
      label: "24h Precip",
      activeColor: "#00ff88",
      textColor: "#000",
    },
    {
      id: "velocity",
      label: "Echo Tops",
      activeColor: "#ff44ff",
      textColor: "#fff",
    },
  ] as const;

  return (
    <div
      class="layer-control"
      style={{
        position: "absolute",
        top: "16px",
        left: "16px",
        zIndex: 100,
        display: "flex",
        gap: "8px",
        padding: "8px",
        borderRadius: "8px",
      }}
    >
      {layers.map((layer) => (
        <button
          type="button"
          key={layer.id}
          onClick={() => onLayerChange(layer.id)}
          style={{
            ...buttonBase,
            background: activeLayer === layer.id
              ? layer.activeColor
              : "transparent",
            color: activeLayer === layer.id
              ? layer.textColor
              : "rgba(255, 255, 255, 0.7)",
          }}
        >
          {layer.label}
        </button>
      ))}

      {/* Wind Overlay Toggle Button */}
      {onWindToggle && (
        <button
          type="button"
          onClick={onWindToggle}
          title="Toggle animated wind particle overlay (W key)"
          style={{
            ...buttonBase,
            background: windEnabled
              ? "linear-gradient(135deg, #4a94a9 0%, #4da75b 100%)"
              : "transparent",
            color: windEnabled ? "#fff" : "rgba(255, 255, 255, 0.7)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          {/* Wind icon SVG */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
          </svg>
          Wind
        </button>
      )}

      {/* Storm Reports Toggle Button */}
      {onStormReportsToggle && (
        <button
          type="button"
          onClick={onStormReportsToggle}
          title="Toggle NWS Local Storm Reports (LSR) overlay"
          class={`storm-reports-btn ${
            stormReportCount > 0 ? "has-reports" : ""
          }`}
          style={{
            ...buttonBase,
            background: stormReportsEnabled
              ? "linear-gradient(135deg, #ff4444 0%, #ff8800 100%)"
              : "transparent",
            color: stormReportsEnabled ? "#fff" : "rgba(255, 255, 255, 0.7)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            position: "relative",
          }}
        >
          {/* Warning triangle icon */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          LSR
          {stormReportCount > 0 && (
            <span class="storm-reports-badge">{stormReportCount}</span>
          )}
        </button>
      )}
    </div>
  );
}
