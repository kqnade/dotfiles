import { verifyPayload, verifyState } from './models.mjs';
import { writeSync } from 'node:fs';

export function installModelGuard(pi, role) {
  pi.on('before_provider_request', (event, ctx) => {
    try {
      verifyState(role, ctx);
      verifyPayload(role, event.payload);
    } catch (error) {
      // Pi catches provider-hook exceptions and continues sending the request.
      try { writeSync(2, `Model guard: ${error.message}\n`); }
      finally { process.exit(78); }
    }
  });
}
