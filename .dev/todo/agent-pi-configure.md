# Pi agent configuration

## Objective

Provide a usable Pi coding-agent environment with Sol as the normal agent,
on-demand Astra escalation, scoped Sol/Luna/Spark delegation, LSP, six shared
skills, and ownership-aware hooks. Complete the migration without losing
authentication or conversation history.

Status: **incomplete; active on macOS arm64**.
The launcher, broker, managed file tools, delegation, and LSP are integrated.
Staged execution primitives exist, but shell/formatter exposure, sandbox
verification, and final migration remain open. Do not remove the existing agent
environment or mark this item complete before the remaining gates pass.

## Scope

- Repository: `git@github.com:kqnade/dotfiles`; branch `agent/pi-configure`.
- Evidence captured on 2026-09-09 in the Linux/WSL worktree
  `/home/kqnade/repos/github.com/kqnade/dotfiles` at code baseline `e8b55ae`.
  This is historical Linux evidence; current macOS evidence is recorded below.
- Commits through this baseline are local; no push or other remote mutation was
  performed. Reconcile the Mac checkout, remote identity, branch, dirty state,
  and commit availability before relying on this record. Keep its `.dev/`
  independent rather than redirecting it to another worktree.
- All roles use provider `openai-codex` and existing ChatGPT OAuth, as defined
  in `dot_pi/agent/runtime/models.mjs`:
  - root/Sol: `gpt-5.6-sol`, `medium`;
  - Astra: `gpt-6-astra`, `medium`;
  - Luna: `gpt-5.6-luna`, `max`;
  - Spark: `gpt-5.3-codex-spark`, `medium`.
- Root delegates to one Astra. Astra delegates to Sol/Luna/Spark. A delegated
  Sol escalates to its existing waiting Astra; leaves cannot create workers.
  Four runnable descendants are allowed per root; the root is exempt.
- Waiting parents drain tools and relinquish runnable slots. Ownership uses
  generation-tagged leases, drain/transfer/renew, and quarantine when process
  termination cannot be confirmed. Unknown termination must not free a slot
  or authorize publication.
- User-selected macOS execution design: Seatbelt confines work to private
  byte copies; the parent captures and validates outputs before CAS publication
  to originals. This prioritizes original-file protection and does **not**
  promise disappearance of every detached process. No VM was selected.
- Pi `0.85.1`, `pi-lsp-adapter` `0.1.3`, and dependency integrity are declared
  under `dot_pi/agent/packages/`. Use the managed launcher and broker, not an
  unrelated subagent package.
- Retain six shared skills for Pi and work Claude: `test-driven-development`,
  `evidence-review`, `sanitize-artifacts`, `using-workflow-skills`,
  `context-handoff`, and `todo-management`, including their resource closure.
- Preserve work Claude authentication, history, namespace authorization, and
  unrelated hooks/plugins. Commit generation routes `livesense-inc`/`jobtalk`
  only to approved Claude; other validated GitHub owners use no-tools Pi Sol.
  This Codex account must not access actual company repositories.

## Non-goals

- No new Herdr integration, MCP setup, Plan Mode, metrics, or API-key migration.
- No Neovim configuration changes or remote Git mutations.
- No blanket deletion of authentication/history or unrelated `.dev` records.
- No removal of old assets until authenticated/runtime/migration gates pass.
- No unsandboxed fallback when a platform or sandbox setup is unsupported.

## Durable records

None: the migration remains active and its final operational contract is not
validated. This TODO owns the resumption checkpoint. Promote durable operating
instructions and required evidence before eventually completing the item.

## Verified implementation

- Launcher/broker/extension integration, fixed model checks, authenticated IPC,
  cancellation, role permits, four-slot scheduling, and crash-marker handling
  have runtime tests. Parent resumption renews the drained lease before
  reacquiring its slot. Borrowed scopes transfer back to the correct owner.
- Managed tools currently exposed in `extensions/managed.ts` are `read`,
  `write`, `edit`, `delegate`, and `escalate`, plus the read-only LSP adapter.
  **Bash, formatter, and skill-helper execution are not exposed.** `user_bash`
  returns a denial; throwing from that hook would let Pi fall back to execution.
- Writes support expected-hash replacement and atomic create-only publication
  with `expectedHash: null`. Replacement CAS serializes this Ownership instance;
  it is not an atomic transaction against arbitrary external processes.
- Namespace guards inspect raw and Git-rewritten origin URLs. Commit generation
  rejects effective owner/repository identity changes before reading the diff,
  and rechecks identity and staged content before committing. Synthetic local
  fixtures cover company namespaces; no real company repository was accessed.
