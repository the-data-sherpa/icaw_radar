import { useEffect, useRef } from "preact/hooks";

interface MiniMapProps {
  latitude: number;
  longitude: number;
  mainMapBounds?: { north: number; south: number; east: number; west: number };
  isVisible: boolean;
  onClose?: () => void;
}

// deno-lint-ignore no-explicit-any
type MapLibreMap = any;

export function MiniMap(
  { latitude, longitude, mainMapBounds, isVisible, onClose }: MiniMapProps,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap>(null);

  useEffect(() => {
    // Mounted on demand only: the component returns null while !isVisible, so
    // this effect (and therefore the second WebGL context) never runs until the
    // user asks for the regional view.
    //
    // KNOWN RISK: iOS Safari caps the number of concurrent WebGL contexts per
    // page (historically 8, but far lower under memory pressure). When the cap
    // is hit the OLDEST context is dropped, which here is the main radar canvas
    // — opening the regional view can therefore blank the main map on an older
    // iPhone. Mitigation in this pass is on-demand mounting plus the unmount
    // teardown below (map.remove() releases the context). A full fix would
    // render this preview from a static raster instead of a live GL map.
    if (!containerRef.current || !isVisible) return;

    // deno-lint-ignore no-explicit-any
    const maplibregl = (globalThis as any).maplibregl;
    if (!maplibregl) return;

    // Create mini map with wider zoom
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          "carto-dark": {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
          },
        },
        layers: [
          {
            id: "carto-dark-layer",
            type: "raster",
            source: "carto-dark",
          },
        ],
      },
      center: [longitude, latitude],
      zoom: 5, // Wide regional view
      interactive: false, // No interaction
      attributionControl: false,
    });

    map.on("load", () => {
      // Add regional radar
      map.addSource("radar-regional", {
        type: "raster",
        tiles: [
          "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
      });

      map.addLayer({
        id: "radar-regional-layer",
        type: "raster",
        source: "radar-regional",
        paint: { "raster-opacity": 0.7 },
      });

      // Add labels on top
      map.addSource("labels", {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
      });

      map.addLayer({
        id: "labels-layer",
        type: "raster",
        source: "labels",
      });

      // Add viewport indicator (rectangle showing main map view)
      if (mainMapBounds) {
        map.addSource("viewport", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [[
                [mainMapBounds.west, mainMapBounds.south],
                [mainMapBounds.east, mainMapBounds.south],
                [mainMapBounds.east, mainMapBounds.north],
                [mainMapBounds.west, mainMapBounds.north],
                [mainMapBounds.west, mainMapBounds.south],
              ]],
            },
          },
        });

        map.addLayer({
          id: "viewport-fill",
          type: "fill",
          source: "viewport",
          paint: {
            "fill-color": "#00aaff",
            "fill-opacity": 0.1,
          },
        });

        map.addLayer({
          id: "viewport-outline",
          type: "line",
          source: "viewport",
          paint: {
            "line-color": "#00aaff",
            "line-width": 2,
          },
        });
      }
    });

    mapRef.current = map;

    return () => map.remove();
  }, [latitude, longitude, isVisible]);

  // Update viewport indicator when main map bounds change
  useEffect(() => {
    if (!mapRef.current || !mainMapBounds) return;

    const source = mapRef.current.getSource("viewport");
    if (source) {
      source.setData({
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [[
            [mainMapBounds.west, mainMapBounds.south],
            [mainMapBounds.east, mainMapBounds.south],
            [mainMapBounds.east, mainMapBounds.north],
            [mainMapBounds.west, mainMapBounds.north],
            [mainMapBounds.west, mainMapBounds.south],
          ]],
        },
      });
    }
  }, [mainMapBounds]);

  if (!isVisible) return null;

  return (
    <div class="mini-map-container">
      <div class="mini-map-header">
        <span>Regional View</span>
        {onClose && (
          <button
            type="button"
            class="mini-map-close"
            onClick={onClose}
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
        )}
      </div>
      <div ref={containerRef} class="mini-map" />
    </div>
  );
}
