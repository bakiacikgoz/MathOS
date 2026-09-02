# MathOS pilot

The maintained v1 workflow and feedback form are in [Professional pilot](PROFESSIONAL_PILOT.md).

Alpha. You will hit missing optional tools. That is expected.

## Flow

1. `bun install` then `bun link` (or `bun run mathos`)
2. `mathos --version`
3. `mathos doctor` — Lean/Python/model may be WARN
4. `mathos init my-research && cd my-research`
5. Create an objective (`/claim` or `mathos claim create ...` then `mathos objective set …`)
6. Formalize / research (`/formalize`, `/research`)
7. `/graph`
8. `mathos report --format md`
9. `mathos backup --out ../backups`

## Feedback

- Where were you confused?
- What command/view was hard to discover?
- What failed?
- What did you expect MathOS to do?
- Would you trust the verification state?
- How much time was saved?
- Did any view create false confidence?
- Which mathematical workflow is missing?

Do not treat KERNEL_VERIFIED as anything except VerificationGate.