- The six-skill loader validates canonical resource identity and exact helper
  closure before launch. Shared routing uses the six current owners. Seven
  legacy skill directories and Claude symlinks remain until the final gate.
- Pi's materialized global `AGENTS.md` includes canonical coding/workflow/Git
  rules and Pi role topology. It does not include Codex/Herdr delegation rules.
- LSP lifecycle drains pending tools and shuts down managed servers before
  delegation/escalation; resumed parents get fresh managers. Actual diagnostic
  tests through Pi passed for TypeScript, Python, Go, and Rust. Detached
  auxiliary-process containment remains unproven.

### Staged execution baseline

The following code increments are committed:

- `b29ced3`: `runtime/staging.mjs` creates private byte-copy workspaces with
  immutable source hashes. It rejects missing, nonregular, escaping, duplicate,
  and symlink sources. Copies have independent inodes; cleanup removes the
  staging area. Creation/deletion/directory synchronization are not implemented.
- `f5e185e`: `runtime/sandbox-env.mjs` supplies only fixed HOME/TMPDIR/PATH and
  locale values. `runtime/seatbelt.mjs` generates a default-deny profile with
  explicit system/runtime reads, workspace writes, and `/dev/null` writes.
  It grants no network, Mach, AppleEvents, or POSIX IPC access. Path strings with
  quotes, backslashes, or control characters are rejected.
- `8d80534`: `runtime/staged-process.mjs` holds the original ownership run while
  a separate staging Ownership supervises the command. Results return only
  after cleanup. Unknown termination/cleanup failure quarantines the original
  lease. The default backend invokes `/usr/bin/sandbox-exec` on Darwin and
  rejects other platforms with `UNSUPPORTED_SANDBOX`.
- `e8b55ae`: lifecycle tests cover success, scope rejection, command failure,
  cancellation/drain/renew, unsupported-platform rejection, and quarantine.
  The orchestration fixture injects the OS boundary and therefore is **not**
  evidence of OS confinement. Both macOS CI jobs include the real Seatbelt test.

`runStagedProcess` returns stdout and original-file preimage metadata; it does
not publish changes or capture arbitrary staged-file outputs. `format.mjs`
still uses the original cwd/path through `Ownership.runProcess`; wire staged
execution before exposing it. Do not loosen that existing cwd guard globally.
Keep sandbox configuration and `readPaths` behind trusted internal callers:
recursive read grants must not expose auth directories, broker sockets, or
unrelated sessions. A mode-0700 directory alone is not proof of a staging
capability. Do not treat the SBPL generator as a command allowlist.

## Current verification and deployment evidence

- At `e8b55ae`, the full local Pi runtime suite passed: **174 passed, 1 skipped,
  0 failed**. The skipped test is the macOS Seatbelt runtime test. The repository
  validator passed, and `git diff --check` was clean.
- Commands used:

  ```bash
  PI_PACKAGE_ROOT="${XDG_CACHE_HOME:-$HOME/.cache}/pi/agent/packages" \
    mise exec -- node --test scripts/ci/pi/*.test.mjs \
    scripts/ci/pi-runtime-extension.test.mjs \
    scripts/ci/pi-runtime-lsp.test.mjs scripts/ci/pi-lsp-diagnostics.test.mjs
  PYTHONDONTWRITEBYTECODE=1 mise exec -- python3 scripts/ci/validate-repository.py
  ```

- Linux logs are disposable evidence aids, not resumption dependencies:
  `/tmp/pi-staged-runtime-suite.log` and
  `/tmp/pi-staged-repository-validator.log`.
- Harness limitation: default-sandbox Node children sometimes return empty
  stdout despite exit 0. Elevated execution yielded the named passing tests
  and a passing deployed Pi doctor. Do not fix product code around this harness
  symptom or infer test coverage from a single empty child-test result.
- Earlier authenticated evidence included all four fixed models and a synthetic
  managed delegation run producing five files with peak four leaves and an
  empty journal. It predates the latest global rules/lease/sandbox changes;
  final authenticated validation is still required.
- A subsequent synthetic real-model probe was rejected by automatic approval
  review because the precise outbound payload/context was not explicitly
  approved. The user has **not** approved that probe. The macOS design approval
  and TODO/commit request do not authorize it. Before retrying, present a
  concrete synthetic payload/destination and obtain explicit approval.
