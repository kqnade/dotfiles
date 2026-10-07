# Pi

Pi uses the ChatGPT OAuth provider (`openai-codex`). Its local settings and OAuth
credentials live under `~/.pi/agent/`. The generic user instructions are sourced from
`dot_agents/AGENTS.md` and deployed through the Pi adapter `dot_pi/agent/symlink_AGENTS.md`.
Before first apply on a machine with an existing `~/.pi/agent/AGENTS.md`, compare the file with
that source: identical content may be replaced by its symlink; differing content must first be
reconciled and preserved. Apply replaces this managed target; there is no automatic migration.
The complete global settings file is managed as the
canonical configuration for every machine, including packages, subagents, LSP, the startup model
`openai-codex/gpt-6.1-sol`, and `xhigh` thinking. `Ctrl+P` cycles through GPT-6 Astra,
GPT-6.1 Sol, and GPT-6 Luna, with `medium`, `xhigh`, and `max` thinking respectively. `/model` remains
available for explicit model selection. Subagents and commit-message generation use
`openai-codex/gpt-6-luna`. Luna builtins `worker`, `delegate`, `scout`, `researcher`, and
`evidence-auditor` use `max` thinking; the GPT-6 Sol `reviewer` and `oracle` use `high`.
The one-shot `git cc` message generator uses `medium`. The `pi` shell function starts Pi through
`~/.local/bin/pi-telemetry`, reading the New Relic ingest key from 1Password.
`PI_NEW_RELIC_ENABLE=0 pi` disables export. An explicit `PI_NEW_RELIC_API_KEY`
can supply the ingest key without 1Password. `/telemetry-status` flushes pending
records and reports HTTP delivery status, queue sizes, errors, and dropped records.

## Execution approvals

The default is **Decision API review** (`PI_APPROVAL_REVIEWER=decision`). Every agent `bash` and
`powershell` invocation, including reads and tests, is reviewed by
`POST https://api.openai.com/v1/decisions` using `gpt-6-luna`. Only an exact `low` risk answer permits
that one invocation automatically. A valid high-risk answer opens a confirmation dialog with the
exact operation; only explicit human approval permits execution. The warning title uses the theme's
warning color in the TUI and plain text in RPC. Refusal, malformed replies, missing evidence,
credential errors, HTTP errors, timeout, and cancellation deny execution without a confirmation dialog.
Recognized authenticated `fetch_content` operations also require review. Other tools, including
file reads/edits and native subagent launch/control, do not use this API.

The reviewer receives the exact invocation and working directory, text user messages from the
parent's active branch, and the parent's loaded context files. Context files are captured from
`before_agent_start.systemPromptOptions` and cleared on session shutdown/replacement. Before that
evidence is available, reviews fail closed; an explicitly loaded empty file list is valid.
Agent explanations cannot establish authorization. Private reasoning, assistant messages, tool outputs, images, and credentials used for
API authentication are not included as evidence. Non-text user messages or requests larger than
64 KiB fail closed rather than silently dropping evidence. Unknown script contents, variables or
runtime state are not inspected by the reviewer; the rubric requires a high-risk answer when these
prevent establishing effects. Remote/shared mutations still require explicit user authorization for
the concrete action and target. Model judgment is not authorization or a security guarantee.
Commands and context can contain sensitive information: do not place secrets in command arguments.

### API credentials

Pi lazily reads `op://Private/DecisionAPI/api key` on the first review and caches the result only in
its parent extension's process memory. Concurrent requests and native children share that lookup;
session replacement reuses it. No credential file is written and the retrieved key is not exported
to child environments or logs. `/reload` or process restart discards the cache. A failed lookup is
also cached to avoid repeated unlock prompts; unlock 1Password or correct the reference and reload
or restart to retry. The CLI lookup is bounded to one minute; API requests are bounded to ten seconds
and responses to 16 KiB. Each command incurs a separate API call and API billing, independent of
ChatGPT OAuth subscription usage.

`PI_DECISION_API_KEY_OP_REF` overrides the 1Password reference. `PI_DECISION_API_KEY` supplies a key
directly without invoking `op`; an environment key supplied by the caller remains subject to ordinary
process environment inheritance. ChatGPT OAuth credentials are not used for Decisions.

### Manual policy and opt-out

`PI_APPROVAL_REVIEWER=user pi` selects the rule-based policy: routine operations proceed automatically
and recognized high-risk operations require human confirmation. This mode never reads the Decisions
key or calls the API. Unknown reviewer values fail closed.
`PI_EXECUTION_GUARD=0 pi` disables the entire guard; only the exact value `0` does so.
When disabled, remote authorization remains an instruction policy, not a tool-level barrier.

A parent session with a TUI or RPC dialog UI owns a private Unix socket. Native foreground and
background children inherit its session-specific endpoint through `PI_EXECUTION_APPROVAL_CHANNEL`.
In Decision mode all child shell commands wait for the parent's API judgment and, for high risk,
human confirmation with their own invocation, child session, tool-call ID, and working directory. Children do not independently retrieve keys.
In manual mode detected high-risk operations wait for the parent's confirmation dialog. Supervisor/model
replies cannot replace these confirmations; RPC clients must present them to a person.

