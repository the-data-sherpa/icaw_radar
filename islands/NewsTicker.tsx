import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";

interface NewsTickerProps {
  items: string[];
  speed?: number; // pixels per second
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
// Matches the deck breakpoint in static/styles/deck.css (<1024px).
const DECK_QUERY = "(max-width: 63.999rem)";

function matches(query: string): boolean {
  return globalThis.matchMedia?.(query).matches ?? false;
}

export function NewsTicker({ items, speed = 100 }: NewsTickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const offset = useSignal(0);
  // WCAG 2.2.2: auto-starting marquee needs a pause control, and reduced-motion
  // users must not get one at all.
  const paused = useSignal(matches(REDUCED_MOTION_QUERY));
  // Transient pause while the pointer rests on the marquee.
  const hovered = useSignal(false);
  // Below the deck breakpoint the marquee is replaced by a static stacked list.
  // Set from an effect (never at render) so SSR and hydration agree.
  const stacked = useSignal(false);

  useEffect(() => {
    const motionQuery = globalThis.matchMedia?.(REDUCED_MOTION_QUERY);
    const deckQuery = globalThis.matchMedia?.(DECK_QUERY);

    stacked.value = deckQuery?.matches ?? false;

    const onMotionChange = (e: MediaQueryListEvent) => {
      paused.value = e.matches;
    };
    const onDeckChange = (e: MediaQueryListEvent) => {
      stacked.value = e.matches;
    };

    motionQuery?.addEventListener("change", onMotionChange);
    deckQuery?.addEventListener("change", onDeckChange);

    return () => {
      motionQuery?.removeEventListener("change", onMotionChange);
      deckQuery?.removeEventListener("change", onDeckChange);
    };
  }, []);

  useEffect(() => {
    // Re-runs whenever paused/stacked flip, so the loop is cancelled and
    // restarted rather than fighting an inline transform.
    if (paused.value || hovered.value || stacked.value) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    const animate = (time: number) => {
      const deltaTime = (time - lastTime) / 1000;
      lastTime = time;

      if (containerRef.current) {
        // Move content left
        offset.value -= speed * deltaTime;

        // Reset if scrolled past width
        const contentWidth = containerRef.current.scrollWidth / 2; // Divided by 2 because we duplicate content
        if (offset.value <= -contentWidth) {
          offset.value += contentWidth;
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrameId);
  }, [speed, items, paused.value, hovered.value, stacked.value]);

  // If no items, don't render or render default
  const displayItems = items.length > 0
    ? items
    : ["Welcome to Iredell County Weather Radar"];

  return (
    <div
      class="alert-ticker"
      // Hovering the marquee stops it, which is the discoverable way to read a
      // headline that is sliding away. Only meaningful while it actually moves.
      onMouseEnter={() => {
        if (!stacked.value) hovered.value = true;
      }}
      onMouseLeave={() => {
        hovered.value = false;
      }}
    >
      {
        /* WCAG 2.2.2 applies only where the marquee actually auto-scrolls, i.e.
          NOT in the deck, where `stacked` renders a static list instead. So the
          control is omitted there entirely rather than shown as dead chrome.
          On desktop it stays operable but is off-screen until focused, so the
          ticker reads as plain text. */
      }
      {!stacked.value && (
        <button
          type="button"
          class="ticker-pause"
          aria-pressed={paused.value}
          aria-label={paused.value
            ? "Resume scrolling headlines"
            : "Pause scrolling headlines"}
          onClick={() => {
            paused.value = !paused.value;
          }}
        >
          {paused.value ? "▶" : "⏸"}
        </button>
      )}
      <div class="ticker-label">
        <span class="live-dot"></span>
        IREDELL COUNTY WEATHER
      </div>
      {stacked.value
        ? (
          <ul class="ticker-list">
            {displayItems.map((item, i) => (
              <li key={i} class="ticker-list-item">{item}</li>
            ))}
          </ul>
        )
        : (
          <div class="ticker-content">
            <div
              ref={containerRef}
              class="ticker-track"
              style={{ transform: `translateX(${offset.value}px)` }}
            >
              {/* Duplicate items for seamless looping */}
              {[...displayItems, ...displayItems].map((item, i) => (
                <span key={i} class="ticker-item">
                  {item} <span class="separator">/</span>
                </span>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
