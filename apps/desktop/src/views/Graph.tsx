import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react"
import { useApp, type Claim } from "../lib/app.ts"
import { useT, type MessageKey } from "../lib/i18n.ts"
import { runJson } from "../lib/bridge.ts"
import { invalidate, useQuery } from "../lib/query.ts"
import { useClaims, useStatus } from "../lib/data.ts"
import { readPref, writePref } from "../lib/storage.ts"
import { GRID, fitGraph, placeColumns, mergePositions, portOffsets, routeEdge, screenToWorld, snap, snapNode, zoomAt, clampZoom, type Point, type Viewport } from "../lib/graph-canvas.ts"
import { errorText } from "../lib/cli-text.ts"
import { isVerifiedStatus, kindLabel, statusMeta } from "../lib/status.ts"
import { Icon } from "../components/Icon.tsx"
import { Sheet } from "../components/Overlay.tsx"
import { Empty, ErrorBox, StatusPill } from "../components/Primitives.tsx"
import { MathText } from "../components/MathText.tsx"

interface GraphNode { id: string; kind: string; label?: string; epistemicStatus?: string; entityId?: string }
interface GraphEdge { id: string; kind: string; fromNodeId: string; toNodeId: string }
interface Frontier { id: string; title: string; status: string; distance?: number }
interface GraphData { nodes: GraphNode[]; edges: GraphEdge[]; analysis: { objectiveClaimId: string | null; unverifiedFrontier: Frontier[]; openBlockingChain: Frontier[] } }

/** Relations the research graph draws (and its blocker analysis follows). */
export const RELATIONS = ["depends_on", "uses_definition", "derived_from", "blocks"] as const
const EDGE_LABEL: Record<string, MessageKey> = { requires: "graph.rel.uses_definition", derived_from: "graph.rel.derived_from", blocks: "graph.rel.blocks" }
const DRAWN = new Set(["DEPENDS_ON", "REQUIRES", "DERIVED_FROM", "BLOCKS"])
const graphKey = (root: string) => `${root}|graph`
// Card size and spacing are whole grid steps, so a fresh layout sits on the grid and level cards link straight.
const W = 216, H = 72, GAP_X = 96, GAP_Y = 24, PAD = 24
type Drag = { kind: "pan" | "node" | "edge" | "link"; id?: string; pointerId: number; capture: Element; client: Point; view: Viewport; origin: Point; moved: boolean }

/** Columns by depth: a claim sits one column right of everything it depends on, so foundations are on the left. */
function layout(claims: Claim[], edges: GraphEdge[]) {
  const ids = new Set(claims.map((claim) => claim.id))
  const deps = new Map<string, string[]>(claims.map((claim) => [claim.id, []]))
  for (const edge of edges) if (ids.has(edge.fromNodeId) && ids.has(edge.toNodeId) && edge.fromNodeId !== edge.toNodeId) deps.get(edge.fromNodeId)!.push(edge.toNodeId)
  const rank = new Map<string, number>()
  const visit = (id: string, trail: Set<string>): number => {
    if (rank.has(id)) return rank.get(id)!
    if (trail.has(id)) return 0
    trail.add(id)
    const value = Math.max(-1, ...deps.get(id)!.map((dep) => visit(dep, trail))) + 1
    trail.delete(id); rank.set(id, value)
    return value
  }
  for (const claim of claims) visit(claim.id, new Set())
  const columns: string[][] = []
  for (const claim of claims) (columns[rank.get(claim.id)!] ??= []).push(claim.id)
  return { position: placeColumns(columns, deps, H + GAP_Y, W + GAP_X, PAD) }
}

