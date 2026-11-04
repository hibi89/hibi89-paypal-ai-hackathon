// No network, no db writes, no credentials echoed, no remote payments.
import {join} from 'node:path';
import {homedir} from 'node:os';
import {inspectOwnerMvpLocalState,inspectOwnerMvpConfig}
  from '../src/owner_mvp_local_status.mjs';
const directory=join(homedir(),'.paypal-ai-mvp-private');
const local=inspectOwnerMvpLocalState({directory});
const config=inspectOwnerMvpConfig({env:process.env});
process.stdout.write(JSON.stringify({
  status:local.status,local,config,
  realPaymentVerifiedByThisCommand:false,
  realGeminiVerifiedByThisCommand:false,
  next:'If local state was used, inspect it before retrying; never delete DB or replay payment POST.'
})+'\n');
