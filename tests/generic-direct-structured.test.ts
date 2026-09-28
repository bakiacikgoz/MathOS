import { describe, expect, test } from "bun:test"
import { GenericDirectProvider } from "../packages/models/src/providers/generic-direct.ts"
import { OpenAIResponsesTransport } from "../packages/models/src/transports/openai-responses.ts"

describe("generic direct structured responses", () => {
  test("parses prompted JSON when the caller did not supply a compatible strict schema", async () => {
    const bodies: any[] = []
    const provider = new GenericDirectProvider("test", "gpt-test", new OpenAIResponsesTransport({
      provider: "test", model: "gpt-test", baseUrl: "http://test.invalid/v1", apiKey: "test",
      fetch: (async (_url, init) => {
        const body = JSON.parse(String(init?.body))
        bodies.push(body)
        if (body.text?.format) return Response.json({ error: "unsupported strict schema" }, { status: 400 })
        return Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: '{"verdict":"MATCH","findings":[]}' }] }] })
      }) as typeof fetch,
    }))

    const result = await provider.generateStructured({
      schemaName: "formal_alignment",
      messages: [{ role: "user", content: "Return the alignment result as JSON." }],
      parse: (value) => value as { verdict: string; findings: unknown[] },
    })

    expect(result).toEqual({ verdict: "MATCH", findings: [] })
    expect(bodies).toHaveLength(1)
    expect(bodies[0].text).toBeUndefined()
    expect(bodies[0].input.at(-1).content).toContain("JSON")
  })

  test("keeps an explicit response schema", async () => {
    let body: any
    const provider = new GenericDirectProvider("test", "gpt-test", new OpenAIResponsesTransport({
      provider: "test", model: "gpt-test", baseUrl: "http://test.invalid/v1", apiKey: "test",
      fetch: (async (_url, init) => {
        body = JSON.parse(String(init?.body))
        return Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: '{"value":true}' }] }] })
      }) as typeof fetch,
    }))
    const schema = { name: "supported", jsonSchema: { type: "object", properties: { value: { type: "boolean" } }, required: ["value"], additionalProperties: false } }
    expect(await provider.generateStructured({ schemaName: "supported", responseSchema: schema, messages: [{ role: "user", content: "Return JSON." }], parse: value => value })).toEqual({ value: true })
    expect(body.text.format.schema).toEqual(schema.jsonSchema)
  })
})
