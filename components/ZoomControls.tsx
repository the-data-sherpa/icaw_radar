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
      <button type="button" onClick={onZoomIn} title="Zoom in">+</button>
      <button type="button" onClick={onZoomOut} title="Zoom out">-</button>
      <button type="button" onClick={onRecenter} title="Recenter map">
        {String.fromCodePoint(0x2302)}
      </button>
    </div>
  );
}
