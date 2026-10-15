# Quickstart

```sh
mathos init --name research
cd research
mathos lean status
mathos doctor --json
mathos claim create --type conjecture --title "Objective" --statement "State the objective precisely."
mathos objective set C-001
mathos status --json
mathos workspace inspect --json
```

Use `mathos formalize C-001`, review fidelity, then `mathos prove C-001`. Missing Lean or model capabilities remain blocked while the workspace stays usable. `mathos atlas --no-open` starts the read-only graph; Ctrl+C stops it.

Once C-001 is `KERNEL_VERIFIED`, share it:

```sh
mathos capsule export C-001            # capsules/CAP-C-001-….mathos-capsule
mathos publication build C-001         # publication/C-001/article.md, .tex, .html
```

Whoever receives the capsule needs no workspace. `mathos capsule verify <file>` checks its hashes and verification record; `mathos capsule replay <file> <empty folder>` writes it there and has their Lean check the proof again. A replayed claim counts as `HISTORICAL_KERNEL_VERIFIED` until a workspace verifies it.
