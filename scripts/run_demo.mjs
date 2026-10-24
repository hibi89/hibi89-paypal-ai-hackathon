import { startOfflineDemo } from '../src/offline_demo_server.mjs';
const server=await startOfflineDemo();
console.log('OFFLINE DEMO ONLY — no AI or PayPal: '+server.url);
console.log('Loopback only. Press Ctrl+C to stop.');
process.once('SIGINT',async()=>{await server.close();process.exit(0);});
process.once('SIGTERM',async()=>{await server.close();process.exit(0);});
