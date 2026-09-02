import{discoverLocalEngines}from"../../packages/models/src/providers/local-openai.ts";console.log(JSON.stringify(await discoverLocalEngines({timeoutMs:500}),null,2))
