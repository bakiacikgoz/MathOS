# MathOS

MathOS is a local-first operating system for serious mathematical research. It keeps claims, dependencies, formalizations, proof attempts, experiments, literature, and provenance in one durable workspace. It is not an automatic solver of open problems, and model output, computation, or citation never becomes proof.

`KERNEL_VERIFIED` means the current formal revision passed the local VerificationGate, including Lean kernel acceptance, fidelity policy, forbidden-construct checks, and axiom audit.

## Install

Download the release archive for your platform, verify it against `SHA256SUMS`, and place `mathos` on your path. The official user-scoped installer performs those checks and does not require sudo. See [installation](docs/INSTALLATION.md).

```sh
mathos --version --json
mathos help
mathos setup status
```

## Ten-minute start

```sh
mkdir prime-gap-research && cd prime-gap-research
mathos init --name prime-gap-research
mathos doctor --json
mathos workspace inspect --json
mathos claim create --type conjecture --title "Bounded prime gaps" --statement "There are infinitely many bounded gaps between consecutive primes."
mathos claims --json
mathos atlas --no-open
```

Atlas remains read-only. Stop its local loopback server with Ctrl+C. Continue with the [quickstart](docs/QUICKSTART.md) or inspect the [professional demo](examples/professional-demo/README.md).

## Model providers

List the provider catalog, configure a named profile, and assign it as the default without putting credentials on the command line:

```sh
mathos provider catalog
mathos provider configure openai-codex-chatgpt --profile codex-personal
mathos provider login codex-personal
mathos provider use codex-personal
```

API credentials go through `mathos secrets set <secret-ref>`. Local Ollama, LM Studio, and llama.cpp profiles remain on loopback. Subscription plans and PAYG APIs are distinct profiles; fallback never crosses billing or local/remote boundaries unless explicitly enabled. See [provider setup](docs/PROVIDERS.md), [provider security](docs/PROVIDER_SECURITY.md), and the [terms matrix](docs/PROVIDER_TERMS_MATRIX.md).

## Product boundaries

- Lean is the proof authority; models only propose.
- Experiments are `COMPUTATIONAL_EVIDENCE`, not proof.
- Literature is `EXTERNAL_SOURCE`, not proof.
- Formalization requires fidelity review before proof promotion.
- Plugins run out of process and have no verification authority.
- Missing external capabilities remain visibly blocked.

## Documentation

[Features](docs/FEATURES.md) · [providers](docs/PROVIDERS.md) · [provider security](docs/PROVIDER_SECURITY.md) · [provider terms](docs/PROVIDER_TERMS_MATRIX.md) · [trust](docs/TRUST_MODEL_V1.md) · [operations](docs/OPERATIONS.md) · [error codes](docs/ERROR_CODES.md) · [security](docs/SECURITY_MODEL_V1.md) · [support](docs/SUPPORT.md)

Developers working from source need Bun 1.2 or newer: `bun install`, `bun run typecheck`, `bun test`, and `bun run build`.
