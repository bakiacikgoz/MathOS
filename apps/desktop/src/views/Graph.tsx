import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { useApp, type Claim } from "../lib/app.ts"
import { useT, type MessageKey } from "../lib/i18n.ts"
import { runJson } from "../lib/bridge.ts"
import { invalidate, useQuery } from "../lib/query.ts"
import { useClaims, useStatus } from "../lib/data.ts"
import { writePref } from "../lib/storage.ts"
import { errorText } from "../lib/cli-text.ts"
import { statusMeta } from "../lib/status.ts"
import { Icon } from "../components/Icon.tsx"
import { Sheet } from "../components/Overlay.tsx"
import { Empty, ErrorBox, Skeleton, StatusPill } from "../components/Primitives.tsx"
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
const W = 216, H = 70, GAP_X = 96, GAP_Y = 26, PAD = 28

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
  // One ordering pass: place each claim near the average row of what it depends on.
  const row = new Map<string, number>()
  columns.forEach((column, index) => {
    if (index > 0) column.sort((a, b) => average(a) - average(b))
    column.forEach((id, at) => row.set(id, at))
    function average(id: string) { const rows = deps.get(id)!.map((dep) => row.get(dep) ?? 0); return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : 0 }
  })
  const tallest = Math.max(1, ...columns.map((column) => column.length))
  const position = new Map<string, { x: number; y: number }>()
  columns.forEach((column, index) => {
    const offset = ((tallest - column.length) * (H + GAP_Y)) / 2
    column.forEach((id, at) => position.set(id, { x: PAD + index * (W + GAP_X), y: PAD + offset + at * (H + GAP_Y) }))
  })
  return { position, width: PAD * 2 + Math.max(1, columns.length) * W + Math.max(0, columns.length - 1) * GAP_X, height: PAD * 2 + tallest * H + (tallest - 1) * GAP_Y }
}

