
interface LayerControlProps {
    activeLayer: "radar" | "precip";
    onLayerChange: (layer: "radar" | "precip") => void;
}

export function LayerControl({ activeLayer, onLayerChange }: LayerControlProps) {
    return (
        <div className="layer-control" style={{
            position: "absolute",
            top: "16px",
            left: "16px",
            zIndex: 100,
            display: "flex",
            gap: "8px",
            background: "rgba(0, 0, 0, 0.8)",
            padding: "8px",
            borderRadius: "4px"
        }}>
            <button
                onClick={() => onLayerChange("radar")}
                style={{
                    background: activeLayer === "radar" ? "#00aaff" : "transparent",
                    color: activeLayer === "radar" ? "#fff" : "#aaa",
                    border: "1px solid #333",
                    padding: "6px 12px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "12px",
                    textTransform: "uppercase"
                }}
            >
                Live Radar
            </button>
            <button
                onClick={() => onLayerChange("precip")}
                style={{
                    background: activeLayer === "precip" ? "#00ff88" : "transparent",
                    color: activeLayer === "precip" ? "#000" : "#aaa",
                    border: "1px solid #333",
                    padding: "6px 12px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "12px",
                    textTransform: "uppercase"
                }}
            >
                24h Precip
            </button>
        </div>
    );
}
