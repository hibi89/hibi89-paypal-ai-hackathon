// D12 synthetic-only Fetch API for explicitly clicked scenario buttons.
// Safe only behind the loopback Host and socket guard in offline_demo_server.mjs.
import {SubscriptionDemoError} from './subscription_demo_store.mjs';
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{
  'content-type':'application/json','cache-control':'no-store',
  'x-content-type-options':'nosniff'}});
const fail=(yes,code,status=400)=>{if(yes)throw new SubscriptionDemoError(code,status)};
export function createSubscriptionDemoApi({store,resolveSession,offlineOnly=false,subscriptionId}={}){
  fail(offlineOnly!==true,'OFFLINE_SCENARIO_ONLY');
  fail(typeof resolveSession!=='function'||!store,'DEMO_CONFIG_REQUIRED');
  const actions=new Set(['start','fail','recover','cancel']);
  return async function handler(request){
    try{
      const url=new URL(request.url);
      const root='/api/demo/subscription';
      const path=url.pathname;
      const isRead=path===root&&request.method==='GET';
      const parts=path.startsWith(root+'/actions/')?
        path.slice((root+'/actions/').length).split('/'):null;
      const action=parts?.length===1&&actions.has(parts[0])?parts[0]:null;
      if(!isRead&&!action)return reply(404,{error:'NOT_FOUND'});
      if(action&&request.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
      const s=await resolveSession(request);
      fail(!s||s.verified!==true||typeof s.actorId!=='string'||
        typeof s.merchantId!=='string','UNAUTHENTICATED_DEMO',401);
      const identity={subscriptionId,actorId:s.actorId,merchantId:s.merchantId};
      if(isRead)return reply(200,{subscription:store.get(identity),mode:'OFFLINE_SCENARIO_NO_PROVIDER'});
      const origin=request.headers.get('origin');
      fail(origin!==null&&origin!==url.origin,'ORIGIN_FORBIDDEN',403);
      fail(request.headers.get('x-csrf-token')!==s.csrfToken,'CSRF_REQUIRED',403);
      fail(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')||''),
        'CONTENT_TYPE_REQUIRED',415);
      const declared=request.headers.get('content-length');
      fail(declared!==null&&(!/^\d{1,5}$/.test(declared)||Number(declared)>2048),
        'BODY_TOO_LARGE',413);
      const bytes=Buffer.from(await request.arrayBuffer());
      fail(bytes.length>2048,'BODY_TOO_LARGE',413);
      let data;try{data=JSON.parse(bytes.toString('utf8'))}catch{
        throw new SubscriptionDemoError('INVALID_JSON',400);
      }
      fail(!data||typeof data!=='object'||Array.isArray(data)||
        Object.keys(data).sort().join(',')!=='eventId,expectedVersion',
        'INVALID_ACTION_FIELDS',400);
      const subscription=store.step({...identity,action,
        expectedVersion:data.expectedVersion,eventId:data.eventId});
      return reply(200,{subscription,mode:'OFFLINE_SCENARIO_NO_PROVIDER'});
    }catch(e){
      if(e instanceof SubscriptionDemoError)return reply(e.status,{error:e.code});
      return reply(503,{error:'OFFLINE_SCENARIO_UNAVAILABLE'});
    }
  };
}
