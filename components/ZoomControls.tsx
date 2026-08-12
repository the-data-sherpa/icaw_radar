interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRecenter: () => void;
}

export function ZoomControls(
  { onZoomIn, onZoomOut, onRecenter }: ZoomControlsProps,
) {
  return (
    <div class="zoom-controls">
      <button
        type="button"
        onClick={onZoomIn}
        title="Zoom in"
        aria-label="Zoom in"
      >
        +
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        title="Zoom out"
        aria-label="Zoom out"
      >
        -
      </button>
      <button
        type="button"
        onClick={onRecenter}
        title="Recenter map"
        aria-label="Recenter on Iredell County"
      >
        <span aria-hidden="true">{String.fromCodePoint(0x2302)}</span>
      </button>
    </div>
  );
}
