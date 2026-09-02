export interface ExtensionSubscription { dispose(): void }
export interface ExtensionContextLike { subscriptions: ExtensionSubscription[] }
export { BridgeClient } from "./bridge-client.ts"
export { buildClaimTree } from "./claim-tree.ts"

export function activate(context: ExtensionContextLike): { authority: "BRIDGE_ONLY" } {
  const session = Object.freeze({ authority: "BRIDGE_ONLY" as const })
  context.subscriptions.push({ dispose() {} })
  return session
}

export function deactivate(): void {}
