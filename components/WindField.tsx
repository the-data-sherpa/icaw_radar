import { useEffect, useRef } from "preact/hooks";

interface WindPoint {
  lat: number;
  lon: number;
  speed: number;
  direction: number;
}

interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface WindFieldProps {
  windData: WindPoint[];
  mapBounds: MapBounds;
  isVisible: boolean;
}

interface Particle {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  speed: number;
}

/** Precomputed wind vectors on a coarse canvas-space lattice. */
interface WindGrid {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  dx: Float32Array;
  dy: Float32Array;
  speed: Float32Array;
}

// One lattice sample every ~40 CSS px. The wind data itself is far coarser
// than that, so this loses no detail while turning an O(particles x stations)
// per-frame cost into an O(lattice x stations) cost per bounds change.
const GRID_CELL_PX = 40;

// Bilinear interpolation for smooth wind field
function interpolateWind(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  windData: WindPoint[],
  mapBounds: MapBounds,
): { dx: number; dy: number; speed: number } {
  if (windData.length === 0) {
    return { dx: 0, dy: 0, speed: 0 };
  }

  // Convert canvas coordinates to lat/lon
  const lon = mapBounds.west +
    (x / canvasWidth) * (mapBounds.east - mapBounds.west);
  const lat = mapBounds.north -
    (y / canvasHeight) * (mapBounds.north - mapBounds.south);

  // Find the 4 nearest wind data points for interpolation
  let totalWeight = 0;
  let weightedSpeed = 0;
  let weightedDirX = 0;
  let weightedDirY = 0;

  for (const point of windData) {
    // Calculate distance (simple Euclidean for small areas)
    const dLat = lat - point.lat;
    const dLon = lon - point.lon;
    const dist = Math.sqrt(dLat * dLat + dLon * dLon);

    // Inverse distance weighting
    const weight = 1 / Math.max(dist, 0.001);
    totalWeight += weight;

    // Convert meteorological direction to mathematical angle
    // Meteorological: 0=N, 90=E, 180=S, 270=W (direction FROM which wind blows)
    // Add 180 to get flow direction (TO), then convert to math angle (90 - meteoAngle)
    // Math angle = 90 - (direction + 180) = -90 - direction = (270 - direction)
    const mathAngle = ((270 - point.direction) * Math.PI) / 180;

    weightedSpeed += point.speed * weight;
    weightedDirX += Math.cos(mathAngle) * weight;
    // Negate sin because canvas Y-axis points downward
    weightedDirY += -Math.sin(mathAngle) * weight;
  }

  const avgSpeed = weightedSpeed / totalWeight;
  const avgDirX = weightedDirX / totalWeight;
  const avgDirY = weightedDirY / totalWeight;

  // Normalize direction and apply speed
  const dirMag = Math.sqrt(avgDirX * avgDirX + avgDirY * avgDirY);
  const normalizedDirX = dirMag > 0 ? avgDirX / dirMag : 0;
  const normalizedDirY = dirMag > 0 ? avgDirY / dirMag : 0;

  // Scale speed for visual effect (pixels per frame)
  // Faster winds = longer particle trails
  const speedScale = 0.3 + (avgSpeed / 30) * 0.7; // Scale from 0.3 to 1.0 based on wind speed

  return {
    dx: normalizedDirX * speedScale * 2,
    dy: normalizedDirY * speedScale * 2,
    speed: avgSpeed,
  };
}

/** Samples interpolateWind onto a coarse lattice once, instead of per particle. */
function buildWindGrid(
  width: number,
  height: number,
  windData: WindPoint[],
  mapBounds: MapBounds,
): WindGrid {
  const cols = Math.max(2, Math.ceil(width / GRID_CELL_PX) + 1);
  const rows = Math.max(2, Math.ceil(height / GRID_CELL_PX) + 1);
  const cellW = width / (cols - 1);
  const cellH = height / (rows - 1);

  const dx = new Float32Array(cols * rows);
  const dy = new Float32Array(cols * rows);
  const speed = new Float32Array(cols * rows);

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const w = interpolateWind(
        i * cellW,
        j * cellH,
        width,
        height,
        windData,
        mapBounds,
      );
      const k = j * cols + i;
      dx[k] = w.dx;
      dy[k] = w.dy;
      speed[k] = w.speed;
    }
  }

  return { cols, rows, cellW, cellH, dx, dy, speed };
}

