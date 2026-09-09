(() => {
  const pool = Array.isArray(window.QUOTES) ? window.QUOTES : [];
  if (pool.length < 2) return;

  const text = document.getElementById("quote-text");
  const attribution = document.getElementById("quote-attribution");

  let index = pool.findIndex(
    ([quote, author]) =>
      quote === text.textContent.trim() &&
      author === attribution.textContent.trim(),
  );
  if (index < 0) index = 0;
  let timer = null;

  function advance() {
    index = (index + 1) % pool.length;
    text.textContent = pool[index][0];
    attribution.textContent = pool[index][1];
  }

  function schedule() {
    window.clearTimeout(timer);
    timer = null;
    if (document.hidden) return;
    timer = window.setTimeout(() => {
      timer = null;
      if (!document.hidden) advance();
      schedule();
    }, 20_000);
  }

  document.addEventListener("visibilitychange", schedule);
  schedule();
})();
