interface BrandingAreaProps {
  stationId: string;
  stationName: string;
  logoPath: string;
}

export function BrandingArea(
  { stationId, stationName, logoPath }: BrandingAreaProps,
) {
  return (
    <div class="branding">
      {logoPath
        ? (
          <img
            src={logoPath}
            alt={stationName}
            class="logo"
            onError={(e) => {
              // If logo fails to load, show placeholder
              const target = e.currentTarget as HTMLImageElement;
              target.style.display = "none";
              const placeholder = target.nextElementSibling as HTMLElement;
              if (placeholder) placeholder.style.display = "flex";
            }}
          />
        )
        : null}
      <div class="logo-placeholder" style={logoPath ? { display: "none" } : {}}>
        LOGO
      </div>
      <div class="station-id">{stationId}</div>
      <div class="station-name">{stationName}</div>
    </div>
  );
}
