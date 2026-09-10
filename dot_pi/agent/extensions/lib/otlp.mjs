const SCOPE_NAME = 'pi.telemetry';
const NANOSECONDS_PER_MILLISECOND = 1_000_000n;
const RESOURCE_ATTRIBUTES = [
  ['deployment.environment.name', 'prod'],
  ['deployment.environment', 'prod'],
  ['telemetry.sdk.language', 'nodejs'],
];

const SIGNAL_LAYOUTS = {
  metrics: { root: 'resourceMetrics', scopes: 'scopeMetrics', records: 'metrics' },
  spans: { root: 'resourceSpans', scopes: 'scopeSpans', records: 'spans' },
  logs: { root: 'resourceLogs', scopes: 'scopeLogs', records: 'logRecords' },
};

function layoutFor(field) {
  const layout = SIGNAL_LAYOUTS[field];
  if (!layout) throw new TypeError(`Unsupported OTLP signal: ${String(field)}`);
  return layout;
}

function attributeValue(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { boolValue: value };
  if (typeof value === 'bigint') return { intValue: value.toString() };
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value)) return { intValue: BigInt(value).toString() };
    return { doubleValue: value };
  }
  return undefined;
}

function attributesFrom(values, { nameKey, skip = new Set() } = {}) {
  if (!values || typeof values !== 'object') return [];
  const attributes = [];
  for (const [key, value] of Object.entries(values)) {
    if (skip.has(key)) continue;
    const typedValue = attributeValue(value);
    if (typedValue) attributes.push({ key: nameKey?.(key, value) ?? key, value: typedValue });
  }
  return attributes;
}

function milliseconds(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  return undefined;
}

function nanoseconds(value) {
  const millis = milliseconds(value);
  return millis === undefined ? undefined : (millis * NANOSECONDS_PER_MILLISECOND).toString();
}

function timestampFields(timestamp, interval) {
  const timestampMillis = milliseconds(timestamp);
  if (timestampMillis === undefined) return {};
  const timestampNanos = timestampMillis * NANOSECONDS_PER_MILLISECOND;
  const intervalMillis = milliseconds(interval);
  return {
    timeUnixNano: timestampNanos.toString(),
    ...(intervalMillis === undefined
      ? {}
      : { startTimeUnixNano: (timestampNanos - intervalMillis * NANOSECONDS_PER_MILLISECOND).toString() }),
  };
}

function metricDataPoint(record) {
  const value = record.value;
  const numeric = typeof value === 'bigint' || (typeof value === 'number' && Number.isFinite(value));
  if (!numeric) throw new TypeError('OTLP metric value must be numeric');
  const dataPoint = {
    ...(typeof value === 'bigint' || (typeof value === 'number' && Number.isInteger(value))
      ? { asInt: BigInt(value).toString() }
      : { asDouble: value }),
    ...timestampFields(record.timestamp, record['interval.ms']),
    attributes: attributesFrom(record.attributes),
  };
  return dataPoint;
}

function metricRecord(record) {
  if (!record || typeof record !== 'object' || typeof record.name !== 'string') {
    throw new TypeError('OTLP metric record is invalid');
  }
  const dataPoint = metricDataPoint(record);
  if (record.type === 'count') {
    return {
      name: record.name,
      sum: {
        dataPoints: [dataPoint],
        aggregationTemporality: 1,
        isMonotonic: true,
      },
    };
  }
  return { name: record.name, gauge: { dataPoints: [dataPoint] } };
}

function hexId(value, size, field) {
  if (typeof value !== 'string' || value.length !== size || !/^[0-9a-f]+$/i.test(value)) {
    throw new TypeError(`OTLP ${field} must be ${size}-character hexadecimal text`);
  }
  return value.toLowerCase();
}

function spanRecord(record) {
  if (!record || typeof record !== 'object') throw new TypeError('OTLP span record is invalid');
  const values = record.attributes && typeof record.attributes === 'object' ? record.attributes : {};
  const startTimeUnixNano = nanoseconds(record.timestamp);
  const duration = typeof values['duration.ms'] === 'bigint'
    ? values['duration.ms']
    : typeof values['duration.ms'] === 'number' && Number.isFinite(values['duration.ms'])
      ? BigInt(Math.trunc(values['duration.ms']))
      : 0n;
  const start = startTimeUnixNano === undefined ? undefined : BigInt(startTimeUnixNano);
  return {
    traceId: hexId(record['trace.id'], 32, 'trace.id'),
    spanId: hexId(record.id, 16, 'span.id'),
    ...(typeof values['parent.id'] === 'undefined' ? {} : { parentSpanId: hexId(values['parent.id'], 16, 'parent.id') }),
    name: typeof values.name === 'string' ? values.name : '',
    ...(start === undefined
      ? {}
      : {
        startTimeUnixNano: start.toString(),
        endTimeUnixNano: (start + duration * NANOSECONDS_PER_MILLISECOND).toString(),
      }),
    kind: 1,
    attributes: attributesFrom(values, { skip: new Set(['name', 'parent.id']) }),
  };
}

function isError(values) {
  return values.success === false || values.isError === true || values.stop_reason === 'error';
}

function logRecord(record) {
  if (!record || typeof record !== 'object') throw new TypeError('OTLP log record is invalid');
  const values = record.attributes && typeof record.attributes === 'object' ? record.attributes : {};
  const name = typeof values.name === 'string' ? values.name : '';
  const error = isError(values);
  return {
    ...timestampFields(record.timestamp),
    severityNumber: error ? 17 : 9,
    severityText: error ? 'ERROR' : 'INFO',
    traceId: hexId(record['trace.id'], 32, 'trace.id'),
    spanId: hexId(record.id, 16, 'span.id'),
    body: { stringValue: name },
    attributes: attributesFrom(values, {
      nameKey: key => key === 'name' ? 'event.name' : key,
      skip: new Set(['parent.id']),
    }),
  };
}

export function otlpRecord(field, record) {
  layoutFor(field);
  if (field === 'metrics') return metricRecord(record);
  if (field === 'spans') return spanRecord(record);
  return logRecord(record);
}

function resource(serviceName) {
  const name = typeof serviceName === 'string' ? serviceName : String(serviceName ?? '');
  return {
    attributes: [
      ['service.name', name],
      ...RESOURCE_ATTRIBUTES,
    ].map(([key, value]) => ({ key, value: { stringValue: value } })),
  };
}

export function otlpBatchParts(serviceName, field) {
  const layout = layoutFor(field);
  const container = {
    [layout.root]: [{
      resource: resource(serviceName),
      [layout.scopes]: [{
        scope: { name: SCOPE_NAME },
        [layout.records]: [],
      }],
    }],
  };
  const serialized = JSON.stringify(container);
  const marker = serialized.lastIndexOf('[]');
  return { prefix: serialized.slice(0, marker + 1), suffix: serialized.slice(marker + 1) };
}
