# Prover adapter contract

Adapters declare a version, executable, supported problem kinds, timeout, sandbox requirement, network policy, and output schema. Inputs use argv/request files in a temporary root; host secrets, home directories, and implicit network are unavailable. Unknown fields are diagnostic only and malformed output fails closed.

An adapter returns candidates, witnesses, certificates, diagnostics, and hashes. Adapter success is not proof. Only local replay through VerificationGate can assign `KERNEL_VERIFIED`; unavailable tools remain BLOCKED.

See [solver trust](SOLVER_TRUST_MODEL.md) and [security model](SECURITY_MODEL_V1.md).
