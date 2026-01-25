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
  const isLive = frameIndex === 0;
  const progressPercent = ((totalFrames - 1 - frameIndex) / (totalFrames - 1)) *
    100;

  const handleTimelineClick = (e: MouseEvent) => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const clickPercent = (e.clientX - rect.left) / rect.width;
    // Convert percentage to frame index (0% = oldest frame, 100% = frame 0)
    const newFrame = Math.round((totalFrames - 1) * (1 - clickPercent));
    onFrameChange(Math.max(0, Math.min(totalFrames - 1, newFrame)));
  };

  return (
    <div class="animation-controls">
      {/* Step Back */}
      <button type="button" onClick={onStepBack} title="Previous frame (older)">
        {String.fromCodePoint(0x25C0)}
      </button>

      {/* Play/Pause */}
      <button
        type="button"
        onClick={onPlayPause}
        class={isPlaying ? "active" : ""}
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying
          ? String.fromCodePoint(0x23F8)
          : String.fromCodePoint(0x25B6)}
      </button>

      {/* Step Forward */}
      <button type="button" onClick={onStepForward} title="Next frame (newer)">
        {String.fromCodePoint(0x25B6)}
      </button>

      {/* Timeline */}
      <div class="timeline-container">
        <div class="timeline-bar" onClick={handleTimelineClick}>
          <div
            class="timeline-progress"
            style={{ width: `${progressPercent}%` }}
          />
          <div
            class="timeline-handle"
            style={{ left: `${progressPercent}%` }}
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
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
