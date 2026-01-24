import type { ComponentChildren } from "preact";

interface LayoutProps {
  children: ComponentChildren;
  overlayMode?: boolean;
}

export function Layout({ children, overlayMode = false }: LayoutProps) {
  return (
    <div class={`broadcast-layout ${overlayMode ? "overlay-mode" : ""}`}>
      {children}
    </div>
  );
}
