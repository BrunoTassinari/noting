"use client";

import { inSpace, useSpace } from "./space-store";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BUJO_ROOT } from "@/lib/bujo";
import { fold } from "@/lib/fold";
import type { NoteMeta } from "@/lib/note-paths";
import { onNotesChanged } from "./note-cache";
import { useVault } from "./vault-context";

// Grafo das notas, como no Obsidian: cada nota é um ponto, cada [[link]] uma
// linha. "global" mostra o vault; "local" mostra a nota aberta e vizinhas.
// Desenho em <canvas> (aguenta milhares de notas); posições por d3-force.

type Node = SimulationNodeDatum & { id: string; title: string; path: string; degree: number; color: string };
type Link = SimulationLinkDatum<Node> & { source: Node | string; target: Node | string };

const PERIODIC = [`${BUJO_ROOT}/Daily`, `${BUJO_ROOT}/Weekly`, `${BUJO_ROOT}/Monthly`];
const isPeriodic = (n: NoteMeta) => PERIODIC.includes(n.path);
const HUES = ["cornflower", "fern", "apricot", "orchid", "verdigris", "rose", "honey", "lilac", "coral", "ember"];

/** Cor por pasta de primeiro nível (a raiz fica neutra). */
function folderHue(path: string, order: string[]): string | null {
  const top = path.split("/")[0];
  if (!top) return null;
  const i = order.indexOf(top);
  return HUES[(i < 0 ? 0 : i) % HUES.length];
}

let edgeCache: { at: number; edges: [string, string][] } | null = null;

async function loadEdges(force = false): Promise<[string, string][]> {
  if (!force && edgeCache && Date.now() - edgeCache.at < 10_000) return edgeCache.edges;
  const res = await fetch("/api/graph");
  if (!res.ok) throw new Error(String(res.status));
  const { edges } = (await res.json()) as { edges: [string, string][] };
  edgeCache = { at: Date.now(), edges };
  return edges;
}

function useEdges() {
  const [edges, setEdges] = useState<[string, string][] | null>(edgeCache?.edges ?? null);
  const reload = useCallback((force = false) => {
    loadEdges(force)
      .then(setEdges)
      .catch(() => setEdges((e) => e ?? []));
  }, []);
  useEffect(() => {
    reload();
    const onFocus = () => document.visibilityState === "visible" && reload(true);
    window.addEventListener("focus", onFocus);
    const off = onNotesChanged(() => reload(true));
    return () => {
      window.removeEventListener("focus", onFocus);
      off();
    };
  }, [reload]);
  return { edges, reload };
}

export type GraphOptions = { periodic: boolean; orphans: boolean; depth: 1 | 2; query: string };

