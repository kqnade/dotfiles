const MAX_BATCH_BYTES = 1_000_000;
const MAX_QUEUE_RECORDS = 5_000;
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 250;

function byteLength(value) {
	return new TextEncoder().encode(value).byteLength;
}

function serializeBatch(serviceName, field, records) {
	return JSON.stringify([
		{
			common: { attributes: { "service.name": serviceName } },
			[field]: records,
		},
	]);
}

function batchParts(serviceName, field) {
	const empty = serializeBatch(serviceName, field, []);
	const marker = empty.lastIndexOf("[]");
	return { prefix: empty.slice(0, marker + 1), suffix: empty.slice(marker + 1) };
}

async function responseHasErrors(response) {
	let payload;
	if (typeof response?.text === "function") {
		const body = await response.text();
		if (!body) {
			return false;
		}
		try {
			payload = JSON.parse(body);
		} catch {
			return false;
		}
	} else if (typeof response?.json === "function") {
		payload = await response.json();
	}
	return (
		(Array.isArray(payload?.errors) && payload.errors.length > 0) ||
		Boolean(payload?.error)
	);
}

function wait(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function createExporter({
	apiKey,
	serviceName = "pi-coding-agent",
	fetchImpl = globalThis.fetch,
	onError,
	metricsEndpoint = "https://metric-api.newrelic.com/metric/v1",
	tracesEndpoint = "https://trace-api.newrelic.com/trace/v1",
} = {}) {
	const configuredApiKey = typeof apiKey === "string" ? apiKey.trim() : "";
	const metricQueue = [];
	const spanQueue = [];
	let activeFlush;
	let lastError = null;
	let lastFlushAt = null;
	let lastFlushSucceeded = null;
	let droppedRecords = 0;

	function reportError(signal, code, status) {
		const safeError = {
			signal,
			code,
			...(Number.isInteger(status) ? { status } : {}),
		};
		lastError = safeError;
		if (typeof onError === "function") {
			try {
				onError(new Error(`New Relic ${signal} export failed (${code})`));
			} catch {
				// Error reporting must not interrupt the Pi event loop.
			}
		}
	}

	async function request(endpoint, body, signal) {
		if (!configuredApiKey) {
			reportError(signal, "missing-api-key");
			return false;
		}

		let attempt = 0;
		while (true) {
			let response;
			let timeout;
			try {
				const controller =
					typeof AbortController === "function" ? new AbortController() : null;
				const options = {
					method: "POST",
					headers: {
						"Api-Key": configuredApiKey,
						"Content-Type": "application/json",
					},
					body,
				};
				if (controller) {
					options.signal = controller.signal;
				}
				const timeoutPromise = new Promise((_, reject) => {
					timeout = setTimeout(() => {
						controller?.abort();
						reject(new Error("request timed out"));
					}, REQUEST_TIMEOUT_MS);
				});
				response = await Promise.race([
					Promise.resolve().then(() => fetchImpl(endpoint, options)),
					timeoutPromise,
				]);
				const status = Number(response?.status);
				if (status === 200 || status === 202) {
					const hasErrors = await Promise.race([responseHasErrors(response), timeoutPromise]);
					if (hasErrors) {
						reportError(signal, "payload");
						return false;
					}
					return true;
				}

				if ((status === 429 || status >= 500) && attempt < MAX_RETRIES) {
					await wait(RETRY_DELAY_MS * 2 ** attempt);
					attempt += 1;
					continue;
				}
				reportError(signal, "http", Number.isInteger(status) ? status : undefined);
				return false;
			} catch {
				if (attempt < MAX_RETRIES) {
					await wait(RETRY_DELAY_MS * 2 ** attempt);
					attempt += 1;
					continue;
				}
				reportError(signal, "network");
				return false;
			} finally {
				if (timeout) {
					clearTimeout(timeout);
				}
			}
		}
	}

	function nextBatch(queue, field) {
		if (queue.length === 0) {
			return null;
		}

		const { prefix, suffix } = batchParts(serviceName, field);
		const serializedRecords = [];
		const records = [];
		let size = byteLength(prefix) + byteLength(suffix);
		for (const record of queue) {
			let serialized;
			try {
				serialized = JSON.stringify(record) ?? "null";
			} catch {
				if (records.length === 0) {
					return { invalid: true };
				}
				break;
			}
			const candidateSize =
				size + (records.length > 0 ? byteLength(",") : 0) + byteLength(serialized);
			if (candidateSize >= MAX_BATCH_BYTES) {
				break;
			}
			size = candidateSize;
			serializedRecords.push(serialized);
			records.push(record);
		}

		if (records.length === 0) {
			return { oversized: true };
		}

		return {
			body: `${prefix}${serializedRecords.join(",")}${suffix}`,
			count: records.length,
		};
	}

	async function flushQueue(queue, field, endpoint, signal) {
		let dropped = false;
		while (queue.length > 0) {
			const batch = nextBatch(queue, field);
			if (batch?.invalid || batch?.oversized) {
				queue.shift();
				droppedRecords += 1;
				dropped = true;
				reportError(signal, batch.invalid ? "invalid-record" : "record-too-large");
				continue;
			}

			if (!batch || !(await request(endpoint, batch.body, signal))) {
				return false;
			}
			queue.splice(0, batch.count);
		}
		return !dropped;
	}

	async function flushInternal() {
		if (!configuredApiKey && (metricQueue.length > 0 || spanQueue.length > 0)) {
			reportError("metrics", "missing-api-key");
			return false;
		}
		if (!(await flushQueue(metricQueue, "metrics", metricsEndpoint, "metrics"))) {
			return false;
		}
		return flushQueue(spanQueue, "spans", tracesEndpoint, "traces");
	}

	function flush() {
		if (activeFlush) {
			return activeFlush;
		}

		activeFlush = flushInternal()
			.catch(() => {
				reportError("exporter", "internal");
				return false;
			})
			.then((succeeded) => {
				lastFlushAt = Date.now();
				lastFlushSucceeded = succeeded;
				if (succeeded) {
					lastError = null;
				}
				return succeeded;
			})
			.finally(() => {
				activeFlush = undefined;
			});
		return activeFlush;
	}

	return {
		addMetric(record) {
			if (metricQueue.length >= MAX_QUEUE_RECORDS) {
				droppedRecords += 1;
				reportError("metrics", "queue-full");
				return;
			}
			metricQueue.push(record);
		},
		addSpan(record) {
			if (spanQueue.length >= MAX_QUEUE_RECORDS) {
				droppedRecords += 1;
				reportError("traces", "queue-full");
				return;
			}
			spanQueue.push(record);
		},
		flush,
		shutdown: flush,
		status() {
			return {
				apiKeyConfigured: Boolean(configuredApiKey),
				metricsQueued: metricQueue.length,
				spansQueued: spanQueue.length,
				flushInProgress: Boolean(activeFlush),
				lastError: lastError ? { ...lastError } : null,
				lastFlushAt,
				lastFlushSucceeded,
				droppedRecords,
			};
		},
	};
}

export default createExporter;
