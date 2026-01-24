import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

interface ClockProps {
  timeFormat: "12h" | "24h";
}

export default function Clock({ timeFormat }: ClockProps) {
  const time = useSignal("");
  const date = useSignal("");

  useEffect(() => {
    function updateClock() {
      const now = new Date();

      // Format time
      let hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, "0");
      const seconds = now.getSeconds().toString().padStart(2, "0");

      if (timeFormat === "12h") {
        const ampm = hours >= 12 ? "PM" : "AM";
        hours = hours % 12 || 12;
        time.value = `${hours}:${minutes}:${seconds} ${ampm}`;
      } else {
        time.value = `${
          hours.toString().padStart(2, "0")
        }:${minutes}:${seconds}`;
      }

      // Format date
      const options: Intl.DateTimeFormatOptions = {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      };
      date.value = now.toLocaleDateString("en-US", options);
    }

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [timeFormat]);

  return (
    <div class="clock">
      <div class="clock-time">{time.value}</div>
      <div class="clock-date">{date.value}</div>
    </div>
  );
}
