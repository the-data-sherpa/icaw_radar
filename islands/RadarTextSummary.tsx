import type { VNode } from "preact";
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

/**
 * RadarTextSummary — a text rendering of everything the radar canvas conveys.
 *
 * Dynamically generated map tiles are unreadable by assistive technology by
 * definition, so this section is the text alternative for the radar. It is
 * visually hidden at >= 64rem (desktop is untouched) and is a real, visible
 * section of the mobile sheet below 64rem.
 *
 * Built entirely from endpoints that already exist: /api/alerts and
 * /api/storm-reports. Polling pauses while the document is hidden.
 */

const ALERT_INTERVAL_MS = 60_000;
const REPORT_INTERVAL_MS = 300_000;

interface SummaryAlert {
  id: string;
  event: string;
  headline?: string;
  areaDesc?: string;
}

interface SummaryReport {
  type: string;
  magnitude?: string | null;
  city?: string | null;
  county?: string | null;
  time?: string;
  remarks?: string;
}

export default function RadarTextSummary(): VNode {
  const alerts = useSignal<SummaryAlert[]>([]);
  const reports = useSignal<SummaryReport[]>([]);
  const liveText = useSignal("");

  useEffect(() => {
    let cancelled = false;
    let signature = "";

    async function loadAlerts() {
      if (document.hidden) return;
      try {
        const response = await fetch("/api/alerts");
        if (!response.ok) return; // keep the previous value
        const data: SummaryAlert[] = await response.json();
        if (cancelled || !Array.isArray(data)) return;
        alerts.value = data;

        const next = data.map((a) => a.id).join("|");
        if (next !== signature) {
          signature = next;
          liveText.value = data.length === 0
            ? "No active watches or warnings."
            : `${data.length} active ${
              data.length === 1 ? "alert" : "alerts"
            }: ${data.map((a) => a.event).join(", ")}.`;
        }
      } catch {
        // network hiccup: keep the previous value
      }
    }

    async function loadReports() {
      if (document.hidden) return;
      try {
        const response = await fetch("/api/storm-reports");
        if (!response.ok) return;
        const data: SummaryReport[] = await response.json();
        if (cancelled || !Array.isArray(data)) return;
        reports.value = data;
      } catch {
        // keep the previous value
      }
    }

    function onVisibility() {
      if (document.hidden) return;
      loadAlerts();
      loadReports();
    }

    loadAlerts();
    loadReports();
    const alertTimer = setInterval(loadAlerts, ALERT_INTERVAL_MS);
    const reportTimer = setInterval(loadReports, REPORT_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(alertTimer);
      clearInterval(reportTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <section class="radar-text-alt" aria-label="Radar summary, text version">
      <h2 class="radar-text-alt-title">Radar summary</h2>

      <div class="radar-text-alt-group">
        <h3 class="radar-text-alt-title">
          Active watches and warnings ({alerts.value.length})
        </h3>
        {alerts.value.length === 0
          ? (
            <p class="radar-text-alt-empty">
              No active watches or warnings for Iredell County.
            </p>
          )
          : (
            <ul class="radar-text-alt-list">
              {alerts.value.map((a: SummaryAlert) => (
                <li key={a.id}>
                  <strong>{a.event}</strong>
                  {a.areaDesc ? ` — ${a.areaDesc}` : ""}
                  {a.headline ? `. ${a.headline}` : ""}
                </li>
              ))}
            </ul>
          )}
      </div>

      <div class="radar-text-alt-group">
        <h3 class="radar-text-alt-title">
          Recent storm reports ({reports.value.length})
        </h3>
        {reports.value.length === 0
          ? <p class="radar-text-alt-empty">No recent storm reports.</p>
          : (
            <ul class="radar-text-alt-list">
              {reports.value.map((r: SummaryReport, i: number) => (
                <li key={i}>
                  {r.type}
                  {r.magnitude ? ` ${r.magnitude}` : ""}
                  {r.city ? ` near ${r.city}` : ""}
                  {r.county ? `, ${r.county} County` : ""}
                  {r.time ? ` at ${new Date(r.time).toLocaleTimeString()}` : ""}
                  {r.remarks ? `. ${r.remarks}` : ""}
                </li>
              ))}
            </ul>
          )}
      </div>

      <p aria-live="polite" aria-atomic="true" class="visually-hidden">
        {liveText.value}
      </p>
    </section>
  );
}
