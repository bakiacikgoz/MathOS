/** Internal capability for the single production KERNEL_VERIFIED promotion path. Not exported by the storage barrel. */
export const verificationAuthority: unique symbol = Symbol("MathOS.VerificationAuthority")
export type VerificationAuthority = typeof verificationAuthority
