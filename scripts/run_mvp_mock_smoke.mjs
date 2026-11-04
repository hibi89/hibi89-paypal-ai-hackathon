// Self-contained, one-command demonstration of the actual MVP orchestrator.
// Synthetic provider responses ONLY; NEVER touch real credentials or network.
import {runOfflineOperatorMvpSmoke} from '../src/offline_operator_mvp_smoke.mjs';
try{
  const result=await runOfflineOperatorMvpSmoke();
  process.stdout.write(JSON.stringify(result)+'\n');
}catch{
  process.stdout.write(JSON.stringify({status:'MOCK_MVP_E2E_FAIL',
    realProviderCalls:0,paymentVerified:false})+'\n');
  process.exitCode=1;
}
