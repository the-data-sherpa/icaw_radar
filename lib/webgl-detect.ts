/**
 * Detects whether the current browser supports WebGL2 (required by MapLibre GL JS v4+).
 * Returns true if a WebGL2 context can be created, false otherwise.
 */
export function isWebGLSupported(): boolean {
  if (typeof document === "undefined") return false;

  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    return gl !== null;
  } catch {
    return false;
  }
}
