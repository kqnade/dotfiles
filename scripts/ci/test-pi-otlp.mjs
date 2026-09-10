import assert from 'node:assert/strict';
import test from 'node:test';

import { otlpBatchParts, otlpRecord } from '../../dot_pi/agent/extensions/lib/otlp.mjs';

function batch(field, serviceName, records) {
  const { prefix, suffix } = otlpBatchParts(serviceName, field);
  return JSON.parse(`${prefix}${records.map(record => JSON.stringify(otlpRecord(field, record))).join(',')}${suffix}`);
}

test('serializes count metrics as OTLP delta sums with exact nanosecond strings', () => {
  const record = otlpRecord('metrics', {
    name: 'pi.turn.count',
    type: 'count',
    value: 3,
    timestamp: 1700000000123,
    'interval.ms': 17,
    attributes: { provider: 'openai-codex', retry: 2, sampled: true, ratio: 0.5 },
  });

  assert.deepEqual(record, {
    name: 'pi.turn.count',
    sum: {
      dataPoints: [{
        asInt: '3',
        timeUnixNano: '1700000000123000000',
        startTimeUnixNano: '1700000000106000000',
        attributes: [
          { key: 'provider', value: { stringValue: 'openai-codex' } },
          { key: 'retry', value: { intValue: '2' } },
          { key: 'sampled', value: { boolValue: true } },
          { key: 'ratio', value: { doubleValue: 0.5 } },
        ],
      }],
      aggregationTemporality: 1,
      isMonotonic: true,
    },
  });
});

test('serializes gauges and ignores unsupported attribute payloads', () => {
  const record = otlpRecord('metrics', {
    name: 'pi.token.rate',
    type: 'gauge',
    value: 1.25,
    timestamp: 1700000000000,
    'interval.ms': 1,
    attributes: { kind: 'output', payload: { secret: 'private' }, list: ['private'] },
  });

  assert.deepEqual(record, {
    name: 'pi.token.rate',
    gauge: {
      dataPoints: [{
        asDouble: 1.25,
        timeUnixNano: '1700000000000000000',
        startTimeUnixNano: '1699999999999000000',
        attributes: [{ key: 'kind', value: { stringValue: 'output' } }],
      }],
    },
  });
});

test('serializes spans with OTLP ids, parent linkage, and duration precision', () => {
  const record = otlpRecord('spans', {
    id: '2222222222222222',
    'trace.id': '11111111111111111111111111111111',
    timestamp: 1700000000000,
    attributes: {
      name: 'pi.turn',
      'duration.ms': 12,
      'parent.id': '3333333333333333',
      model: 'gpt-test',
      tokens: 4,
    },
    payload: 'PRIVATE',
  });

  assert.deepEqual(record, {
    traceId: '11111111111111111111111111111111',
    spanId: '2222222222222222',
    parentSpanId: '3333333333333333',
    name: 'pi.turn',
    startTimeUnixNano: '1700000000000000000',
    endTimeUnixNano: '1700000000012000000',
    kind: 1,
    attributes: [
      { key: 'duration.ms', value: { intValue: '12' } },
      { key: 'model', value: { stringValue: 'gpt-test' } },
      { key: 'tokens', value: { intValue: '4' } },
    ],
  });
  assert.equal(JSON.stringify(record).includes('PRIVATE'), false);
});

test('serializes correlated logs with stable bodies and severity without raw payloads', () => {
  const record = otlpRecord('logs', {
    id: '2222222222222222',
    'trace.id': '11111111111111111111111111111111',
    timestamp: 1700000000000,
    attributes: {
      name: 'pi.model',
      success: false,
      stop_reason: 'error',
      provider: 'openai-codex',
      response: { secret: 'PRIVATE' },
    },
    result: 'PRIVATE',
  });

  assert.deepEqual(record, {
    timeUnixNano: '1700000000000000000',
    severityNumber: 17,
    severityText: 'ERROR',
    traceId: '11111111111111111111111111111111',
    spanId: '2222222222222222',
    body: { stringValue: 'pi.model' },
    attributes: [
      { key: 'event.name', value: { stringValue: 'pi.model' } },
      { key: 'success', value: { boolValue: false } },
      { key: 'stop_reason', value: { stringValue: 'error' } },
      { key: 'provider', value: { stringValue: 'openai-codex' } },
    ],
  });
  assert.equal(JSON.stringify(record).includes('PRIVATE'), false);
});

test('builds OTLP resource and scope containers for every signal', () => {
  const fields = {
    metrics: 'resourceMetrics',
    spans: 'resourceSpans',
    logs: 'resourceLogs',
  };
  for (const [field, rootField] of Object.entries(fields)) {
    const payload = batch(field, 'pi-coding-agent', [field === 'metrics'
      ? { name: 'pi.turn.count', type: 'count', value: 1, timestamp: 1700000000000 }
      : { id: '2222222222222222', 'trace.id': '11111111111111111111111111111111', timestamp: 1700000000000, attributes: { name: 'pi.turn' } }]);
    const resource = payload[rootField][0];
    assert.deepEqual(resource.resource.attributes, [
      { key: 'service.name', value: { stringValue: 'pi-coding-agent' } },
      { key: 'deployment.environment.name', value: { stringValue: 'prod' } },
      { key: 'deployment.environment', value: { stringValue: 'prod' } },
      { key: 'telemetry.sdk.language', value: { stringValue: 'nodejs' } },
    ]);
    const scopeField = field === 'metrics' ? 'scopeMetrics' : field === 'spans' ? 'scopeSpans' : 'scopeLogs';
    assert.deepEqual(resource[scopeField][0].scope, { name: 'pi.telemetry' });
  }
});
