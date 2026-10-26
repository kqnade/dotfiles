import { apply as applyTelemetry } from '../personal/new-relic.mjs';

export function apply(ctx) {
  return applyTelemetry(ctx, { profile: 'work' });
}