- The old `/tmp/pi-managed-capacity-probe.mjs` preflight now encounters the
  materialized real `~/.pi/agent/AGENTS.md`; do not remove global rules or copy
  OAuth credentials to bypass isolation. Rebuild a genuinely synthetic context
  while preserving OAuth refresh ownership, then validate the final launcher.
- Linux HOME received nine scoped chezmoi targets through the earlier
  `51da31b` baseline: shared rules/skills, mise manifests, zsh `cc`, Pi wrapper,
  `.pi/agent`, and `.pi/bin`. Hash/mode checks preserved auth, sessions, and
  `.zshrc`. `pi --version` returned `0.85.1`, mise resolved the managed Pi, and
  `scripts/pi/doctor.mjs` passed. The new sandbox modules have not been applied.
  This Linux deployment says nothing about the Mac HOME state.
- Full `mise run apply` was not run because `.zshrc` has pre-existing manual
  changes (`MM` in chezmoi status). Preserve/reconcile those changes rather than
  overwriting them. No services or authentication/history were removed.

## macOS verification checkpoint

- Observed on 2026-09-09: remote `git@github.com:kqnade/dotfiles`, branch
  `agent/pi-configure`, worktree
  `/Users/kanato.momose/repos/github.com/kqnade/dotfiles@agent-pi-configure`.
  Code baseline: `85fa015f50da7415461ab5e3f4fa3c79a6b194f9`; producing client:
  Codex. The code worktree was clean before this TODO update. No remote mutation
  or HOME deployment was performed.
- Observed: `774c4c6` adds narrowly scoped system reads for macOS
  binary startup: root directory itself, `/private/var/select/sh`, and metadata for
  `/var` and `/System/Cryptexes/OS`. The real Seatbelt test confirms staged
  writes, explicit original reads, denied ungranted reads, denied original
  append/create/rename/unlink/hardlink/symlink writes, and original inode/content.
- Observed: `fb68538` canonicalizes two ownership-test temporary roots. The
  `/var` versus `/private/var` alias otherwise prevents test hooks from firing.
  The complete ownership file passed all 12 tests on this Mac.
- Observed: `e6ff1fb`, `7641753`, and `85fa015` add compiled native probes in
  `scripts/ci/pi/fixtures/seatbelt-probe.c`, exercised by the existing macOS CI
  entry `scripts/ci/pi/seatbelt-runtime.test.mjs`. Real reachable loopback TCP
  and pathname Unix sockets are denied under Seatbelt. A pre-created POSIX
  shared-memory object and a reachable Mach service are inaccessible; positive
  controls outside Seatbelt pass. A writable parent FD is closed in the managed
  child. A child that calls `setsid()` and outlives its leader can write its
  stage but cannot open the original for append. All three Darwin runtime
  tests passed with no skips using:
  `mise exec -- node --test --test-timeout=25000 scripts/ci/pi/seatbelt-runtime.test.mjs`.
- Limitation: the detached probe retains stdout until reporting denial; it does
  not establish disappearance of detached processes or output publication after
  staging cleanup. The security contract still prioritizes original protection.
  Mach lookup rejection is not proof against every possible OS deputy. Intel
  macOS and actual formatter/config/plugin compatibility remain unverified.
- Observed: the related Seatbelt/staging/environment/process suite passed 12
  tests with one expected unsupported-platform skip on Darwin. Repository
  validation passed with the already installed Python 3.11 executable at
  `~/.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/bin/python3`.
  macOS `/usr/bin/python3` lacks `tomllib`; no dependency installation or product
  workaround was made. `git diff --check` passed before each code commit.
- Observed harness boundary: nested `sandbox_apply` fails with `Operation not
  permitted` inside Codex's sandbox. Actual Seatbelt tests ran through approved
  elevated execution. Broadening the product sandbox was not used as a harness
  workaround.
- Observed: a disposable direct `runStagedProcess` probe with installed Go
  `1.27.1` gofmt returned the independently expected formatted Go source on
  stdout inside Seatbelt (exit 0). This checks real gofmt runtime compatibility,
  not `formatFile` integration or CAS publication. Other formatters and their
  config/plugin closure remain unverified.
- Next implementation: formatter staging must remap cwd/file arguments, preserve
  config/plugin/runtime closure, and publish independently captured stdout via
  the existing preimage check. Generic shell still needs creation/deletion and
  validated directory output synchronization; the final scope is unchanged.

## Resume on macOS

1. Verify the authorized remote, current worktree, branch, commits, dirty state,
   installed dependencies, and relevant target diffs. Treat this Linux record
   as candidate evidence for the Mac runtime. Do not assume the local commits
   have been pushed or that the Mac HOME matches the Linux deployment.
