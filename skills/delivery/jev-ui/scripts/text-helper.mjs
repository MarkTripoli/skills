import {spawn} from 'node:child_process';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function generateText({command, goal, field, timeoutMs=Number(process.env.JEV_UI_TEXT_TIMEOUT_MS||15000), maxOutput=4096}={}) {
  if (!command) return {text:null, skipped:true, reason:'text helper not configured'};
  const configured = Array.isArray(command) ? command : [command]; const [bin,...rest]=configured;
  const prompt=`Return exactly a JSON object with only the key "text". Provide only the concise literal value to type into the observed field, not instructions, a sentence, or a restatement of the goal. Goal: ${goal}. Field context: ${JSON.stringify(field)}`;
  const deadline=Number.isFinite(timeoutMs)&&timeoutMs>0?timeoutMs:15000;
  return await new Promise(resolve => {
    const stdinMode=rest.includes('-p'); const p=spawn(bin,stdinMode?rest:[...rest,prompt],{stdio:[stdinMode?'pipe':'ignore','pipe','ignore'],detached:true}); let out=''; let settled=false; let timed=false; let timer;
    const signal=kind=>{try{if(p.pid)process.kill(-p.pid,kind)}catch{try{p.kill(kind)}catch{}}};
    const finish=result=>{if(settled)return;settled=true;clearTimeout(timer);resolve(result)};
    const cleanup=async()=>{signal('SIGTERM'); await sleep(250); signal('SIGKILL'); await sleep(25);};
    const timedOut=async()=>{if(timed||settled)return;timed=true;await cleanup();finish({text:null,rejected:true,reason:'text helper timeout'});};
    timer=setTimeout(()=>{void timedOut();},deadline); timer.unref?.();
    p.stdout.on('data',d=>{out+=d;if(out.length>maxOutput)void timedOut();});
    p.on('error',()=>finish({text:null,rejected:true,reason:'text helper failed'}));
    p.on('close',async()=>{if(settled)return;if(timed)return; await cleanup(); if(settled)return; const candidate=out.trim().replace(/^Working(?:…|\.\.\.)\s*/i,'').trim();try{const value=JSON.parse(candidate);const keys=Object.keys(value||{});if(keys.length!==1||keys[0]!=='text'||typeof value.text!=='string'||!value.text.trim()||value.text.length>1000)return finish({text:null,rejected:true,reason:'text helper returned invalid text'});finish({text:value.text});}catch{finish({text:null,rejected:true,reason:'text helper returned invalid JSON'});}});
    if(stdinMode) { p.stdin.write(prompt); p.stdin.end(); }
  });
}
