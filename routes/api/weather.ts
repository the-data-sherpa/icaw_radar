import { getCurrentConditions } from "@/lib/nws-api.ts";
import { loadConfig } from "@/lib/config-loader.ts";

export async function handler(req: Request): Promise<Response> {
  try {
    const config = await loadConfig();
    const url = new URL(req.url);
    const lat = url.searchParams.get("lat")
      ? parseFloat(url.searchParams.get("lat")!)
      : config.location.latitude;
    const lon = url.searchParams.get("lon")
      ? parseFloat(url.searchParams.get("lon")!)
      : config.location.longitude;

    const conditions = await getCurrentConditions(
      lat,
      lon,
      config.display.temperatureUnit,
    );

    if (!conditions) {
      return new Response(
        JSON.stringify({ error: "Unable to fetch weather data" }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify(conditions), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (error) {
    console.error("Weather API error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
