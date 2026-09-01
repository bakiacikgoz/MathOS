import type { Database } from "bun:sqlite"
import { VerificationFailed } from "@mathos/shared"

/** @internal VerificationService-only mutation surface, backed by persisted evidence and SQLite triggers. */
export function promoteVerifiedClaim(db: Database, claimId: string, verificationRunId: string, updatedAt: string): void {
  const result = db.query(
    `UPDATE claims SET status = 'KERNEL_VERIFIED', updated_at = ?
     WHERE id = ? AND EXISTS (
       SELECT 1
       FROM verification_runs vr
       JOIN formal_statements fs ON fs.id = vr.formal_statement_id
       JOIN proof_attempts pa ON pa.id = vr.proof_attempt_id
       WHERE vr.id = ? AND vr.claim_id = ? AND vr.result = 'KERNEL_ACCEPTED'
         AND length(trim(vr.gate_json)) > 2
         AND length(trim(vr.lean_version)) > 0 AND length(trim(vr.toolchain)) > 0
         AND vr.fidelity_status = 'HUMAN_APPROVED'
         AND fs.claim_id = ? AND fs.is_current = 1 AND fs.fidelity_status = 'HUMAN_APPROVED'
         AND pa.claim_id = ? AND pa.formal_statement_id = fs.id AND pa.status = 'KERNEL_ACCEPTED'
         AND NOT EXISTS (
           SELECT 1 FROM (
             SELECT 'current revision' AS name UNION ALL SELECT 'fidelity' UNION ALL
             SELECT 'proof compiles' UNION ALL SELECT 'forbidden constructs' UNION ALL
             SELECT 'custom axioms' UNION ALL SELECT 'Lean version' UNION ALL SELECT 'toolchain pinned'
           ) required
           WHERE NOT EXISTS (
             SELECT 1 FROM json_each(vr.gate_json) check_row
             WHERE json_extract(check_row.value, '$.name') = required.name
               AND json_extract(check_row.value, '$.status') = 'PASS'
           )
         )
     )`,
  ).run(updatedAt, claimId, verificationRunId, claimId, claimId, claimId)
  if (result.changes !== 1) {
    throw new VerificationFailed("KERNEL_VERIFIED requires persisted VerificationGate evidence.")
  }
}
