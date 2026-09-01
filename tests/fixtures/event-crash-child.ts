import { MathOS } from "@mathos/core"
import type { EventProjectionPoint } from "@mathos/events"
const [root, crashPoint] = process.argv.slice(2) as [string, EventProjectionPoint]
const app = MathOS.open(root, {
  eventProjectionHook: (point, event) => {
    if (point === crashPoint && event.action === "claim_created") process.exit(77)
  },
})
app.createClaim({ kind: "lemma", title: `Crash ${crashPoint}`, naturalStatement: "x" })
app.close()