export function Graph() {
  const app = useApp()
  const { t, lang } = useT()
  const root = app.workspace.root
  const graph = useQuery(graphKey(root), () => runJson<GraphData>(root, ["graph", "show"]))
  const claims = useClaims(root)
  const status = useStatus(root)
  const [selected, setSelected] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  // null = fit the whole graph in the canvas; the buttons switch to a fixed zoom.
  const [manualZoom, setManualZoom] = useState<number | null>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const node = canvas.current
    if (!node) return
    const observer = new ResizeObserver(() => setCanvasSize({ width: node.clientWidth, height: node.clientHeight }))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const [linking, setLinking] = useState(false)

  const list = claims.data ?? []
  const edges = useMemo(() => (graph.data?.edges ?? []).filter((edge) => DRAWN.has(edge.kind) && list.some((claim) => claim.id === edge.fromNodeId) && list.some((claim) => claim.id === edge.toNodeId)), [graph.data, list])
  const placed = useMemo(() => layout(list, edges), [list, edges])
  // Fitting never shrinks cards below readable size; a long chain scrolls sideways instead.
  const fit = canvasSize.width ? Math.max(0.8, Math.min(1.2, (canvasSize.width - 8) / placed.width, (canvasSize.height - 8) / placed.height)) : 1
  const zoom = manualZoom ?? fit
  const setZoom = (next: (value: number) => number) => setManualZoom(Math.round(next(zoom) * 100) / 100)
  const objective = status.data?.status.mainObjective?.id ?? graph.data?.analysis.objectiveClaimId ?? null
  const focus = hover ?? selected
  const touching = (edge: GraphEdge) => focus !== null && (edge.fromNodeId === focus || edge.toNodeId === focus)
  const current = list.find((claim) => claim.id === selected) ?? null
  const frontier = graph.data?.analysis.unverifiedFrontier ?? []
  const openClaim = (id: string) => { app.selectClaim(id); app.navigate("claims") }

  if (graph.error) return <div className="page-inner"><ErrorBox error={graph.error} onRetry={() => graph.refetch()} /></div>
  return (
    <div className="graph-page">
      <div className="graph-main">
        <div className="page-head graph-head">
          <div><div className="eyebrow eyebrow-name">{app.workspace.name}</div><h1 className="title">{t("graph.title")}</h1></div>
          <div className="head-actions">
            <div className="zoom" role="group" aria-label={t("graph.zoom")}>
              <button className="btn btn-ghost btn-icon" onClick={() => setZoom((value) => Math.max(0.4, value - 0.15))} aria-label="−">−</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setManualZoom(null)} title={t("graph.fit")}>{manualZoom === null ? t("graph.fit") : `${Math.round(zoom * 100)}%`}</button>
              <button className="btn btn-ghost btn-icon" onClick={() => setZoom((value) => Math.min(1.8, value + 0.15))} aria-label="+">+</button>
            </div>
            <button className="btn btn-primary" onClick={() => setLinking(true)} disabled={list.length < 2}><Icon name="plus" size={15} />{t("graph.link")}</button>
          </div>
        </div>
        <div className="graph-legend">
          <span><i className="lg verified" />{t("graph.legend.verified")}</span><span><i className="lg formal" />{t("graph.legend.formal")}</span><span><i className="lg open" />{t("graph.legend.open")}</span><span><Icon name="target" size={13} />{t("graph.legend.objective")}</span>
        </div>
        <div className="graph-canvas" ref={canvas} onClick={() => setSelected(null)}>
          {!graph.data || !claims.data ? <Skeleton height={320} /> : !list.length ? <Empty glyph="∘" title={t("graph.empty")}><p className="field-hint">{t("graph.emptyHint")}</p></Empty> : (
            <svg width={placed.width * zoom} height={placed.height * zoom} viewBox={`0 0 ${placed.width} ${placed.height}`} role="img" aria-label={t("graph.title")}>
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="currentColor" /></marker>
              </defs>
              {edges.map((edge) => {
                const from = placed.position.get(edge.toNodeId)!, to = placed.position.get(edge.fromNodeId)!
                const x1 = from.x + W, y1 = from.y + H / 2, x2 = to.x - 4, y2 = to.y + H / 2, bend = Math.max(40, (x2 - x1) / 2)
                const relation = edge.kind.toLowerCase()
                return (
                  <g key={edge.id} className={`g-edge ${touching(edge) ? "hot" : focus ? "dim" : ""} ${relation}`}>
                    <path d={x2 > x1 ? `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}` : `M${from.x + W / 2},${from.y + H} C${from.x + W / 2},${from.y + H + 60} ${to.x + W / 2},${to.y + H + 60} ${to.x + W / 2},${to.y + H}`} markerEnd="url(#arrow)" />
                    {EDGE_LABEL[relation] && x2 > x1 && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle">{t(EDGE_LABEL[relation]!)}</text>}
                  </g>
                )
              })}
              {list.map((claim) => {
                const at = placed.position.get(claim.id)!, meta = statusMeta(claim.status, lang), state = /VERIFIED/.test(claim.status) && !/UN/.test(claim.status) ? "verified" : /FORMAL/.test(claim.status) ? "formal" : "open"
                return (
                  <g key={claim.id} className={`g-node ${state} ${claim.id === selected ? "on" : ""} ${focus && focus !== claim.id && !edges.some((edge) => touching(edge) && (edge.fromNodeId === claim.id || edge.toNodeId === claim.id)) ? "dim" : ""} ${claim.id === objective ? "objective" : ""}`}
                    transform={`translate(${at.x},${at.y})`} onMouseEnter={() => setHover(claim.id)} onMouseLeave={() => setHover(null)} onClick={(event) => { event.stopPropagation(); setSelected(claim.id) }} onDoubleClick={() => openClaim(claim.id)} tabIndex={0} role="button" aria-label={`${claim.id} ${claim.title}`}
                    onKeyDown={(event) => { if (event.key === "Enter") setSelected(claim.id) }}>
                    <rect width={W} height={H} rx={14} />
                    <text className="g-id" x={14} y={24}>{claim.id}</text>
                    <text className="g-status" x={W - 14} y={24} textAnchor="end">{meta.label}</text>
                    <text className="g-title" x={14} y={49}>{claim.title.length > 28 ? `${claim.title.slice(0, 27)}…` : claim.title}</text>
                    {claim.id === objective && <circle className="g-target" cx={W - 12} cy={H - 12} r={4.5} />}
                  </g>
                )
              })}
            </svg>
          )}
        </div>
      </div>
      <aside className="graph-side">
        {current ? (
          <div className="graph-detail view-enter">
            <div className="graph-detail-head"><span className="kbd">{current.id}</span><StatusPill status={current.status} /></div>
            <h2>{current.title}</h2>
            <div className="statement-card small"><MathText text={current.naturalStatement} /></div>
            <Relations title={t("graph.dependsOn")} ids={edges.filter((edge) => edge.fromNodeId === current.id).map((edge) => [edge.toNodeId, edge.kind])} list={list} onPick={setSelected} empty={t("graph.noDeps")} />
            <Relations title={t("graph.usedBy")} ids={edges.filter((edge) => edge.toNodeId === current.id).map((edge) => [edge.fromNodeId, edge.kind])} list={list} onPick={setSelected} empty={t("graph.noDependents")} />
            <div className="wf-actions">
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
      {linking && <LinkSheet claims={list} initialFrom={selected} onClose={() => setLinking(false)} onDone={() => { setLinking(false); invalidate(graphKey(root)) }} />}
    </div>
  )
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

function LinkSheet({ claims, initialFrom, onClose, onDone }: { claims: Claim[]; initialFrom: string | null; onClose: () => void; onDone: () => void }) {
  const app = useApp()
  const { t, lang } = useT()
  const [from, setFrom] = useState(initialFrom ?? claims[0]?.id ?? "")
  const [to, setTo] = useState(claims.find((claim) => claim.id !== (initialFrom ?? claims[0]?.id))?.id ?? "")
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