2. Run `mise exec -- node --test scripts/ci/pi/seatbelt-runtime.test.mjs`.
   The test requires successful staged write/read and original read, rejects
   original append/create/rename/unlink/hardlink and symlink escape writes,
   checks original inode/content, and checks staging cleanup. It must actually
   execute on Darwin; a skip is not success for this gate.
3. Add and run negative probes for external network/Unix sockets, Mach/shared
   memory deputies, inherited writable FDs, and detached late writers. Validate
   parser/path behavior and real formatter/runtime compatibility on supported
   macOS architectures. Fix narrow required permissions from evidence; do not
   substitute `(allow default)` or blanket IPC grants.
4. Wire formatter stdin/stdout through staging and CAS publication, including
   config/plugin/runtime read closure, cancellation, preimage changes, and
   cleanup failure. Capture independent output bytes before publication.
   `git cc` needs the real Git metadata, OAuth, and signing channel and must
   remain a separate trusted operation, not a claim of generic sandbox shell
   compatibility.
5. Complete shell/helper execution and Linux containment without reducing the
   final goal to formatter-only or existing-file-only support. For Linux,
   avoid mounting the original checkout/HOME/run directories: pathname Unix
   sockets can reach host helpers despite readonly mounts. A candidate is
   minimal system read mounts plus private copies of explicit user runtime
   inputs, rejecting sockets/devices and escaping symlinks. This is not yet
   implemented or verified as a complete boundary.
6. Complete authenticated and migration gates before removing the old assets,
   then update operating docs/validators and apply the managed environment.

Linux probe caveat: an exploratory minimal-root bwrap command failed with
`--disable-userns requires --unshare-user` despite `--unshare-all`; no fallback
ran and the original sentinel stayed unchanged. Explicit user-namespace flags
need correction and actual tests before adopting that command. Earlier PID
namespace probes are partial evidence, not proof of the proposed full adapter.

## Retirement requirements

Removing a mise service declaration does not stop an installed service. A
synthetic Linux fixture verified explicit removal via
`mise bootstrap services remove codex-usage-exporter --yes` after removing its
manifest declaration: stop/disable/reload occurred, exporter unit disappeared,
and yaskkserv2 plus auth/state sentinels remained. Use a dry run first. macOS
LaunchAgent removal still requires actual verification. Update validators that
currently require exporter declarations as part of retirement.

Keep Codex/OpenCode/Herdr/ccusage/metrics management, the seven legacy skills,
and Claude Herdr integration until adoption gates pass. Test setup failure,
successful reapply, and repeated reapply with auth/history sentinels; preserve
Claude namespace boundaries and unrelated settings.

## Commit checklist

- [x] Pin Pi/LSP dependencies and external package preparation.
- [x] Integrate launcher, broker, managed read/write/edit/delegate/escalate tools, role guards, and IPC.
- [x] Integrate ownership CAS/create-only writes, scope borrowing, drain/renew, scheduling, and quarantine.
- [x] Implement raw/effective Git origin authorization and no-tools Sol/approved Claude commit routing.
- [x] Integrate six-skill discovery/resource closure and shared Pi rules; retain legacy assets pending retirement.
- [x] Integrate LSP lifecycle handoff and test actual four-language diagnostics through Pi.
- [x] Add private staging, sanitized environment, Seatbelt profile generation, and staged process orchestration.
- [x] Add lifecycle regressions and macOS arm64/Intel CI Seatbelt test wiring.
- [ ] Execute and harden Seatbelt on macOS, including IPC/FD/detached-writer negative probes and tool compatibility.
- [ ] Implement and verify Linux sandbox execution with host socket/FD isolation.
- [ ] Integrate formatter staging and validated CAS publication with real formatter failure/cancellation/conflict tests.
- [ ] Expose complete managed shell/helper execution with scoped output validation and safe Git operation boundaries.
- [ ] Verify LSP auxiliary-process original-write restrictions and persistent supervisor recovery under real failures.
- [ ] Obtain explicit approval and repeat final synthetic authenticated launcher/delegation/cancellation probes.
- [ ] Complete interruption/reapply migration tests with authentication/history sentinels and explicit service retirement.
- [ ] Remove retired agent/metrics/skill/Herdr management only after adoption gates pass; preserve work Claude boundaries.
- [ ] Update final operating documentation, public tasks, validators, and CI; apply the complete managed environment safely.
