// Offline, no API call. A green local variable check is NOT provider access proof.
import {inspectP0ProviderReadiness} from '../src/p0_provider_readiness.mjs';
const report=inspectP0ProviderReadiness(process.env);
process.stdout.write(JSON.stringify(report,null,2)+'\n');
// Always nonzero: real Sandbox OAuth/GET and AI generation evidence are external.
process.exitCode=2;