export function Graph() {
  const app = useApp()
  const { t, lang } = useT()
  const root = app.workspace.root
  const graph = useQuery(graphKey(root), () => runJson<GraphData>(root, ["graph", "show"]))
  const claims = useClaims(root)
  const status = useStatus(root)
  const [selected, setSelected] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [viewport, setViewport] = useState<Viewport | null>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const savedPositions = useRef<Record<string, Point>>(readPref(`graph.positions.${root}`, {}))
  const savedBends = useRef<Record<string, Point>>(readPref(`graph.bends.${root}`, {}))
  const [layoutRevision, setLayoutRevision] = useState(0)
  const [draftLink, setDraftLink] = useState<{ from: string; point: Point; target: string | null } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [settling, setSettling] = useState(false)
  const reducedMotion = useReducedMotion()
  const suppressClick = useRef(false)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const node = canvas.current
    if (!node) return
    const observer = new ResizeObserver(() => setCanvasSize({ width: node.clientWidth, height: node.clientHeight }))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const [linking, setLinking] = useState<{ from: string | null; to: string | null } | null>(null)

  const list = claims.data ?? []
  const edges = useMemo(() => (graph.data?.edges ?? []).filter((edge) => DRAWN.has(edge.kind) && list.some((claim) => claim.id === edge.fromNodeId) && list.some((claim) => claim.id === edge.toNodeId)), [graph.data, list])
  const placed = useMemo(() => layout(list, edges), [list, edges])
  const positions = useMemo(() => mergePositions(placed.position, savedPositions.current), [placed, layoutRevision])
  const routes = useMemo(() => routeLinks(edges, positions, savedBends.current), [edges, positions, layoutRevision])
  const columns = useMemo(() => new Map([...placed.position].map(([id, point]) => [id, Math.round((point.x - PAD) / (W + GAP_X))])), [placed])
  const view = viewport ?? fitGraph(positions, canvasSize, { width: W, height: H })
  const setZoom = (next: (value: number) => number) => setViewport(zoomAt(view, { x: canvasSize.width / 2, y: canvasSize.height / 2 }, next(view.zoom)))
  const objective = status.data?.status.mainObjective?.id ?? graph.data?.analysis.objectiveClaimId ?? null
  const focus = dragging ? selected : hover ?? selected
  const touching = (edge: GraphEdge) => focus !== null && (edge.fromNodeId === focus || edge.toNodeId === focus)
  const current = list.find((claim) => claim.id === selected) ?? null
  const currentEdge = edges.find((edge) => edge.id === selectedEdge) ?? null
  const frontier = graph.data?.analysis.unverifiedFrontier ?? []
  const openClaim = (id: string) => { app.selectClaim(id); app.navigate("claims") }

  useEffect(() => {
    savedPositions.current = readPref(`graph.positions.${root}`, {})
    savedBends.current = readPref(`graph.bends.${root}`, {})
    setViewport(null); setSelected(null); setSelectedEdge(null); setLayoutRevision(value => value + 1)
  }, [root])

  const localPoint = (clientX: number, clientY: number): Point => {
    const rect = canvas.current!.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }
  const claimAt = (clientX: number, clientY: number) => document.elementFromPoint(clientX, clientY)?.closest("[data-claim-id]")?.getAttribute("data-claim-id") ?? null
  const begin = (kind: Drag["kind"], id: string | undefined, event: PointerEvent, origin: Point = { x: 0, y: 0 }) => {
    if (event.button !== 0) return
    event.preventDefault(); event.stopPropagation()
    // The fitted view depends on where the cards are; left in fit mode it would re-fit on every frame of a drag and
    // the card would slide away from the pointer. From the first touch on, the view stays where the user sees it.
    if (viewport === null) setViewport(view)
    drag.current = { kind, id, pointerId: event.pointerId, capture: event.currentTarget, client: { x: event.clientX, y: event.clientY }, view, origin, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
    if (kind === "node" && id) { setSelected(id); setSelectedEdge(null) }
    if (kind === "edge" && id) { setSelectedEdge(id); setSelected(null) }
    if (kind === "link" && id) setDraftLink({ from: id, point: screenToWorld(localPoint(event.clientX, event.clientY), view), target: null })
    if (kind === "pan") { setSelected(null); setSelectedEdge(null) }
  }
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    const dx = event.clientX - active.client.x, dy = event.clientY - active.client.y
    if (Math.hypot(dx, dy) > 3) active.moved = true
    if (active.kind === "pan") setViewport({ ...active.view, x: active.view.x + dx, y: active.view.y + dy })
    if (active.kind === "node" && active.id) {
      const raw = { x: active.origin.x + dx / active.view.zoom, y: active.origin.y + dy / active.view.zoom }
      const linked = edges.filter((edge) => edge.fromNodeId === active.id || edge.toNodeId === active.id).map((edge) => positions.get(edge.fromNodeId === active.id ? edge.toNodeId : edge.fromNodeId)?.y).filter((y): y is number => y !== undefined)
      savedPositions.current = { ...savedPositions.current, [active.id]: event.altKey ? raw : snapNode(raw, linked) }
      setLayoutRevision(value => value + 1)
    }
    if (active.kind === "edge" && active.id) {
      savedBends.current = { ...savedBends.current, [active.id]: { x: active.origin.x + dx / active.view.zoom, y: active.origin.y + dy / active.view.zoom } }
      setLayoutRevision(value => value + 1)
    }
    if (active.kind === "link" && active.id) {
      const target = claimAt(event.clientX, event.clientY)
      setDraftLink({ from: active.id, point: screenToWorld(localPoint(event.clientX, event.clientY), active.view), target: target && target !== active.id ? target : null })
    }
  }
  const end = (event: PointerEvent<SVGSVGElement>) => {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    if (active.kind === "node" && active.moved) writePref(`graph.positions.${root}`, savedPositions.current)
    if (active.kind === "edge" && active.moved) writePref(`graph.bends.${root}`, savedBends.current)
    if (active.kind === "link" && active.id) {
      const target = claimAt(event.clientX, event.clientY)
      // Links are drawn out of the right side of what is relied on, so a link dragged from a card's port onto another
      // card means "that card depends on this one".
      if (target && target !== active.id) setLinking({ from: target, to: active.id })
      setDraftLink(null)
    }
    suppressClick.current = active.moved
    requestAnimationFrame(() => { suppressClick.current = false })
    drag.current = null
    setDragging(false)
    if (active.capture.hasPointerCapture(event.pointerId)) active.capture.releasePointerCapture(event.pointerId)
  }
  const wheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!list.length) return
    event.preventDefault()
    const factor = Math.exp(-event.deltaY * 0.0015)
    setViewport(zoomAt(view, localPoint(event.clientX, event.clientY), view.zoom * factor))
  }
  /** Cards glide to their new places instead of jumping (only for layout changes the user did not drag). */
  const settle = () => { if (reducedMotion) return; setSettling(true); window.setTimeout(() => setSettling(false), 420) }
  const resetLayout = () => {
    savedPositions.current = {}; savedBends.current = {}
    writePref(`graph.positions.${root}`, {}); writePref(`graph.bends.${root}`, {})
    settle(); setLayoutRevision(value => value + 1); setViewport(null); setSelectedEdge(null)
  }
  const centerOn = (id: string) => {
    const point = positions.get(id)
    if (!point) return
    setViewport({ ...view, x: canvasSize.width / 2 - (point.x + W / 2) * view.zoom, y: canvasSize.height / 2 - (point.y + H / 2) * view.zoom })
  }
  const nudge = (event: KeyboardEvent, kind: "node" | "edge", id: string) => {
    const step = event.shiftKey ? GRID * 4 : GRID
    const change: Record<string, Point> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } }
    const delta = change[event.key]
    if (!delta) return
    event.preventDefault(); event.stopPropagation()
    if (kind === "node") {
      const start = positions.get(id)!
      savedPositions.current = { ...savedPositions.current, [id]: { x: snap(start.x + delta.x), y: snap(start.y + delta.y) } }
      writePref(`graph.positions.${root}`, savedPositions.current)
    } else {
      const start = savedBends.current[id] ?? { x: 0, y: 0 }
      savedBends.current = { ...savedBends.current, [id]: { x: start.x + delta.x, y: start.y + delta.y } }
      writePref(`graph.bends.${root}`, savedBends.current)
    }
    setLayoutRevision(value => value + 1)
  }
  // The dot grid belongs to the canvas: it pans and zooms with the cards (thinned out when it would get too dense).
  const dot = GRID * 2 * view.zoom
  const grid = list.length ? { backgroundSize: `${dot < 10 ? dot * 4 : dot}px ${dot < 10 ? dot * 4 : dot}px`, backgroundPosition: `${view.x}px ${view.y}px` } : undefined
  const draftFrom = draftLink ? positions.get(draftLink.from) : undefined

  if (graph.error) return <div className="page-inner"><ErrorBox error={graph.error} onRetry={() => graph.refetch()} /></div>
  return (
    <div className="graph-page">
      <div className="graph-main">
        <div className="page-head graph-head">
          <div><div className="eyebrow eyebrow-name">{app.workspace.name}</div><h1 className="title">{t("graph.title")}</h1></div>
          <div className="head-actions">
            <div className="zoom" role="group" aria-label={t("graph.zoom")}>
              <button className="btn btn-ghost btn-icon" onClick={() => setZoom(value => clampZoom(value / 1.2))} aria-label="−">−</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setViewport(null)} title={t("graph.fit")}>{viewport === null ? t("graph.fit") : `${Math.round(view.zoom * 100)}%`}</button>
              <button className="btn btn-ghost btn-icon" onClick={() => setZoom(value => clampZoom(value * 1.2))} aria-label="+">+</button>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={resetLayout} disabled={!list.length} title={t("graph.resetHint")}>{t("graph.reset")}</button>
            <button className="btn btn-primary" onClick={() => setLinking({ from: selected, to: null })} disabled={list.length < 2}><Icon name="plus" size={15} />{t("graph.link")}</button>
          </div>
        </div>
        <div className="graph-legend">
          <span><i className="lg verified" />{t("graph.legend.verified")}</span><span><i className="lg formal" />{t("graph.legend.formal")}</span><span><i className="lg open" />{t("graph.legend.open")}</span><span><Icon name="target" size={13} />{t("graph.legend.objective")}</span>
          <span className="graph-gesture-hint">{t("graph.gestures")}</span>
        </div>
        <div className={`graph-canvas ${dragging ? "is-dragging" : ""} ${settling ? "is-settling" : ""} ${draftLink ? "is-linking" : ""}`} ref={canvas} onWheel={wheel} style={grid}>
          {!graph.data || !claims.data ? <div className="graph-loading" role="status"><span className="spinner" />{t("graph.loading")}</div> : !list.length ? <Empty glyph="∘" title={t("graph.empty")}><p className="field-hint">{t("graph.emptyHint")}</p></Empty> : (
            <svg width="100%" height="100%" role="group" aria-label={t("graph.title")} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
              <defs>
                <marker id="g-arrow" className="g-marker" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path d="M2 1.5 8.5 5 2 8.5" /></marker>
                <marker id="g-arrow-hot" className="g-marker hot" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path d="M2 1.5 8.5 5 2 8.5" /></marker>
              </defs>
              <rect className="graph-background" width="100%" height="100%" onPointerDown={event => begin("pan", undefined, event)} />
              <g transform={`translate(${view.x},${view.y}) scale(${view.zoom})`}>
              {edges.map((edge) => {
                const route = routes.get(edge.id)!, relation = edge.kind.toLowerCase(), hot = touching(edge) || edge.id === selectedEdge
                const label = EDGE_LABEL[relation] ? t(EDGE_LABEL[relation]!) : null
                const offset = savedBends.current[edge.id] ?? { x: 0, y: 0 }
                return (
                  <g key={edge.id} className={`g-edge ${hot ? "hot" : focus ? "dim" : ""} ${relation} ${edge.id === selectedEdge ? "on" : ""}`}>
                    <path className="g-line" d={route.path} markerEnd={`url(#${hot ? "g-arrow-hot" : "g-arrow"})`} />
                    {hot && !reducedMotion && !dragging && <FlowDots path={route.path} length={route.length} />}
                    <path className="g-hit" d={route.path} tabIndex={0} role="button" aria-label={`${edge.fromNodeId} → ${edge.toNodeId}`} onPointerDown={event => begin("edge", edge.id, event, offset)} onClick={event => { event.stopPropagation(); setSelectedEdge(edge.id); setSelected(null) }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedEdge(edge.id); setSelected(null) } else nudge(event, "edge", edge.id) }} />
                    {label && <g className="g-edge-label" transform={`translate(${route.label.x},${route.label.y})`}><rect x={-(label.length * 3.1 + 9)} y={-9} width={label.length * 6.2 + 18} height={18} rx={9} /><text textAnchor="middle" y={3.6}>{label}</text></g>}
                    {edge.id === selectedEdge && <circle className="g-bend" cx={route.handle.x} cy={route.handle.y} r={7} onPointerDown={event => begin("edge", edge.id, event, offset)}><title>{t("graph.moveLink")}</title></circle>}
                  </g>
                )
              })}
              {list.map((claim) => {
                const at = positions.get(claim.id)!, meta = statusMeta(claim.status, lang), state = isVerifiedStatus(claim.status) ? "verified" : /FORMAL/.test(claim.status) ? "formal" : "open"
                const dim = focus && focus !== claim.id && !edges.some((edge) => touching(edge) && (edge.fromNodeId === claim.id || edge.toNodeId === claim.id))
                return (
                  <g key={claim.id} data-claim-id={claim.id} className={`g-node ${state} ${claim.id === selected ? "on" : ""} ${dim ? "dim" : ""} ${claim.id === objective ? "objective" : ""} ${draftLink?.target === claim.id ? "link-target" : ""}`}
                    style={{ transform: `translate(${at.x}px,${at.y}px)` }} onMouseEnter={() => { if (!drag.current) setHover(claim.id) }} onMouseLeave={() => { if (!drag.current) setHover(null) }} onPointerDown={event => begin("node", claim.id, event, at)} onClick={(event) => { event.stopPropagation(); if (suppressClick.current) { suppressClick.current = false; return } setSelected(claim.id); setSelectedEdge(null) }} onDoubleClick={() => openClaim(claim.id)} tabIndex={0} role="button" aria-label={`${claim.id} ${claim.title}`}
                    onKeyDown={(event) => { if (event.key === "Enter") setSelected(claim.id); else nudge(event, "node", claim.id) }}>
                    <g className="g-card" style={{ animationDelay: `${Math.min(columns.get(claim.id) ?? 0, 10) * 45}ms` }}>
                      <rect className="g-shape" width={W} height={H} rx={12} />
                      <text className="g-kind" x={16} y={23}>{kindLabel(claim.kind, lang).toLocaleUpperCase(lang)}</text>
                      <text className="g-id" x={W - 16} y={23} textAnchor="end">{claim.id}</text>
                      <text className="g-title" x={16} y={44}>{claim.title.length > 26 ? `${claim.title.slice(0, 25).trimEnd()}…` : claim.title}<title>{claim.title}</title></text>
                      <circle className="g-dot" cx={20} cy={57.5} r={3.5} />
                      <text className="g-status" x={30} y={61}>{meta.label}</text>
                      {claim.id === objective && <g className="g-target" transform={`translate(${W - 20},${H - 16})`}><circle className="g-target-ring" r={4.5} /><circle r={2.4} /></g>}
                    </g>
                    {list.length > 1 && <g className="g-port" onPointerDown={event => begin("link", claim.id, event)}><circle className="g-port-hit" cx={W} cy={H / 2} r={12} /><circle className="g-port-dot" cx={W} cy={H / 2} r={5} /><title>{t("graph.dragLink")}</title></g>}
                  </g>
                )
              })}
              {draftLink && draftFrom && <path className="g-draft-link" d={`M${draftFrom.x + W},${draftFrom.y + H / 2} C${draftFrom.x + W + 60},${draftFrom.y + H / 2} ${draftLink.point.x - 60},${draftLink.point.y} ${draftLink.point.x},${draftLink.point.y}`} />}
              </g>
            </svg>
          )}
        </div>
      </div>
      <aside className="graph-side">
        {currentEdge ? (
          <div className="graph-detail view-enter">
            <div className="graph-detail-head"><span className="kbd">{t("graph.connection")}</span><span className="pill pill-soft">{t(EDGE_LABEL[currentEdge.kind.toLowerCase()] ?? `graph.rel.${currentEdge.kind.toLowerCase()}` as MessageKey)}</span></div>
            <h2>{list.find(claim => claim.id === currentEdge.fromNodeId)?.title ?? currentEdge.fromNodeId}</h2>
            <p className="field-hint">{currentEdge.fromNodeId} {t(EDGE_LABEL[currentEdge.kind.toLowerCase()] ?? `graph.rel.${currentEdge.kind.toLowerCase()}` as MessageKey)} {currentEdge.toNodeId}</p>
            <p className="field-hint">{t("graph.moveLinkHint")}</p>
            <div className="wf-actions"><button className="btn btn-secondary btn-sm" onClick={() => { const next = { ...savedBends.current }; delete next[currentEdge.id]; savedBends.current = next; writePref(`graph.bends.${root}`, next); settle(); setLayoutRevision(value => value + 1) }}>{t("graph.resetLink")}</button></div>
          </div>
        ) : current ? (
          <div className="graph-detail view-enter">
            <div className="graph-detail-head"><span className="kbd">{current.id}</span><StatusPill status={current.status} /></div>
            <h2>{current.title}</h2>
            <div className="statement-card small"><MathText text={current.naturalStatement} /></div>
            <Relations title={t("graph.dependsOn")} ids={edges.filter((edge) => edge.fromNodeId === current.id).map((edge) => [edge.toNodeId, edge.kind])} list={list} onPick={setSelected} empty={t("graph.noDeps")} />
            <Relations title={t("graph.usedBy")} ids={edges.filter((edge) => edge.toNodeId === current.id).map((edge) => [edge.fromNodeId, edge.kind])} list={list} onPick={setSelected} empty={t("graph.noDependents")} />
            <div className="wf-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => centerOn(current.id)}>{t("graph.center")}</button>
              <button className="btn btn-primary btn-sm" onClick={() => openClaim(current.id)}><Icon name="arrow" size={14} />{t("graph.open")}</button>
              <button className="btn btn-secondary btn-sm" onClick={() => { writePref("assistant.claim", current.id); app.navigate("assistant") }}><Icon name="chat" size={14} />{t("claims.askAssistant")}</button>
            </div>
          </div>
        ) : (
          <div className="graph-detail">
            <h2 className="section-h">{t("graph.frontier")}</h2>
            <p className="field-hint">{t("graph.frontierHint")}</p>
            <ul className="frontier">{frontier.map((row) => <li key={row.id}><button onClick={() => setSelected(row.id)}><span className="kbd">{row.id}</span><span className="name">{row.title}</span><StatusPill status={row.status} /></button></li>)}</ul>
            {!frontier.length && graph.data && <p className="field-hint">{t("graph.frontierNone")}</p>}
          </div>
        )}
      </aside>
      {linking && <LinkSheet claims={list} initialFrom={linking.from} initialTo={linking.to} onClose={() => setLinking(null)} onDone={() => { setLinking(null); invalidate(graphKey(root)) }} />}
    </div>
  )
}

