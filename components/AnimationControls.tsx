interface AnimationControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  frameIndex: number;
  totalFrames: number;
  onFrameChange: (index: number) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  onStepBack: () => void;
  onStepForward: () => void;
}

export function AnimationControls({
  isPlaying,
  onPlayPause,
  frameIndex,
  totalFrames,
  onFrameChange,
  speed,
  onSpeedChange,
  onStepBack,
  onStepForward,
}: AnimationControlsProps) {
  // Frame 0 = current (newest), higher index = older
  // For display: frame 0 should be at 100% (right side), frame 10 at 0% (left side)
  // Guard the divide: with a single loaded frame totalFrames - 1 is 0 and the
  // width would resolve to "NaN%".
  const denom = Math.max(1, totalFrames - 1);
  const progressPercent = ((denom - frameIndex) / denom) * 100;
  const sliderMax = Math.max(0, totalFrames - 1);

  return (
    <div class="animation-controls">
      {/* Step Back */}
      <button
        type="button"
        onClick={onStepBack}
        title="Previous frame (older)"
        aria-label="Previous frame"
      >
        {String.fromCodePoint(0x25C0)}
      </button>

      {/* Play/Pause */}
      <button
        type="button"
        onClick={onPlayPause}
        class={isPlaying ? "active" : ""}
        title={isPlaying ? "Pause" : "Play"}
        aria-label={isPlaying ? "Pause radar loop" : "Play radar loop"}
        aria-pressed={isPlaying}
      >
        {isPlaying
          ? String.fromCodePoint(0x23F8)
          : String.fromCodePoint(0x25B6)}
      </button>

      {/* Step Forward */}
      <button
        type="button"
        onClick={onStepForward}
        title="Next frame (newer)"
        aria-label="Next frame"
      >
        {String.fromCodePoint(0x25B6)}
      </button>

      {
        /* Timeline — the bar/progress/handle visuals are unchanged. A
          transparent native range input is overlaid on top of them, which
          buys drag-to-scrub, arrow-key stepping and role=slider semantics
          with zero visual change on the broadcast/OBS render. */
      }
      <div class="timeline-container">
        <div class="timeline-bar">
          <div
            class="timeline-progress"
            style={{ width: `${progressPercent}%` }}
          />
          <div
            class="timeline-handle"
            style={{ left: `${progressPercent}%` }}
          />
          <input
            type="range"
            class="timeline-range"
            min={0}
            max={sliderMax}
            step={1}
            value={Math.max(0, sliderMax - frameIndex)}
            aria-label="Radar loop time"
            aria-valuetext={frameIndex === 0
              ? "Now"
              : `${frameIndex * 5} minutes ago`}
            onInput={(e) => {
              const v = Number((e.currentTarget as HTMLInputElement).value);
              onFrameChange(
                Math.max(0, Math.min(sliderMax, sliderMax - v)),
              );
            }}
          />
        </div>
        <div class="timeline-labels">
          <span>-50m</span>
          <span>NOW</span>
        </div>
      </div>

      {/* Speed Control */}
      <div class="speed-control">
        {[0.5, 1, 2].map((s) => (
          <button
            type="button"
            key={s}
            class={speed === s ? "active" : ""}
            onClick={() => onSpeedChange(s)}
            aria-label={`${s}x playback speed`}
            aria-pressed={speed === s}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
