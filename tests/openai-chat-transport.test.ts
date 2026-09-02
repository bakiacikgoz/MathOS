import { afterEach, describe, expect, test } from "bun:test"
import { ModelResponseTooLarge, OpenAIChatTransport } from "@mathos/models"

const servers:Bun.Server<unknown>[]=[];afterEach(()=>{for(const server of servers.splice(0))server.stop(true)})
function server(handler:(request:Request)=>Response|Promise<Response>){const instance=Bun.serve({port:0,fetch:handler});servers.push(instance);return `http://127.0.0.1:${instance.port}/v1`}

describe("OpenAI chat transport",()=>{
  test("sends auth, structured body and normalizes usage",async()=>{let observed:any;const baseUrl=server(async request=>{observed={authorization:request.headers.get("authorization"),path:new URL(request.url).pathname,body:await request.json()};return Response.json({id:"chat-1",choices:[{message:{content:"{\"ok\":true}"}}],usage:{prompt_tokens:7,completion_tokens:3}})});const transport=new OpenAIChatTransport({provider:"openai",model:"gpt-test",baseUrl,apiKey:"header-canary"});const result=await transport.generate({messages:[{role:"user",content:"hi"}],maxOutputTokens:128,reasoningEffort:"high",responseSchema:{name:"answer",jsonSchema:{type:"object"}}});expect(observed).toEqual(expect.objectContaining({authorization:"Bearer header-canary",path:"/v1/chat/completions"}));expect(observed.body.response_format.json_schema.name).toBe("answer");expect(observed.body.max_completion_tokens).toBe(128);expect(observed.body.reasoning_effort).toBe("high");expect(result.usage).toEqual({inputTokens:7,outputTokens:3})})
  test("limits a streamed response body",async()=>{const baseUrl=server(()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(40));controller.enqueue(new Uint8Array(40));controller.close()}})));const transport=new OpenAIChatTransport({provider:"openai",model:"gpt-test",baseUrl,apiKey:"x",maxResponseBytes:64});await expect(transport.generate({messages:[{role:"user",content:"hi"}]})).rejects.toBeInstanceOf(ModelResponseTooLarge)})
})
