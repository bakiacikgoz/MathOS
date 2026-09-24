import { runJson } from "./bridge.ts"
import { useQuery } from "./query.ts"
import type { Branch, Claim, DoctorReport, StatusProjection } from "./app.ts"

export const keys = {
  status: (root: string) => `${root}|status`,
  claims: (root: string) => `${root}|claims`,
  claim: (root: string, id: string) => `${root}|claims|${id}`,
  branches: (root: string) => `${root}|branches`,
  doctor: (root: string) => `${root}|doctor`,
}

export const useStatus = (root: string) => useQuery(keys.status(root), () => runJson<{ text: string; status: StatusProjection }>(root, ["status"]))
export const useClaims = (root: string) => useQuery(keys.claims(root), () => runJson<Claim[]>(root, ["claims"]))
export const useClaimPage = (root: string, id: string | null) => useQuery(id ? keys.claim(root, id) : null, () => runJson<{ claim: Claim; page: string }>(root, ["claim", "show", id!]))
export const useBranches = (root: string) => useQuery(keys.branches(root), () => runJson<Branch[]>(root, ["branch", "list"]))
export const useDoctor = (root: string) => useQuery(keys.doctor(root), () => runJson<DoctorReport>(root, ["doctor"], { allowNonZero: true }), 60_000)
