// Local-only callback smoke server. Never starts external APIs or payment.
import {argv,env,stderr,stdout} from 'node:process';
import {startOwnerMvpCallbackLanding} from '../src/owner_mvp_callback_landing.mjs';
const start=argv.slice(2).join(' ')==='--serve-loopback-only'&&
  typeof env.PAYPAL_PILOT_PUBLIC_ORIGIN==='string';
if(!start){
 stdout.write(JSON.stringify({status:'CALLBACK_NOT_STARTED',
   providerCalls:0,paymentPosts:0})+'\n');
 process.exitCode=2;
}else{
 try{
  const port=Number(env.PAYPAL_PILOT_CALLBACK_PORT??8787);
  const landing=await startOwnerMvpCallbackLanding({
    port,publicOrigin:env.PAYPAL_PILOT_PUBLIC_ORIGIN
  });
  stderr.write('Callback navigation-only listener '+landing.localUrl+'\n');
  stderr.write('No HTTPS ingress is created by this script.\n');
  const stop=()=>landing.close().then(()=>process.exit(0)).catch(()=>process.exit(1));
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
 }catch{
  stdout.write(JSON.stringify({status:'CALLBACK_CONFIGURATION_INVALID'})+'\n');
  process.exitCode=2;
 }
}
