# Quickstart

```sh
mathos init --name research
cd research
mathos setup status
mathos doctor --json
mathos claim create --type conjecture --title "Objective" --statement "State the objective precisely."
mathos objective set C-001
mathos status --json
mathos workspace inspect --json
```

Use `mathos formalize C-001`, review fidelity, then `mathos prove C-001`. Missing Lean or model capabilities remain blocked while the workspace stays usable. `mathos atlas --no-open` starts the read-only graph; Ctrl+C stops it.