/** Bilinear lookup into the precomputed lattice. */
function sampleGrid(
  grid: WindGrid,
  x: number,
  y: number,
): { dx: number; dy: number; speed: number } {
  const gx = Math.min(Math.max(x / grid.cellW, 0), grid.cols - 1);
  const gy = Math.min(Math.max(y / grid.cellH, 0), grid.rows - 1);
  const i0 = Math.floor(gx);
  const j0 = Math.floor(gy);
  const i1 = Math.min(i0 + 1, grid.cols - 1);
  const j1 = Math.min(j0 + 1, grid.rows - 1);
  const fx = gx - i0;
  const fy = gy - j0;

  const k00 = j0 * grid.cols + i0;
  const k10 = j0 * grid.cols + i1;
  const k01 = j1 * grid.cols + i0;
  const k11 = j1 * grid.cols + i1;

  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;

  return {
    dx: grid.dx[k00] * w00 + grid.dx[k10] * w10 + grid.dx[k01] * w01 +
      grid.dx[k11] * w11,
    dy: grid.dy[k00] * w00 + grid.dy[k10] * w10 + grid.dy[k01] * w01 +
      grid.dy[k11] * w11,
    speed: grid.speed[k00] * w00 + grid.speed[k10] * w10 +
      grid.speed[k01] * w01 + grid.speed[k11] * w11,
  };
}

// Get color based on wind speed (Windy.com style gradient)
function getWindColor(speed: number): string {
  // Speed in mph - adjust thresholds as needed
  if (speed < 5) return "rgba(98, 113, 183, 0.8)"; // Light blue - calm
  if (speed < 10) return "rgba(57, 97, 159, 0.8)"; // Blue - light breeze
  if (speed < 15) return "rgba(74, 148, 169, 0.8)"; // Teal - gentle breeze
  if (speed < 20) return "rgba(77, 167, 91, 0.8)"; // Green - moderate
  if (speed < 25) return "rgba(163, 192, 63, 0.8)"; // Yellow-green - fresh
  if (speed < 30) return "rgba(247, 215, 50, 0.85)"; // Yellow - strong
  if (speed < 40) return "rgba(246, 126, 36, 0.9)"; // Orange - high wind
  if (speed < 50) return "rgba(234, 51, 35, 0.9)"; // Red - gale
  return "rgba(190, 30, 98, 0.95)"; // Magenta - storm
}

/** Device-appropriate particle budget. 3000 melts a mid-range phone. */
function particleBudget(): number {
  const coarse = globalThis.matchMedia?.("(pointer: coarse)").matches ?? false;
  if (coarse) return 600;
  return (navigator.hardwareConcurrency ?? 4) >= 8 ? 3000 : 1500;
}