/**
 * Every drawn link, routed between the cards it joins: out of the right side of what is relied on, into the left side
 * of what relies on it. Links sharing a side are spread along it in the order of the cards at their other end, so
 * they do not cross at the card or meet in one point.
 */
function routeLinks(edges: GraphEdge[], positions: Map<string, Point>, bends: Record<string, Point>) {
  const ends = (edge: GraphEdge) => edge.kind === "BLOCKS" ? [edge.fromNodeId, edge.toNodeId] as const : [edge.toNodeId, edge.fromNodeId] as const
  const middle = (id: string) => (positions.get(id)?.y ?? 0) + H / 2
  const outgoing = new Map<string, GraphEdge[]>(), incoming = new Map<string, GraphEdge[]>()
  for (const edge of edges) { const [source, target] = ends(edge); (outgoing.get(source) ?? outgoing.set(source, []).get(source)!).push(edge); (incoming.get(target) ?? incoming.set(target, []).get(target)!).push(edge) }
  const port = new Map<string, number>()
  for (const [side, groups] of [["out", outgoing], ["in", incoming]] as const) for (const group of groups.values()) {
    group.sort((a, b) => middle(side === "out" ? ends(a)[1] : ends(a)[0]) - middle(side === "out" ? ends(b)[1] : ends(b)[0]))
    const offsets = portOffsets(group.length, H)
    group.forEach((edge, index) => port.set(`${side}:${edge.id}`, offsets[index]!))
  }
  return new Map(edges.map((edge) => {
    const [source, target] = ends(edge), a = positions.get(source)!, b = positions.get(target)!
    const from = { x: a.x + W, y: a.y + port.get(`out:${edge.id}`)! }, to = { x: b.x, y: b.y + port.get(`in:${edge.id}`)! }
    // Links into one card take separate vertical channels, so their steps never run on top of each other.
    const group = incoming.get(target)!, lane = (group.indexOf(edge) - (group.length - 1) / 2) * 12
    const bend = bends[edge.id] ?? { x: lane, y: 0 }
    const route = routeEdge(from, to, bend, Math.max(a.y, b.y) + H + GAP_Y - Math.max(from.y, to.y))
    const length = route.points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - route.points[index]!.x, point.y - route.points[index]!.y), 0)
    return [edge.id, { ...route, length }]
  }))
}

