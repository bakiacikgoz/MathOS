# Professional demo: finite sum identity

This example is intentionally unverified. It demonstrates a serious, reproducible starting point without pre-populated proof evidence or fake kernel status.

```sh
mkdir finite-sum-demo && cd finite-sum-demo
mathos init --name finite-sum-demo
mathos claim create --type conjecture --title "Sum of odd numbers" --statement "For every natural n, the sum of the first n odd natural numbers equals n squared."
mathos objective set C-001
mathos status --json
mathos doctor --json
```

A real run must formalize the statement, receive human fidelity approval, and pass local Lean VerificationGate before `KERNEL_VERIFIED` is possible.
