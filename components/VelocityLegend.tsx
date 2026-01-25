export function VelocityLegend() {
  // Echo Tops colors: Height of storms in thousands of feet
  // Low = blue/green, High = red/purple/white
  const colors = [
    { color: "#00ffff", label: "10" }, // Low (cyan)
    { color: "#00ff00", label: "20" }, // (green)
    { color: "#ffff00", label: "30" }, // (yellow)
    { color: "#ff8800", label: "40" }, // (orange)
    { color: "#ff0000", label: "50" }, // (red)
    { color: "#ff00ff", label: "60" }, // (magenta)
    { color: "#ffffff", label: "70+" }, // High (white)
  ];

  return (
    <div class="radar-legend velocity-legend">
      <div class="radar-legend-title">Echo Tops (kft)</div>
      <div class="velocity-legend-bar">
        {colors.map((c, i) => (
          <div
            key={i}
            class="radar-legend-color"
            style={{ backgroundColor: c.color }}
          />
        ))}
      </div>
      <div class="velocity-legend-labels">
        <span>Low</span>
        <span>High</span>
      </div>
      <div class="velocity-note">
        Higher tops indicate stronger storms
      </div>
    </div>
  );
}
