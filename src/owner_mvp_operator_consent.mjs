// Owner-only prompt policy. This never calls a provider or creates a session.
// Fast mode combines read-only HTTPS probes and private local session issuance
// with preceding explicitly scoped consent. Model/PayPal POSTs stay independent.
const bad=code=>{const e=new Error(code);e.code=code;throw e;};
export function createOwnerMvpOperatorConsent({confirm,fast=false}={}){
  if(typeof confirm!=='function'||typeof fast!=='boolean')
    bad('MVP_CONSENT_CONFIGURATION_REQUIRED');
  let probeAuthorized=false,sessionAuthorized=false;
  async function authorizeTunnel(){
    const ok=await confirm('OPEN TEMP HTTPS TUNNEL',fast?
      'Publish two inert buyer-return GET pages and run two read-only HTTPS reachability probes via temporary Cloudflare tunnel. No provider calls.':
      'Publish ONLY two inert buyer-return navigation pages through Cloudflare Quick Tunnel.');
    probeAuthorized=fast&&ok;
    return ok;
  }
  async function authorizeProbe(){
    if(fast&&probeAuthorized){probeAuthorized=false;return true;}
    return confirm('PROBE OWNER HTTPS CALLBACK',
      'Send two read-only HTTPS GET probes to return/cancel URLs; no Gemini or PayPal calls.');
  }
  async function authorizeStage(action){
    if(action?.action==='GEMINI_SKILL_CLASSIFICATION_ONCE')
      return confirm('SEND SYNTHETIC GEMINI','Gemini Free-tier one-shot skills classification.');
    if(action?.action==='APPROVE_SYNTHETIC_USD_1_50'){
      const ok=await confirm('APPROVE USD 1.50',
        'Approve $1.50 human-set quote for '+action.selectedProfileId+
        ', missing skills: '+(action.missingSkills?.join(', ')||'none')+
        (fast?'. Also authorize issuing a private 15-minute local checkout session. PayPal order and Capture still require separate consent.':
          '. Price is NOT AI predicted.'));
      sessionAuthorized=fast&&ok;
      return ok;
    }
    if(action?.action==='ISSUE_OWNER_SANDBOX_CHECKOUT_SESSION'){
      if(fast&&sessionAuthorized){sessionAuthorized=false;return true;}
      return confirm('ISSUE SANDBOX SESSION','Create a private 15-minute checkout proof.');
    }
    if(action?.operation==='CREATE_SANDBOX_ORDER')
      return confirm('CREATE SANDBOX ORDER','Send ONE virtual USD 1.50 Orders CREATE.');
    if(action?.operation==='CAPTURE_SANDBOX_ORDER')
      return confirm('CAPTURE SANDBOX USD 1.50',
        'Buyer must have approved in distinct Sandbox Personal account.');
    return false;
  }
  return Object.freeze({authorizeTunnel,authorizeProbe,authorizeStage,
    fast,providerPostAuthorizedByShortcut:false});
}
