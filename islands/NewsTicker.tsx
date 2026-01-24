import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";

interface NewsTickerProps {
    items: string[];
    speed?: number; // pixels per second
}

export function NewsTicker({ items, speed = 100 }: NewsTickerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const offset = useSignal(0);

    useEffect(() => {
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
    }, [speed, items]);

    // If no items, don't render or render default
    const displayItems = items.length > 0 ? items : ["Welcome to Iredell County Weather Radar"];

    return (
        <div class="alert-ticker">
            <div class="ticker-label">
                <span class="live-dot"></span>
                IREDELL COUNTY WEATHER
            </div>
            <div class="ticker-content">
                <div
                    ref={containerRef}
                    class="ticker-track"
                    style={{ transform: `translateX(${offset.value}px)` }}
                >
                    {/* Duplicate items for seamless looping */}
                    {[...displayItems, ...displayItems].map((item, i) => (
                        <span key={i} class="ticker-item">{item} <span class="separator">///</span> </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
