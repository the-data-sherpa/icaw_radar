import { getRadarFrames } from "@/lib/radar-service.ts";

export function handler(_req: Request): Response {
  const frames = getRadarFrames();

  return new Response(JSON.stringify(frames), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
    },
  });
}
