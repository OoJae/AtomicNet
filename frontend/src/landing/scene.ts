// The AtomicNet constellation — the page's signature. Five subsidiary nodes, twenty invoice
// threads (the REAL demo dataset), and a scroll-driven collapse into the three net wires.
// Everything is a deterministic function of scroll progress p ∈ [0,1] (plus a little
// time-based drift), so scrubbing is buttery and the reduced-motion path is just p = const.
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { FLOWS, NET_ARCS, NODES, CCY_COLOR, arcFor, type NodeId } from "./data";

const WIRE = 0x4d7cff;
const PAPER = 0xf2efe7;
const POS = 0x34d399;

// Deterministic tangle: the same web on every visit — it's the brand object.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** 0→1 across the progress window [a,b], with cubic ease-in-out. */
function win(p: number, a: number, b: number): number {
  const t = clamp01((p - a) / (b - a));
  return t * t * (3 - 2 * t);
}

const NODE_POS: Record<NodeId, THREE.Vector3> = {
  US: new THREE.Vector3(0, 12.5, -2),
  UK: new THREE.Vector3(21, 4, 4),
  FR: new THREE.Vector3(13.5, -14, -5),
  DE: new THREE.Vector3(-13.5, -14, 3),
  SG: new THREE.Vector3(-21, 4, -4),
};

const SAMPLES = 48;

interface Edge {
  line: Line2;
  mat: LineMaterial;
  gross: Float32Array; // sampled tangled curve
  target: Float32Array | null; // sampled net-arc curve (null → dissolves)
  current: Float32Array;
  baseColor: THREE.Color;
  touchesUK: boolean;
  payer: NodeId;
  delay: number; // collapse stagger 0..1
  lastKey: string; // skip redundant geometry updates while scrubbing holds
}

function sampleCurve(curve: THREE.Curve<THREE.Vector3>): Float32Array {
  const out = new Float32Array(SAMPLES * 3);
  for (let i = 0; i < SAMPLES; i++) {
    const v = curve.getPoint(i / (SAMPLES - 1));
    out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
  }
  return out;
}

function glowTexture(inner = "rgba(242,239,231,1)", size = 128): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, "rgba(242,239,231,0.28)");
  g.addColorStop(1, "rgba(242,239,231,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function ringTexture(size = 128): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.strokeStyle = "rgba(242,239,231,1)";
  ctx.lineWidth = size * 0.09;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  return new THREE.CanvasTexture(c);
}

