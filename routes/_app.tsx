import { define } from "../utils.ts";

export default define.page(function App({ Component }) {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <meta
          name="viewport"
          content="width=1920, height=1080, initial-scale=1.0"
        />
        <title>ICAW Weather Radar</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossorigin=""
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
        <link rel="stylesheet" href="/styles/broadcast.css" />
      </head>
      <body>
        <Component />
      </body>
    </html>
  );
});