export function WindField({ windData, mapBounds, isVisible }: WindFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationIdRef = useRef<number>(0);
  // mapBounds is a NEW object on every moveend. Keeping it in the effect's
  // dependency array tore down and reallocated the particle system, the
  // offscreen trail canvas and the ResizeObserver after every pan flick.
  const boundsRef = useRef<MapBounds>(mapBounds);
  const rebuildGridRef = useRef<() => void>(() => {});

  useEffect(() => {
    boundsRef.current = mapBounds;
    rebuildGridRef.current();
  }, [mapBounds]);

  useEffect(() => {
    if (!isVisible || !canvasRef.current) {
      // Clean up when hidden
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = 0;
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion =
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
        false;

    // Set canvas size to match container
    const updateCanvasSize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };
    updateCanvasSize();

    // Particle settings - adjusted for visual appeal
    const PARTICLE_COUNT = particleBudget();
    const BASE_MAX_AGE = 80;
    const AGE_VARIANCE = 40;

    // Initialize particles if empty or count changed significantly
    if (
      particlesRef.current.length < PARTICLE_COUNT * 0.5 ||
      particlesRef.current.length > PARTICLE_COUNT * 1.5
    ) {
      particlesRef.current = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particlesRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          age: Math.floor(Math.random() * BASE_MAX_AGE),
          maxAge: BASE_MAX_AGE + Math.random() * AGE_VARIANCE,
          speed: 0,
        });
      }
    }

    const particles = particlesRef.current;

    // Create offscreen canvas for trail effect
    const trailCanvas = document.createElement("canvas");
    trailCanvas.width = canvas.width;
    trailCanvas.height = canvas.height;
    const trailCtx = trailCanvas.getContext("2d");
    if (!trailCtx) return;

    // Clear both canvases
    ctx.fillStyle = "rgba(0, 0, 0, 0)";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    trailCtx.fillStyle = "rgba(0, 0, 0, 0)";
    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);

    let grid: WindGrid = buildWindGrid(
      canvas.width,
      canvas.height,
      windData,
      boundsRef.current,
    );
    const rebuildGrid = () => {
      if (canvas.width === 0 || canvas.height === 0) return;
      grid = buildWindGrid(
        canvas.width,
        canvas.height,
        windData,
        boundsRef.current,
      );
    };
    rebuildGridRef.current = rebuildGrid;

    let lastTime = performance.now();

    /** One integration + draw pass. Shared by the rAF loop and the static
     * reduced-motion render. */
    function step(deltaTime: number) {
      if (!ctx || !trailCtx || !canvas) return;

      // Fade existing trails - this creates the flowing effect
      trailCtx.globalCompositeOperation = "destination-out";
      trailCtx.fillStyle = `rgba(0, 0, 0, ${0.03 * deltaTime})`;
      trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);
      trailCtx.globalCompositeOperation = "source-over";

      // Update and draw particles
      for (const p of particles) {
        const wind = sampleGrid(grid, p.x, p.y);

        const prevX = p.x;
        const prevY = p.y;

        // Move particle
        p.x += wind.dx * deltaTime;
        p.y += wind.dy * deltaTime;
        p.age += deltaTime;
        p.speed = wind.speed;

        // Calculate alpha based on particle age (fade in and out)
        const lifeRatio = p.age / p.maxAge;
        let alpha = 1;
        if (lifeRatio < 0.1) {
          alpha = lifeRatio / 0.1; // Fade in
        } else if (lifeRatio > 0.7) {
          alpha = 1 - (lifeRatio - 0.7) / 0.3; // Fade out
        }

        // Only draw if particle has moved and is in bounds
        if (
          p.x >= 0 &&
          p.x < canvas.width &&
          p.y >= 0 &&
          p.y < canvas.height &&
          (Math.abs(wind.dx) > 0.01 || Math.abs(wind.dy) > 0.01)
        ) {
          const color = getWindColor(p.speed);

          // Draw line from previous to current position
          trailCtx.beginPath();
          trailCtx.moveTo(prevX, prevY);
          trailCtx.lineTo(p.x, p.y);
          trailCtx.strokeStyle = color.replace(/[\d.]+\)$/, `${alpha * 0.7})`);
          trailCtx.lineWidth = 1 + (p.speed / 40); // Thicker lines for faster wind
          trailCtx.lineCap = "round";
          trailCtx.stroke();
        }

        // Reset particle if too old or out of bounds
        if (
          p.age > p.maxAge ||
          p.x < -10 ||
          p.x > canvas.width + 10 ||
          p.y < -10 ||
          p.y > canvas.height + 10
        ) {
          // Respawn at random edge position biased by wind direction
          if (Math.random() < 0.5) {
            // Random position
            p.x = Math.random() * canvas.width;
            p.y = Math.random() * canvas.height;
          } else {
            // Spawn at upwind edge for continuous flow
            const edgeChoice = Math.random();
            if (edgeChoice < 0.25) {
              p.x = 0;
              p.y = Math.random() * canvas.height;
            } else if (edgeChoice < 0.5) {
              p.x = canvas.width;
              p.y = Math.random() * canvas.height;
            } else if (edgeChoice < 0.75) {
              p.x = Math.random() * canvas.width;
              p.y = 0;
            } else {
              p.x = Math.random() * canvas.width;
              p.y = canvas.height;
            }
          }
          p.age = 0;
          p.maxAge = BASE_MAX_AGE + Math.random() * AGE_VARIANCE;
        }
      }

      // Copy trail canvas to main canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(trailCanvas, 0, 0);
    }

    function animate(currentTime: number) {
      // Calculate delta time for smooth animation
      const deltaTime = Math.min((currentTime - lastTime) / 16.67, 2); // Cap at 2x speed
      lastTime = currentTime;
      step(deltaTime);
      animationIdRef.current = requestAnimationFrame(animate);
    }

    /** Reduced motion: draw ONE static streamline snapshot and stop. The
     * information (where the wind is and how fast) survives; the motion does
     * not. */
    function renderStatic() {
      for (let i = 0; i < 40; i++) step(1);
    }

    const stop = () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = 0;
      }
    };

    const start = () => {
      if (reduceMotion) {
        renderStatic();
        return;
      }
      if (animationIdRef.current) return;
      lastTime = performance.now();
      animationIdRef.current = requestAnimationFrame(animate);
    };

    // Hard-stop while the tab is in the background: a backgrounded rAF loop
    // still burns battery on mobile Safari during audio playback.
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    if (!document.hidden) start();

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
      trailCanvas.width = canvas.width;
      trailCanvas.height = canvas.height;
      rebuildGrid();
      if (reduceMotion && !document.hidden) renderStatic();
    });
    resizeObserver.observe(canvas.parentElement!);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      resizeObserver.disconnect();
      rebuildGridRef.current = () => {};
    };
  }, [windData, isVisible]);

  if (!isVisible) return null;

  // Positioning/compositing live in broadcast.css (.wind-field-canvas) so a
  // stylesheet can reach them.
  return <canvas ref={canvasRef} class="wind-field-canvas" />;
}
