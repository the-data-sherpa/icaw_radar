export interface LocationConfig {
  latitude: number;
  longitude: number;
  name: string;
  state: string;
}

export interface BrandingConfig {
  stationId: string;
  stationName: string;
  logoPath: string;
}

export interface DisplayConfig {
  temperatureUnit: "F" | "C";
  timeFormat: "12h" | "24h";
}

export interface AppConfig {
  location: LocationConfig;
  branding: BrandingConfig;
  display: DisplayConfig;
}

let cachedConfig: AppConfig | null = null;

export async function loadConfig(): Promise<AppConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const configPath = new URL("../config/settings.json", import.meta.url);
    const configText = await Deno.readTextFile(configPath);
    cachedConfig = JSON.parse(configText) as AppConfig;
    return cachedConfig;
  } catch (error) {
    console.error("Failed to load config, using defaults:", error);
    return getDefaultConfig();
  }
}

export function getDefaultConfig(): AppConfig {
  return {
    location: {
      latitude: 35.7846,
      longitude: -80.8883,
      name: "Statesville",
      state: "NC",
    },
    branding: {
      stationId: "ICAW",
      stationName: "Iredell County Alert Weather",
      logoPath: "/images/icaw-logo.png",
    },
    display: {
      temperatureUnit: "F",
      timeFormat: "12h",
    },
  };
}

export function clearConfigCache(): void {
  cachedConfig = null;
}
