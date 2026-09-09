# Pi agent configuration

## Objective

Provide a usable Pi coding-agent environment with Sol as the normal agent,
on-demand Astra escalation, scoped Sol/Luna/Spark delegation, LSP, six shared
skills, and ownership-aware hooks. Complete the migration without losing
authentication or conversation history.

Status: **incomplete; active on macOS arm64**.
The launcher, broker, managed file tools, delegation, and LSP are integrated.
Staged execution and formatter stdout publication are integrated internally,
but remaining formatter runtimes, shell/tool exposure, sandbox verification,
and final migration remain open. Do not remove the existing agent
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
uses staged cwd, copied target/config inputs, and stdout publication with the
snapshot preimage. Remaining runtime and failure coverage is incomplete; keep
it unexposed until the formatter gates below pass. Do not loosen the ownership cwd guard.
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
- Next implementation at this baseline: formatter staging must remap cwd/file arguments, preserve
  config/plugin/runtime closure, and publish independently captured stdout via
  the existing preimage check. Generic shell still needs creation/deletion and
  validated directory output synchronization; the final scope is unchanged.

## Formatter staging checkpoint

- Observed on 2026-09-09 in the same macOS worktree and branch: code baseline
  `7969cdd82182b9553aac33a073bd1aa14366f38e`, clean before this TODO update;
  producing client Codex. No HOME apply or remote mutation occurred.
- Observed: `7da7549` adds trusted `prepare` and `readFiles` inputs to
  `runStagedProcess`. Preparation sees copied file paths and can derive stdin
  from the snapshot. Config files can lie outside a file-level write lease but
  must remain valid regular sources under cwd. Returned publication preimages
  include only owned files. Runtime staging tests passed 9 tests with the one
  expected Darwin unsupported-platform skip.
- Observed: `7969cdd` routes `formatFile` through staged execution, copies known
  ancestor formatter configuration, remaps filename arguments, derives stdin
  and expected hashes from the snapshot, and checks cancellation before
  publication. Standard Node shebang launchers use the active Node executable;
  parent metadata grants cover only ancestors of explicitly granted read paths
  and workspace. Both macOS CI jobs run `scripts/ci/pi/format.test.mjs`.
- Observed: all 10 formatter tests passed on Darwin through real Seatbelt using
  `mise exec -- node --test --test-timeout=15000 scripts/ci/pi/format.test.mjs`.
  Actual installed gofmt formats and publishes, repeated formatting reports
  unchanged, and invalid Go preserves the source. Deterministic subprocess
  fixtures cover staged filename/config lookup, external-edit conflicts,
  cancellation after subprocess completion, skipped formatters, missing
  formatter/config failures, and scope denial. A cancellation regression first
  failed with missing rejection, then passed after the publication check.
- Observed: the combined formatter/staged/Seatbelt suite passed 18 tests with
  one expected skip before the two added publication regressions; those added
  regressions subsequently passed in the complete formatter file. The
  repository validator passed through the installed Python 3.11 command from
  the preceding checkpoint, and `git diff --check` passed. An independent
  bounded review found no additional publication or metadata-grant defects;
  its default-sandbox runtime attempt hit the nested Seatbelt harness limit.
### Package and plugin checkpoint

- Observed on 2026-09-09, same macOS worktree/ref, producing client Codex: code
  baseline `a19179918b66a26e51ddc06f4fd92c9c3f0bc125`, clean before this TODO
  update. No HOME deployment or remote mutation occurred.
- Observed: `352b636` snapshots project context into independent regular files,
  preserving executable context-file modes and remapping internal symlinks into
  the copy. Git metadata is omitted. External/Git links and sockets fail
  explicitly; failed preparation removes partial copies. Existing explicit
  target snapshots cannot be overwritten by the context traversal.
- Observed: `8002917` runs project-installed formatter executables from their
  copies and replaces the fixed config-name copy list with project context.
  Actual Prettier 3.6.2 loads imported JS config and a local parser plugin;
  plugin writes to the original project are denied by Seatbelt. The dedicated
  `scripts/ci/pi/fixtures/formatter-packages/` manifest and integrity lock are
  installed without lifecycle scripts into runner temporary storage. Linux
  unit tests and both macOS CI jobs run the package fixture.
