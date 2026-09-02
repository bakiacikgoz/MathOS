import{evaluateProviderPolicy}from"../catalog/terms-policy.ts"
export const ANTIGRAVITY_REMEDIATION="Use Gemini API, Vertex AI, or an officially permitted Enterprise Agent Platform API."
export function googleAntigravityStatus(){const policy=evaluateProviderPolicy("google-antigravity-consumer");return{state:"TERMS_RESTRICTED" as const,allowed:false,remediation:policy.remediation??ANTIGRAVITY_REMEDIATION}}
export function createConsumerAntigravityProvider():never{throw new Error(`PROVIDER_TERMS_RESTRICTED: ${ANTIGRAVITY_REMEDIATION}`)}
