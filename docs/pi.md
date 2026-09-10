# Pi

Pi uses the ChatGPT OAuth provider (`openai-codex`). Its local settings and OAuth
credentials live under `~/.pi/agent/`. The `pi` shell function starts Pi through
`~/.local/bin/pi-telemetry`, reading the New Relic ingest key from 1Password.
`PI_NEW_RELIC_ENABLE=0 pi` disables export. An explicit `PI_NEW_RELIC_API_KEY`
can supply the ingest key without 1Password. `/telemetry-status` flushes pending
records and reports HTTP delivery status, queue sizes, errors, and dropped records.

## New Relic

The extension sends logs, dimensional metrics, and distributed traces using
OTLP/HTTP JSON to `https://otlp.nr-data.net/v1/{logs,metrics,traces}` with
`service.name = pi-coding-agent` and deployment environment `prod`.
Log records contain event names and measurement attributes, with matching trace
and span IDs. Response events include `input_token_count`, `output_token_count`,
`cached_token_count`, `cache_write_token_count`, `reasoning_token_count` when
available, and `total_token_count`.

The New Relic account routes `service.name = 'pi-coding-agent'` to `Log_Pi`
with the `SECONDARY` retention policy. This is an account-side data partition
rule; a different account needs the same rule to route logs out of the default
`Log` partition. Metrics and traces remain in `Metric` and `Span`.
Events retain their individual timestamps; HTTP batches flush every second,
after an agent run, and during orderly shutdown. Abrupt termination can lose
queued records. Each signal queues at most 5,000 records during delivery failures;
overflow is counted in status. Successful HTTP delivery means the ingest endpoint
accepted the request, not that a subsequent query has verified ingestion.

| Measurement | Metric |
| --- | --- |
| Every exposed lifecycle, input, streaming, tool, model, context, and compaction event | `pi.event.count`, facet `event` |
| Model input, output, cache read/write, optional reasoning tokens | `pi.token.usage`, facet `type` |
| Tool-reported token usage | `pi.tool.token.usage`, facets `tool`, `type` |
| Tokens per model turn | `pi.turn.tokens` |
| Input/output tokens per second of model response wall time | `pi.token.rate`, facet `type` |
| Model-reported estimated cost | `pi.cost.usage`, facet `type` |
| Session, agent run, turn, model response, tool and UI wait duration (ms) | `pi.{session,agent,turn,model,tool,ui_wait}.duration` |
| Provider response status and time until headers (ms) | `pi.provider.response.count`, `pi.provider.headers.duration` |
| Time until first text, thinking, or tool-call delta (ms) | `pi.model.first_delta.duration` |
| Completed tool executions and success | `pi.tool.count`, facets `tool`, `success` |
| Skill command invocations and successful reads of discovered skill files | `pi.skill.count`, facets `skill`, `method` |
| Successful builtin edit/write byte counts | `pi.edit.bytes`, facets `tool`, `type` |
| Prompt/system prompt UTF-8 bytes and image count | `pi.prompt.bytes`, `pi.system_prompt.bytes`, `pi.prompt.images` |
| Available skills and loaded context files | `pi.skills.available`, `pi.context.files` |
| Context use and compaction size | `pi.context.{tokens,window,percent}`, `pi.compaction.tokens_before` |
| Process memory and CPU since previous turn sample | `pi.process.{rss.bytes,heap.bytes,cpu.user.us,cpu.system.us}` |

Metrics carry `provider`, `model`, `thinking`, execution `mode`, and `conversation`
(`main`, `btw`, or `btw_summary`). Spans relate
sessions, agent runs, turns, model responses, and tools using generated trace IDs.
An agent run may contain multiple model turns and tool executions.

Reasoning tokens are a subset of output tokens and are omitted when unavailable;
`pi.reasoning.available` records availability. Do not add reasoning to output or
add cost `total` to its components. Tool-reported usage is separate from parent
model usage. Model costs are provider estimates, not a ChatGPT subscription bill.

Token rates divide token counts by model response wall time, including waiting;
input rate is not server-side prefill throughput. Edit bytes count UTF-8 replacement
text, not a minimal diff. Write replacements include the prior file size when it
can be read. Shell commands and external tool mutations are not measured as edits.
Skill reads describe observed loads, not proof that every instruction was followed.

No prompt text, response text, thinking text, source code, file paths, tool
arguments/results, HTTP headers, credentials, raw error messages, or stack traces
are exported. HTTP status, success flags, and model stop categories provide
diagnostic information.

Example NRQL:

```sql
FROM Log_Pi SELECT count(*)
WHERE service.name = 'pi-coding-agent' FACET event.name, conversation SINCE 1 hour ago
```

```sql
FROM Metric SELECT sum(pi.token.usage)
WHERE service.name = 'pi-coding-agent' FACET provider, model, type SINCE 1 hour ago
```

```sql
FROM Metric SELECT average(pi.turn.duration), average(pi.turn.tokens)
WHERE service.name = 'pi-coding-agent' TIMESERIES SINCE 1 hour ago
```

```sql
FROM Span SELECT count(*) WHERE service.name = 'pi-coding-agent'
FACET name SINCE 1 hour ago
```

## LSP and UI

Mise supplies TypeScript 5.9 (including tsserver), typescript-language-server,
Pyright, and bash-language-server. Pi's LSP package selects servers using local
project markers and `lsp` settings; diagnostics can run at the end of an agent run.
Taplo and the platform's clangd can serve TOML and C/C++ where installed.

The local UI uses a quiet startup, collapsed thinking, and a two-line footer for
model, thinking level, context use, directory, Git state, and cost. The footer,
subagent, web-access, and LSP packages are configured in Pi's local settings.

## Side conversations

The managed `btw.ts` extension includes pi-btw 0.4.1 with telemetry-enabled
side sessions. Do not also enable the npm pi-btw extension: both register the
same commands. The upstream license and source information accompany the copy
under `extensions/lib/vendor/`.

- `/btw question` opens or continues a side conversation with the main context.
- `/btw:tangent question` uses an independent context.
- `Alt+/` switches focus; `Esc` dismisses the overlay.
- `/btw:inject` sends the side thread to the main agent.
- `/btw:summarize` sends a summary instead.

Side conversations inherit the main model unless `/btw:model` overrides it.
Both side and summary sessions load the same metadata-only telemetry extension;
their session shutdown waits for export. Query `conversation = 'btw'` or
`conversation = 'btw_summary'` to isolate their usage. Each session has its own
trace and export queue; the main `/telemetry-status` reports its own queue.