export class Constellation {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private group = new THREE.Group();
  private edges: Edge[] = [];
  private arcCurves: THREE.QuadraticBezierCurve3[] = [];
  private nodeSprites = new Map<NodeId, { glow: THREE.Sprite; core: THREE.Sprite }>();
  private sparks: THREE.Sprite[] = [];
  private labels = new Map<NodeId, HTMLDivElement>();
  private labelHost: HTMLElement;
  private progress = 0;
  private time = 0;
  private drift: number;
  private v = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, labelHost: HTMLElement, opts?: { maxDPR?: number; drift?: number }) {
    this.labelHost = labelHost;
    this.drift = opts?.drift ?? 1;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts?.maxDPR ?? 2));
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    this.camera.position.set(0, 0, 88);
    this.scene.add(this.group);
    this.build();
    this.resize();
  }

  private build() {
    const rnd = mulberry32(20260713); // deadline as seed — deterministic tangle
    const glowTex = glowTexture();
    const ringTex = ringTexture();

    // Shared net-arc curves: merged threads land on IDENTICAL points → crisp 20→3.
    for (const arc of NET_ARCS) {
      const a = NODE_POS[arc.payer], b = NODE_POS[arc.receiver];
      const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 9, 7));
      this.arcCurves.push(new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone()));
    }

    // Twenty threads.
    FLOWS.forEach((f, i) => {
      const a = NODE_POS[f.payer as NodeId], b = NODE_POS[f.issuer as NodeId];
      const j = () => (rnd() - 0.5) * 2;
      const m1 = a.clone().lerp(b, 0.34).add(new THREE.Vector3(j() * 10, j() * 10, j() * 8));
      const m2 = a.clone().lerp(b, 0.66).add(new THREE.Vector3(j() * 10, j() * 10, j() * 8));
      const gross = sampleCurve(new THREE.CatmullRomCurve3([a.clone(), m1, m2, b.clone()]));
      const arcIdx = arcFor(f, i);
      const target = arcIdx >= 0 ? sampleCurve(this.arcCurves[arcIdx]!) : null;

      const geo = new LineGeometry();
      geo.setPositions(Array.from(gross));
      const mat = new LineMaterial({
        color: CCY_COLOR[f.ccy],
        linewidth: 1.4,
        transparent: true,
        opacity: 0.62,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new Line2(geo, mat);
      line.computeLineDistances();
      this.group.add(line);
      this.edges.push({
        line, mat, gross, target,
        current: gross.slice(),
        baseColor: new THREE.Color(CCY_COLOR[f.ccy]),
        touchesUK: f.payer === "UK" || f.issuer === "UK",
        payer: f.payer as NodeId,
        delay: rnd() * 0.5,
        lastKey: "",
      });
    });

    // Nodes: soft glow + core (SG's core is a hollow ring — it nets to zero).
    for (const id of NODES) {
      const p = NODE_POS[id];
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.setScalar(7);
      glow.position.copy(p);
      const core = new THREE.Sprite(new THREE.SpriteMaterial({
        map: id === "SG" ? ringTex : glowTex,
        color: PAPER, transparent: true, opacity: 0.95, depthWrite: false,
      }));
      core.scale.setScalar(id === "SG" ? 3.2 : 2.1);
      core.position.copy(p);
      this.group.add(glow, core);
      this.nodeSprites.set(id, { glow, core });

      const label = document.createElement("div");
      label.className = "node-label mono";
      label.innerHTML = `<span class="nl-id">SUB_${id}</span><span class="nl-note"></span>`;
      this.labelHost.appendChild(label);
      this.labels.set(id, label);
    }

    // Settle pulses — one spark per net wire, all crossing in the same instant.
    for (let i = 0; i < NET_ARCS.length; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PAPER, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.scale.setScalar(3.4);
      this.group.add(s);
      this.sparks.push(s);
    }
  }

  setProgress(p: number) { this.progress = clamp01(p); }

  /** Advance ambient time and draw one frame. Call from rAF (or once, for static mode). */
  tick(dt: number) {
    this.time += dt * this.drift;
    const p = this.progress;
    const t = this.time;

    // ---- camera: hero 88 → push-in 64 → recede 124
    const zIn = 88 - 24 * win(p, 0.06, 0.24);
    const z = zIn + 40 * win(p, 0.9, 1);
    this.camera.position.set(0, 0, z);
    this.camera.lookAt(0, 1.5, 0);

    // ---- ambient drift + slow progression rotate
    this.group.rotation.y = 0.09 * Math.sin(t * 0.07) + 0.4 * p;
    this.group.rotation.x = 0.04 * Math.sin(t * 0.05);
    this.group.position.y = 0.7 * Math.sin(t * 0.1);

    // ---- chapter signals
    const heroLift = win(p, 0.05, 0.14); // threads sit quieter under the hero type
    const privacy = win(p, 0.28, 0.34) * (1 - win(p, 0.44, 0.5)); // on, hold, release
    const collapse = win(p, 0.52, 0.74);
    const pulseT = win(p, 0.78, 0.85); // sparks travel
    const flash = win(p, 0.845, 0.865) * (1 - win(p, 0.875, 0.9));
    const recede = win(p, 0.9, 1);
    const baseOp = 0.44 + 0.18 * heroLift;

    // ---- edges
    this.edges.forEach((e, i) => {
      // collapse morph, staggered per-edge
      const m = e.target ? clamp01((collapse - e.delay * 0.35) / 0.65) : 0;
      const mm = m * m * (3 - 2 * m);
      const dissolve = e.target ? 0 : collapse;

      const key = `${mm.toFixed(3)}|${dissolve.toFixed(3)}`;
      if (key !== e.lastKey) {
        e.lastKey = key;
        if (e.target && mm > 0) {
          for (let k = 0; k < e.current.length; k++) {
            e.current[k] = e.gross[k]! + (e.target[k]! - e.gross[k]!) * mm;
          }
          e.line.geometry.setPositions(Array.from(e.current));
        } else if (!e.target && dissolve > 0) {
          // dissolving threads shrink into their payer — the value cancels inside the netting
          const px = NODE_POS[e.payer].x, py = NODE_POS[e.payer].y, pz = NODE_POS[e.payer].z;
          for (let k = 0; k < e.current.length; k += 3) {
            e.current[k] = e.gross[k]! + (px - e.gross[k]!) * dissolve;
            e.current[k + 1] = e.gross[k + 1]! + (py - e.gross[k + 1]!) * dissolve;
            e.current[k + 2] = e.gross[k + 2]! + (pz - e.gross[k + 2]!) * dissolve;
          }
          e.line.geometry.setPositions(Array.from(e.current));
        } else if (mm === 0 && dissolve === 0) {
          e.line.geometry.setPositions(Array.from(e.gross));
        }
      }

      // opacity: privacy ghosting (non-UK), dissolve fade, outro dim
      let op = baseOp;
      if (privacy > 0 && !e.touchesUK) op = baseOp - 0.56 * privacy;
      if (privacy > 0 && e.touchesUK) op = baseOp + 0.3 * privacy;
      if (!e.target) op *= 1 - dissolve;
      else op = op + (0.92 - op) * mm; // merged wires burn brighter (aggregated value)
      op *= 1 - 0.75 * recede;
      e.mat.opacity = op;

      // color: currency → wire as threads merge; flash lifts toward paper
      if (e.target) {
        const c = e.baseColor.clone().lerp(new THREE.Color(WIRE), mm);
        if (flash > 0) c.lerp(new THREE.Color(PAPER), flash * 0.8);
        e.mat.color = c;
        e.mat.linewidth = 1.4 + 1.3 * mm + 1.6 * flash;
      }
    });

    // ---- nodes
    for (const id of NODES) {
      const s = this.nodeSprites.get(id)!;
      const base = id === "SG" ? 3.2 : 2.1;
      let scale = base;
      let coreOp = 0.95;
      if (id === "SG") scale = base * (1 - 0.55 * collapse); // exhales to (almost) nothing
      if (id === "UK") scale = base * (1 + 0.35 * privacy);
      // settle flip: receivers glow green for a beat
      if ((id === "UK" || id === "FR") && flash > 0) {
        s.core.material.color.set(POS);
      } else {
        s.core.material.color.set(PAPER);
      }
      s.core.scale.setScalar(scale * (1 + 0.25 * flash));
      s.glow.material.opacity = (0.5 + 0.35 * flash) * (1 - 0.7 * recede);
      s.core.material.opacity = coreOp * (1 - 0.8 * recede);
    }

    // ---- sparks: all three cross in the same instant (that's the point)
    this.sparks.forEach((s, i) => {
      const mat = s.material as THREE.SpriteMaterial;
      if (pulseT > 0 && pulseT < 1) {
        mat.opacity = 0.9;
        s.position.copy(this.arcCurves[i]!.getPoint(pulseT));
      } else {
        mat.opacity = 0;
      }
    });

    // ---- labels (projected DOM)
    const w = this.labelHost.clientWidth, h = this.labelHost.clientHeight;
    for (const id of NODES) {
      const el = this.labels.get(id)!;
      const core = this.nodeSprites.get(id)!.core;
      core.getWorldPosition(this.v).project(this.camera);
      const x = (this.v.x * 0.5 + 0.5) * w;
      const y = (-this.v.y * 0.5 + 0.5) * h;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      // labels belong to the journey, not the hero — they enter with chapter 01
      el.style.opacity = String(heroLift * (1 - 0.9 * recede) * (this.v.z < 1 ? 1 : 0));
      el.classList.toggle("is-uk", id === "UK" && privacy > 0.5);
      const note = el.querySelector(".nl-note") as HTMLElement;
      if (id === "SG") note.textContent = collapse > 0.6 ? "nets to 0 — nothing moves" : "";
      if (id === "UK") note.textContent = privacy > 0.5 ? "sees 8 of 20" : "";
    }

    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const e of this.edges) e.mat.resolution.set(w, h);
  }
}
