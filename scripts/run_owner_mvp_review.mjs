// Read-only private local viewer. No provider API calls or private DB writes.
import {join} from 'node:path';
import {homedir} from 'node:os';
import {inspectOwnerMvpReceipt} from '../src/owner_mvp_receipt.mjs';
import {startOwnerMvpReview} from '../src/owner_mvp_review_server.mjs';
if(process.argv.length!==2){
 console.log(JSON.stringify({status:'REVIEW_NO_ARGUMENTS',networkRequests:0,paymentPosts:0}));
 process.exitCode=2;
}else{
 const receipt=inspectOwnerMvpReceipt({directory:join(homedir(),'.paypal-ai-mvp-private')});
 const app=await startOwnerMvpReview({receipt});
 console.log('OWNER_LOCAL_REVIEW_ONLY — no PayPal/Gemini call, no private DB writes');
 console.log('Open on this computer: '+app.url);
 console.log('Press Ctrl+C to stop. Never share this URL or tunnel this server.');
 let closing=false;
 const clean=async()=>{
  if(closing)return;closing=true;
  try{await app.close()}finally{process.exit(0)}
 };
 process.on('SIGINT',clean);
 process.on('SIGTERM',clean);
}
