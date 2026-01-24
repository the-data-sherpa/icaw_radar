import { getAlerts } from "@/lib/alert-service.ts";
import { loadConfig } from "@/lib/config-loader.ts";

export async function handler(_req: Request): Promise<Response> {
  try {
    const config = await loadConfig();
    const alerts = await getAlerts(
      config.location.latitude,
      config.location.longitude,
    );

    return new Response(JSON.stringify(alerts), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30",
      },
    });
  } catch (error) {
    console.error("Alerts API error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
