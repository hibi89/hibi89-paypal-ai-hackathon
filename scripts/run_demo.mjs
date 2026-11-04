// Loopback-only demo launcher. Credential mode is explicitly opt-in and never public.
import { startOfflineDemo } from '../src/offline_demo_server.mjs';
import { writeFileSync, unlinkSync } from 'node:fs';

const tokenFile=process.env.PAYPAL_BROWSER_TEST_TOKEN_FILE;
const localAccounts=process.argv.includes('--local-accounts');
const syntheticSeller=process.argv.includes('--synthetic-seller');
if(localAccounts&&tokenFile)
  throw new Error('LOCAL_CREDENTIALS_INCOMPATIBLE_WITH_SYNTHETIC_ROLE_COOKIE_FILE');
const passwordFor=name=>process.env['PAYPAL_LOCAL_'+name+'_PASSWORD'];
const localLoginPasswords=localAccounts?{
  buyer:passwordFor('BUYER'),reviewer:passwordFor('REVIEWER'),
  ...(syntheticSeller?{seller:passwordFor('SELLER')}:{})
}:null;
const server=await startOfflineDemo({testReviewSessions:Boolean(tokenFile),
  enableSyntheticReviewer:true,enableSyntheticSeller:syntheticSeller,
  localLoginPasswords});
if(tokenFile)writeFileSync(tokenFile,server.testReviewerCookie,{mode:0o600,flag:'wx'});
console.log('OFFLINE DEMO ONLY — no AI or PayPal: '+server.url);
if(localAccounts)console.log('Local credential login enabled: POST /api/demo/auth/login; no public registration.');
console.log('Loopback only. Press Ctrl+C to stop.');
const clean=async()=>{if(tokenFile){try{unlinkSync(tokenFile);}catch{}}
  await server.close();process.exit(0);};
process.once('SIGINT',clean);
process.once('SIGTERM',clean);
