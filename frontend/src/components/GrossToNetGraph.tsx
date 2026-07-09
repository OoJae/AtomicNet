import { useMemo } from "react";
import type { GraphView } from "../api";
import { fmt } from "../api";

const CCY: Record<string, string> = { USD: "#2563eb", EUR: "#7c3aed", GBP: "#0d9488" };

// The centerpiece: the tangled gross payment web collapsing into a few net arrows.
export function GrossToNetGraph({ graph, mode }: { graph: GraphView; mode: "gross" | "net" }) {
  const W = 580, H = 440, cx = W / 2, cy = H / 2, R = 150;

  const { list, pos } = useMemo(() => {
    const names = new Set<string>();
    graph.grossEdges.forEach((e) => (names.add(e.from), names.add(e.to)));
    graph.positions.forEach((p) => names.add(p.subsidiary));
    const list = [...names].sort();
    const pos: Record<string, { x: number; y: number }> = {};
    list.forEach((n, i) => {
      const a = (i / Math.max(list.length, 1)) * Math.PI * 2 - Math.PI / 2;
      pos[n] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
    });
    return { list, pos };
  }, [graph]);

  const netByParty: Record<string, number> = Object.fromEntries(graph.positions.map((p) => [p.subsidiary, p.netAmount]));

  // Fan co-directional parallel invoices (e.g. two UK->US invoices in USD + GBP) into distinct
  // arcs so every one of the 20 gross strands — including same-pair multi-currency flows — is
  // visible instead of collapsing onto a single overlapping curve.
  const grossCurves = useMemo(() => {
    const seen: Record<string, number> = {};
    return graph.grossEdges.map((e) => {
      const key = `${e.to}->${e.from}`; // rendered direction: payer -> issuer
      const j = (seen[key] = (seen[key] ?? -1) + 1);
      return 0.16 + 0.13 * j; // nested arcs, all bowing the same way
    });
  }, [graph]);

  const path = (from: string, to: string, curve: number) => {
    const a = pos[from], b = pos[to];
    if (!a || !b) return "";
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // shorten ends so arrows don't overlap node circles
    const pad = 30;
    const ax = a.x + (dx / len) * pad, ay = a.y + (dy / len) * pad;
    const bx = b.x - (dx / len) * pad, by = b.y - (dy / len) * pad;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const ox = (-dy / len) * curve * len, oy = (dx / len) * curve * len;
    return `M ${ax} ${ay} Q ${mx + ox} ${my + oy} ${bx} ${by}`;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 470, display: "block" }}>
      <defs>
        <marker id="ag" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" />
        </marker>
        <marker id="an" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#1d4ed8" />
        </marker>
      </defs>

      {/* GROSS: payment flows payer -> issuer (to -> from), curved + currency-coloured */}
      <g style={{ opacity: mode === "gross" ? 1 : 0, transition: "opacity .55s ease" }}>
        {graph.grossEdges.map((e, i) => (
          <path key={i} d={path(e.to, e.from, grossCurves[i]!)} fill="none" stroke={CCY[e.currency] ?? "#94a3b8"} strokeWidth={2.2} markerEnd="url(#ag)" opacity={0.75} />
        ))}
      </g>

      {/* NET: a handful of bold net arrows payer -> receiver */}
      <g style={{ opacity: mode === "net" ? 1 : 0, transition: "opacity .55s ease .15s" }}>
        {graph.netEdges.map((e, i) => (
          <g key={i}>
            <path d={path(e.payer, e.receiver, 0.12)} fill="none" stroke="#1d4ed8" strokeWidth={3.2} markerEnd="url(#an)" />
          </g>
        ))}
      </g>

      {/* NODES */}
      {list.map((n) => {
        const p = pos[n]!;
        const net = netByParty[n];
        const settled = mode === "net" && net !== undefined;
        const color = settled ? (net > 0 ? "#047857" : net < 0 ? "#b91c1c" : "#64748b") : "#334155";
        return (
          <g key={n} transform={`translate(${p.x},${p.y})`}>
            <circle r={24} fill="#fff" stroke={color} strokeWidth={settled ? 2.5 : 1.5} style={{ transition: "stroke .4s" }} />
            <text textAnchor="middle" dy={settled ? -2 : 4} fontSize={11} fontWeight={650} fill="#0f172a">{n.replace("Sub_", "")}</text>
            {settled && (
              <text textAnchor="middle" dy={11} fontSize={9.5} fontWeight={700} fill={color} className="num">
                {net > 0 ? "+" : ""}{fmt(net)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
