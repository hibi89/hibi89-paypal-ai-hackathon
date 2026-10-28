import { startOfflineDemo } from '../src/offline_demo_server.mjs';
import { writeFileSync, unlinkSync } from 'node:fs';
const tokenFile=process.env.PAYPAL_BROWSER_TEST_TOKEN_FILE;
const server=await startOfflineDemo({testReviewSessions:Boolean(tokenFile),
  enableSyntheticReviewer:true});
if(tokenFile)writeFileSync(tokenFile,server.testReviewerCookie,{mode:0o600,flag:'wx'});
console.log('OFFLINE DEMO ONLY — no AI or PayPal: '+server.url);
console.log('Loopback only. Press Ctrl+C to stop.');
const clean=async()=>{if(tokenFile){try{unlinkSync(tokenFile);}catch{}}await server.close();process.exit(0);};
process.once('SIGINT',clean);
process.once('SIGTERM',clean);
