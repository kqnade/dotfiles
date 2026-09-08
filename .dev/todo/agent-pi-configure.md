# Pi agent configuration

## Objective

Provide a usable Pi coding-agent environment with Sol as the normal agent,
on-demand Astra escalation, scoped Sol/Luna/Spark delegation, LSP, six shared
skills, and ownership-aware hooks. Complete the migration without losing
authentication or conversation history.

Status: partial implementation. Runtime primitives and dependency preparation
exist, but normal Pi startup, the broker, extension tools, and migration gates
are not integrated. Do not treat the unit-tested modules as a working agent
environment or remove the existing environment before the integration gates pass.

## Scope

- Repository: `git@github.com:kqnade/dotfiles`; branch `agent/pi-configure`;
  worktree `/Users/kanato.momose/repos/github.com/kqnade/dotfiles@agent-pi-configure`.
- Implementation baseline: `53c2672939db97ece3fe03943333583f5f736b72`.
- All model roles use provider `openai-codex` and existing ChatGPT OAuth:
  - root/Sol: `gpt-5.6-sol`, `medium`;
  - Astra: `gpt-6-astra`, `medium`;
  - Luna: `gpt-5.6-luna`, `max`;
  - Spark: `gpt-5.3-codex-spark`, `medium`.
- Normal Sol escalates large or complex work to Astra. Astra delegates by task
  size and directly implements algorithmically difficult work. A delegated Sol
  escalates to its existing waiting Astra, without starting another Astra.
  Luna and Spark cannot delegate.
- Four runnable descendants per normal root session, including all nested
  delegation tasks. The normal root itself is exempt. Separate root windows
  have independent limits. Waiting parents release their slots only after
  draining tools/writes; resumption reacquires a slot.
- Ownership sequence: reject new writes, stop/await active writers and process
  groups, confirm termination, snapshot scope, transfer a generation-tagged
  lease. Apply the same sequence on return. Unknown termination quarantines
  ownership and any occupied slot; timeout alone is not proof.
- Adopt npm `@earendil-works/pi-coding-agent@0.85.1` through mise and
  `pi-lsp-adapter@0.1.3`. Exact dependency integrity is in
  `dot_pi/agent/packages/package-lock.json`. Do not adopt a same-named
  `pi-subagents` package: the inspected concurrency controls did not cover the
  required all-descendant session scope. Use official Pi RPC with one supervisor.
- LSP uses mise-owned vtsls, pyright, gopls, and rust-analyzer with
  `installMode: off`. Formatting uses stdin/stdout and ownership CAS writes,
  never a formatter's in-place write option.
- Retain these shared skills for Pi and work Claude: `test-driven-development`,
  `evidence-review`, `sanitize-artifacts`, `using-workflow-skills`,
  `context-handoff`, and `todo-management`, including required helper files.
- Preserve work Claude authentication, history, namespace authorization, and
  unrelated hooks/plugins. Update its Herdr hook and obsolete git-cc prohibition.
- Git commit-message routing: `livesense-inc`/`jobtalk` only to approved Claude;
  other validated GitHub owners to no-tools Sol. Reject unsupported or malformed
  remotes before reading/transmitting a diff. No backend or model fallback.

## Non-goals

- No Herdr integration, MCP setup, dedicated Plan Mode, metrics, or API-key migration.
- No Neovim configuration changes or remote Git mutations.
- No blanket deletion of authentication/history directories or unrelated `.dev` records.
- No removal of old assets until the final authenticated/runtime/migration gates pass.

## Durable records

None: the migration is still active and its integration contract is not yet
validated. This task item owns the current implementation evidence and remaining
decisions; completed operational behavior belongs in repository documentation
when the integration is complete.

## Evidence and implementation boundaries

- Verified in this worktree: focused tests under `scripts/ci/pi/` cover RPC
  model/effort verification, abort admission races, authenticated IPC, scheduling,
  ownership drain/transfer/quarantine, process-group cancellation, scope borrowing,
  supervisor role routing and existing-Astra escalation, formatter scope checks,
  dependency preparation, and commit-message validation.
- `node --test scripts/ci/pi/*.test.mjs` passed as a complete suite at the stopping
  point. Unix-socket/process tests require permissions unavailable in the default
  sandbox; they were also run with elevated local process permissions.
- `/opt/homebrew/bin/python3.14 scripts/ci/validate-repository.py` passed.
  `mise exec -- python3 scripts/ci/validate-repository.py` selected a Python without
  `tomllib` and failed before validation. Use a Python with tomllib when resuming.
