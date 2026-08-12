import { define } from "../utils.ts";

export default define.page(function App({ Component, url }) {
  const isOverlay = url.pathname.startsWith("/overlay");
  return (
    <html lang="en" class={isOverlay ? "obs" : "web"}>
      <head>
        <meta charset="utf-8" />
        {isOverlay
          ? (
            <meta
              name="viewport"
              content="width=1920, height=1080, initial-scale=1.0"
            />
          )
          : (
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1, viewport-fit=cover"
            />
          )}
        {!isOverlay && <meta name="theme-color" content="#0a0a0a" />}
        <title>ICAW Weather Radar</title>
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/images/icaw-logo.png"
        />
        <link rel="apple-touch-icon" href="/images/apple-touch-icon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossorigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://basemaps.cartocdn.com"
          crossorigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://mesonet.agron.iastate.edu"
          crossorigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Condensed:wght@700&family=Roboto+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"
          rel="stylesheet"
        />
        <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js">
        </script>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <link rel="stylesheet" href="/styles/broadcast.css" />
        {!isOverlay && <link rel="stylesheet" href="/styles/deck.css" />}
      </head>
      <body>
        <Component />
      </body>
    </html>
  );
});
