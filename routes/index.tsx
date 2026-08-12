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
import DeckSheetController from "@/islands/DeckSheetController.tsx";
import RadarTextSummary from "@/islands/RadarTextSummary.tsx";
import { loadConfig } from "@/lib/config-loader.ts";

export default define.page(async function IndexPage() {
  const config = await loadConfig();

  return (
    <Layout>
      <div class="deck-sheet">
        <div class="deck-sheet-header">
          <div class="deck-header-brand deck-only">
            {config.branding.stationId}
          </div>
          <DeckSheetController />
          <div class="ticker-slot">
            <StreamOverlay className="alert-ticker" />
          </div>
        </div>
        <div class="deck-sheet-body" id="deck-sheet-body">
          <div class="sidebar">
            <div class="deck-pane deck-pane--brand">
              <BrandingArea
                stationId={config.branding.stationId}
                stationName={config.branding.stationName}
                logoPath={config.branding.logoPath}
              />
            </div>
            <div class="deck-pane deck-pane--now">
              <CurrentConditions />
            </div>
            <div class="deck-pane deck-pane--cities">
              <CityForecastList />
            </div>
            <div class="deck-pane deck-pane--summary">
              <RadarTextSummary />
            </div>
            <div class="deck-pane deck-pane--sky">
              <SunMoonWidget />
            </div>
            <div class="deck-pane deck-pane--clock">
              <Clock timeFormat={config.display.timeFormat} />
            </div>
          </div>
        </div>
      </div>
      <RadarMap
        latitude={config.location.latitude}
        longitude={config.location.longitude}
        zoom={10}
      />
      <AlertOverlay />
      <ThemeController
        latitude={config.location.latitude}
        longitude={config.location.longitude}
      />
    </Layout>
  );
});
