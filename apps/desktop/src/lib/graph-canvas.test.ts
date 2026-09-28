import { expect, test } from "bun:test"
import { fitGraph, mergePositions, placeColumns, portOffsets, roundedPath, routeEdge, screenToWorld, snap, snapNode, zoomAt } from "./graph-canvas.ts"

test("graph view fits the actual moved nodes and zoom keeps the point under the cursor", () => {
  const points = new Map([["A", { x: -380, y: 80 }], ["B", { x: 640, y: 440 }]])
  const fitted = fitGraph(points, { width: 800, height: 500 }, { width: 216, height: 70 })
  for (const point of points.values()) {
    const screen = { x: fitted.x + point.x * fitted.zoom, y: fitted.y + point.y * fitted.zoom }
    expect(screen.x).toBeGreaterThanOrEqual(0)
    expect(screen.x + 216 * fitted.zoom).toBeLessThanOrEqual(800)
    expect(screen.y).toBeGreaterThanOrEqual(0)
    expect(screen.y + 70 * fitted.zoom).toBeLessThanOrEqual(500)
  }
  const cursor = { x: 245, y: 190 }
  const before = screenToWorld(cursor, fitted), after = screenToWorld(cursor, zoomAt(fitted, cursor, fitted.zoom * 1.7))
  expect(after.x).toBeCloseTo(before.x)
  expect(after.y).toBeCloseTo(before.y)
  const wide = fitGraph(new Map([["first", { x: 0, y: 0 }], ["last", { x: 20_000, y: 0 }]]), { width: 800, height: 500 }, { width: 216, height: 70 })
  expect(wide.x + (20_000 + 216) * wide.zoom).toBeLessThanOrEqual(800)
})

test("saved positions ignore removed nodes and malformed values", () => {
  const defaults = new Map([["A", { x: 10, y: 20 }], ["B", { x: 30, y: 40 }]])
  const positions = mergePositions(defaults, { A: { x: -150, y: 60 }, B: { x: Infinity, y: 8 }, C: { x: 9, y: 9 } })
  expect([...positions.entries()]).toEqual([["A", { x: -150, y: 60 }], ["B", { x: 30, y: 40 }]])
})

test("links run straight between level ports and step once otherwise, with corners that fit", () => {
  expect(routeEdge({ x: 0, y: 40 }, { x: 200, y: 40 }).path).toBe("M0,40 L200,40")
  const step = routeEdge({ x: 0, y: 40 }, { x: 200, y: 140 })
  expect(step.points).toEqual([{ x: 0, y: 40 }, { x: 100, y: 40 }, { x: 100, y: 140 }, { x: 200, y: 140 }])
  expect(step.handle).toEqual({ x: 100, y: 90 })
  expect(step.label).toEqual({ x: 50, y: 40 })
  expect(routeEdge({ x: 0, y: 0 }, { x: 400, y: 30 }, { x: 150, y: 0 }).label).toEqual({ x: 175, y: 0 })
  expect(step.path).toStartWith("M0,40 L90,40 Q100,40 100,50")
  // A bend moves the vertical step but never into the cards' own margin.
  expect(routeEdge({ x: 0, y: 0 }, { x: 200, y: 50 }, { x: 500, y: 0 }).handle.x).toBe(176)
  // A target on the left is reached around the cards, below both ports.
  const back = routeEdge({ x: 300, y: 40 }, { x: 0, y: 40 }, { x: 0, y: 0 }, 60)
  expect(back.points.map(point => point.y)).toEqual([40, 40, 100, 100, 40, 40])
  expect(roundedPath([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 100 }])).toBe("M0,0 L2,0 Q4,0 4,2 L4,100")
})

test("cards snap to the grid or to a linked card's row, and ports spread along a side", () => {
  expect(snapNode({ x: 17, y: 29 }, [])).toEqual({ x: 12, y: 24 })
  expect(snapNode({ x: 17, y: 29 }, [33, 80])).toEqual({ x: 12, y: 33 })
  expect(snap(-7)).toBe(-12)
  expect(portOffsets(1, 72)).toEqual([36])
  expect(portOffsets(3, 72)).toEqual([22, 36, 50])
  const many = portOffsets(9, 72)
  expect(Math.min(...many)).toBeGreaterThanOrEqual(16)
  expect(Math.max(...many)).toBeLessThanOrEqual(56)
})

test("a card with one dependency sits level with it; cards never overlap in a column", () => {
  const deps = new Map([["A", []], ["B", []], ["C", ["A"]], ["D", ["A", "B"]], ["E", []]])
  const placed = placeColumns([["A", "B"], ["C", "D", "E"]], deps, 96, 312, 24)
  expect(placed.get("C")!.y).toBe(placed.get("A")!.y)
  expect(placed.get("A")!.y).toBe(24)
  const column = ["C", "D", "E"].map((id) => placed.get(id)!.y).sort((a, b) => a - b)
  for (let index = 1; index < column.length; index++) expect(column[index]! - column[index - 1]!).toBeGreaterThanOrEqual(96)
  expect(placed.get("D")!.x).toBe(336)
})
