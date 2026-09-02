import { afterEach, describe, expect, test } from "bun:test"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { DatabaseClient, PortfolioBudgetRepository, PortfolioLeaseRepository, ProofCandidateRepository, ProofJobRepository, ProofPortfolioRepository } from "@mathos/storage"
import { ProofPortfolioService, type ProofPortfolioCrashPoint } from "../packages/core/src/services/proof-portfolio-service.ts"

const clients: DatabaseClient[] = []
const roots: string[] = []

function setup(crashAt: ProofPortfolioCrashPoint | null = null) {
  const root = join(tmpdir(), `mathos-proof-portfolio-${crypto.randomUUID()}`)
  const client = new DatabaseClient(join(root, "state.sqlite")); client.migrate(); clients.push(client); roots.push(root)
  const portfolios = new ProofPortfolioRepository(client.db), jobs = new ProofJobRepository(client.db)
  const candidates = new ProofCandidateRepository(client.db), budgets = new PortfolioBudgetRepository(client.db), leases = new PortfolioLeaseRepository(client.db)
  let sequence = 0
  const started: string[] = []
  const service = new ProofPortfolioService({
    root, portfolios, jobs, candidates, budgets, leases,
    unitOfWork: (work) => client.unitOfWork(work), now: () => "2026-09-02T10:00:00.000Z",
    nextId: (prefix) => `${prefix}-${++sequence}`,
    createWorker: async ({ jobId, gitRef, worktreePath }) => { started.push(jobId); return { branchId: gitRef, worktreePath } },
    startProcess: async ({ jobId }) => ({ processId: `process:${jobId}` }),
    crashHook: (point) => { if (point === crashAt) throw new Error(`CRASH:${point}`) },
  })
  return { service, client, portfolios, jobs, candidates, budgets, leases, started }
}

afterEach(() => { while (clients.length) clients.pop()!.close() })

const request = {
  id: "PF-1", claimId: "C-1", formalStatementId: "F-1", formalRevisionHash: "formal-r7",
  contextRevisionId: "context-r3", retrievalIndexRevision: "retrieval-r9", branchId: "B-000", maxWorkers: 2,
  recipes: [
    { adapterId: "lean-native", adapterVersion: "4.19", strategy: "simp", budget: 2 },
    { adapterId: "model-plan", adapterVersion: "1", strategy: "aesop", budget: 3 },
    { adapterId: "model-direct", adapterVersion: "1", strategy: "exact", budget: 5 },
  ],
} as const

describe("proof portfolio scheduler", () => {
  test("binds exact revisions, dispatches deterministically, and enforces the worker cap", async () => {
    const { service, portfolios, jobs, leases } = setup()
    const result = await service.start({ ...request, premiseMode: "RANKED" })
    expect(result.jobs.map((job) => `${job.adapterId}:${job.strategy}`)).toEqual([
      "lean-native:simp", "model-direct:exact", "model-plan:aesop",
    ])
    expect(result.runningJobs).toBe(2)
    expect(leases.activeCount("PF-1")).toBe(2)
    expect(portfolios.get("PF-1")).toEqual(expect.objectContaining({
      formalRevisionHash: "formal-r7", contextRevisionId: "context-r3", retrievalIndexRevision: "retrieval-r9",
      selectionPolicy: expect.objectContaining({ premiseMode: "RANKED" }),
    }))
    expect(jobs.list("PF-1").filter((job) => job.status === "RUNNING")).toHaveLength(2)
    await expect(service.start({ ...request, id: "PF-2", premiseMode: "RANKED" })).rejects.toThrow("ACTIVE_PROOF_PORTFOLIO_EXISTS")
  })

  test("uses an exact global premise-set binding or records ranked fallback", async () => {
    const first = setup()
    const planned = await first.service.start({
      ...request, premiseMode: "GLOBAL_SET", globalPremisePlanner: () => ({ id: "GPS-1", hash: "sha256:g", revision: "gps-r2" }),
    })
    expect(planned.portfolio.selectionPolicy).toEqual(expect.objectContaining({ premiseMode: "GLOBAL_SET", globalPremiseSetHash: "sha256:g", globalPremiseSetRevision: "gps-r2" }))

    const second = setup()
    const fallback = await second.service.start({ ...request, id: "PF-2", premiseMode: "GLOBAL_SET" })
    expect(fallback.portfolio.selectionPolicy).toEqual(expect.objectContaining({ premiseMode: "RANKED", fallbackReason: "GLOBAL_PREMISE_PLANNER_UNAVAILABLE" }))
  })

  for (const crashAt of ["after_reservation", "after_process_start", "after_candidate_write"] as const) {
    test(`reconciles ${crashAt} without duplicate charge, lease, job, or candidate`, async () => {
      const state = setup(crashAt)
      await expect(state.service.start({ ...request, premiseMode: "RANKED", candidateFactory: ({ jobId }) => ({
        id: `PC-${jobId}`, sourceArtifactId: `artifact:${jobId}`, normalizedProofHash: `proof:${jobId}`, declarationHash: "formal-r7",
      }) })).rejects.toThrow(`CRASH:${crashAt}`)
      const before = { jobs: state.jobs.list("PF-1").length, budgets: state.budgets.count("PF-1"), candidates: state.candidates.list().length }
      const reopened = new ProofPortfolioService({
        root: roots.at(-1)!, portfolios: state.portfolios, jobs: state.jobs, candidates: state.candidates, budgets: state.budgets, leases: state.leases,
        unitOfWork: (work) => state.client.unitOfWork(work), now: () => "2026-09-02T10:01:00.000Z", nextId: (prefix) => `${prefix}-reopen`,
        createWorker: async ({ gitRef, worktreePath }) => ({ branchId: gitRef, worktreePath }), startProcess: async ({ jobId }) => ({ processId: `process:${jobId}` }),
      })
      await reopened.reconcile("PF-1")
      expect(state.jobs.list("PF-1")).toHaveLength(before.jobs)
      expect(state.budgets.count("PF-1")).toBe(before.budgets)
      expect(state.candidates.list()).toHaveLength(before.candidates)
      expect(new Set(state.jobs.list("PF-1").map((job) => job.idempotencyKey)).size).toBe(before.jobs)
    })
  }
})