- Observed: `a191799` copies an external formatter's enclosing npm package tree
  into a private staged runtime. Actual external Prettier works, and config
  writes to its original installation are denied. Runtime source/destination
  overlap is rejected. Both package cases first failed with missing
  `../package.json`, then passed through Seatbelt after runtime copying.
- Observed: with `PI_FORMATTER_PACKAGE_ROOT` pointing to the temporary fixture
  install, the combined format-package/format/staging/staged-process/Seatbelt
  suite passed 25 tests with one expected Darwin platform skip. After adding
  external runtime handling, format-package/format/staging passed all 17 tests;
  the five staging tests also passed with the overlap assertions. `npm ci`
  succeeded from the fixture lock. The repository validator passed through
  installed Python 3.11 after package/CI integration; `git diff --check` passed
  before each code commit. Independent bounded review found no additional
  target-snapshot or symlink-isolation defect.
- Incomplete: actual Biome/Ruff and Rust toolchain shim/config/runtime coverage,
  config references outside the copied project/runtime roots, formatter-level
  active-process cancellation and preparation/cleanup failure tests, and Linux
  confinement remain open. Local/standard npm Prettier evidence does not prove
  every package-manager layout. Whole-project/package copying is a correctness
  baseline; large-repository cost has not been measured. No original auth or
  session directories are granted to the formatter to bypass missing inputs.
- Next smallest action: exercise actual Biome/Ruff/Rust installations and close
  their runtime/config gaps, then complete formatter failure gates and expose
  the managed tool. Generic shell creation/deletion/output synchronization and
  Linux containment remain required before final migration.

### Native formatter and failure checkpoint

- Observed on 2026-09-09 in the same macOS arm64 worktree/ref, producing client
  Codex: code baseline `2069667`, clean before this TODO update. No HOME apply
  or remote mutation occurred.
- Observed: `0cd9296` recognizes `ruff.toml`, with a real Ruff regression that
  first returned `skipped` instead of formatting. Ruff 0.16.0 formats a nested
  Python target using ancestor configuration inside Seatbelt. `352ea7b` verifies
  repeated formatting, nested `.ruff.toml` extending the ancestor config,
  quote-style overrides, and invalid syntax preserving the source. CI installs
  the pinned binary wheel into runner temporary storage with uv and runs the
  native test on Linux and both macOS architectures; only arm64 executed here.
- Observed: `39805ad` adds integrity-pinned Biome 2.5.12 to the npm fixture.
  Its actual Node launcher/native package runs from private copies, loads an
  extended config, formats nested JavaScript, reports unchanged on repetition,
  and preserves invalid source after a failed parse. The existing project and
  external Prettier tests pass with the combined package fixture.
- Observed: `2069667` verifies formatter-level active cancellation after a
  readiness marker, preparation failure caused by removal of the staged
  executable, and cleanup failure caused by the child making its workspace
  non-writable. Cancellation discards captured stdout and removes the stage;
  preparation failure preserves the original lease and cleans the stage.
  Successful process exit followed by the sole cleanup permission error blocks
  publication and quarantines original ownership. The test restores permissions
  and removes its fixture; root-user runs skip permission enforcement coverage.
- Observed: the final formatter/native/package/staging/staged-process/Seatbelt
  suite passed **31 tests, 1 expected Darwin platform skip, 0 failures** with
  `PI_RUFF_BIN=/private/tmp/pi-ruff-fixture-0160/bin/ruff` and
  `PI_FORMATTER_PACKAGE_ROOT=/private/tmp/pi-formatter-packages.87IlMy`.
  These temporary paths are disposable fixtures, not runtime dependencies.
  Repository validation passed after Ruff/CI integration with installed
  Python 3.11; every increment passed `git diff --check` and was locally signed.
