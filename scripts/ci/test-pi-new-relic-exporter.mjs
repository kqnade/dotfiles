import assert from "node:assert/strict";
import test from "node:test";

import { createExporter } from "../../dot_pi/agent/extensions/lib/new-relic-exporter.mjs";

function response(status, body = "") {
	return {
		status,
		async text() {
			return body;
		},
	};
}

function requestBody(request) {
	return JSON.parse(request.options.body);
}

test("flush sends OTLP metrics with the API key in the header only", async () => {
	const requests = [];
	const exporter = createExporter({
		apiKey: "license-secret",
		serviceName: "pi-coding-agent",
		metricsEndpoint: "https://metrics.example.test/v1",
		fetchImpl: async (url, options) => {
			requests.push({ url, options });
			return response(202);
		},
	});
	exporter.addMetric({
		name: "pi.turn.count",
		type: "count",
		value: 1,
		timestamp: 1700000000000,
		attributes: { provider: "openai-codex", model: "gpt-test" },
	});

	assert.equal(await exporter.flush(), true);
	assert.equal(requests.length, 1);
	assert.equal(requests[0].url, "https://metrics.example.test/v1");
	assert.equal(requests[0].options.headers["Api-Key"], "license-secret");
	assert.equal(requests[0].options.headers["Content-Type"], "application/json");
	const resource = requestBody(requests[0]).resourceMetrics[0];
	assert(resource.resource.attributes.some(a => a.key === "service.name" && a.value.stringValue === "pi-coding-agent"));
	const metric = resource.scopeMetrics[0].metrics[0];
	assert.equal(metric.name, "pi.turn.count");
	assert.equal(metric.sum.aggregationTemporality, 1);
	assert.equal(metric.sum.dataPoints[0].timeUnixNano, "1700000000000000000");
	assert.equal(Number(metric.sum.dataPoints[0].asInt ?? metric.sum.dataPoints[0].asDouble), 1);
	assert.equal(requests[0].options.body.includes("license-secret"), false);
	assert.deepEqual(exporter.status(), {
		apiKeyConfigured: true,
		metricsQueued: 0,
		spansQueued: 0,
		logsQueued: 0,
		flushInProgress: false,
		lastError: null,
		lastFlushAt: exporter.status().lastFlushAt,
		lastFlushSucceeded: true,
		droppedRecords: 0,
	});
});

test("flush sends correlated OTLP traces and logs", async () => {
	const requests = [];
	const exporter = createExporter({
		apiKey: "license-secret",
		tracesEndpoint: "https://traces.example.test/v1",
		fetchImpl: async (url, options) => {
			requests.push({ url, options });
			return response(200);
		},
	});
	exporter.addSpan({
		id: "2222222222222222",
		"trace.id": "11111111111111111111111111111111",
		timestamp: 1700000000000,
		attributes: { name: "pi.turn", "duration.ms": 12 },
	});

	assert.equal(await exporter.shutdown(), true);
	assert.equal(requests.length, 2);
	assert.equal(requests[0].url, "https://traces.example.test/v1");
	assert.equal(requests[1].url, "https://otlp.nr-data.net/v1/logs");
	const span = requestBody(requests[0]).resourceSpans[0].scopeSpans[0].spans[0];
	const log = requestBody(requests[1]).resourceLogs[0].scopeLogs[0].logRecords[0];
	assert.equal(span.name, "pi.turn");
	assert.equal(log.body.stringValue, "pi.turn");
	assert.equal(span.traceId, "11111111111111111111111111111111");
	assert.equal(log.traceId, span.traceId);
	assert.equal(log.spanId, span.spanId);
	assert.equal(span.endTimeUnixNano, "1700000000012000000");
});

test("network errors are reported without throwing or exposing response data", async () => {
	const errors = [];
	const exporter = createExporter({
		apiKey: "license-secret",
		onError: (error) => errors.push(error),
		fetchImpl: async () => {
			throw new Error("response body contains license-secret");
		},
	});
	exporter.addMetric({ name: "pi.turn.count", type: "count", value: 1, timestamp: 1700000000000 });

	assert.equal(await exporter.flush(), false);
	assert.equal(errors.length, 1);
	assert.equal(errors[0].message, "New Relic metrics export failed (network)");
	assert.equal(JSON.stringify(exporter.status()).includes("license-secret"), false);
	assert.equal(exporter.status().metricsQueued, 1);
});

