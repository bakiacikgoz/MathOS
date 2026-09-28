export interface Point { x: number; y: number }
export interface Viewport extends Point { zoom: number }
export interface Size { width: number; height: number }

export const MIN_ZOOM = 0.02
export const MAX_ZOOM = 2.4
export const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))

export function screenToWorld(screen: Point, view: Viewport): Point {
  return { x: (screen.x - view.x) / view.zoom, y: (screen.y - view.y) / view.zoom }
}

export function zoomAt(view: Viewport, cursor: Point, nextZoom: number): Viewport {
  const world = screenToWorld(cursor, view), zoom = clampZoom(nextZoom)
  return { x: cursor.x - world.x * zoom, y: cursor.y - world.y * zoom, zoom }
}

export function fitGraph(points: Map<string, Point>, canvas: Size, card: Size): Viewport {
  if (!points.size || !canvas.width || !canvas.height) return { x: 0, y: 0, zoom: 1 }
  const values = [...points.values()]
  const left = Math.min(...values.map(point => point.x))
  const top = Math.min(...values.map(point => point.y))
  const right = Math.max(...values.map(point => point.x + card.width))
  const bottom = Math.max(...values.map(point => point.y + card.height))
  const margin = 48
  const zoom = clampZoom(Math.min(1.2, (canvas.width - margin * 2) / (right - left), (canvas.height - margin * 2) / (bottom - top)))
  return { zoom, x: (canvas.width - (right - left) * zoom) / 2 - left * zoom, y: (canvas.height - (bottom - top) * zoom) / 2 - top * zoom }
}

export function mergePositions(defaults: Map<string, Point>, saved: Record<string, Point> | null | undefined): Map<string, Point> {
  const result = new Map<string, Point>()
  for (const [id, point] of defaults) {
    const stored = saved?.[id]
    result.set(id, stored && Number.isFinite(stored.x) && Number.isFinite(stored.y) ? { x: stored.x, y: stored.y } : point)
  }
  return result
}

/** Nodes land on this grid, so cards line up and links between neighbours run straight. */
export const GRID = 12
export const snap = (value: number, grid = GRID) => Math.round(value / grid) * grid

/** Snaps a dragged card to the grid, or to the row of a linked card when it comes close, so the link runs straight. */
export function snapNode(point: Point, alignWith: number[], reach = 10): Point {
  const near = alignWith.reduce<number | null>((best, y) => Math.abs(y - point.y) <= reach && (best === null || Math.abs(y - point.y) < Math.abs(best - point.y)) ? y : best, null)
  return { x: snap(point.x), y: near ?? snap(point.y) }
}

/** A polyline with rounded corners; each corner's radius shrinks to fit short segments. */
export function roundedPath(points: Point[], radius = 10): string {
  const clean = points.filter((point, index) => index === 0 || Math.hypot(point.x - points[index - 1]!.x, point.y - points[index - 1]!.y) > 0.01)
  if (clean.length < 2) return ""
  let path = `M${clean[0]!.x},${clean[0]!.y}`
  for (let index = 1; index < clean.length - 1; index++) {
    const before = clean[index - 1]!, corner = clean[index]!, after = clean[index + 1]!
    const into = Math.hypot(corner.x - before.x, corner.y - before.y), out = Math.hypot(after.x - corner.x, after.y - corner.y)
    const r = Math.min(radius, into / 2, out / 2)
    const a = { x: corner.x - ((corner.x - before.x) / into) * r, y: corner.y - ((corner.y - before.y) / into) * r }
    const b = { x: corner.x + ((after.x - corner.x) / out) * r, y: corner.y + ((after.y - corner.y) / out) * r }
    path += ` L${a.x},${a.y} Q${corner.x},${corner.y} ${b.x},${b.y}`
  }
  const last = clean[clean.length - 1]!
  return `${path} L${last.x},${last.y}`
}

/**
 * An orthogonal link from a card's right side (`from`) to another card's left side (`to`): straight when the two
 * ports are level, one vertical step otherwise, and around the cards when the target sits to the left. `bend`
 * moves the vertical step (or the detour row); `clearance` is how far a detour stays below the lower port. The label
 * sits in the middle of the longest run, where it has the most room; the handle sits on the part a bend moves.
 */
