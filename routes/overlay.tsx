import { define } from "@/utils.ts";
import { Layout } from "@/components/Layout.tsx";
import { BrandingArea } from "@/components/BrandingArea.tsx";
import RadarMap from "@/islands/RadarMap.tsx";
import CurrentConditions from "@/islands/CurrentConditions.tsx";
import Clock from "@/islands/Clock.tsx";
import AlertBanner from "@/islands/AlertBanner.tsx";
import AlertOverlay from "@/islands/AlertOverlay.tsx";
import { loadConfig } from "@/lib/config-loader.ts";

export default define.page(async function OverlayPage() {
  const config = await loadConfig();

  return (
    <Layout overlayMode>
      <div class="sidebar">
        <BrandingArea
          stationId={config.branding.stationId}
          stationName={config.branding.stationName}
          logoPath={config.branding.logoPath}
        />
        <CurrentConditions />
        <Clock timeFormat={config.display.timeFormat} />
      </div>
      <RadarMap
        latitude={config.location.latitude}
        longitude={config.location.longitude}
      />
      <AlertBanner />
      <AlertOverlay />
    </Layout>
  );
});
