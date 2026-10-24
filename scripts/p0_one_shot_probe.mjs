// The ONLY entrypoint for manual owner-approved evidence probes.
// Without --execute AND --owner-authorized, never reads credentials or calls global fetch.
import {parseP0ProbeArgs,runP0OneShotProbe} from '../src/p0_one_shot_probe.mjs';
const args=parseP0ProbeArgs(process.argv.slice(2));
const report=await runP0OneShotProbe({...args,env:process.env,
  fetchImpl:globalThis.fetch});
process.stdout.write(JSON.stringify(report)+'\n');
// A real response shape is NOT proof of account free tier or complete order flow.
// Always exit zero only for a successful narrow single-call response.
process.exitCode=report.externalEvidence===true?0:2;
