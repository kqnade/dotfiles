# Pi

Pi uses the ChatGPT OAuth provider (`openai-codex`). Its local settings and OAuth
credentials live under `~/.pi/agent/`. The generic user instructions are sourced from
`dot_agents/AGENTS.md` and deployed through the Pi adapter `dot_pi/agent/symlink_AGENTS.md`.
Before first apply on a machine with an existing `~/.pi/agent/AGENTS.md`, compare the file with
that source: identical content may be replaced by its symlink; differing content must first be
reconciled and preserved. Apply replaces this managed target; there is no automatic migration.
The complete global settings file is managed as the
canonical configuration for every machine, including packages, subagents, LSP, the startup model
`openai-codex/gpt-6-sol`, and `xhigh` thinking. `Ctrl+P` cycles through GPT-6 Astra,
Sol, and Luna, with `medium`, `xhigh`, and `max` thinking respectively. `/model` remains
available for explicit model selection. Subagents and commit-message generation use
`openai-codex/gpt-6-luna`. Luna builtins `worker`, `delegate`, `scout`, `researcher`, and
`evidence-auditor` use `max` thinking; the Sol `reviewer` and `oracle` remain at `high`.
The one-shot `git cc` message generator uses `medium`. The `pi` shell function starts Pi through
`~/.local/bin/pi-telemetry`, reading the New Relic ingest key from 1Password.
`PI_NEW_RELIC_ENABLE=0 pi` disables export. An explicit `PI_NEW_RELIC_API_KEY`
can supply the ingest key without 1Password. `/telemetry-status` flushes pending
records and reports HTTP delivery status, queue sizes, errors, and dropped records.

## Execution approvals

`execution-guard.ts` allows the builtin `read`, `grep`, `find`, and `ls` tools. Every other Pi tool call,
including shell execution, writes, edits, and custom tools, requires the native UI to approve that exact
invocation once in the current working directory. Dialogs are serialized. Declines, unavailable UI,
and UI errors fail closed; no session-wide grants or model/chat-text approval are used. Direct `git commit`
and detected explicit signing or hook bypasses are blocked; use `git cc` for commits.

This is an execution guard, not an OS sandbox. Shell commands are not parsed as a security language:
compound commands, substitutions, scripts, wrappers, mutable code, manually launched processes, and
extensions that are not loaded can cross the boundary. The human sees and approves the complete shell
invocation rather than relying on a command denylist. Native pi-subagents children receive the guard
through `subagents.defaultExtensions`; a child or project configuration that explicitly replaces its
extension list can omit it. External CLI agent profiles remain disabled.

An existing regular `~/.pi/agent/AGENTS.md` must be compared with `dot_agents/AGENTS.md` before first
apply. If different, reconcile and preserve its instructions first: applying the managed adapter replaces
the file with a symlink. No automatic migration or backup is performed.

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

Metrics carry `provider`, `model`, `thinking`, execution `mode`, and
`conversation = main`. Spans relate sessions, agent runs, turns, model responses,
and tools using generated trace IDs.
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

Mise supplies TypeScript 7's native LSP, Pyright, and bash-language-server. Pi's LSP
package selects servers using local project markers and `lsp` settings; diagnostics can run at
the end of an agent run.
Taplo and the platform's clangd can serve TOML and C/C++ where installed.

The local UI uses a quiet startup, collapsed thinking, and a two-line footer for
model, thinking level, context use, directory, Git state, and cost. The footer,
subagent, web-access, and LSP packages are configured in Pi's local settings.

## Interactive questions

The `ask_user` tool presents a single decision through Pi's built-in selector,
with two to five choices and an `Other (type your own)` input option. It can also
ask for free text without offering choices. The agent uses it when an unresolved
decision blocks progress, not for routine status updates.

Questions work in the terminal UI and clients supporting Pi's RPC dialog protocol.
They have no automatic timeout or default answer. Cancelling or submitting empty
text stops the current agent operation without giving an answer or authorization.
Headless calls fail explicitly; the agent must ask in the conversation instead.
