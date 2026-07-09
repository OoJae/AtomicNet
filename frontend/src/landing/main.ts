// AtomicNet landing — one choreographed scroll scene. Scroll performs the product:
// twenty tangled obligations collapse into three wires, then settle atomically.
import "@fontsource/instrument-serif";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./landing.css";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { Constellation } from "./scene";

gsap.registerPlugin(ScrollTrigger);

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = window.matchMedia("(max-width: 720px)").matches;

// ---------------------------------------------------------------- network flavor
// The same landing ships on both origins; /api/config says which ledger sits behind /app.
fetch("/api/config")
  .then((r) => r.json())
  .then((cfg: { network?: string }) => {
    if (cfg.network !== "devnet") return;
    const copy = document.querySelector("[data-network-copy]");
    if (copy) {
      copy.textContent =
        "The console on this origin is connected to the REAL Canton Network — every approval and settlement you click commits on DevNet.";
    }
    const sibling = document.getElementById("sibling-link");
    if (sibling) {
      sibling.setAttribute("href", "https://atomicnet-production.up.railway.app");
      sibling.innerHTML = 'Prefer the instant sandbox<span aria-hidden="true"> ↗</span>';
    }
  })
  .catch(() => {});

// ---------------------------------------------------------------- scene
const canvas = document.getElementById("web") as HTMLCanvasElement | null;
const labelHost = document.querySelector(".node-labels") as HTMLElement | null;
let scene: Constellation | null = null;

try {
  if (canvas && labelHost) {
    scene = new Constellation(canvas, labelHost, {
      maxDPR: mobile ? 1.5 : 2,
      drift: reduced ? 0 : 1,
    });
  }
} catch {
  // No WebGL: the typography carries the page; the wash + grain keep it composed.
  canvas?.remove();
  document.body.classList.add("no-webgl");
}

window.addEventListener("resize", () => scene?.resize());

// ---------------------------------------------------------------- reduced motion
if (reduced) {
  document.body.classList.add("reduced");
  // Static netted state — the after-image — and everything readable in normal flow.
  scene?.setProgress(0.76);
  scene?.tick(0.016);
} else {
  // ---------------------------------------------------------------- smooth scroll
  const lenis = new Lenis({ lerp: 0.1 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // render loop
  let last = performance.now();
  gsap.ticker.add(() => {
    const now = performance.now();
    scene?.tick(Math.min((now - last) / 1000, 0.05));
    last = now;
  });

  // ---------------------------------------------------------------- the master scroll scene
  ScrollTrigger.create({
    trigger: "#stage",
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => scene?.setProgress(self.progress),
  });

  // DOM chapters ride the same scroll: a scrubbed timeline mapped 0..1 over the stage.
  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: { trigger: "#stage", start: "top top", end: "bottom bottom", scrub: true },
  });
  const show = (sel: string, at: number, out: number) => {
    tl.fromTo(sel, { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.04 }, at)
      .to(sel, { autoAlpha: 0, y: -22, duration: 0.03 }, out);
  };
  // hero exits as the journey starts
  tl.to("#ch-hero", { autoAlpha: 0, y: -40, duration: 0.05 }, 0.055);
  show("#ch-web", 0.1, 0.24);
  show("#ch-privacy", 0.3, 0.44);
  show("#ch-collapse", 0.52, 0.72);
  show("#ch-atomic", 0.78, 0.88);
  // the 20 → 3 numeral: gross count in, crossfade at the collapse's peak
  tl.fromTo(".numeral", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.03 }, 0.54)
    .fromTo(".numeral-gross", { opacity: 1, filter: "blur(0px)" }, { opacity: 0.14, filter: "blur(5px)", duration: 0.08 }, 0.6)
    .fromTo(".numeral-net", { opacity: 0, scale: 0.82, filter: "blur(6px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.08 }, 0.62)
    .to(".numeral", { autoAlpha: 0, duration: 0.03 }, 0.73);
  // constellation resolves into the mark
  tl.fromTo(".resolve", { autoAlpha: 0, scale: 0.9 }, { autoAlpha: 1, scale: 1, duration: 0.08 }, 0.92);

  // ---------------------------------------------------------------- hero load sequence
  const load = gsap.timeline({ defaults: { ease: "expo.out" } });
  load
    .fromTo("#web", { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.1 }, 0)
    .fromTo(".hero .line-inner", { yPercent: 110 }, { yPercent: 0, duration: 0.9, stagger: 0.09 }, 0.15)
    .fromTo(".hero .eyebrow", { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.6 }, 0.55)
    .fromTo(".hero-sub, .hero-figures", { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.08 }, 0.7)
    .fromTo(".scroll-cue", { autoAlpha: 0 }, { autoAlpha: 0.8, duration: 0.6 }, 1.0)
    .fromTo(".site-head", { autoAlpha: 0, y: -10 }, { autoAlpha: 1, y: 0, duration: 0.7 }, 0.4);

  // outro + footer reveal once, near viewport
  for (const sel of [".outro-title", ".outro-sub", ".outro-ctas", ".proof-strip"]) {
    gsap.from(sel, {
      autoAlpha: 0, y: 30, duration: 0.9, ease: "expo.out",
      scrollTrigger: { trigger: sel, start: "top 85%", once: true },
    });
  }
}
