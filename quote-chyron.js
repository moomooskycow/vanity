(() => {
  const pool = Array.isArray(window.QUOTES) ? window.QUOTES : [];
  if (pool.length < 2) return;

  const region = document.getElementById("quote-chyron");
  const text = document.getElementById("quote-text");
  const attribution = document.getElementById("quote-attribution");
  const controls = document.getElementById("quote-controls");
  const pause = document.getElementById("quote-pause");
  const next = document.getElementById("quote-next");
  const announcement = document.getElementById("quote-announcement");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let index = pool.findIndex(
    ([quote, author]) =>
      quote === text.textContent && author === attribution.textContent,
  );
  let paused = false;
  let hovered = region.matches(":hover");
  let focused = region.contains(document.activeElement);
  let timer = null;

  function advance() {
    const choices = pool.length - (index === -1 ? 0 : 1);
    let selected = Math.floor(Math.random() * choices);
    if (index !== -1 && selected >= index) selected += 1;
    index = selected;
    text.textContent = pool[index][0];
    attribution.textContent = pool[index][1];
  }

  function canPlay() {
    return (
      !paused && !motion.matches && !document.hidden && !hovered && !focused
    );
  }

  // Every transition owns a fresh reading interval; only one timeout may exist.
  function schedule() {
    window.clearTimeout(timer);
    timer = null;
    if (!canPlay()) return;
    timer = window.setTimeout(() => {
      timer = null;
      if (canPlay()) advance();
      schedule();
    }, 20_000);
  }

  function updateControls() {
    if (motion.matches && document.activeElement === pause) next.focus();
    pause.hidden = motion.matches;
    pause.textContent = paused ? "Resume" : "Pause";
    pause.setAttribute(
      "aria-label",
      paused ? "Resume automatic quotes" : "Pause automatic quotes",
    );
    schedule();
  }

  pause.addEventListener("click", () => {
    paused = !paused;
    updateControls();
  });
  next.addEventListener("click", () => {
    advance();
    // Only an explicit request is announced. Autoplay never changes this region.
    announcement.textContent = `${text.textContent} ${attribution.textContent}`;
    schedule();
  });
  region.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "touch") return;
    hovered = true;
    schedule();
  });
  region.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "touch") return;
    hovered = false;
    schedule();
  });
  region.addEventListener("focusin", () => {
    focused = true;
    schedule();
  });
  region.addEventListener("focusout", (event) => {
    focused = region.contains(event.relatedTarget);
    schedule();
  });
  document.addEventListener("visibilitychange", schedule);
  motion.addEventListener("change", updateControls);

  updateControls();
  controls.hidden = false;
})();