export function routeEdge(from: Point, to: Point, bend: Point = { x: 0, y: 0 }, clearance = 60, gap = 24): { path: string; label: Point; handle: Point; points: Point[] } {
  if (to.x - from.x >= gap * 2) {
    const mid = Math.min(to.x - gap, Math.max(from.x + gap, (from.x + to.x) / 2 + bend.x))
    if (Math.abs(from.y - to.y) < 0.5) { const centre = { x: (from.x + to.x) / 2, y: from.y }; return { path: roundedPath([from, to]), label: centre, handle: centre, points: [from, to] } }
    const points = [from, { x: mid, y: from.y }, { x: mid, y: to.y }, to]
    return { path: roundedPath(points), label: longestRunMiddle(points), handle: { x: mid, y: (from.y + to.y) / 2 }, points }
  }
  const out = from.x + gap + Math.max(0, bend.x), back = to.x - gap + Math.min(0, bend.x)
  const row = Math.max(from.y, to.y) + clearance + bend.y
  const points = [from, { x: out, y: from.y }, { x: out, y: row }, { x: back, y: row }, { x: back, y: to.y }, to]
  const handle = { x: (out + back) / 2, y: row }
  return { path: roundedPath(points), label: handle, handle, points }
}

function longestRunMiddle(points: Point[]): Point {
  let best = { length: -1, at: points[0]! }
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]!, b = points[index]!, length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length > best.length) best = { length, at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
  }
  return best.at
}

/**
 * Card positions by column: the first column stacked around the middle, every later card at the average row of what
 * it relies on (a card with one dependency sits level with it, so their link runs straight), pushed down just enough
 * not to overlap the card above. `rows` is the spacing between rows; the result is shifted to start at `pad`.
 */
export function placeColumns(columns: string[][], deps: Map<string, string[]>, rows: number, columnStep: number, pad: number): Map<string, Point> {
  const y = new Map<string, number>()
  columns.forEach((column, index) => {
    const wanted = column.map((id) => {
      const rowsOf = (deps.get(id) ?? []).map((dep) => y.get(dep)).filter((value): value is number => value !== undefined)
      return { id, at: index === 0 || !rowsOf.length ? null : rowsOf.reduce((sum, value) => sum + value, 0) / rowsOf.length }
    })
    const anchored = wanted.filter((row) => row.at !== null).sort((a, b) => a.at! - b.at!)
    const loose = wanted.filter((row) => row.at === null)
    let next = -Infinity
    for (const row of anchored) { const at = Math.max(snap(row.at!, rows / 4), next); y.set(row.id, at); next = at + rows }
    // Pushing down to avoid overlaps drifts a crowded column downwards; a column more than a row off is centred back
    // on the rows it wanted (a small drift is kept, so lightly filled columns keep their straight links).
    const drift = snap(anchored.reduce((sum, row) => sum + y.get(row.id)! - row.at!, 0) / (anchored.length || 1), rows / 4)
    if (drift > rows) { for (const row of anchored) y.set(row.id, y.get(row.id)! - drift); next -= drift }
    // Cards without a placed dependency continue below the column (or, in the first column, stack around 0).
    let start = anchored.length ? next : -((loose.length - 1) * rows) / 2
    for (const row of loose) { y.set(row.id, snap(start, rows / 4)); start += rows }
  })
  const top = Math.min(0, ...y.values())
  const result = new Map<string, Point>()
  columns.forEach((column, index) => column.forEach((id) => result.set(id, { x: pad + index * columnStep, y: pad + y.get(id)! - top })))
  return result
}

/** Where each of `count` links meets a side of a card of height `height`: spread around the middle, never at the corners. */
export function portOffsets(count: number, height: number, inset = 16): number[] {
  if (count <= 1) return [height / 2]
  const step = Math.min(14, (height - inset * 2) / (count - 1))
  return Array.from({ length: count }, (_, index) => height / 2 + (index - (count - 1) / 2) * step)
}
