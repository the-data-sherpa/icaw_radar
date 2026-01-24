// IEM NEXRAD tile URL suffixes for time offsets
// Each suffix represents a 5-minute interval going back in time
const RADAR_SUFFIXES = [
  "900913", // Current (0 min)
  "900913-m05m", // -5 min
  "900913-m10m", // -10 min
  "900913-m15m", // -15 min
  "900913-m20m", // -20 min
  "900913-m25m", // -25 min
  "900913-m30m", // -30 min
  "900913-m35m", // -35 min
  "900913-m40m", // -40 min
  "900913-m45m", // -45 min
  "900913-m50m", // -50 min
];

export interface RadarFrame {
  id: string;
  suffix: string;
  minutesAgo: number;
  tileUrl: string;
  timestamp: string;
}

export function getRadarFrames(): RadarFrame[] {
  const now = new Date();

  return RADAR_SUFFIXES.map((suffix, index) => {
    const minutesAgo = index * 5;
    const frameTime = new Date(now.getTime() - minutesAgo * 60 * 1000);

    // Round to nearest 5 minutes for display
    frameTime.setMinutes(Math.floor(frameTime.getMinutes() / 5) * 5);
    frameTime.setSeconds(0);

    return {
      id: `frame-${index}`,
      suffix,
      minutesAgo,
      tileUrl:
        `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-${suffix}/{z}/{x}/{y}.png`,
      timestamp: frameTime.toISOString(),
    };
  });
}

export function getRadarTileUrl(
  suffix: string,
  z: number,
  x: number,
  y: number,
): string {
  return `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-${suffix}/${z}/${x}/${y}.png`;
}

// Get the base map style for MapLibre (CARTO Dark)
export function getBaseMapStyle(): object {
  return {
    version: 8,
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
  };
}

// dBZ color scale for radar legend
export const RADAR_LEGEND = [
  { dbz: -30, color: "#000000", label: "-30" },
  { dbz: 5, color: "#04e9e7", label: "5" },
  { dbz: 10, color: "#019ff4", label: "10" },
  { dbz: 15, color: "#0300f4", label: "15" },
  { dbz: 20, color: "#02fd02", label: "20" },
  { dbz: 25, color: "#01c501", label: "25" },
  { dbz: 30, color: "#008e00", label: "30" },
  { dbz: 35, color: "#fdf802", label: "35" },
  { dbz: 40, color: "#e5bc00", label: "40" },
  { dbz: 45, color: "#fd9500", label: "45" },
  { dbz: 50, color: "#fd0000", label: "50" },
  { dbz: 55, color: "#d40000", label: "55" },
  { dbz: 60, color: "#bc0000", label: "60" },
  { dbz: 65, color: "#f800fd", label: "65" },
  { dbz: 70, color: "#9854c6", label: "70" },
  { dbz: 75, color: "#fdfdfd", label: "75+" },
];
