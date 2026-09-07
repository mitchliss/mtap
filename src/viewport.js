// Safari toolbars can move/resize the visual viewport without a window resize.
// Keep the canvas and all HUD elements in the same visible coordinate space.
export function trackViewport(win = window, root = document.documentElement) {
  const viewport = win.visualViewport;
  if (!viewport) return () => {};
  const update = () => {
    root.style.setProperty('--viewport-height', `${viewport.height}px`);
    root.style.setProperty('--viewport-top', `${viewport.offsetTop}px`);
  };
  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  update();
  return () => {
    viewport.removeEventListener('resize', update);
    viewport.removeEventListener('scroll', update);
  };
}
