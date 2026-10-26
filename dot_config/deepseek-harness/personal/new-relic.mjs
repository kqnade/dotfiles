import { createExporter } from './lib/new-relic-exporter.mjs';
import { createCollector } from './telemetry.mjs';
import { catalogRates, loadPricingCatalog } from './pricing.mjs';

export function apply(ctx, { profile = 'personal' } = {}) {
  if (process.env.DSH_NEW_RELIC_ENABLE !== '1') return;
  const apiKey = process.env.DSH_NEW_RELIC_API_KEY;
  if (!apiKey?.trim()) throw new Error('DSH New Relic telemetry requires a license key.');
  const exporter = createExporter({ apiKey, serviceName: 'deepseek-harness', scopeName: 'dsh.telemetry',
    onError: error => ctx.logger.warn(error.message) });
  let catalog;
  try { catalog = loadPricingCatalog(process.argv[1]); }
  catch { ctx.logger.warn('DSH pricing catalog could not be loaded; estimated cost will be unavailable.'); }
  const collector = createCollector({ ...exporter, profile, getRates: (provider, model, usage) => catalogRates(catalog, provider, model, usage) });
  ctx.effect(() => {
    const timer = setInterval(() => { collector.sample(); void exporter.flush(); }, 1000);
    timer.unref();
    return async () => {
      clearInterval(timer);
      collector.clear();
      await exporter.shutdown();
    };
  });
  ctx.on('subagent/start', collector.subagentStart);
  ctx.on('subagent/end', collector.subagentEnd);
  ctx.on('agent/created', collector.created);
  ctx.on('agent/status', collector.status);
  ctx.on('agent/request-error', collector.requestError, { prepend: true });
  ctx.on('agent/assistant-stream', collector.stream);
  ctx.on('session/event', collector.event);
  ctx.on('session/disposed', collector.dispose);
}
