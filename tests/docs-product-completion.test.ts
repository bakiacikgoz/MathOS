import { expect, test } from "bun:test"
import { runDocsSmoke } from "../scripts/docs-smoke.ts"
test("product documentation is linked, executable, honest, and secret-free",()=>{const report=runDocsSmoke();expect(report.errors).toEqual([]);expect(report.documentsChecked).toBeGreaterThanOrEqual(8);expect(report.commandsChecked).toBeGreaterThanOrEqual(6)})
