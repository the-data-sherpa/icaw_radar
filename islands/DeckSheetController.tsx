import type { VNode } from "preact";
import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";

/**
 * DeckSheetController — the tap/keyboard/drag handle for the mobile "Storm
 * Deck" bottom sheet.
 *
 * Integration surface (the only things other workstreams may rely on):
 *  - writes `document.documentElement.dataset.detent` = "peek" | "half" | "full"
 *    (never while the viewport is >= 64rem; removed when crossing back above it)
 *  - dispatches `icaw:detent` on `globalThis` with
 *    `{ detail: { detent, covered, axis } }` where `covered` is the number of
 *    CSS px of the viewport the sheet occupies along `axis`.
 *    `axis: "block"`  — the normal bottom sheet; `covered` is a HEIGHT and
 *                       belongs in `map.setPadding({ bottom: covered })`.
 *    `axis: "inline"` — the landscape right rail (deck.css
 *                       `(max-height: 32rem) and (orientation: landscape)`),
 *                       where the sheet is `inset: 0 0 0 auto; height: 100svh`.
 *                       `covered` is a WIDTH and belongs in
 *                       `map.setPadding({ right: covered })`. Consumers MUST
 *                       branch on `axis`; feeding an inline `covered` into
 *                       `bottom` pushes the camera centre off the map.
 *  - sets `data-dragging="true"` on `.deck-sheet` while a pointer drag is live
 *
 * It NEVER re-parents the sidebar islands: it only walks up to `.deck-sheet`.
 */

type Detent = "peek" | "half" | "full";
type Axis = "block" | "inline";

const ORDER: Detent[] = ["peek", "half", "full"];
const DECK_QUERY = "(max-width: 63.999rem)";
const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
/** must stay in sync with the landscape rail block in deck.css */
const RAIL_QUERY = "(max-height: 32rem) and (orientation: landscape)";

/** px of pointer travel before a press is treated as a drag instead of a tap */
const DRAG_THRESHOLD = 4;
/** px/ms flick threshold that overrides nearest-detent snapping */
const FLICK_VELOCITY = 0.5;
/** fallback settle delay when no transitionend arrives */
const SETTLE_TIMEOUT = 500;

/** fallbacks used only when the deck custom properties cannot be resolved */
const PEEK_FRACTION = 0.26;
const HALF_FRACTION = 0.55;
const FULL_FRACTION = 0.9;

/**
 * Rail resting sliver. deck.css parks the rail at
 * `translate: calc(100% - 56px) 0`, so exactly 56px of it covers the map at
 * the peek detent.
 */
const RAIL_PEEK_PX = 56;
/** rail width fallback, mirroring deck.css `width: min(380px, 46vw)` */
const RAIL_MAX_PX = 380;
const RAIL_VW_FRACTION = 0.46;

interface Sample {
  /** position along the active axis (clientY for block, clientX for inline) */
  pos: number;
  t: number;
}

interface DeckState {
  sheet: HTMLElement | null;
  deck: boolean;
  /** true while the landscape right-rail layout is active */
  rail: boolean;
  dragging: boolean;
  moved: boolean;
  suppressClick: boolean;
  pointerId: number | null;
  startPos: number;
  base: number;
  samples: Sample[];
  covered: Record<Detent, number>;
  fullPx: number;
  settleTimer: number;
  rafId: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.(MOTION_QUERY)?.matches ?? false;
}

/**
 * The landscape rail is a WIDTH-driven layout, so every measurement, the drag
 * axis and the dispatched `covered` all have to switch with it.
 */
function isRail(): boolean {
  return globalThis.matchMedia?.(RAIL_QUERY)?.matches ?? false;
}

/**
 * Resolve a CSS length expression (`clamp()`, `svh`, `var()`) to px by
 * measuring a throwaway probe element. `getComputedStyle().getPropertyValue()`
 * on an unregistered custom property returns the unresolved token stream, so
 * measurement is the only reliable route.
 */
function probeLength(expr: string): number {
  if (typeof document === "undefined") return 0;
  const el = document.createElement("div");
  el.style.cssText =
    "position:absolute;left:0;top:0;width:0;visibility:hidden;" +
    "pointer-events:none;height:" + expr;
  document.body.appendChild(el);
  const height = el.getBoundingClientRect().height;
  el.remove();
  return Number.isFinite(height) ? height : 0;
}

