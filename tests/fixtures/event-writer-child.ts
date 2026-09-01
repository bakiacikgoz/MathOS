import { MathOS } from "@mathos/core"

const [root, rawCount] = process.argv.slice(2)
const app = MathOS.open(root!)
for (let index = 0; index < Number(rawCount); index += 1) {
  app.createClaim({ kind: "lemma", title: `Concurrent ${index}`, naturalStatement: String(index) })
}
app.close()
