// Private CLI; without exact flags + interactive typed approval: strictly no API calls.
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {stdin,stderr,stdout,argv,env} from 'node:process';
import {inspectGeminiA2APilotReadiness,parseGeminiA2APilotArgs,
 runOwnerGeminiA2APilot} from '../src/owner_gemini_a2a_pilot.mjs';

const parsed=parseGeminiA2APilotArgs(argv.slice(2));
if(!parsed.valid){
 stdout.write(JSON.stringify(inspectGeminiA2APilotReadiness())+'\n');
}else if(!stdin.isTTY||!stderr.isTTY){
 stdout.write(JSON.stringify({status:'PRIVATE_TTY_REQUIRED',networkRequests:0,
  paymentState:'NOT_PAID'})+'\n');
 process.exitCode=2;
}else{
 const rl=createInterface({input:stdin,output:stderr,terminal:true});
 let confirmed=false;
 try{
  const typed=await rl.question(
   'Verify in YOUR Google AI Studio that gemini-3.5-flash-lite is available on the Free tier. '+
   'This may send up to FOUR synthetic generateContent POST requests, with NO payment. '+
   'For explicit authorization type: AUTHORIZE GEMINI A2A FOUR CALLS: ');
  confirmed=typed==='AUTHORIZE GEMINI A2A FOUR CALLS';
 }finally{rl.close();}
 const result=await runOwnerGeminiA2APilot({
  execute:true,ownerAuthorized:true,freeTierConfirmed:true,
  operatorConfirmed:confirmed,apiKey:confirmed?env.GEMINI_API_KEY:undefined,
  fetchImpl:confirmed?(...args)=>globalThis.fetch(...args):undefined,
  budgetFilename:join(homedir(),'.paypal-ai-pilot-private','gemini-a2a-one-shot.sqlite')
 });
 stdout.write(JSON.stringify(result)+'\n');
 if(!confirmed||result.status==='PROVIDER_OR_RESULT_UNKNOWN_NO_RETRY'||
    result.status==='A2A_PREVIOUS_CLAIM_NO_AUTO_RETRY')
  process.exitCode=2;
}
