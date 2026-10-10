// A minimal ACP v1 agent: the answer streams as session/update notifications and a tool permission request precedes it.
export {}
const send=(message:unknown)=>console.log(JSON.stringify({jsonrpc:"2.0",...message as object}))
let pendingPrompt:{id:number;sessionId:string;received:unknown}|null=null,sessions=0
for await(const line of console){const message=JSON.parse(line)
 if(message.method===undefined){if(message.id==="perm-1"&&pendingPrompt){const{id,sessionId,received}=pendingPrompt;pendingPrompt=null;send({method:"session/update",params:{sessionId,update:{sessionUpdate:"agent_thought_chunk",content:{type:"text",text:"thinking"}}}});for(const text of["ans","wer"])send({method:"session/update",params:{sessionId,update:{sessionUpdate:"agent_message_chunk",content:{type:"text",text}}}});send({id,result:{stopReason:"end_turn",received,permission:message.result}})}continue}
 if(message.id===undefined)continue
 if(message.method==="initialize"){send({id:message.id,result:{protocolVersion:1,authMethods:[{id:"oauth-personal",name:"Log in"}],received:message.params}});continue}
 if(message.method==="authenticate"){if(typeof message.params?.methodId!=="string")send({id:message.id,error:{code:-32603,message:"Internal error"}});else send({id:message.id,result:{}});continue}
 if(message.method==="session/new"){sessions++;send({id:message.id,result:{sessionId:`session-${sessions}`,received:message.params}});continue}
 if(message.method==="session/prompt"){pendingPrompt={id:message.id,sessionId:message.params.sessionId,received:message.params};send({id:"perm-1",method:"session/request_permission",params:{sessionId:message.params.sessionId,toolCall:{toolCallId:"t1"},options:[{optionId:"allow",kind:"allow_once",name:"Allow"},{optionId:"deny",kind:"reject_once",name:"Deny"}]}});continue}
 send({id:message.id,error:{code:-32601,message:"Method not found"}})}