Manual dialogs use Japanese labels for the operation, working directory, input, and confirmation reason rather
than a JSON envelope. Commands and other multiline values retain their line breaks; terminal control and
bidirectional formatting characters are shown as visible escapes. Raw parameter names and string type
labels distinguish translated keys, strings, and non-string values. The complete input remains displayed.
Below the input, the dialog shows a short purpose from the public assistant text immediately preceding
that tool call in the same message. Private reasoning, user messages, and another call's explanation are
not used as its purpose. In both modes recognized high-risk operations require this explanation
through a Pi prompt guideline and the shared user instructions, without a separate purpose-generation call. A missing or whitespace-only explanation blocks the call
before review, opening a dialog, or forwarding a child request, with instructions to explain the purpose and
target in Japanese before retrying. Each call needs its own explanation, including calls in a batch.
A long explanation is clipped at 500 Unicode characters with a marker.
The purpose is agent-authored reference text, not proof of safety or permission. Child purposes are forwarded
to the parent with the invocation; changed purposes or arguments invalidate pending approval.

Each forwarded request uses a fresh ID and waits at most five minutes, including queue time. Cancellation,
UI failure, disconnection, unavailable parents, or arguments changed while waiting deny execution.
Forwarded messages are limited to 64 KiB and at most 16 child requests may be pending; exceeding either limit
fails explicitly. Orderly parent shutdown or session replacement removes the channel. A crash also
breaks the connection but may leave its private temporary directory. Children bound to an old session
must be relaunched, not silently attached to its replacement. One interactive
approval owner is supported per process; separate Pi processes own independent channels.

In manual mode the command recognizers use this policy:

| Automatic | Human confirmation |
|---|---|
| Local reads, edits, writes, tests, questions, native subagent launch/control | Privilege elevation and permission/ownership changes, such as sudo/chmod/chown |
| Public Web search/fetch, Git fetch/pull/clone, GitHub view/list/diff | Git push, PR changes, publication, and recognized cloud/deployment changes |
| Dependency installation and ordinary HTTP reads | Explicit HTTP data/authentication submission, authenticated fetch, remote execution/file-transfer tools |
| Ordinary local development commands | Recursive deletion, destructive Git resets/cleaning, disk writes, and direct download-to-shell execution |

These are command/tool recognizers, not a semantic guarantee. Opaque API and remote-management commands
such as `gh api` or SSH/file-transfer clients can require confirmation even for a read-only use.
Dependency installation is automatic even when packages execute install scripts; use only trusted sources.

Reviews and dialogs are serialized and authorize one unchanged invocation in its working directory.
Unavailable parent channels and UI errors fail closed; there are no session-wide grants.
Manual declines deny execution. Recognized literal `git commit` forms,
including common global options such as `-C`, and detected signing or hook bypasses remain blocked;
use `git cc` for commits.

The socket directory is private to the current OS user, and connections require an ephemeral token.
This prevents accidental cross-session approval, not access by hostile code running as the same user.
No request content is persisted by the channel, and it opens no TCP port or external service.

The argument check covers the wait for approval. Pi allows later `tool_call` handlers to mutate
arguments after this guard returns; such changes are outside this check. Load only trusted extensions.

This is a best-effort execution gate, not an OS sandbox or a complete side-effect detector.
Decision mode reviews every agent shell command, but tools outside its coverage remain allowed;
manual mode also allows unrecognized commands. Extensions' internal execution, wrappers, custom tools,
and apparently read-only HTTP requests can have external effects beyond the review evidence.
The instruction policy still requires explicit authorization before remote/shared mutations, including
indirect operations. Native pi-subagents children receive the extension through `subagents.defaultExtensions`
and inherit the guard environment. In Decision mode headless sessions without a valid parent channel cannot execute shell commands.
In manual mode they can perform routine local work but cannot obtain high-risk approvals. A child or project configuration
that replaces its extension list or environment can omit the guard. External CLI agent profiles remain
disabled.

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

### Decision API telemetry

Decision reviews emit `pi.decision.review` logs and spans on the active Pi trace, parented to the
active turn, agent run, or session. An extension event carries only bounded metadata into the
New Relic collector; this measurement does not depend on Pi provider-request hooks.

| Measurement | Metric |
| --- | --- |
| All reviews, including rejection before HTTP | `pi.decision.review.count` |
| Total review time, including credential lookup | `pi.decision.review.duration` |
| HTTP attempts and full request/response time | `pi.decision.request.count`, `pi.decision.request.duration` |
| Request and response byte counts | `pi.decision.request.bytes`, `pi.decision.response.bytes` |
| API-reported input, output, total, cache read/write, optional reasoning tokens | `pi.decision.token.usage`, facet `type` |

Records include `decision_model`, `decision_provider`, `decision_source` (parent/child),
`decision_outcome` (allow/deny/error), `decision_risk`, `tool`, `key_cache_hit`, HTTP status when
available, and a bounded `error_type`. A high-risk answer is a successful review with outcome
`deny` regardless of subsequent human confirmation; credential, evidence, HTTP, timeout, transport,
and response-validation failures have outcome `error`. Request counts exclude reviews that never reached HTTP. Byte counts and usage
are included on the log/span when known; error response bodies are not consumed for telemetry.
Decision tokens are separate from `pi.token.usage` and are not added to Pi turn totals or estimated
model cost. Missing API usage remains absent, not zero; actual API charges are not calculated here.

```sql
FROM Log_Pi SELECT count(*), average(request_duration_ms)
WHERE event.name = 'pi.decision.review'
FACET decision_outcome, http_status SINCE 1 hour ago
```

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