export function GraphView({
  mode,
  centerId,
  options,
  onStats,
}: {
  mode: "global" | "local";
  centerId?: string | null;
  options: GraphOptions;
  onStats?: (s: { nodes: number; links: number }) => void;
}) {
  const { notes, goToNote } = useVault();
  const { edges, reload } = useEdges();
  const space = useSpace();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Simulation<Node, Link> | null>(null);
  const view = useRef({ x: 0, y: 0, k: 1 });
  const hover = useRef<Node | null>(null);
  const drawRef = useRef<() => void>(() => {});

  // Recarrega as ligações quando a nota aberta (local) muda: links novos.
  useEffect(() => {
    if (mode === "local") reload(true);
  }, [mode, centerId, reload]);

  const graph = useMemo(() => {
    if (!edges) return null;
    const byId = new Map(notes.map((n) => [n.id, n]));
    let pairs = edges.filter(([a, b]) => a !== b && byId.has(a) && byId.has(b));
    let keep: Set<string>;

    if (mode === "local") {
      if (!centerId || !byId.has(centerId)) return { nodes: [] as Node[], links: [] as Link[] };
      keep = new Set([centerId]);
      let frontier = [centerId];
      for (let d = 0; d < options.depth; d++) {
        const next: string[] = [];
        for (const [a, b] of pairs) {
          if (frontier.includes(a) && !keep.has(b)) next.push(b);
          if (frontier.includes(b) && !keep.has(a)) next.push(a);
        }
        next.forEach((id) => keep.add(id));
        frontier = next;
      }
      if (!options.periodic) for (const id of [...keep]) if (id !== centerId && isPeriodic(byId.get(id)!)) keep.delete(id);
    } else {
      keep = new Set(
        notes.filter((n) => (options.periodic || !isPeriodic(n)) && inSpace(space, n.path)).map((n) => n.id),
      );
    }
    pairs = pairs.filter(([a, b]) => keep.has(a) && keep.has(b));

    const degree = new Map<string, number>();
    for (const [a, b] of pairs) {
      degree.set(a, (degree.get(a) ?? 0) + 1);
      degree.set(b, (degree.get(b) ?? 0) + 1);
    }
    if (mode === "global" && !options.orphans) for (const id of [...keep]) if (!degree.get(id)) keep.delete(id);

    const tops = [...new Set(notes.map((n) => n.path.split("/")[0]).filter(Boolean))].sort();
    const nodes: Node[] = [...keep].map((id) => {
      const n = byId.get(id)!;
      return { id, title: n.title, path: n.path, degree: degree.get(id) ?? 0, color: folderHue(n.path, tops) ?? "" };
    });
    return { nodes, links: pairs.map(([a, b]) => ({ source: a, target: b })) as Link[] };
  }, [edges, notes, mode, centerId, options.periodic, options.orphans, options.depth, space]);

  useEffect(() => {
    if (graph) onStats?.({ nodes: graph.nodes.length, links: graph.links.length });
  }, [graph, onStats]);

  const q = fold(options.query.trim());

  // Desenho.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawRef.current = () => {
      const ctx = canvas.getContext("2d");
      const sim = simRef.current;
      if (!ctx || !sim) return;
      const css = getComputedStyle(document.documentElement);
      const color = (name: string) => css.getPropertyValue(`--color-${name}`).trim();
      const dpr = window.devicePixelRatio || 1;
      const { x, y, k } = view.current;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.translate(w / 2 + x, h / 2 + y);
      ctx.scale(k, k);

      const hv = hover.current;
      const links = (sim.force("link") as ReturnType<typeof forceLink<Node, Link>> | undefined)?.links() ?? [];
      const near = new Set<string>();
      if (hv) {
        near.add(hv.id);
        for (const l of links) {
          const s = l.source as Node;
          const t = l.target as Node;
          if (s.id === hv.id) near.add(t.id);
          if (t.id === hv.id) near.add(s.id);
        }
      }
      const matches = (n: Node) => !q || fold(n.title).includes(q);
      const dim = (n: Node) => (hv && !near.has(n.id)) || (q && !matches(n));

      const muted = color("border-strong");
      const accent = color("accent");
      ctx.lineWidth = 1 / Math.max(k, 0.6);
      for (const l of links) {
        const s = l.source as Node;
        const t = l.target as Node;
        const hot = hv && (s.id === hv.id || t.id === hv.id);
        ctx.strokeStyle = hot ? accent : muted;
        ctx.globalAlpha = hot ? 0.9 : hv || q ? 0.15 : 0.55;
        ctx.beginPath();
        ctx.moveTo(s.x!, s.y!);
        ctx.lineTo(t.x!, t.y!);
        ctx.stroke();
      }

      const neutral = color("text-soft");
      const nodes = sim.nodes();
      for (const n of nodes) {
        const r = radius(n);
        ctx.globalAlpha = dim(n) ? 0.18 : 1;
        ctx.fillStyle = n.id === centerId ? accent : n.color ? color(`hue-${n.color}`) : neutral;
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2);
        ctx.fill();
        if (n === hv) {
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2 / k;
          ctx.stroke();
        }
      }

      // Nomes: com zoom, em grafos pequenos, na nota em foco e vizinhas.
      const always = nodes.length <= 40;
      const fontPx = 12 / Math.max(k, 0.8);
      ctx.font = `${fontPx}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const text = color("text");
      for (const n of nodes) {
        const show = always || k > 1.3 || near.has(n.id) || n.id === centerId || (q && matches(n));
        if (!show) continue;
        ctx.globalAlpha = dim(n) ? 0.25 : k > 1.3 || near.has(n.id) || always || q ? 0.95 : 0.7;
        ctx.fillStyle = text;
        const label = n.title.length > 40 ? `${n.title.slice(0, 38)}…` : n.title;
        ctx.fillText(label, n.x!, n.y! + radius(n) + 3 / k);
      }
      ctx.globalAlpha = 1;
    };
  }, [centerId, q]);

  useEffect(() => {
    drawRef.current();
  }, [q, centerId]);

  // Simulação.
  useEffect(() => {
    if (!graph) return;
    // Notas que continuam no grafo ficam onde estavam (sem "explodir").
    const old = new Map((simRef.current?.nodes() ?? []).map((n) => [n.id, n]));
    simRef.current?.stop();
    for (const n of graph.nodes) {
      const prev = old.get(n.id);
      if (prev) Object.assign(n, { x: prev.x, y: prev.y, vx: prev.vx, vy: prev.vy });
    }
    const local = mode === "local";
    const sim = forceSimulation<Node, Link>(graph.nodes)
      .force(
        "link",
        forceLink<Node, Link>(graph.links)
          .id((n) => n.id)
          .distance(local ? 70 : 45)
          .strength(0.6),
      )
      .force("charge", forceManyBody<Node>().strength(local ? -260 : -90).distanceMax(500))
      .force("collide", forceCollide<Node>((n) => radius(n) + 2))
      .force("x", forceX<Node>(0).strength(local ? 0.04 : 0.06))
      .force("y", forceY<Node>(0).strength(local ? 0.04 : 0.06))
      .alphaDecay(0.03)
      .on("tick", () => drawRef.current());
    if (local && centerId) {
      const c = graph.nodes.find((n) => n.id === centerId);
      if (c) {
        c.fx = 0;
        c.fy = 0;
      }
    }
    simRef.current = sim;
    return () => {
      sim.stop();
    };
  }, [graph, mode, centerId]);

  // Tamanho do canvas = tamanho da área.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(wrap.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(wrap.clientHeight * dpr));
      canvas.style.width = `${wrap.clientWidth}px`;
      canvas.style.height = `${wrap.clientHeight}px`;
      drawRef.current();
    });
    ro.observe(wrap);
    // Tema mudou: redesenha com as cores novas.
    const mo = new MutationObserver(() => drawRef.current());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  // Mouse/toque: arrastar o fundo move; arrastar um ponto o leva junto;
  // roda ou pinça dá zoom; clique abre a nota.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let drag: { node: Node | null; moved: boolean; startX: number; startY: number } | null = null;
    let pinch: { dist: number; k: number } | null = null;

    const toGraph = (cx: number, cy: number) => {
      const rect = canvas.getBoundingClientRect();
      const { x, y, k } = view.current;
      return { gx: (cx - rect.left - rect.width / 2 - x) / k, gy: (cy - rect.top - rect.height / 2 - y) / k };
    };
    const hit = (cx: number, cy: number): Node | null => {
      const sim = simRef.current;
      if (!sim) return null;
      const { gx, gy } = toGraph(cx, cy);
      let best: Node | null = null;
      let bestD = Infinity;
      for (const n of sim.nodes()) {
        const d = Math.hypot(n.x! - gx, n.y! - gy);
        const r = radius(n) + 6 / view.current.k;
        if (d < r && d < bestD) {
          best = n;
          bestD = d;
        }
      }
      return best;
    };
    const zoomAt = (cx: number, cy: number, factor: number) => {
      const rect = canvas.getBoundingClientRect();
      const v = view.current;
      const k = Math.min(6, Math.max(0.1, v.k * factor));
      const px = cx - rect.left - rect.width / 2;
      const py = cy - rect.top - rect.height / 2;
      v.x = px - ((px - v.x) * k) / v.k;
      v.y = py - ((py - v.y) * k) / v.k;
      v.k = k;
      drawRef.current();
    };

    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: view.current.k };
        drag = null;
        return;
      }
      const node = hit(e.clientX, e.clientY);
      drag = { node, moved: false, startX: e.clientX, startY: e.clientY };
      if (node) {
        node.fx = node.x;
        node.fy = node.y;
        simRef.current?.alphaTarget(0.2).restart();
      }
    };
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (prev) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (pinch.k * (d / pinch.dist)) / view.current.k);
        return;
      }
      if (drag && prev) {
        if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 4) drag.moved = true;
        if (drag.node) {
          const { gx, gy } = toGraph(e.clientX, e.clientY);
          drag.node.fx = gx;
          drag.node.fy = gy;
        } else {
          view.current.x += e.clientX - prev.x;
          view.current.y += e.clientY - prev.y;
          drawRef.current();
        }
        return;
      }
      if (e.pointerType === "mouse") {
        const n = hit(e.clientX, e.clientY);
        if (n !== hover.current) {
          hover.current = n;
          canvas.style.cursor = n ? "pointer" : "grab";
          drawRef.current();
        }
      }
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!drag) return;
      const { node, moved } = drag;
      drag = null;
      if (node) {
        if (!(mode === "local" && node.id === centerId)) {
          node.fx = null;
          node.fy = null;
        }
        simRef.current?.alphaTarget(0);
        if (!moved) goToNote(node.id, e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1);
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.001)));
    };
    const leave = () => {
      if (hover.current) {
        hover.current = null;
        drawRef.current();
      }
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("wheel", wheel);
    };
  }, [goToNote, mode, centerId]);

  const empty = graph && graph.nodes.length === 0;

  return (
    <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 touch-none" style={{ cursor: "grab" }} aria-label="Grafo das notas" role="img" />
      {!edges && <p className="absolute left-3 top-3 text-xs text-muted">Carregando…</p>}
      {empty && (
        <p className="absolute inset-x-4 top-4 text-center text-xs leading-normal text-muted">
          {mode === "local" ? "Nenhuma nota aberta." : "Nenhuma nota para mostrar."}
        </p>
      )}
    </div>
  );
}

const radius = (n: Node) => 3.5 + Math.sqrt(n.degree) * 1.8;
