import { RADAR_LEGEND } from "@/lib/radar-service.ts";

export function RadarLegend() {
  return (
    <div class="radar-legend">
      <div class="radar-legend-title">Reflectivity (dBZ)</div>
      <div class="radar-legend-bar">
        {RADAR_LEGEND.map((item) => (
          <div
            key={item.dbz}
            class="radar-legend-color"
            style={{ backgroundColor: item.color }}
          />
        ))}
      </div>
      <div class="radar-legend-labels">
        <span>5</span>
        <span>20</span>
        <span>35</span>
        <span>50</span>
        <span>65+</span>
      </div>
    </div>
  );
}
