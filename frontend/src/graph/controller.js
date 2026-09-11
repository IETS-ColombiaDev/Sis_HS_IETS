export const TYPE_COLOR = {
  cycle: "#4F46E5",
  cluster: "#0F766E",
  funnel: "#7C3AED",
  technology: "#1D4ED8",
  ttm: "#0369A1",
  evidence: "#B45309",
  budget: "#BE123C",
  comparators: "#4338CA",
};

export const TYPE_LABEL = {
  cycle: "Ciclo",
  cluster: "Clúster",
  funnel: "Embudo",
  technology: "Tecnología",
  ttm: "Time-to-market",
  evidence: "Evidencia",
  budget: "Presupuesto",
  comparators: "Comparadores",
};

const COLS = { cycle: 0, cluster: 1, funnel: 1, technology: 2, ttm: 3, evidence: 3, budget: 3, comparators: 3 };

export function ancestorsOf(id, byId) {
  const chain = [];
  const seen = new Set();
  let cur = byId[id];
  let guard = 0;
  while (cur?.parent && !seen.has(cur.id) && guard < 32) {
    seen.add(cur.id);
    chain.push(cur.parent);
    cur = byId[cur.parent];
    guard += 1;
  }
  return chain;
}

export function isVisible(node, expanded, byId) {
  if (!node?.parent) return true;
  return ancestorsOf(node.id, byId).every((id) => expanded.has(id));
}

export function finite(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

export function sanitizePositions(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  Object.entries(raw).forEach(([id, p]) => {
    const x = finite(p?.x, NaN);
    const y = finite(p?.y, NaN);
    if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < 20000 && Math.abs(y) < 20000) {
      out[id] = { x, y };
    }
  });
  return out;
}

export function sanitizeView(raw) {
  if (!raw || typeof raw !== "object") return { x: 0, y: 0, k: 1 };
  return {
    x: Math.max(-4000, Math.min(4000, finite(raw.x))),
    y: Math.max(-4000, Math.min(4000, finite(raw.y))),
    k: Math.max(0.35, Math.min(2.8, finite(raw.k, 1))),
  };
}

export function layout(nodes, expanded, byId, positions) {
  const safe = Array.isArray(nodes) ? nodes : [];
  const visible = safe.filter((n) => isVisible(n, expanded, byId));
  const buckets = [[], [], [], []];
  visible.forEach((n) => {
    buckets[COLS[n.type] ?? 2].push(n);
  });
  const placed = {};
  buckets.forEach((list, col) => {
    const gap = Math.max(64, Math.min(92, 640 / Math.max(list.length, 1)));
    list.forEach((n, i) => {
      const saved = positions[n.id];
      placed[n.id] = saved || { x: 90 + col * 230, y: 48 + i * gap };
    });
  });
  let width = 920;
  let height = 420;
  Object.values(placed).forEach((p) => {
    width = Math.max(width, finite(p.x) + 260);
    height = Math.max(height, finite(p.y) + 70);
  });
  return { visible, placed, width, height };
}

export function messageText(m) {
  if (m == null) return "";
  if (typeof m === "string") return m;
  if (typeof m.content === "string") return m.content;
  if (m.content == null) return "";
  try {
    return String(m.content);
  } catch {
    return "";
  }
}

export function closestEl(target, selector) {
  let el = target;
  if (el && typeof el.closest !== "function") el = el.parentElement;
  if (!el || typeof el.closest !== "function") return null;
  return el.closest(selector);
}

export function svgPoint(event, svg, width, height) {
  if (!svg) return { x: 0, y: 0 };
  const rect = svg.getBoundingClientRect();
  const w = rect.width || 1;
  const h = rect.height || 1;
  return {
    x: ((event.clientX - rect.left) / w) * width,
    y: ((event.clientY - rect.top) / h) * height,
  };
}

export function zoomAt(view, factor, mx, my) {
  const next = sanitizeView(view);
  const k = Math.max(0.35, Math.min(2.8, next.k * factor));
  const wx = (mx - next.x) / next.k;
  const wy = (my - next.y) / next.k;
  return sanitizeView({ x: mx - wx * k, y: my - wy * k, k });
}

export function isCameraLost(placed, view, width, height) {
  const pts = Object.values(placed || {});
  if (!pts.length) return false;
  const v = sanitizeView(view);
  return !pts.some((p) => {
    const x = finite(p.x) * v.k + v.x;
    const y = finite(p.y) * v.k + v.y;
    return x > -80 && x < width + 80 && y > -80 && y < height + 80;
  });
}

export function centerOn(placed, id, width, height, k = 1.15) {
  const p = placed[id];
  if (!p) return { x: 0, y: 0, k: 1 };
  const zk = Math.max(0.7, Math.min(1.6, k));
  return sanitizeView({
    x: width / 2 - finite(p.x) * zk,
    y: height / 2 - finite(p.y) * zk,
    k: zk,
  });
}

export function expandPath(nodeId, byId, current) {
  const next = new Set(current);
  next.add(nodeId);
  ancestorsOf(nodeId, byId).forEach((id) => next.add(id));
  return next;
}

export function filterNodes(nodes, query, type) {
  const q = (query || "").trim().toLowerCase();
  return (nodes || []).filter((n) => {
    if (type && n.type !== type) return false;
    if (!q) return true;
    const hay = `${n.label || ""} ${n.subtitle || ""} ${TYPE_LABEL[n.type] || ""}`.toLowerCase();
    return hay.includes(q);
  });
}
