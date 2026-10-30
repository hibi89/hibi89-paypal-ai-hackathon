import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {parseOwnerQuickTunnelOrigin,startOwnerMvpQuickTunnel}
  from '../src/owner_mvp_quick_tunnel.mjs';

const fakeSpawn=(output,exitEarly=false)=>{
  let args=null,options=null,stopped=false;
  const create=(command,argv,opts)=>{
    args=[command,...argv];options=opts;
    const child=new EventEmitter();
    child.stdout=new PassThrough();child.stderr=new PassThrough();
    child.kill=signal=>{
      stopped=true;
      queueMicrotask(()=>child.emit('exit',signal==='SIGKILL'?1:0));
      return true;
    };
    queueMicrotask(()=>{
      if(exitEarly)child.emit('exit',1);
      else child.stderr.write(output);
    });
    return child;
  };
  return {create,get args(){return args},get options(){return options},
    get stopped(){return stopped}};
};
test('only exact random HTTPS trycloudflare origin can become callback authority',()=>{
  assert.equal(parseOwnerQuickTunnelOrigin('Ready https://pilot-abc.trycloudflare.com now'),
    'https://pilot-abc.trycloudflare.com');
  for(const value of [
    'https://trycloudflare.com','http://pilot-abc.trycloudflare.com',
    'https://pilot.trycloudflare.com.evil.invalid',
    'https://attacker.example','',null
  ])assert.equal(parseOwnerQuickTunnelOrigin(value),null);
});
test('approved helper acquires random origin without shell, secrets, PayPal or API calls',async()=>{
  const f=fakeSpawn('Tunnel ready https://pilot-abc.trycloudflare.com\n');
  const tunnel=await startOwnerMvpQuickTunnel({port:8787,spawnProcess:f.create});
  assert.deepEqual(f.args,['cloudflared','tunnel','--url','http://127.0.0.1:8787']);
  assert.equal(f.options.shell,false);
  assert.equal(f.options.stdio[0],'ignore');
  assert.equal(tunnel.publicOrigin,'https://pilot-abc.trycloudflare.com');
  assert.equal(tunnel.providerCalls,0);
  assert.equal(tunnel.paymentPosts,0);
  assert.equal(tunnel.productionDeployment,false);
  await tunnel.close();
  assert.equal(f.stopped,true);
  await tunnel.close();
});
test('invalid arguments refuse to launch tunnel',async()=>{
  const f=fakeSpawn('');
  await assert.rejects(startOwnerMvpQuickTunnel({port:80,spawnProcess:f.create}),
    {code:'QUICK_TUNNEL_INVALID_ARGUMENTS'});
  assert.equal(f.args,null);
});
test('cloudflared premature exit refuses public origin and does not run provider',async()=>{
  const f=fakeSpawn('',true);
  await assert.rejects(startOwnerMvpQuickTunnel({port:8787,spawnProcess:f.create}),
    {code:'QUICK_TUNNEL_EXITED_BEFORE_READY'});
});
test('malformed tunnel output times out and terminates the process',async()=>{
  const f=fakeSpawn('https://phishing.example.invalid');
  await assert.rejects(startOwnerMvpQuickTunnel({
    port:8787,spawnProcess:f.create,timeoutMs:100
  }),{code:'QUICK_TUNNEL_READY_TIMEOUT'});
  assert.equal(f.stopped,true);
});
