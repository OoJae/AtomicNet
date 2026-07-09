// Shared header/footer for /how and /proof.
export function header(current: "how" | "proof"): string {
  return `
  <header class="site-head">
    <a class="head-brand" href="/" aria-label="AtomicNet home">
      <img src="/brand/logomark.svg" alt="" width="28" height="28" />
      <span class="head-word">Atomic<b>Net</b></span>
    </a>
    <nav class="head-nav" aria-label="Site">
      <a href="/how" ${current === "how" ? 'aria-current="page"' : ""}>How it works</a>
      <a href="/proof" ${current === "proof" ? 'aria-current="page"' : ""}>Proof</a>
      <a class="head-cta" href="/app">Open the console<span aria-hidden="true"> →</span></a>
    </nav>
  </header>`;
}

export function footer(): string {
  return `
  <footer class="site-foot">
    <img src="/brand/wordmark.svg" alt="AtomicNet" height="24" />
    <p>Built for the Build on Canton hackathon — Encode Club × Canton Foundation, 2026.</p>
    <nav aria-label="Footer">
      <a href="https://github.com/OoJae/AtomicNet" target="_blank" rel="noopener">GitHub</a>
      <a href="/">Home</a>
      <a href="/app">Console</a>
    </nav>
  </footer>`;
}

/** Gentle reveal-on-scroll for elements carrying .rv (CSS handles reduced motion). */
export function reveals(): void {
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      }
    },
    { rootMargin: "0px 0px -12% 0px" },
  );
  document.querySelectorAll(".rv").forEach((el) => io.observe(el));
}
