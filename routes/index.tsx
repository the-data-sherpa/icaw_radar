import { define } from "@/utils.ts";
import { Layout } from "@/components/Layout.tsx";
import { BrandingArea } from "@/components/BrandingArea.tsx";
import RadarMap from "@/islands/RadarMap.tsx";
import CurrentConditions from "@/islands/CurrentConditions.tsx";
import CityForecastList from "@/islands/CityForecastList.tsx";
import SunMoonWidget from "@/islands/SunMoonWidget.tsx";
import Clock from "@/islands/Clock.tsx";
import StreamOverlay from "@/islands/StreamOverlay.tsx";
import AlertOverlay from "@/islands/AlertOverlay.tsx";
import ThemeController from "@/islands/ThemeController.tsx";
import { loadConfig } from "@/lib/config-loader.ts";

export default define.page(async function IndexPage() {
  const config = await loadConfig();

  return (
    <Layout>
      <div class="sidebar">
        <BrandingArea
          stationId={config.branding.stationId}
          stationName={config.branding.stationName}
          logoPath={config.branding.logoPath}
        />
        <CurrentConditions />
        <CityForecastList />
        <SunMoonWidget />
        <Clock timeFormat={config.display.timeFormat} />
      </div>
      <RadarMap
        latitude={config.location.latitude}
        longitude={config.location.longitude}
        zoom={10} // Increased zoom for better detail (was 7)
      />
      <StreamOverlay className="alert-ticker" />
      <AlertOverlay />
      <ThemeController
        latitude={config.location.latitude}
        longitude={config.location.longitude}
      />
    </Layout>
  );
});
