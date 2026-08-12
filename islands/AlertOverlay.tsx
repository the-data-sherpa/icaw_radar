import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { audioAlerts } from "@/lib/audio-alerts.ts";

interface Alert {
  id: string;
  event: string;
  headline: string;
  areaDesc: string;
  color: string;
  isEmergency: boolean;
}

export default function AlertOverlay() {
  /**
   * The most recent emergency alert. This deliberately SURVIVES dismissal so
   * `.deck-alert-chip` can re-open it - an emergency must never become
   * unreachable. It is only cleared when the alert leaves the feed.
   */
  const lastAlert = useSignal<Alert | null>(null);
  const dismissed = useSignal<Set<string>>(new Set());
  const visible = useSignal(false);
  const audioActive = useSignal(false);
  const audioInitialized = useRef(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const chipRef = useRef<HTMLButtonElement | null>(null);
  const returnFocus = useRef(false);

  // Initialize audio system on mount
  useEffect(() => {
    if (!audioInitialized.current) {
      audioAlerts.loadPreference();
      audioInitialized.current = true;
    }
  }, []);

  /** Dismiss the current alert overlay. The chip keeps it re-openable. */
  function handleDismiss() {
    const current = lastAlert.value;
    if (!current) return;
    returnFocus.current = true;
    dismissed.value = new Set([...dismissed.value, current.id]);
    visible.value = false;
    audioAlerts.clearPlayed(current.id);
  }

  useEffect(() => {
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    /** setTimeout that is tracked so it can be cancelled on unmount. */
    function later(fn: () => void, ms: number) {
      const id = setTimeout(() => {
        timers.delete(id);
        if (!cancelled) fn();
      }, ms);
      timers.add(id);
    }

    async function fetchAlerts() {
      try {
        const response = await fetch("/api/alerts");
        if (!response.ok) return;

        const alerts: Alert[] = await response.json();
        if (cancelled) return;

        const emergencies = alerts.filter((a) => a.isEmergency);
        const liveIds = new Set(emergencies.map((a) => a.id));

        // Forget dismissals for alerts that have expired out of the feed.
        if ([...dismissed.value].some((id) => !liveIds.has(id))) {
          dismissed.value = new Set(
            [...dismissed.value].filter((id) => liveIds.has(id)),
          );
        }

        // The re-open chip must not outlive the alert it points at.
        if (lastAlert.value && !liveIds.has(lastAlert.value.id)) {
          lastAlert.value = null;
          visible.value = false;
        }

        // Find first emergency alert that hasn't been dismissed
        const emergency = emergencies.find((a) => !dismissed.value.has(a.id));
        if (!emergency) return;

        // Already showing this one - do not re-arm timers on every poll.
        if (lastAlert.value?.id === emergency.id) return;

        lastAlert.value = emergency;
        visible.value = true;

        // Play audio alert if enabled and not already played for this alert
        if (audioAlerts.isEnabled() && !audioAlerts.hasPlayed(emergency.id)) {
          audioActive.value = true;
          await audioAlerts.playAlert(emergency.event, emergency.id);
          if (cancelled) return;
          // Visual feedback duration matches audio pattern
          later(() => {
            audioActive.value = false;
          }, 3000);
        }

        // Auto-dismiss after 15 seconds. Recoverable via .deck-alert-chip.
        later(() => {
          if (visible.value && lastAlert.value?.id === emergency.id) {
            returnFocus.current = closeRef.current !== null &&
              document.activeElement === closeRef.current;
            dismissed.value = new Set([...dismissed.value, emergency.id]);
            visible.value = false;
            audioAlerts.clearPlayed(emergency.id);
          }
        }, 15000);
      } catch (e) {
        console.error("Emergency alert fetch error:", e);
      }
    }

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      for (const id of timers) clearTimeout(id);
      timers.clear();
    };
  }, []);

  // Escape closes; focus moves into the overlay on open and back to the chip.
  useEffect(() => {
    if (visible.value) {
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          handleDismiss();
        }
      };
      document.addEventListener("keydown", onKeyDown);
      closeRef.current?.focus();
      return () => document.removeEventListener("keydown", onKeyDown);
    }
    if (returnFocus.current) {
      returnFocus.current = false;
      chipRef.current?.focus();
    }
  }, [visible.value]);

  const alert = lastAlert.value;
  if (!alert) {
    return null;
  }

  if (!visible.value) {
    return (
      <button
        type="button"
        ref={chipRef}
        class="deck-alert-chip deck-only"
        onClick={() => {
          visible.value = true;
        }}
        aria-label={`Reopen ${alert.event} alert`}
      >
        {alert.event}
      </button>
    );
  }

  // Determine icon based on event type
  let icon = "!";
  if (alert.event.toLowerCase().includes("tornado")) {
    icon = "T";
  } else if (alert.event.toLowerCase().includes("thunderstorm")) {
    icon = "ST";
  } else if (alert.event.toLowerCase().includes("flood")) {
    icon = "FL";
  }

  /**
   * Click-anywhere dismissal is a fine-pointer affordance only. On a touch
   * screen an accidental tap during a tornado warning must not destroy it.
   */
  function handleSurfaceClick() {
    if (typeof globalThis.matchMedia !== "function") return;
    if (!globalThis.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      return;
    }
    handleDismiss();
  }

  return (
    <div
      class={`alert-overlay ${audioActive.value ? "audio-active" : ""}`}
      // @ts-ignore - CSS custom property
      style={{ "--alert-color": alert.color }}
      onClick={handleSurfaceClick}
    >
      <div class="alert-overlay-content" role="alert">
        <div class="alert-overlay-icon" style={{ color: alert.color }}>
          {icon}
        </div>
        <div class="alert-overlay-event" style={{ color: alert.color }}>
          {alert.event}
        </div>
        <div class="alert-overlay-headline">{alert.headline}</div>
        <div class="alert-overlay-area">{alert.areaDesc}</div>
        <div class="alert-overlay-dismiss">Press Escape or tap Close</div>
      </div>
      <button
        type="button"
        ref={closeRef}
        class="alert-overlay-close"
        onClick={handleDismiss}
        aria-label="Dismiss alert"
      >
        X
      </button>
    </div>
  );
}
