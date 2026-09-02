# MathOS V1 Qualification

MathOS 1.0 ships only when every frozen hard gate in `benchmarks/v1-qualification-baseline.json` returns `PASS`. Missing and skipped hard gates fail. Model quality, live literature services, optional solvers, and additional platform evidence are conditional signals and cannot hide a hard-gate failure. The runner emits JSON and Markdown with exact revision, schema epoch, blockers, and evidence.
