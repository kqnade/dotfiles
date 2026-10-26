import { createExporter } from './lib/new-relic-exporter.mjs';
import { createCollector } from './telemetry.mjs';

export function apply(ctx) {
  if (process.env.DSH_NEW_RELIC_ENABLE !== '1') return;
  const apiKey = process.env.DSH_NEW_RELIC_API_KEY;
  if (!apiKey?.trim()) throw new Error('DSH New Relic telemetry requires a license key.');
  const exporter = createExporter({ apiKey, serviceName: 'deepseek-harness', scopeName: 'dsh.telemetry',
    onError: error => ctx.logger.warn(error.message) });
  const collector = createCollector(exporter);
  ctx.effect(() => {
    const timer = setInterval(() => { void exporter.flush(); }, 1000);
    timer.unref();
    return async () => {
      clearInterval(timer);
      collector.clear();
      await exporter.shutdown();
    };
  });
  ctx.on('agent/assistant-stream', collector.stream);
  ctx.on('session/event', collector.event);
  ctx.on('session/disposed', collector.dispose);
}
