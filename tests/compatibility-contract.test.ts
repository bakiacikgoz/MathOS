import { describe, expect, test } from "bun:test"
import { assertMathOSCompatibility, compatibilityMatrix } from "@mathos/shared"

describe("MathOS compatibility contract",()=>{
  test("accepts current and older supported workspace while preserving independent formats",()=>{
    expect(assertMathOSCompatibility({workspaceSchemaVersion:29,bridgeProtocolVersion:1,pluginApiVersion:1,capsuleFormatVersion:1,publicationFormatVersion:1}).compatible).toBe(true)
    expect(compatibilityMatrix()).toEqual({workspaceSchemaVersion:30,minimumWorkspaceSchemaVersion:16,bridgeProtocolVersion:1,pluginApiVersion:1,capsuleFormatVersion:1,publicationFormatVersion:1})
  })
  for(const [field,code] of [
    ["workspaceSchemaVersion","WORKSPACE_SCHEMA_TOO_NEW"],["bridgeProtocolVersion","BRIDGE_PROTOCOL_UNSUPPORTED"],
    ["pluginApiVersion","PLUGIN_API_UNSUPPORTED"],["capsuleFormatVersion","CAPSULE_FORMAT_UNSUPPORTED"],["publicationFormatVersion","PUBLICATION_FORMAT_UNSUPPORTED"],
  ] as const)test(`rejects newer ${field} before use`,()=>{
    expect(()=>assertMathOSCompatibility({workspaceSchemaVersion:30,bridgeProtocolVersion:1,pluginApiVersion:1,capsuleFormatVersion:1,publicationFormatVersion:1,[field]:31})).toThrow(code)
  })
})
