import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createExporter } from './lib/new-relic-exporter.mjs';
import { createCollector } from './lib/telemetry-events.mjs';

export default function (pi) {
  const apiKey = process.env.PI_NEW_RELIC_API_KEY;
  const enabled = process.env.PI_NEW_RELIC_ENABLE === '1' && !!apiKey;
  const exporter = enabled ? createExporter({ apiKey }) : undefined;
  const collector = exporter ? createCollector(exporter) : undefined;
  const skills = new Map();
  let cpu = process.cpuUsage();
  const timer = exporter ? setInterval(() => { void exporter.flush(); }, 1000) : undefined;
  timer?.unref();

  pi.registerCommand('telemetry-status', {
    description: 'Show New Relic delivery status without credentials',
    handler: async (_args, ctx) => {
      await exporter?.flush();
      const status = exporter?.status();
      ctx.ui.notify(JSON.stringify({ enabled, ...status }), status?.lastError ? 'warning' : 'info');
    },
  });
  if (!collector) return;

  const events = [
    'resources_discover', 'session_start', 'session_info_changed', 'session_before_switch',
    'session_before_fork', 'session_before_compact', 'session_compact', 'session_compact_failed',
    'session_shutdown', 'session_before_tree', 'session_tree', 'context', 'before_provider_request',
    'before_provider_headers', 'after_provider_response', 'before_agent_start', 'agent_start',
    'agent_end', 'agent_settled', 'ui_prompt_start', 'ui_prompt_end', 'turn_start', 'turn_end',
    'message_start', 'message_update', 'message_end', 'tool_execution_start', 'tool_execution_update',
    'tool_execution_end', 'model_select', 'thinking_level_select', 'tool_call', 'tool_result',
    'user_bash', 'input',
  ];
  for (const name of events) pi.on(name, async (event, ctx) => {
    const observation: { skillName?: string; previousBytes?: number; measurements?: Record<string, number> } = {};
    if (name === 'before_agent_start') {
      skills.clear();
      for (const skill of event.systemPromptOptions?.skills ?? []) skills.set(resolve(skill.filePath), skill.name);
    }
    if (name === 'tool_execution_start' && typeof event.args?.path === 'string') {
      const path = resolve(ctx.cwd, event.args.path);
      if (event.toolName === 'read') observation.skillName = skills.get(path);
      if (event.toolName === 'write') {
        try { observation.previousBytes = (await stat(path)).size; }
        catch (e) {
          if (e.code === 'ENOENT') observation.previousBytes = 0;
          else observation.measurements = { 'edit.size_unavailable.count': 1 };
        }
      }
    }
    if (name === 'input') {
      const match = /^\/skill:([\w.-]+)(?:\s|$)/.exec(event.text);
      if (match) observation.skillName = match[1];
    }
    if (name === 'turn_end') {
      const context = ctx.getContextUsage();
      const memory = process.memoryUsage();
      const used = process.cpuUsage(cpu);
      cpu = process.cpuUsage();
      observation.measurements = {
        'process.rss.bytes': memory.rss, 'process.heap.bytes': memory.heapUsed,
        'process.cpu.user.us': used.user, 'process.cpu.system.us': used.system,
        ...(context?.tokens != null ? { 'context.tokens': context.tokens } : {}),
        ...(context ? { 'context.window': context.contextWindow } : {}),
        ...(context?.percent != null ? { 'context.percent': context.percent } : {}),
      };
    }
    const model = event.message?.role === 'assistant' ? event.message : event.model ?? ctx.model;
    collector.handle(event, {
      provider: model?.provider ?? 'unknown', model: model?.model ?? model?.id ?? 'unknown',
      thinking: pi.getThinkingLevel(), mode: ctx.mode,
    }, observation);
    if (name === 'agent_end') void exporter.flush();
    if (name === 'session_shutdown') {
      clearInterval(timer);
      await exporter.shutdown();
    }
  });
}
