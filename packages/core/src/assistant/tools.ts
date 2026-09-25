// What the assistant may do in a workspace. Every tool is an existing MathOS command, so privacy, consent, model
// routing and the trust rules apply exactly as they do everywhere else. Reading runs at once; anything that changes
// the workspace or reaches outside it waits for the user's approval. Nothing here can approve a meaning (a human
// decision) or mark a claim verified (only the Lean kernel through VerificationGate can).

export type AssistantToolKind = "read" | "action" | "document"
export interface AssistantTool {
  name: string
  kind: AssistantToolKind
  description: string
  args: string
  argv?(args: Record<string, unknown>): string[]
  title(args: Record<string, unknown>): string
  summarize?(stdout: string): string
}

const CLAIM_ID = /^[A-Z]{1,4}-\d{1,6}$/
const KINDS = ["conjecture", "lemma", "theorem", "corollary", "definition"]
const LIMIT = 6_000

export class AssistantToolError extends Error { constructor(message: string) { super(`ASSISTANT_TOOL_ARGS_INVALID: ${message}`) } }
const claimId = (args: Record<string, unknown>, key = "id") => { const value = String(args[key] ?? "").trim().toUpperCase(); if (!CLAIM_ID.test(value)) throw new AssistantToolError(`${key} must be a claim id like C-001`); return value }
const text = (args: Record<string, unknown>, key: string, max: number, required = true) => { const value = typeof args[key] === "string" ? (args[key] as string).trim() : ""; if (required && !value) throw new AssistantToolError(`${key} is required`); if (value.length > max) throw new AssistantToolError(`${key} is longer than ${max} characters`); return value }
const clip = (value: string) => value.length > LIMIT ? `${value.slice(0, LIMIT)}\n…(truncated)` : value
const json = (stdout: string): any => { try { return JSON.parse(stdout) } catch { return null } }

