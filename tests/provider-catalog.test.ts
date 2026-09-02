import { expect, test } from "bun:test"
import { PROVIDER_DESCRIPTOR_IDS, providerCatalog, validateProviderCatalog } from "@mathos/models"

test("provider catalog contains every required unique descriptor", () => {
  const descriptors=providerCatalog.list(); expect(descriptors.map(item=>item.id)).toEqual([...PROVIDER_DESCRIPTOR_IDS].sort()); expect(new Set(descriptors.map(item=>item.id)).size).toBe(descriptors.length); expect(validateProviderCatalog(descriptors)).toBe(true)
})
test("descriptor validation rejects unsafe endpoints and overridable prohibitions", () => {
  const base=providerCatalog.get("openai-api")!; expect(()=>validateProviderCatalog([{...base,endpointPresets:[{id:"bad",baseUrl:"http://api.example.test",protocol:"openai"}]}])).toThrow("PROVIDER_ENDPOINT_UNSAFE")
  const prohibited=providerCatalog.get("google-antigravity-consumer")!; expect(()=>validateProviderCatalog([{...prohibited,terms:{...prohibited.terms,userOverrideAllowed:true}}])).toThrow("PROVIDER_POLICY_OVERRIDE_FORBIDDEN")
})