- Candidate investigation: installed `~/.cargo/bin/rustfmt` resolves to rustup.
  `format.mjs` realpath resolution loses the rustfmt dispatch basename; private
  HOME also prevents rustup from finding its installed toolchain. The installed
  native rustfmt requires adjacent toolchain libraries. Do not execute a
  PATH-resolved rustup outside confinement as a resolution shortcut. Toolchain
  selection, config/edition handling, and safe runtime closure still require
  implementation and actual tests; no Rust fix was included in this checkpoint.
- Remaining: Rust shim/config/native closure, external config references and
  additional package-manager layouts, Linux confinement, managed formatter and
  shell/helper exposure, LSP auxiliaries/recovery, authenticated validation, and
  final migration. Whole-project/runtime copy cost remains unmeasured. This
  evidence does not authorize retirement of existing agent assets.

### Rust formatter pause checkpoint

- Observed on 2026-09-09 in the same macOS arm64 worktree/ref, producing client
  Codex: code baseline `412f80d`, clean before this TODO update. The user
  requested a pause at a Green boundary. No HOME apply or remote mutation occurred.
- Observed: `38d4b2f` copies native rustfmt and its adjacent toolchain `lib`
  tree into a private runtime. The actual installed 1.98.1 formatter first
  aborted because Seatbelt denied its rustc driver library, then formatted
  successfully with copied libraries. The current library copy is about 376 MB
  on this host; a cold native formatter test took about 4 seconds including
  setup/copy. This is correctness evidence, not a large-project performance gate.
- Observed: `b4253e0` selects the nearest copied `.rustfmt.toml`/`rustfmt.toml`.
  A nested config overrides ancestor indentation and enables Rust 2024 parsing.
  `bba1b2a` verifies unchanged repeated output, invalid source preservation, and
  unchanged config bytes. CI supplies the actual native formatter path.
- Observed: `abd2837` adds trusted `readLiterals` to staged execution/Seatbelt.
  Exact directory reads permit listing but not child-file content or original
  writes; exact absent config paths return ENOENT. Real host socket probes
  still fail even when their containing directory is explicitly listable.
  The added permission is nonrecursive and remains behind trusted callers.
- Observed: `412f80d` resolves rustup shims inside a separate staged process,
  preserving the caller cwd for directory override semantics. It grants only
  exact config/executable paths and nonrecursive discovery directories, disables
  auto-installation, and retains the default-deny network/write boundary.
  Returned stdout must be one absolute path resolving to a pre-enumerated
  installed executable. The selected native runtime is then copied for formatting.
  Registered toolchain symlinks are supported as explicit installed runtime inputs.
- Observed: the synthetic registered-toolchain test uses a private RUSTUP_HOME,
  retains a different unavailable override on the nested target directory, and
  confirms caller cwd selection plus unchanged settings. A review identified
  the cwd mismatch; its regression failed with the missing nested toolchain
  before the correction and passed afterward. No host-side rustup subprocess
  was introduced into production resolution.
- Observed: the final native/package/format/Seatbelt/staged-process suite passed
  **29 tests, 1 expected Darwin platform skip, 0 failures**. The earlier suite
  including staging passed 32 tests with one expected skip before shim integration.
  Repository validation passed after resolver/CI integration and before the
  final cwd-only correction. All code increments passed `git diff --check`.
  Fixture environment: `PI_RUSTUP_BIN=~/.cargo/bin/rustup`,
  `PI_RUSTFMT_BIN=~/.rustup/toolchains/1.98.1-aarch64-apple-darwin/bin/rustfmt`,
  plus the preceding Ruff/npm fixture paths. Shell commands must expand these
  paths explicitly rather than pass a literal tilde in an environment value.
- Incomplete: rust-toolchain/plain TOML selection, environment and caller-directory
  override precedence, missing selected toolchains, hostile resolver stdout,
  resolver cancellation, Cargo edition inference, external config references,
  and nonstandard runtime layouts need further targeted verification/implementation.
  The resolver does not forward `RUSTUP_OVERRIDE_UNIX_FALLBACK_SETTINGS`.
  Custom path toolchains outside the enumerated installed set remain unsupported.
  Keep formatter unexposed and do not mark the broad Rust compatibility gate complete.