export default function DeckSheetController(): VNode {
  // SSR renders "peek", so the first client render matches the server exactly.
  const detent = useSignal<Detent>("peek");
  const ref = useRef<HTMLButtonElement | null>(null);
  const state = useRef<DeckState>({
    sheet: null,
    deck: false,
    rail: false,
    dragging: false,
    moved: false,
    suppressClick: false,
    pointerId: null,
    startPos: 0,
    base: 0,
    samples: [],
    covered: { peek: 0, half: 0, full: 0 },
    fullPx: 0,
    settleTimer: 0,
    rafId: 0,
  });

  function refreshMetrics() {
    const s = state.current;
    const sheet = s.sheet;
    if (!sheet) return;
    s.rail = isRail();
    const rect = sheet.getBoundingClientRect();

    if (s.rail) {
      // Rail: the sheet is full-height and slides horizontally, so "full" is
      // its width and "peek" is the 56px sliver deck.css leaves on screen.
      // half and full share one visual state there (translate: 0 0).
      const measured = rect.width;
      const full = measured > 0 ? measured : Math.min(
        RAIL_MAX_PX,
        (globalThis.innerWidth || 0) * RAIL_VW_FRACTION,
      );
      s.fullPx = full;
      s.covered.full = full;
      s.covered.half = full;
      s.covered.peek = clamp(RAIL_PEEK_PX, 0, full);
      return;
    }

    const viewport = globalThis.innerHeight || 0;
    const measured = rect.height;
    const full = measured > 0
      ? measured
      : probeLength("var(--deck-full)") || viewport * FULL_FRACTION;
    const peek = probeLength("var(--deck-peek)") || viewport * PEEK_FRACTION;
    const half = probeLength("var(--deck-half)") || viewport * HALF_FRACTION;
    s.fullPx = full;
    s.covered.full = full;
    s.covered.peek = clamp(peek, 0, full);
    s.covered.half = clamp(half, s.covered.peek, full);
  }

  function coveredNow(): number {
    const sheet = state.current.sheet;
    if (!sheet) return 0;
    const rect = sheet.getBoundingClientRect();
    if (isRail()) {
      // Inline axis: `rect.top` is 0 for a `height: 100svh` rail, so measuring
      // vertically here would report the whole viewport as covered.
      return Math.max(0, (globalThis.innerWidth || 0) - rect.left);
    }
    return Math.max(0, (globalThis.innerHeight || 0) - rect.top);
  }

  function cancelPending() {
    const s = state.current;
    if (s.settleTimer) {
      clearTimeout(s.settleTimer);
      s.settleTimer = 0;
    }
    if (s.rafId) {
      globalThis.cancelAnimationFrame?.(s.rafId);
      s.rafId = 0;
    }
  }

  function settle() {
    const s = state.current;
    cancelPending();
    if (!s.deck || !s.sheet) return;
    // A rotation can land between the last measurement and this settle.
    s.rail = isRail();
    const current: Detent = detent.value;
    const covered = coveredNow();
    const axis: Axis = s.rail ? "inline" : "block";
    s.covered[current] = covered;
    globalThis.dispatchEvent(
      new CustomEvent("icaw:detent", {
        detail: { detent: current, covered, axis },
      }),
    );
  }

  function scheduleSettle() {
    const s = state.current;
    cancelPending();
    if (!s.deck) return;
    if (prefersReducedMotion()) {
      // No transition means no transitionend; settle on the next frame.
      s.rafId = globalThis.requestAnimationFrame(() => {
        s.rafId = 0;
        settle();
      });
      return;
    }
    s.settleTimer = setTimeout(() => {
      s.settleTimer = 0;
      settle();
    }, SETTLE_TIMEOUT);
  }

  function applyDetent(next: Detent) {
    const s = state.current;
    if (!s.deck) return;
    detent.value = next;
    document.documentElement.dataset.detent = next;
    scheduleSettle();
  }

  function restingTranslate(which: Detent): number {
    const s = state.current;
    return Math.max(0, s.fullPx - s.covered[which]);
  }

  function nearestDetent(covered: number): Detent {
    const s = state.current;
    // Seeded with the current detent so a tie keeps it. In the rail layout
    // half and full cover the same width, so ties are the normal case.
    let best: Detent = detent.value;
    let bestDelta = Math.abs(s.covered[best] - covered);
    for (const candidate of ORDER) {
      const delta = Math.abs(s.covered[candidate] - covered);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = candidate;
      }
    }
    return best;
  }

  const cycle = () => {
    const s = state.current;
    if (!s.deck) return;
    if (s.suppressClick) {
      s.suppressClick = false;
      return;
    }
    const index = ORDER.indexOf(detent.value);
    applyDetent(ORDER[(index + 1) % ORDER.length]);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!state.current.deck) return;
    const index = ORDER.indexOf(detent.value);
    let next: Detent;
    switch (e.key) {
      case "ArrowUp":
        next = ORDER[Math.min(index + 1, ORDER.length - 1)];
        break;
      case "ArrowDown":
        next = ORDER[Math.max(index - 1, 0)];
        break;
      case "Escape":
      case "Home":
        next = "peek";
        break;
      case "End":
        next = "full";
        break;
      default:
        return;
    }
    e.preventDefault();
    applyDetent(next);
  };

  const onPointerDown = (e: PointerEvent) => {
    const s = state.current;
    if (!s.deck || !s.sheet || s.dragging) return;
    if (e.button > 0) return;
    // Also latches s.rail, so the drag axis cannot flip mid-gesture.
    refreshMetrics();
    s.dragging = true;
    s.moved = false;
    // A cancelled drag never produces the click that clears this.
    s.suppressClick = false;
    s.pointerId = e.pointerId;
    const pos = s.rail ? e.clientX : e.clientY;
    s.startPos = pos;
    s.base = restingTranslate(detent.value);
    s.samples = [{ pos, t: performance.now() }];
    try {
      ref.current?.setPointerCapture(e.pointerId);
    } catch {
      // capture is an enhancement; drag still works without it
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    const s = state.current;
    if (!s.deck || !s.dragging || !s.sheet || e.pointerId !== s.pointerId) {
      return;
    }
    // Positive delta always means "closing": down for the sheet, right for the
    // rail. That keeps the base/velocity maths axis-agnostic.
    const pos = s.rail ? e.clientX : e.clientY;
    const delta = pos - s.startPos;
    if (!s.moved) {
      if (Math.abs(delta) < DRAG_THRESHOLD) return;
      s.moved = true;
      // A real drag must not also fire the tap-to-cycle click.
      s.suppressClick = true;
      s.sheet.dataset.dragging = "true";
    }
    const max = Math.max(0, s.fullPx - s.covered.peek);
    const offset = clamp(s.base + delta, 0, max);
    // Compositor-only: no layout, no paint of the map container. The rail
    // rests at `translate: calc(100% - 56px) 0`, so it must move on X.
    s.sheet.style.translate = s.rail ? `${offset}px 0` : `0 ${offset}px`;
    s.samples.push({ pos, t: performance.now() });
    if (s.samples.length > 4) s.samples.shift();
  };

  const onPointerUp = (e: PointerEvent) => {
    const s = state.current;
    if (!s.dragging || e.pointerId !== s.pointerId) return;
    s.dragging = false;
    s.pointerId = null;
    try {
      ref.current?.releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
    const sheet = s.sheet;
    if (!sheet) return;
    delete sheet.dataset.dragging;
    sheet.style.translate = "";
    if (!s.moved) return; // plain tap: the click handler cycles

    const first = s.samples[0];
    const last = s.samples[s.samples.length - 1];
    const dt = last.t - first.t;
    const velocity = dt > 0 ? (last.pos - first.pos) / dt : 0;
    const index = ORDER.indexOf(detent.value);

    let target: Detent;
    if (Math.abs(velocity) > FLICK_VELOCITY) {
      target = velocity > 0
        ? ORDER[Math.max(index - 1, 0)]
        : ORDER[Math.min(index + 1, ORDER.length - 1)];
    } else {
      const max = Math.max(0, s.fullPx - s.covered.peek);
      const translated = clamp(s.base + (last.pos - s.startPos), 0, max);
      target = nearestDetent(s.fullPx - translated);
    }
    applyDetent(target);
  };

  useEffect(() => {
    const s = state.current;
    const sheet = (ref.current?.closest(".deck-sheet") ?? null) as
      | HTMLElement
      | null;
    s.sheet = sheet;

    const mq = globalThis.matchMedia?.(DECK_QUERY) ?? null;
    // Crossing into or out of the rail changes the axis of `covered`, so the
    // consumers have to be told even though the detent itself did not change.
    const railMq = globalThis.matchMedia?.(RAIL_QUERY) ?? null;
    const root = document.documentElement;

    const reset = () => {
      cancelPending();
      s.dragging = false;
      s.moved = false;
      s.suppressClick = false;
      s.pointerId = null;
      if (sheet) {
        sheet.style.translate = "";
        delete sheet.dataset.dragging;
      }
    };

    const sync = () => {
      const active = mq?.matches ?? false;
      s.deck = active;
      if (!active) {
        reset();
        detent.value = "peek";
        delete root.dataset.detent;
        return;
      }
      root.dataset.detent = detent.value;
      refreshMetrics();
      scheduleSettle();
    };

    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.target !== sheet) return;
      if (e.propertyName !== "translate" && e.propertyName !== "transform") {
        return;
      }
      settle();
    };

    const onResize = () => {
      if (!s.deck) return;
      refreshMetrics();
      scheduleSettle();
    };

    sync();
    mq?.addEventListener("change", sync);
    railMq?.addEventListener("change", sync);
    sheet?.addEventListener("transitionend", onTransitionEnd);
    globalThis.addEventListener("resize", onResize);
    globalThis.addEventListener("orientationchange", onResize);

    return () => {
      mq?.removeEventListener("change", sync);
      railMq?.removeEventListener("change", sync);
      sheet?.removeEventListener("transitionend", onTransitionEnd);
      globalThis.removeEventListener("resize", onResize);
      globalThis.removeEventListener("orientationchange", onResize);
      reset();
      s.deck = false;
      s.sheet = null;
      delete root.dataset.detent;
    };
  }, []);

  return (
    <button
      type="button"
      ref={ref}
      class="deck-grip deck-only"
      aria-label="Weather details panel"
      aria-expanded={detent.value !== "peek"}
      aria-controls="deck-sheet-body"
      onClick={cycle}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span class="deck-grip-bar" aria-hidden="true" />
      <span class="visually-hidden">
        {detent.value === "peek"
          ? "Expand weather details"
          : detent.value === "half"
          ? "Expand weather details fully"
          : "Collapse weather details"}
      </span>
    </button>
  );
}
