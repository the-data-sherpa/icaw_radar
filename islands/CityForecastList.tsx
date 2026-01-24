import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

interface CityWeather {
    name: string;
    temp: number | string;
    unit: string;
    icon: string | null;
    conditions: string;
}

const CITIES = [
    { name: "Statesville", lat: 35.7826, lon: -80.8873 },
    { name: "Mooresville", lat: 35.5849, lon: -80.8101 },
    { name: "Troutman", lat: 35.7007, lon: -80.8881 },
    { name: "Harmony", lat: 35.9570, lon: -80.7710 },
    { name: "Love Valley", lat: 35.9899, lon: -80.9881 },
];

export default function CityForecastList() {
    const forecasts = useSignal<CityWeather[]>([]);
    const loading = useSignal(true);

    useEffect(() => {
        async function fetchForecasts() {
            loading.value = true;
            const results: CityWeather[] = [];

            // Fetch sequentially to be polite to the API (or parallel if we trust the rate limit)
            // Small delay between requests
            for (const city of CITIES) {
                try {
                    const res = await fetch(`/api/weather?lat=${city.lat}&lon=${city.lon}`);
                    if (res.ok) {
                        const data = await res.json();
                        results.push({
                            name: city.name,
                            temp: data.temperature,
                            unit: data.temperatureUnit,
                            icon: data.icon,
                            conditions: data.conditions
                        });
                    } else {
                        results.push({ name: city.name, temp: "--", unit: "", icon: null, conditions: "Error" });
                    }
                } catch (e) {
                    console.error(`Failed to fetch for ${city.name}`, e);
                    results.push({ name: city.name, temp: "--", unit: "", icon: null, conditions: "Error" });
                }
                // distinct delay
                await new Promise(r => setTimeout(r, 200));
            }
            forecasts.value = results;
            loading.value = false;
        }

        fetchForecasts();
        const interval = setInterval(fetchForecasts, 300000); // 5 minutes
        return () => clearInterval(interval);
    }, []);

    if (loading.value && forecasts.value.length === 0) {
        return <div class="city-list-loading">Loading forecasts...</div>;
    }

    return (
        <div class="city-forecast-list">
            <h3 class="city-list-header">Iredell Outlook</h3>
            <div class="city-list-items">
                {forecasts.value.map((city) => (
                    <div key={city.name} class="city-item">
                        <div class="city-name">{city.name}</div>
                        <div class="city-temp">
                            {city.temp}{city.unit}
                        </div>
                        {city.icon && <img src={city.icon} alt={city.conditions} class="city-icon" />}
                    </div>
                ))}
            </div>
        </div>
    );
}
