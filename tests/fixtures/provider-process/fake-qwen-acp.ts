export{};const send=(m:unknown)=>console.log(JSON.stringify({jsonrpc:"2.0",...m as object}));let sessions=0
for await(const line of console){const m=JSON.parse(line);if(m.id===undefined||m.method===undefined)continue
 if(m.method==="initialize"){send({id:m.id,result:{protocolVersion:1,authMethods:[]}});continue}
 if(m.method==="session/new"){if(process.argv.includes("--signed-out")){send({id:m.id,error:{code:-32000,message:"Authentication required: Use Qwen Code CLI to authenticate first."}});continue}sessions++;send({id:m.id,result:{sessionId:`qwen-session-${sessions}`}});continue}
 if(m.method==="session/prompt"){const text=m.params.prompt[0].text;send({method:"session/update",params:{sessionId:m.params.sessionId,update:{sessionUpdate:"agent_message_chunk",content:{type:"text",text:`answer from ${m.params.sessionId}`}}}});send({id:m.id,result:{stopReason:"end_turn",usage:{inputTokens:3},...(text.includes("reported")?{_meta:{upstreamProvider:"kimi"}}:{})}});continue}
 send({id:m.id,error:{code:-32601,message:"Method not found"}})}