- Verified authenticated preflight: all four exact models/efforts returned a
  minimal response through Pi 0.85.1 RPC. Temporary CLI used:
  `/private/tmp/pi-0851-smoke.SZFCDM/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js`.
  Credentials were not copied into the repository. Repeat these probes through
  the final launcher before deleting old assets; a preflight is not proof of
  production broker integration.
- LSP worker reported successful initialize/shutdown for all four pinned
  servers. The adapter loads its seven read-only tools, but SDK diagnostic
  execution stopped at `Theme not initialized. Call initTheme() first.`
  Adapter diagnostics through the actual Pi runtime remain unverified.
  Temporary adapter entry:
  `/private/tmp/pi-lsp-runtime.93xkpP/install/node_modules/pi-lsp-adapter/src/index.ts`.
  Temporary paths are disposable evidence aids, not deployment dependencies.
- Pi catches exceptions from `before_provider_request` and may continue sending.
  `runtime/guard.mjs` therefore terminates on model/effort mismatch. It still
  needs integration with supervisor admission and extension load ordering.
- `runtime/rpc.mjs` verifies state before prompting and fences pre-prompt aborts.
  Its `close()` currently confirms only the RPC process, not all LSP/auxiliary
  descendants. Wire POSIX process groups and the exported `stopProcessGroup`
  helper before using RPC completion as an execution receipt's stop proof.
- `runtime/supervisor.mjs` requires internal `{ stopped: true, result, error }`
  receipts. Model output or untrusted IPC callers must never author this proof.
  `Scopes` is connected to delegation, but no live RPC worker factory/broker exists.
- `Ownership.runProcess` supervises a POSIX process group. Escaped/detached
  writers are not established as contained. Enforce the managed detached-writer
  prohibition and test the actual shell execution boundary before claiming the
  complete stop contract. `expectedHash: null` create-only CAS is not implemented.
- Directory scope snapshots can traverse a large tree. Decide the root/child
  file-scope contract and metadata handling before defaulting to a whole-repo
  scope. Existing source modules are not an OS sandbox.
- `scripts/pi/setup.mjs` stages npm dependencies outside the source tree and
  replaces the external install; it does not apply settings, migrate credentials,
  activate services, or delete old assets.
- `scripts/pi/commit-message.mjs` currently parses/routes/validates output through
  an injected generator. Actual Sol/Claude backend execution and zsh `git cc` /
  `git ccc` integration are not implemented.
- Old Codex/OpenCode/Herdr tools, metrics, skills, and Claude settings remain.
  No complete `mise run apply`, old-environment deletion, or remote mutation was done.

## Commit checklist

- [x] Pin Pi and LSP dependencies and implement external staged package preparation.
- [x] Implement exact model/effort verification, fail-closed request guard, and RPC abort fencing.
- [x] Implement authenticated local IPC and per-root descendant scheduling.
- [x] Implement scoped write leases, stop/drain, transfer snapshots, quarantine, and process-group cancellation.
- [x] Implement supervisor scope handoff and escalation results to the existing Astra.
- [x] Implement stdout formatter selection and scoped CAS writeback primitives.
- [x] Implement commit-message namespace routing and output validation primitives.
- [ ] Integrate and review persistent supervisor crash markers with live worker lifecycle.
- [ ] Implement broker startup/shutdown, private IPC credentials, role prompts, and Pi extension tools.
- [ ] Wire RPC auxiliary-process termination proof, cancellation, permit checks, and scope recovery.
- [ ] Expose managed write/edit/bash/format/delegate/escalate tools; prohibit unmanaged mutation paths and detached writers.
- [ ] Validate saturated four-slot delegation/resume and escalation/cancellation during real writes; assert no overlapping edits or deadlock.
- [ ] Validate formatter failure, mid-format cancellation, concurrent preimage changes, and language-specific real formatter behavior.
- [ ] Execute adapter diagnostics through Pi for all four languages. Gate mutating `/lsp install`, `/lsp update`, `/lsp uninstall`, and `/lsp trust` commands.
- [ ] Implement no-tools Sol and approved Claude commit-message backends; wire `git cc` and `git ccc` with failure tests.
- [ ] Reduce shared skills to six and fix retained helper/reference closure, including Claude skill symlinks.
- [ ] Remove Herdr and retired Codex/OpenCode/metrics management only after all adoption gates pass; preserve auth/history and Claude namespace boundaries.
- [ ] Update public mise tasks, apply/doctor, managed removal paths, validators, CI, and operational documentation to the implemented Pi behavior.
- [ ] Verify migration interruption/reapply with authentication/history sentinels, run final authenticated launcher probes and repository checks, then apply the managed environment.
