import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api, { apiError } from "../api/client";
import {
  TYPE_COLOR,
  TYPE_LABEL,
  ancestorsOf,
  centerOn,
  closestEl,
  expandPath,
  filterNodes,
  isCameraLost,
  layout,
  messageText,
  sanitizePositions,
  sanitizeView,
  svgPoint,
  zoomAt,
} from "../graph/controller";
import { useToast } from "./Toast";
import Button from "./Button";
import Badge from "./Badge";
import Markdown from "./Markdown";
import { Spinner } from "./Spinner";
import EmptyState from "./EmptyState";
import InfoTip from "./InfoTip";
import { Input } from "./Field";
import ErrorBoundary from "./ErrorBoundary";

const HELP =
  "Mapa del ciclo. Use el controlador de la izquierda para buscar y saltar a un nodo sin perderse. Clic en el dibujo abre el chat de ese nodo. La rueda hace zoom hacia el cursor. Esc cierra la vista amplia.";

function GraphTool({ cycleId, filters, restricted }) {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const svgRef = useRef(null);
  const chatRef = useRef(null);
  const searchRef = useRef(null);
  const drag = useRef(null);
  const viewRef = useRef({ x: 0, y: 0, k: 1 });

  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(new Set());
  const [positions, setPositions] = useState({});
  const [selected, setSelected] = useState(null);
  const [wide, setWide] = useState(false);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [saved, setSaved] = useState([]);
  const [saveTitle, setSaveTitle] = useState("");
  const [activeSave, setActiveSave] = useState(null);
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  viewRef.current = view;

  const params = useMemo(() => {
    const next = { cycle_id: cycleId };
    Object.entries(filters || {}).forEach(([k, v]) => {
      if (v !== "" && v != null) next[k] = v;
    });
    return next;
  }, [cycleId, filters]);

  const loadGraph = useCallback(async () => {
    if (!cycleId) return;
    setLoading(true);
    try {
      const { data } = await api.get("/strategy/graph", { params });
      const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
      setGraph({ ...data, nodes, edges: Array.isArray(data?.edges) ? data.edges : [] });
      setExpanded(new Set(data.default_expanded || []));
      setPositions({});
      setSelected(nodes.find((n) => n.type === "cycle") || nodes[0] || null);
      setView({ x: 0, y: 0, k: 1 });
      setActiveSave(null);
    } catch (e) {
      toastRef.current.error(apiError(e, "No se pudo armar el grafo del ciclo"));
      setGraph(null);
    } finally {
      setLoading(false);
    }
  }, [cycleId, params]);

  const loadSaved = useCallback(async () => {
    if (!cycleId) return;
    try {
      const { data } = await api.get("/strategy/graphs", { params: { cycle_id: cycleId } });
      setSaved(Array.isArray(data) ? data : []);
    } catch {
      setSaved([]);
    }
  }, [cycleId]);

  useEffect(() => {
    loadGraph();
    loadSaved();
  }, [loadGraph, loadSaved]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, sending]);

  const byId = useMemo(() => {
    const map = {};
    (graph?.nodes || []).forEach((n) => {
      if (n?.id) map[n.id] = n;
    });
    return map;
  }, [graph]);

  const { visible, placed, width, height } = useMemo(() => {
    if (!graph) return { visible: [], placed: {}, width: 920, height: 420 };
    return layout(graph.nodes, expanded, byId, positions);
  }, [graph, expanded, byId, positions]);

  const visibleEdges = useMemo(() => {
    const ids = new Set(visible.map((n) => n.id));
    return (graph?.edges || []).filter((e) => e && ids.has(e.source) && ids.has(e.target));
  }, [graph, visible]);

  const catalog = useMemo(() => filterNodes(graph?.nodes || [], query, typeFilter), [graph, query, typeFilter]);
  const lost = isCameraLost(placed, view, width, height);
  const typesPresent = useMemo(() => {
    const set = new Set((graph?.nodes || []).map((n) => n.type));
    return Object.keys(TYPE_LABEL).filter((t) => set.has(t));
  }, [graph]);

  const applyView = (next) => setView(sanitizeView(next));

  const openNode = async (node, { focus = false } = {}) => {
    if (!node) return;
    setSelected(node);
    if (focus) {
      setExpanded((prev) => expandPath(node.id, byId, prev));
      applyView(centerOn(placed, node.id, width, height, Math.max(view.k, 1.05)));
    }
    setSessionId(null);
    setMessages([]);
    try {
      const { data } = await api.get("/chat/sessions", {
        params: { scope: "graph_node", node_key: node.id, cycle_id: cycleId },
      });
      if (data?.[0]?.id) {
        const detail = await api.get(`/chat/sessions/${data[0].id}`);
        setSessionId(data[0].id);
        setMessages(Array.isArray(detail.data?.messages) ? detail.data.messages : []);
      }
    } catch {
      /* primera consulta del nodo */
    }
  };

  const jumpTo = (node) => {
    if (!node) return;
    setExpanded((prev) => expandPath(node.id, byId, prev));
    setSelected(node);
    requestAnimationFrame(() => {
      const nextLayout = layout(graph.nodes, expandPath(node.id, byId, expanded), byId, positions);
      applyView(centerOn(nextLayout.placed, node.id, nextLayout.width, nextLayout.height, 1.2));
    });
    openNode(node);
  };

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setExpanded(new Set((graph?.nodes || []).filter((n) => n.children?.length).map((n) => n.id)));
    applyView({ x: 0, y: 0, k: 1 });
  };

  const compact = () => {
    setExpanded(new Set(graph?.default_expanded || []));
    applyView({ x: 0, y: 0, k: 1 });
  };

  const send = async (text) => {
    const message = String(text ?? draft).trim();
    if (!message || sending || !selected) return;
    setDraft("");
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content: message }]);
    setSending(true);
    try {
      const { data } = await api.post("/chat/send", {
        session_id: sessionId,
        message,
        scope: "graph_node",
        node_key: selected.id,
        cycle_id: cycleId,
        graph_id: activeSave,
      });
      const answer = data?.answer;
      setSessionId(data?.session?.id || sessionId);
      setMessages((m) => [
        ...m.filter((x) => !String(x.id || "").startsWith("tmp-")),
        { role: "user", content: message },
        answer && typeof answer === "object" ? answer : { role: "assistant", content: messageText(answer) },
      ]);
    } catch (e) {
      toastRef.current.error(apiError(e, "No se pudo consultar el nodo"));
      setMessages((m) => m.filter((x) => !String(x.id || "").startsWith("tmp-")));
    } finally {
      setSending(false);
    }
  };

  const persist = async () => {
    if (!cycleId) return;
    const title = saveTitle.trim() || `Grafo ${graph?.cycle_code || cycleId}`;
    const body = {
      cycle_id: cycleId,
      title,
      payload: {
        expanded: [...expanded],
        positions,
        selected: selected?.id || "",
        notes,
        view: sanitizeView(view),
        query,
        typeFilter,
      },
    };
    try {
      const { data } = activeSave
        ? await api.put(`/strategy/graphs/${activeSave}`, body)
        : await api.post("/strategy/graphs", body);
      setActiveSave(data.id);
      setSaveTitle(data.title);
      toastRef.current.success("Vista del grafo guardada");
      loadSaved();
    } catch (e) {
      toastRef.current.error(apiError(e, "No se pudo guardar el grafo"));
    }
  };

  const applySave = (row) => {
    const payload = row?.payload || {};
    setActiveSave(row.id);
    setSaveTitle(row.title || "");
    setExpanded(new Set(payload.expanded || graph?.default_expanded || []));
    setPositions(sanitizePositions(payload.positions));
    setNotes(typeof payload.notes === "string" ? payload.notes : "");
    setQuery(typeof payload.query === "string" ? payload.query : "");
    setTypeFilter(typeof payload.typeFilter === "string" ? payload.typeFilter : "");
    applyView(payload.view || { x: 0, y: 0, k: 1 });
    if (payload.selected && byId[payload.selected]) openNode(byId[payload.selected]);
  };

  const removeSave = async (id) => {
    try {
      await api.delete(`/strategy/graphs/${id}`);
      if (activeSave === id) setActiveSave(null);
      loadSaved();
    } catch (e) {
      toastRef.current.error(apiError(e, "No se pudo eliminar la vista"));
    }
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const pt = svgPoint(e, svg, width, height);
      setView((v) => zoomAt(v, e.deltaY > 0 ? 0.9 : 1.1, pt.x, pt.y));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [width, height, loading, wide, graph]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea";
      if (e.key === "Escape") setWide(false);
      if (typing) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setView((v) => sanitizeView({ ...v, k: v.k * 1.15 }));
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setView((v) => sanitizeView({ ...v, k: v.k / 1.15 }));
      }
      if (e.key === "0") applyView({ x: 0, y: 0, k: 1 });
      if (e.key === "/" && searchRef.current) {
        e.preventDefault();
        searchRef.current.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onSvgDown = (e) => {
    if (closestEl(e.target, ".sg-node")) return;
    const current = viewRef.current;
    drag.current = { mode: "pan", x: e.clientX, y: e.clientY, vx: current.x, vy: current.y };
  };

  const onNodeDown = (e, node) => {
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY, moved: false };
    const origin = placed[node.id] || { x: 90, y: 48 };
    const move = (ev) => {
      const rect = svgRef.current?.getBoundingClientRect();
      const sx = rect ? width / (rect.width || 1) : 1;
      const sy = rect ? height / (rect.height || 1) : 1;
      const k = viewRef.current.k || 1;
      const dx = ((ev.clientX - start.x) * sx) / k;
      const dy = ((ev.clientY - start.y) * sy) / k;
      if (Math.abs(dx) + Math.abs(dy) > 4) start.moved = true;
      setPositions((prev) => ({ ...prev, [node.id]: { x: origin.x + dx, y: origin.y + dy } }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!start.moved) openNode(node);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (!cycleId) return null;
  if (loading) {
    return (
      <div className="sg-shell">
        <Spinner /> Armando el grafo del ciclo...
      </div>
    );
  }
  if (!graph) return <EmptyState message="No hay grafo para este ciclo." />;

  const controller = (
    <aside className="sg-controller" aria-label="Controlador interno del grafo">
      <header>
        <strong>Controlador interno</strong>
        <InfoTip text={HELP} label="Como usar el controlador" />
      </header>
      <input
        ref={searchRef}
        className="sg-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar nodo, tecnologia o etapa..."
        aria-label="Buscar nodo"
      />
      <div className="sg-type-chips">
        <button type="button" className={!typeFilter ? "is-on" : ""} onClick={() => setTypeFilter("")}>
          Todos
        </button>
        {typesPresent.map((t) => (
          <button
            key={t}
            type="button"
            className={typeFilter === t ? "is-on" : ""}
            onClick={() => setTypeFilter(typeFilter === t ? "" : t)}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <div className="sg-zoom-row">
        <Button size="sm" variant="ghost" onClick={() => setView((v) => sanitizeView({ ...v, k: v.k / 1.15 }))}>
          −
        </Button>
        <input
          type="range"
          min="35"
          max="280"
          value={Math.round(view.k * 100)}
          onChange={(e) => setView((v) => sanitizeView({ ...v, k: Number(e.target.value) / 100 }))}
          aria-label="Zoom"
        />
        <Button size="sm" variant="ghost" onClick={() => setView((v) => sanitizeView({ ...v, k: v.k * 1.15 }))}>
          +
        </Button>
        <span>{Math.round(view.k * 100)}%</span>
      </div>
      <div className="sg-ctrl-actions">
        <Button size="sm" variant="secondary" onClick={() => applyView({ x: 0, y: 0, k: 1 })}>
          Encajar
        </Button>
        <Button size="sm" variant="ghost" onClick={expandAll}>
          Ampliar todo
        </Button>
        <Button size="sm" variant="ghost" onClick={compact}>
          Compactar
        </Button>
        {selected && (
          <Button size="sm" variant="outline" onClick={() => jumpTo(selected)}>
            Ir al seleccionado
          </Button>
        )}
      </div>
      <p className="sg-ctrl-hint">
        {catalog.length} nodos · {visible.length} visibles · {selected ? selected.label : "sin seleccion"}
      </p>
      <ul className="sg-node-list">
        {catalog.slice(0, 80).map((n) => {
          const depth = ancestorsOf(n.id, byId).length;
          const on = selected?.id === n.id;
          return (
            <li key={n.id}>
              <button type="button" className={on ? "is-on" : ""} style={{ paddingLeft: 8 + depth * 10 }} onClick={() => jumpTo(n)}>
                <i style={{ background: TYPE_COLOR[n.type] || "#64748B" }} />
                <span>
                  <b>{n.label}</b>
                  <em>{n.subtitle}</em>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="sg-keys">Atajos: / buscar · + − zoom · 0 encajar · Esc salir de amplia</p>
    </aside>
  );

  const board = (
    <div className={`sg-board${wide ? " is-wide" : ""}`}>
      <div className="sg-toolbar">
        <div className="term-label">
          <strong>Grafo del ciclo</strong>
          <Badge tone="info">{visible.length} visibles</Badge>
          {restricted && <Badge tone="ok">Capa restringida</Badge>}
        </div>
        <div className="eval-actions">
          <Button size="sm" variant="secondary" onClick={() => applyView({ x: 0, y: 0, k: 1 })}>
            Encajar
          </Button>
          <Button size="sm" variant={wide ? "primary" : "outline"} onClick={() => setWide((v) => !v)}>
            {wide ? "Cerrar" : "Ampliar grafo"}
          </Button>
        </div>
      </div>

      <div className="sg-canvas-wrap">
        {lost && (
          <div className="sg-lost">
            <span>El dibujo quedo fuera de vista.</span>
            <Button size="sm" onClick={() => applyView({ x: 0, y: 0, k: 1 })}>
              Volver a encajar
            </Button>
          </div>
        )}
        <svg
          ref={svgRef}
          className="sg-canvas"
          viewBox={`0 0 ${width} ${height}`}
          onPointerDown={onSvgDown}
          onPointerMove={(e) => {
            if (drag.current?.mode !== "pan") return;
            const rect = svgRef.current?.getBoundingClientRect();
            const sx = rect ? width / (rect.width || 1) : 1;
            const sy = rect ? height / (rect.height || 1) : 1;
            setView(
              sanitizeView({
                x: drag.current.vx + (e.clientX - drag.current.x) * sx,
                y: drag.current.vy + (e.clientY - drag.current.y) * sy,
                k: viewRef.current.k,
              })
            );
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerLeave={() => {
            drag.current = null;
          }}
        >
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {visibleEdges.map((e, i) => {
              const a = placed[e.source];
              const b = placed[e.target];
              if (!a || !b) return null;
              const mid = (a.x + b.x) / 2;
              return (
                <path
                  key={`${e.source}-${e.target}-${e.kind}-${i}`}
                  d={`M ${a.x + 18} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x - 18} ${b.y}`}
                  className={`sg-edge sg-edge-${e.kind || "link"}`}
                  fill="none"
                />
              );
            })}
            {visible.map((n) => {
              const p = placed[n.id];
              if (!p) return null;
              const color = TYPE_COLOR[n.type] || "#64748B";
              const active = selected?.id === n.id;
              const canOpen = (n.children || []).length > 0;
              return (
                <g
                  key={n.id}
                  className="sg-node"
                  transform={`translate(${p.x},${p.y})`}
                  onPointerDown={(e) => onNodeDown(e, n)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (canOpen) toggle(n.id);
                  }}
                >
                  <circle r={active ? 16 : 13} fill={color} stroke={active ? "#0F172A" : "#fff"} strokeWidth={active ? 3 : 2} />
                  {canOpen && (
                    <text
                      y={4}
                      textAnchor="middle"
                      className="sg-plus"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        toggle(n.id);
                      }}
                    >
                      {expanded.has(n.id) ? "–" : "+"}
                    </text>
                  )}
                  <text x={22} y={-4} className="sg-label">
                    {n.label}
                  </text>
                  <text x={22} y={12} className="sg-sub">
                    {n.subtitle}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="sg-legend">
        {typesPresent.map((key) => (
          <span key={key}>
            <i style={{ background: TYPE_COLOR[key] }} />
            {TYPE_LABEL[key]}
          </span>
        ))}
      </div>
    </div>
  );

  const chat = selected && (
    <aside className="sg-chat">
      <header>
        <div>
          <strong>{selected.label}</strong>
          <p>{selected.subtitle}</p>
        </div>
        <Badge>{TYPE_LABEL[selected.type] || selected.type}</Badge>
      </header>
      <div className="sg-prompts">
        {(selected.prompts || []).map((q) => (
          <button key={q} type="button" disabled={sending} onClick={() => send(q)}>
            {q}
          </button>
        ))}
      </div>
      <div className="sg-messages" ref={chatRef}>
        {messages.length === 0 && (
          <p className="sg-chat-empty">Pregunte sobre este nodo. La conversacion se guarda y puede retomarla despues.</p>
        )}
        {messages.map((m, i) => {
          const text = messageText(m);
          const role = m.role === "assistant" ? "assistant" : "user";
          return (
            <div key={m.id || `${role}-${i}`} className={`sg-msg sg-msg-${role}`}>
              {role === "assistant" ? (
                <ErrorBoundary title="No se pudo mostrar la respuesta" hint="El texto crudo sigue disponible al reintentar.">
                  <Markdown>{text}</Markdown>
                </ErrorBoundary>
              ) : (
                text
              )}
            </div>
          );
        })}
        {sending && <Spinner />}
      </div>
      <form
        className="sg-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Consultar ${selected.label}...`}
        />
        <Button type="submit" disabled={sending || !draft.trim()}>
          Enviar
        </Button>
      </form>
    </aside>
  );

  const saves = (
    <div className="sg-saves">
      <Input
        label="Nombre de la vista"
        value={saveTitle}
        onChange={(e) => setSaveTitle(e.target.value)}
        placeholder={`Grafo ${graph.cycle_code || ""}`}
      />
      <textarea
        className="sg-notes"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notas de lectura (se guardan con la vista)"
      />
      <div className="eval-actions">
        <Button size="sm" onClick={persist}>
          {activeSave ? "Actualizar vista" : "Guardar vista"}
        </Button>
        {activeSave && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setActiveSave(null);
              setSaveTitle("");
            }}
          >
            Nueva
          </Button>
        )}
      </div>
      {saved.length > 0 && (
        <ul>
          {saved.map((row) => (
            <li key={row.id}>
              <button type="button" onClick={() => applySave(row)}>
                {row.title}
              </button>
              <button type="button" className="sg-del" onClick={() => removeSave(row.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const body = (
    <div className="sg-layout">
      {controller}
      {board}
      <div className="sg-side">
        {chat}
        {saves}
      </div>
    </div>
  );

  if (wide) {
    return (
      <div className="sg-lightbox" role="dialog" aria-modal="true" aria-label="Grafo ampliado">
        <div className="sg-lightbox-inner">{body}</div>
      </div>
    );
  }

  return <div className="sg-shell">{body}</div>;
}

export default function StrategyGraph(props) {
  return (
    <ErrorBoundary
      title="El grafo se detuvo"
      hint="El tablero sigue disponible. Reintente el mapa o use Encajar si el dibujo quedo fuera de vista."
    >
      <GraphTool {...props} />
    </ErrorBoundary>
  );
}
