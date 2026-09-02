process.stdin.on("data",data=>{const request=JSON.parse(String(data));process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:request.id,result:{outcome:"UNKNOWN",trustClass:"UNTRUSTED"}}))})