test("non-transient HTTP errors retain the batch and omit the response body", async () => {
	const errors = [];
	const exporter = createExporter({
		apiKey: "license-secret",
		onError: (error) => errors.push(error),
		fetchImpl: async () => response(400, '{"error":"secret response body"}'),
	});
	exporter.addMetric({ name: "pi.turn.count", type: "count", value: 1, timestamp: 1700000000000 });

	assert.equal(await exporter.flush(), false);
	assert.equal(errors.length, 1);
	assert.equal(errors[0].message, "New Relic metrics export failed (http)");
	assert.equal(JSON.stringify(exporter.status()).includes("secret response body"), false);
	assert.equal(exporter.status().metricsQueued, 1);
});

test("a transient response is retried without dropping the first batch", async () => {
	const requests = [];
	const exporter = createExporter({
		apiKey: "license-secret",
		fetchImpl: async (url, options) => {
			requests.push({ url, options });
			return requests.length === 1 ? response(503) : response(202);
		},
	});
	exporter.addMetric({ name: "pi.turn.count", type: "count", value: 1, timestamp: 1700000000000 });

	assert.equal(await exporter.flush(), true);
	assert.equal(requests.length, 2);
	assert.equal(requests[0].options.body, requests[1].options.body);
	assert.equal(exporter.status().metricsQueued, 0);
});

test("concurrent flush calls share one request", async () => {
	const requests = [];
	let release;
	const gate = new Promise((resolve) => {
		release = resolve;
	});
	const exporter = createExporter({
		apiKey: "license-secret",
		fetchImpl: async (url, options) => {
			requests.push({ url, options });
			await gate;
			return response(202);
		},
	});
	exporter.addMetric({ name: "pi.turn.count", type: "count", value: 1, timestamp: 1700000000000 });

	const firstFlush = exporter.flush();
	const secondFlush = exporter.flush();
	assert.strictEqual(firstFlush, secondFlush);
	assert.equal(exporter.status().flushInProgress, true);
	release();
	assert.equal(await firstFlush, true);
	assert.equal(requests.length, 1);
});

test("payload errors in a successful HTTP response retain the batch", async () => {
	const errors = [];
	const exporter = createExporter({
		apiKey: "license-secret",
		onError: (error) => errors.push(error),
		fetchImpl: async () => response(202, '{"errors":[{"message":"secret response body"}]}'),
	});
	exporter.addMetric({ name: "pi.turn.count", type: "count", value: 1, timestamp: 1700000000000 });

	assert.equal(await exporter.flush(), false);
	assert.equal(errors.length, 1);
	assert.equal(errors[0].message, "New Relic metrics export failed (payload)");
	assert.equal(exporter.status().metricsQueued, 1);
});

test("batches stay below one megabyte", async () => {
	const requests = [];
	const exporter = createExporter({
		apiKey: "license-secret",
		fetchImpl: async (url, options) => {
			requests.push({ url, options });
			return response(202);
		},
	});
	for (let index = 0; index < 100; index += 1) {
		exporter.addMetric({
			name: `pi.metric.${index}`,
			type: "gauge",
			value: index, timestamp: 1700000000000,
			attributes: { metadata: "x".repeat(15_000) },
		});
	}

	assert.equal(await exporter.flush(), true);
	assert.ok(requests.length > 1);
	assert.ok(requests.every(({ options }) => new TextEncoder().encode(options.body).byteLength < 1_000_000));
	assert.equal(exporter.status().metricsQueued, 0);
});

test("bounds each signal queue and counts rejected records", () => {
	const exporter = createExporter({ apiKey: "license-secret" });
	for (let index = 0; index < 5_001; index += 1) {
		exporter.addMetric({ name: `pi.metric.${index}`, type: "gauge", value: index });
	}

	assert.equal(exporter.status().metricsQueued, 5_000);
	assert.equal(exporter.status().droppedRecords, 1);
	assert.deepEqual(exporter.status().lastError, {
		signal: "metrics",
		code: "queue-full",
	});
});
