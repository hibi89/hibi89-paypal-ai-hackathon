// User-only, no new external requests or payment attempts.
// Keep local private files on this device and print only minimal safe metadata.
import {join} from 'node:path';
import {homedir} from 'node:os';
import {inspectOwnerMvpReceipt} from '../src/owner_mvp_receipt.mjs';
if(process.argv.length!==2){
  process.stdout.write(JSON.stringify({status:'RECEIPT_READ_ONLY_NO_FLAGS',
    networkRequests:0,paymentPosts:0})+'\n');
  process.exitCode=2;
}else{
  const report=inspectOwnerMvpReceipt({
    directory:join(homedir(),'.paypal-ai-mvp-private')
  });
  process.stdout.write(JSON.stringify(report)+'\n');
  if(report.status!=='LOCAL_PROVIDER_RESULT_RECORDED_NOT_FRESH_GET')
    process.exitCode=2;
}