- Next action after resumption: revalidate this worktree, then complete the Rust
  selection/failure test list before exposing formatter through the managed broker.
  Linux containment, generic shell output synchronization, LSP recovery/auxiliaries,
  authenticated probes, and final migration remain active requirements.

### Rust selection and process environment checkpoint

- Observed on 2026-09-09 in the same macOS arm64 worktree/ref, producing client
  Codex: code baseline `ba85f39`, clean before this TODO update. No HOME apply
  or remote mutation occurred.
- Observed: `daee621` verifies actual rustup selection for plain and TOML
  toolchain files, explicit environment selection, caller-directory override
  precedence, and a missing selected toolchain. Failures preserve source and
  settings; successful selection uses the private native runtime.
- Observed: `922543a` maps resolver stdout directly to captured installed paths
  and their canonical aliases. Unregistered, missing, relative, empty, and
  multiline output produces `FORMATTER_MISSING` without resolving arbitrary
  returned paths. Both macOS CI jobs now run the resolver tests.
- Observed: `b93e2c9` verifies cancellation after a resolver readiness marker,
  stage removal, unchanged original source, and a usable original lease. The
  fixture uses one process via `exec /bin/sleep`. An exploratory multi-process
  fixture once quarantined on unconfirmed descendant termination; subsequent
  repetitions passed, but general descendant cancellation is not proven by
  the single-process regression. Do not relax quarantine on uncertain exit.
- Observed: a synthetic parent-only environment variable reached the staged
  child despite the sandbox environment allowlist. `ba85f39` fixes the merge
  in Ownership supervision by explicitly disabling inheritance for staged
  execution. Direct Ownership callers retain default environment overlays.
  The regression first failed on the synthetic value and then passed with
  real Seatbelt. No actual credential values were read. Both macOS CI jobs
  include staged-process tests so this boundary is checked on Darwin.
- Observed after the environment fix: ownership, staged-process, rustup, and
  Seatbelt tests passed **25 tests, 1 expected Darwin platform skip, 0 failures**.
  Actual native/package/formatter tests passed **24 tests, 0 skips, 0 failures**
  using the preceding Rust, Ruff, and npm fixtures. Repository validation and
  `git diff --check` passed. All four code increments are locally signed.
- Remaining: Cargo edition inference, external config references, additional
  package-manager/runtime layouts, and the unsupported rustup settings noted
  above. Keep formatter unexposed until its compatibility gates pass. Linux
  confinement, shell/helper output synchronization, LSP auxiliaries/recovery,
  authenticated probes, and final migration remain incomplete.
- Next action: implement and verify Cargo manifest edition selection against
  copied inputs, including workspace inheritance and explicit formatter-config
  precedence, before advancing the remaining formatter compatibility gates.

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
4. Complete formatter config/plugin/runtime read closure and active-process
   cancellation, preparation failure, and cleanup failure tests. Preserve the
   staged stdout/preimage publication verified in the formatter checkpoint.
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
- [x] Integrate formatter staged stdin/path/config and snapshot-based stdout publication; verify actual gofmt success/failure and publication conflict/cancellation.
- [x] Verify project and external npm Prettier packages with copied config imports/plugins and original project/runtime protection.
- [x] Verify actual Ruff and Biome, plus formatter active cancellation, preparation failure, and cleanup failure.
- [ ] Complete Rust formatter runtime/config closure and remaining formatter compatibility coverage.
- [ ] Expose complete managed shell/helper execution with scoped output validation and safe Git operation boundaries.
- [ ] Verify LSP auxiliary-process original-write restrictions and persistent supervisor recovery under real failures.
- [ ] Obtain explicit approval and repeat final synthetic authenticated launcher/delegation/cancellation probes.
- [ ] Complete interruption/reapply migration tests with authentication/history sentinels and explicit service retirement.
- [ ] Remove retired agent/metrics/skill/Herdr management only after adoption gates pass; preserve work Claude boundaries.
- [ ] Update final operating documentation, public tasks, validators, and CI; apply the complete managed environment safely.
