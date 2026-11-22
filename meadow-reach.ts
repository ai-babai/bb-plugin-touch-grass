// BB's scroll pane also contains the sticky composer. Measure the whole visible
// pane for the one-third target, then cap the blades at the space above the roots.
export function watchChatSpan(host: HTMLElement, resize: () => void) {
  const pane = host.closest<HTMLElement>(".thread-scrollbar");
  const dock = host.closest<HTMLElement>(".sticky");
  const viewport = window.visualViewport;
  let frame = 0;

  function scheduleResize() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      resize();
    });
  }

  function reach(ground: number) {
    const top = viewport?.offsetTop ?? 0;
    const bottom = top + (viewport?.height ?? window.innerHeight);
    const rect = pane?.getBoundingClientRect();
    const visibleTop = Math.max(top, rect?.top ?? top);
    const visibleBottom = Math.min(bottom, rect?.bottom ?? bottom);
    return Math.max(1, Math.min((visibleBottom - visibleTop) / 3, ground - visibleTop));
  }

  const observer = new ResizeObserver(scheduleResize);
  if (pane) observer.observe(pane);
  if (dock) observer.observe(dock);
  window.addEventListener("resize", scheduleResize);
  viewport?.addEventListener("resize", scheduleResize);
  viewport?.addEventListener("scroll", scheduleResize);
  return {
    reach,
    dispose() {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleResize);
      viewport?.removeEventListener("resize", scheduleResize);
      viewport?.removeEventListener("scroll", scheduleResize);
    },
  };
}