export const ASSISTANT_TOOLS: AssistantTool[] = [
  { name: "workspace_status", kind: "read", description: "Objective, claim counts, blockers, branch and environment of this workspace.", args: "{}", argv: () => ["status", "--json"], title: () => "Workspace status", summarize: (out) => clip(json(out)?.text ?? out) },
  {
    name: "list_claims", kind: "read", description: "All claims with id, kind, status and title.", args: "{}", argv: () => ["claims", "--json"], title: () => "List claims",
    summarize: (out) => { const rows = json(out); return Array.isArray(rows) ? clip(rows.map((row: any) => `${row.id} [${row.kind}, ${row.status}] ${row.title} — ${row.naturalStatement}`).join("\n") || "(no claims)") : clip(out) },
  },
  {
    name: "show_claim", kind: "read", description: "One claim in full: statement, current Lean statement, meaning review, approval, proofs and verification.", args: '{"id":"C-001"}', argv: (args) => ["claim", "show", claimId(args), "--json"], title: (args) => `Read ${String(args.id ?? "")}`,
    summarize: (out) => { const value = json(out); if (!value) return clip(out); const { claim, workflow } = value; return clip(JSON.stringify({ claim: claim && { id: claim.id, kind: claim.kind, title: claim.title, statement: claim.naturalStatement, status: claim.status }, workflow: workflow && { next: workflow.next, lean: workflow.formal?.statement ?? null, leanBy: workflow.formal?.createdBy ?? null, approved: workflow.approved, review: workflow.alignment ? { verdict: workflow.alignment.verdict, status: workflow.alignment.status, reading: workflow.alignment.backTranslation, findings: workflow.alignment.findings } : null, proofs: workflow.proofs, acceptedProof: workflow.acceptedProof?.source ?? null, verified: workflow.verified, verification: workflow.verification } }, null, 1)) },
  },
  { name: "lean_status", kind: "read", description: "Whether Lean and Mathlib are installed for this workspace.", args: "{}", argv: () => ["lean", "status"], title: () => "Check Lean", summarize: (out) => clip(out) },
  { name: "search_mathlib", kind: "read", description: "Search Mathlib and workspace theorems (premise search) by words or a goal.", args: '{"query":"Finset sum odd"}', argv: (args) => ["search-theorem", text(args, "query", 300), "--json"], title: (args) => `Search Mathlib: ${String(args.query ?? "")}`, summarize: (out) => { const value = json(out); return clip(value ? JSON.stringify({ mode: value.mode, warning: value.warning, candidates: (value.candidates ?? []).slice(0, 12) }, null, 1) : out) } },
  { name: "research_graph", kind: "read", description: "The dependency graph of claims (what depends on what, blockers).", args: "{}", argv: () => ["graph", "show", "--json"], title: () => "Read the research graph", summarize: (out) => { const value = json(out); return clip(value ? JSON.stringify({ nodes: (value.nodes ?? []).map((node: any) => ({ id: node.id, kind: node.kind, status: node.status ?? node.state, label: node.label ?? node.title })), edges: (value.edges ?? []).map((edge: any) => ({ from: edge.from ?? edge.source, to: edge.to ?? edge.target, kind: edge.kind })) }) : out) } },
  { name: "list_branches", kind: "read", description: "Research branches and which one is current.", args: "{}", argv: () => ["branch", "list", "--json"], title: () => "List branches", summarize: (out) => { const rows = json(out); return Array.isArray(rows) ? clip(rows.map((row: any) => `${row.id} ${row.name}${row.isCurrent ? " (current)" : ""} — ${row.purpose ?? ""}`).join("\n")) : clip(out) } },

  { name: "create_claim", kind: "action", description: "Create a claim. kind is conjecture, lemma, theorem, corollary or definition; statement uses $…$ for math.", args: '{"kind":"conjecture","title":"…","statement":"…","objective":false}', argv: (args) => { const kind = String(args.kind ?? "conjecture"); if (!KINDS.includes(kind)) throw new AssistantToolError(`kind must be one of ${KINDS.join(", ")}`); return ["claim", "create", "--type", kind, "--title", text(args, "title", 200), "--statement", text(args, "statement", 8_000), ...(args.objective === true ? ["--objective"] : []), "--json"] }, title: (args) => `Create claim “${String(args.title ?? "")}”`, summarize: (out) => { const value = json(out); return value?.id ? `Created ${value.id}: ${value.title}` : clip(out) } },
  { name: "formalize", kind: "action", description: "Translate a claim into a Lean 4 statement with the formalizer model, checked by Lean. Pass lean to use a statement you wrote instead (checked by Lean, no model).", args: '{"id":"C-001","lean":"optional Lean statement"}', argv: (args) => { const lean = text(args, "lean", 8_000, false); return ["formalize", claimId(args), ...(lean ? ["--lean", lean] : []), "--json"] }, title: (args) => args.lean ? `Set the Lean statement of ${String(args.id ?? "")}` : `Formalize ${String(args.id ?? "")}`, summarize: (out) => clip(out) },
  { name: "compare_meaning", kind: "action", description: "Compare the claim's natural statement with its Lean statement using the alignment model. Only the user can then approve that the meanings match.", args: '{"id":"C-001"}', argv: (args) => ["align", "run", claimId(args), "--json"], title: (args) => `Compare meanings of ${String(args.id ?? "")}`, summarize: (out) => clip(out) },
  { name: "prove", kind: "action", description: "Search for a Lean proof with the prover model (needs the user's meaning approval first).", args: '{"id":"C-001"}', argv: (args) => ["prove", claimId(args), "--json"], title: (args) => `Prove ${String(args.id ?? "")}`, summarize: (out) => clip(out) },
  { name: "verify", kind: "action", description: "Run VerificationGate: the Lean kernel checks the accepted proof. The only way a claim becomes verified.", args: '{"id":"C-001"}', argv: (args) => ["verify", claimId(args), "--json"], title: (args) => `Verify ${String(args.id ?? "")}`, summarize: (out) => clip(out) },
  { name: "set_objective", kind: "action", description: "Make a claim the workspace's main objective.", args: '{"id":"C-001"}', argv: (args) => ["objective", "set", claimId(args)], title: (args) => `Make ${String(args.id ?? "")} the objective`, summarize: (out) => clip(out) },
  { name: "create_branch", kind: "action", description: "Start a research branch to explore an alternative without touching the main line.", args: '{"name":"…"}', argv: (args) => ["branch", "create", text(args, "name", 120)], title: (args) => `Create branch “${String(args.name ?? "")}”`, summarize: (out) => clip(out) },
  { name: "search_literature", kind: "action", description: "Search published literature (arXiv and other sources) and record the results in the workspace.", args: '{"query":"…"}', argv: (args) => ["literature", "search", text(args, "query", 300), "--json"], title: (args) => `Search literature: ${String(args.query ?? "")}`, summarize: (out) => { const value = json(out); return clip(value ? JSON.stringify({ state: value.search?.state ?? value.state, results: (value.results ?? value.search?.results ?? []).slice(0, 10).map((row: any) => ({ title: row.title, authors: row.authors, year: row.year, id: row.externalId ?? row.id, url: row.url })) }) : out) } },

  { name: "create_document", kind: "document", description: "Write a document the user can download as PDF, Word, Markdown or LaTeX (format markdown or latex), or a table they can download as Excel or CSV (format table with rows). Use it for reports, notes, summaries, exercise sheets and tables.", args: '{"title":"…","format":"markdown","content":"# …"} or {"title":"…","format":"table","rows":[["Header","…"],["…","…"]]}', title: (args) => `Document “${String(args.title ?? "")}”` },
]

export const assistantTool = (name: string) => ASSISTANT_TOOLS.find((tool) => tool.name === name)
