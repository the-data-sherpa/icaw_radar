import type { VNode } from "preact";

interface WeatherIconProps {
  icon: string | null;
  conditions: string;
}

// Map NWS icon URLs to simple condition names
function getConditionType(icon: string | null, conditions: string): string {
  const condLower = conditions.toLowerCase();

  if (condLower.includes("thunder") || condLower.includes("storm")) {
    return "thunderstorm";
  }
  if (condLower.includes("rain") || condLower.includes("shower")) return "rain";
  if (condLower.includes("snow")) return "snow";
  if (condLower.includes("sleet") || condLower.includes("ice")) return "sleet";
  if (condLower.includes("fog") || condLower.includes("mist")) return "fog";
  if (condLower.includes("cloud") || condLower.includes("overcast")) {
    return "cloudy";
  }
  if (condLower.includes("partly")) return "partly-cloudy";
  if (
    condLower.includes("clear") || condLower.includes("sunny") ||
    condLower.includes("fair")
  ) {
    if (icon && icon.includes("night")) return "clear-night";
    return "clear";
  }
  if (condLower.includes("wind")) return "windy";

  return "cloudy";
}

function getIconSvg(type: string): VNode {
  switch (type) {
    case "clear":
      return (
        <g>
          <circle cx="32" cy="32" r="14" fill="#FFD700" />
          <g stroke="#FFD700" stroke-width="3">
            <line x1="32" y1="6" x2="32" y2="12" />
            <line x1="32" y1="52" x2="32" y2="58" />
            <line x1="6" y1="32" x2="12" y2="32" />
            <line x1="52" y1="32" x2="58" y2="32" />
            <line x1="13" y1="13" x2="17" y2="17" />
            <line x1="47" y1="47" x2="51" y2="51" />
            <line x1="51" y1="13" x2="47" y2="17" />
            <line x1="17" y1="47" x2="13" y2="51" />
          </g>
        </g>
      );
    case "clear-night":
      return (
        <path
          d="M40 16 A20 20 0 1 0 48 40 A16 16 0 1 1 40 16"
          fill="#C0C0C0"
        />
      );
    case "partly-cloudy":
      return (
        <g>
          <circle cx="24" cy="24" r="10" fill="#FFD700" />
          <ellipse cx="36" cy="40" rx="16" ry="10" fill="#A0A0A0" />
          <ellipse cx="28" cy="38" rx="10" ry="8" fill="#B0B0B0" />
          <ellipse cx="44" cy="40" rx="8" ry="6" fill="#B0B0B0" />
        </g>
      );
    case "rain":
      return (
        <g>
          <ellipse cx="32" cy="28" rx="18" ry="12" fill="#708090" />
          <ellipse cx="24" cy="24" rx="12" ry="10" fill="#808080" />
          <line
            x1="20"
            y1="44"
            x2="16"
            y2="54"
            stroke="#00BFFF"
            stroke-width="2"
          />
          <line
            x1="32"
            y1="44"
            x2="28"
            y2="54"
            stroke="#00BFFF"
            stroke-width="2"
          />
          <line
            x1="44"
            y1="44"
            x2="40"
            y2="54"
            stroke="#00BFFF"
            stroke-width="2"
          />
        </g>
      );
    case "thunderstorm":
      return (
        <g>
          <ellipse cx="32" cy="24" rx="18" ry="12" fill="#505050" />
          <ellipse cx="24" cy="20" rx="12" ry="10" fill="#606060" />
          <path
            d="M34 32 L28 44 L36 44 L30 58"
            fill="none"
            stroke="#FFD700"
            stroke-width="3"
          />
        </g>
      );
    case "snow":
      return (
        <g>
          <ellipse cx="32" cy="28" rx="18" ry="12" fill="#B0B0B0" />
          <text x="18" y="52" font-size="12" fill="#FFF">*</text>
          <text x="30" y="56" font-size="12" fill="#FFF">*</text>
          <text x="42" y="50" font-size="12" fill="#FFF">*</text>
        </g>
      );
    case "sleet":
      return (
        <g>
          <ellipse cx="32" cy="28" rx="18" ry="12" fill="#808080" />
          <circle cx="20" cy="50" r="3" fill="#B0E0E6" />
          <circle cx="32" cy="54" r="3" fill="#B0E0E6" />
          <circle cx="44" cy="48" r="3" fill="#B0E0E6" />
        </g>
      );
    case "fog":
      return (
        <g>
          <rect x="12" y="28" width="40" height="4" rx="2" fill="#A0A0A0" />
          <rect x="16" y="36" width="32" height="4" rx="2" fill="#909090" />
          <rect x="12" y="44" width="40" height="4" rx="2" fill="#808080" />
        </g>
      );
    case "windy":
      return (
        <g>
          <path
            d="M8 28 Q32 20 48 28"
            stroke="#A0A0A0"
            stroke-width="3"
            fill="none"
          />
          <path
            d="M12 40 Q36 32 52 40"
            stroke="#808080"
            stroke-width="3"
            fill="none"
          />
          <path
            d="M8 52 Q32 44 48 52"
            stroke="#A0A0A0"
            stroke-width="3"
            fill="none"
          />
        </g>
      );
    case "cloudy":
    default:
      return (
        <g>
          <ellipse cx="32" cy="36" rx="18" ry="12" fill="#A0A0A0" />
          <ellipse cx="24" cy="32" rx="12" ry="10" fill="#B0B0B0" />
          <ellipse cx="42" cy="34" rx="10" ry="8" fill="#B0B0B0" />
        </g>
      );
  }
}

export function WeatherIcon({ icon, conditions }: WeatherIconProps) {
  const type = getConditionType(icon, conditions);

  return (
    <div class="weather-icon">
      <svg viewBox="0 0 64 64" width="64" height="64">
        {getIconSvg(type)}
      </svg>
    </div>
  );
}
