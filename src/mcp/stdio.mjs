import readline from 'node:readline';
import { MODERN_PROTOCOL } from './protocol.mjs';

export async function serveStdio(protocol,{log=console.error}={}){
  const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity,terminal:false});
  let era='auto';
  log('living-solution-graph MCP stdio ready');
  for await (const line of rl){
    if(!line.trim())continue;
    let msg;
    try{msg=JSON.parse(line);}catch{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n');continue;}
    if(era==='auto'){
      if(msg.method==='server/discover'||msg?.params?._meta?.['io.modelcontextprotocol/protocolVersion']===MODERN_PROTOCOL)era='modern';
      else if(msg.method==='initialize')era='legacy';
    }
    const res=await protocol.handle(msg,{era});
    if(res&&msg.id!==undefined)process.stdout.write(JSON.stringify(res)+'\n');
  }
}
