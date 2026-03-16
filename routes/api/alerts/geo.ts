import { getAlertGeoJSON } from "@/lib/alert-geo-service.ts";
import { loadConfig } from "@/lib/config-loader.ts";

/** Returns active NWS alert polygons as GeoJSON for map rendering. */
export async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const state = url.searchParams.get("state") ||
      (await loadConfig()).location.state;

    const geojson = await getAlertGeoJSON(state);

    return new Response(JSON.stringify(geojson), {
      headers: {
        "Content-Type": "application/geo+json",
        "Cache-Control": "public, max-age=30",
      },
    });
  } catch (error) {
    console.error("Alert geo API error:", error);
    return new Response(
      JSON.stringify({ type: "FeatureCollection", features: [] }),
      {
        status: 500,
        headers: { "Content-Type": "application/geo+json" },
      },
    );
  }
}