/** A few dots travelling along a link in its direction, shown while the link is in focus. */
function FlowDots({ path, length }: { path: string; length: number }) {
  const seconds = Math.min(3.2, Math.max(0.9, length / 140))
  return <>{[0, 1, 2].map((index) => <circle key={index} className="g-flow" r={index === 0 ? 2.6 : 2}><animateMotion dur={`${seconds}s`} begin={`${(-index * seconds) / 3}s`} repeatCount="indefinite" path={path} /></circle>)}</>
}

function useReducedMotion() {
  const query = useMemo(() => typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null, [])
  const [reduced, setReduced] = useState(query?.matches ?? false)
  useEffect(() => {
    if (!query) return
    const update = () => setReduced(query.matches)
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [query])
  return reduced
}

function Relations({ title, ids, list, onPick, empty }: { title: string; ids: Array<[string, string]>; list: Claim[]; onPick: (id: string) => void; empty: string }) {
  const { t } = useT()
  return (
    <div className="graph-rel">
      <div className="k">{title}</div>
      {ids.length ? ids.map(([id, kind]) => { const claim = list.find((row) => row.id === id); return <button key={`${id}-${kind}`} onClick={() => onPick(id)}><span className="kbd">{id}</span><span className="name">{claim?.title ?? id}</span>{EDGE_LABEL[kind.toLowerCase()] && <span className="rel">{t(EDGE_LABEL[kind.toLowerCase()]!)}</span>}</button> }) : <p className="field-hint">{empty}</p>}
    </div>
  )
}

function LinkSheet({ claims, initialFrom, initialTo, onClose, onDone }: { claims: Claim[]; initialFrom: string | null; initialTo: string | null; onClose: () => void; onDone: () => void }) {
  const app = useApp()
  const { t, lang } = useT()
  const [from, setFrom] = useState(initialFrom ?? claims[0]?.id ?? "")
  const [to, setTo] = useState(initialTo ?? claims.find((claim) => claim.id !== (initialFrom ?? claims[0]?.id))?.id ?? "")
  const [relation, setRelation] = useState<(typeof RELATIONS)[number]>("depends_on")
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try { await runJson(app.workspace.root, ["claim", "depend", from, "--on", to, "--relation", relation]); app.toast(t("graph.linked")); onDone() }
    catch (error) { app.toast(errorText(error, lang), "error") } finally { setBusy(false) }
  }
  const option = (claim: Claim) => <option key={claim.id} value={claim.id}>{claim.id} · {claim.title}</option>
  return (
    <Sheet open onClose={onClose} title={t("graph.linkTitle")} footer={<><button className="btn btn-secondary" onClick={onClose}>{t("common.cancel")}</button><button className="btn btn-primary" onClick={() => void save()} disabled={busy || !from || !to || from === to}>{busy ? <span className="spinner" /> : t("graph.linkSave")}</button></>}>
      <label className="field"><span className="field-label">{t("graph.linkFrom")}</span><select className="input" value={from} onChange={(event) => setFrom(event.target.value)}>{claims.map(option)}</select></label>
      <label className="field"><span className="field-label">{t("graph.linkRelation")}</span><select className="input" value={relation} onChange={(event) => setRelation(event.target.value as (typeof RELATIONS)[number])}>{RELATIONS.map((value) => <option key={value} value={value}>{t(`graph.rel.${value}` as MessageKey)}</option>)}</select></label>
      <label className="field"><span className="field-label">{t("graph.linkTo")}</span><select className="input" value={to} onChange={(event) => setTo(event.target.value)}>{claims.filter((claim) => claim.id !== from).map(option)}</select></label>
      <p className="field-hint">{t("graph.linkHint")}</p>
    </Sheet>
  )
}
