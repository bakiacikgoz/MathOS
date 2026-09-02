import { expect, test } from "bun:test"
import { normalizeDoctorContract } from "@mathos/shared"
test("doctor v1 has stable categories and honest states",()=>{const report=normalizeDoctorContract([{name:"Lean",status:"FAIL",detail:"missing"}]);expect(report.schemaVersion).toBe("mathos.doctor.v1");expect(report.categories).toEqual(["workspace","storage","lean","models","literature","computation","plugins","distribution"]);expect(report.ready).toBe(false)})
