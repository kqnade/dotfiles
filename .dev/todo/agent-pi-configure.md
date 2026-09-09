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

### Cargo edition and macOS process-stop checkpoint

- Observed on 2026-09-09 in the same macOS arm64 worktree/ref, producing client
  Codex: code baseline `aaa9748`. No HOME apply or remote mutation occurred.
- Observed: `3ae29ac` reads the closest copied Cargo package manifest with
  pinned `smol-toml` 1.8.0 and passes its language edition to native rustfmt.
  An actual async-source regression first failed under Rust 2015 and passed
  with the package's 2024 edition. Original manifest bytes remain unchanged.
  The parser is loaded from the absolute managed `PI_PACKAGE_ROOT`; it does
  not search the project for executable parser code. Linux unit CI prepares
  the managed package root through `scripts/pi/setup.mjs`.
- Observed: `b109179` reconciles the existing exact dependency-list test with
  the parser pin; that test failed after the initial manifest addition.
  `478360c` supports `edition.workspace = true` from an ancestor workspace's
  `[workspace.package]`, with a failing-then-passing parser regression and
  macOS CI wiring. `58631c7` makes doctor reject a missing parser entry file.
  Doctor does not yet compare the parser's installed version to the source pin.
- Observed: whole-suite macOS validation exposed four path-alias fixture
  failures, two process-stop failures, and two commit-backend readiness
  timeouts. `d6b19be` canonicalizes fixture expectations and the snapshot fault
  injection target; all four focused tests pass under elevated execution.
- Observed: `6795b91` waits within the existing timeout for an uncertain
  process-group observation to become a confirmed disappearance. `1426305`
  also rechecks disappearance after SIGTERM returns EPERM. Neither treats
  EPERM as proof of termination; permanent uncertainty still quarantines the
  worker and reports failure. Deterministic OS-boundary regressions and the
  34-test ownership/RPC/session/launch suite pass. The full-suite result is
  recorded below; isolated successes alone do not resolve readiness timeouts.
- Evidence: Apple's XNU `bsd/kern/kern_sig.c` process-group iterator excludes
  zombie entries and can return EPERM when no signalable member is counted:
  https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/kern_sig.c
  This supports the transient observation hypothesis; the runtime still
  requires an actual ESRCH before reporting an empty process group.
- Observed: `aaa9748` extends synthetic backend startup
  readiness to 10 seconds while retaining post-readiness termination checks.
  It canonicalizes the extension broker fixture and trusted-project LSP
  fixtures, and runs all Pi runtime tests in both macOS jobs. The adapter's
  normal trust registration stores canonical paths; lexical fixture paths had
  prevented the tests from exercising trusted overrides.
- Observed: the combined runtime/extension run passed all **189 runtime tests**
  with **1 expected Darwin platform skip**, but initially failed five extension
  tests. After the fixture corrections and missing tool installation, the
  separate extension/LSP run passed **16 tests, 0 failures, 0 skips**, including
  actual TypeScript, Python, Go, and Rust diagnostics. Together these cover
  205 successful tests and one expected skip; they are not a claim that the
  earlier combined invocation returned success. Repository validation passed
  after CI expansion; final diffs passed whitespace checks.
- Observed local setup: installed mise-locked `npm:@vtsls/language-server`
  0.3.0 and `npm:pyright` 1.1.413, which were absent on this Mac. Existing
  gopls and rust-analyzer were used. No dotfile apply, service retirement,
  authentication/history modification, or remote mutation was performed.
- Disposable fixtures: managed dependencies from the current lock are installed
  at `/private/tmp/pi-cargo-packages` using npm ci with scripts disabled.
  Rust, Ruff, and formatter-package fixtures use the preceding checkpoint's
  paths. These paths are test inputs, not deployment requirements.
- Remaining Cargo test list: explicit `package.workspace` paths (currently
  rejected), missing/incomplete workspace inheritance, malformed manifests,
  edition defaults, config-versus-CLI precedence, and manifest changes after
  snapshot. External configuration/runtime layouts and all broader adoption
  gates remain active. Formatter is still internal and migration incomplete.
- Next action: complete Cargo failure/precedence cases and explicit workspace
  paths. Preserve the Linux, shell/helper, LSP auxiliary/recovery, authenticated,
  and migration gates.

### Cargo workspace resolution checkpoint

- Observed on 2026-09-09 in the same macOS arm64 worktree/ref, producing client
  Codex: code baseline `5e85eb4`, clean before this TODO update. No HOME apply,
  package installation, authentication/history change, or remote mutation occurred.
- Observed: `639a020` resolves an explicit relative `package.workspace` inside
  the copied project, including a sibling workspace that overrides an ancestor.
  The initial regression failed because explicit workspace paths were rejected.
  Lexical and canonical boundary checks reject traversal, absolute paths, and
  symlink escapes before reading a referenced manifest outside the copied tree.
  Missing explicit references fail rather than falling back to an ancestor.
- Observed: `ed39407` verifies Cargo's 2015 default without an explicit edition
  or inheritance opt-in. The real rustfmt regression confirms Cargo's language
  edition takes precedence over a conflicting rustfmt config edition while the
  config's indentation still applies. Malformed TOML prevents publication and
  leaves the original source and ownership usable.
- Observed: `5e85eb4` rejects absent, incomplete, or invalid inherited editions.
  A real formatter test changes the original manifest after staging and proves
  the copied edition is used while the changed original manifest is preserved.
  These cover the preceding checkpoint's Cargo test list for copied manifests;
  external/absolute workspace roots still require a separate read-closure design.
- Observed: Cargo resolution, actual native formatters, and formatter publication
  tests passed **34 tests, 0 failures, 0 skips**. Repository validation and
  whitespace checks passed. The suite took about 95 seconds on this run; copying
  native toolchain libraries remains significant and is not a performance gate.
- Next implementation: generic shell/helper execution needs immutable staged
  output capture and a validated change manifest before original-file publication.
  Current staged execution returns stdout and original preimages only, requires
  at least one existing file, and has no output-capture callback. Ownership has
  regular-file CAS/create-only writes but no directory/delete or multi-path
  preflight/publication operation. Start with capture-before-cleanup and changed
  existing files, then add nested creation, deletion, directories, and type changes.
  This is an increment order, not a reduction of the required shell capability.
- Design constraint for that work: runtime files introduced by trusted preparation
  must not appear as user-created outputs. Capture the execution baseline after
  preparation, retain explicit lease-root checks, validate symlinks/special files,
  and preflight original state before publication. Partial publication and
  rollback semantics still require a primary-agent decision and failure tests.
  Do not expose shell or helper execution before these gates pass.
- Remaining: external formatter config/runtime layouts, parser installed-version
  checking in doctor, generic shell/helper publication, Linux confinement, LSP
  auxiliary containment/recovery, authenticated validation, and final migration.
  Existing agent assets remain managed until the adoption gates pass.

### Staged output capture checkpoint

- Observed on 2026-09-09 in the same macOS arm64 worktree/ref, producing client
  Codex: code baseline `51ebab0`, clean before this TODO update. No HOME apply,
  package installation, authentication/history change, or remote mutation occurred.
- Observed: `2420fde` adds a trusted internal asynchronous capture callback after
  command success and before staging cleanup. The original ownership lease stays
  held. The callback is not a model-facing capability or a validated manifest.
  `ab6be54` rejects cancellation during capture or successful cleanup with
  `ABORT_ERR`, after cleanup; the initial cancellation regression failed because
  captured output was returned. `c905511` verifies that a capture exception is
  propagated unchanged, cleanup succeeds, originals remain unchanged, and the
  original lease remains usable. This failure regression passed on existing code.
- Observed: capture/staged-process tests passed 10 tests with one expected Darwin
  platform skip. The preceding cancellation run including actual Seatbelt probes
  passed 13 tests with the same skip. These are separate runs, not one combined
  suite. Linux confinement was not verified.
- Decision: use descriptor-relative traversal for the output reader. Node path
  recursion plus final-component O_NOFOLLOW does not prevent an intermediate
  directory symlink swap, and process-group completion does not establish that
  every detached child has disappeared. Before/after realpath checks are not a
  substitute for descriptor-relative lookup.
- Observed: `05efeab` adds internal `capture-tree.py`, using Python standard-library
  directory fds, scandir(fd), open(dir_fd=...), O_DIRECTORY/O_NOFOLLOW, and regular
  file fstat plus O_NONBLOCK. Its normal-case test records binary bytes as base64,
  executable mode, and empty directories; later writes do not change the emitted
  manifest. Other special files are rejected.
  `0434a82` limits aggregate file bytes (default 64 MiB, configurable internally)
  and fails before JSON emission on overflow. Both behavior tests failed for the
  intended missing behavior before implementation; the final two tests pass.
- Observed: `fb3bf47` records symlink targets with readlink(dir_fd=...) without
  traversing directory or dangling links. This is raw capture data: absolute and
  escaping target strings are also recorded, not authorized for publication.
  Publication must validate the complete link graph; normalizing each target
  independently is insufficient when a target traverses another link before `..`.
- Observed: `5b27eb1` bounds aggregate entry count during scandir enumeration
  (default 100,000), including directories and empty files. `1a8d863` bounds
  serialized metadata excluding content (default 8 MiB), including link targets.
  These limits complement the 64 MiB file-byte limit. Link capture and both
  resource limits each had the intended failing test before implementation.
- Observed: `9173479` adds three deterministic descriptor-race regressions using
  Python os.open wrappers around real filesystem operations. After an intermediate
  directory fd opens, replacing its pathname with a symlink to a sibling outside
  the stage still captures only the original stage bytes. Replacing a regular
  file with an external symlink before open rejects with ELOOP; replacing it with
  a FIFO rejects as nonregular, with empty stdout and no timeout kill or signal.
  The race tests passed on existing production behavior, not an observed Red fix.
- Observed: the combined helper/race suite passed 8 tests, no failures or skips,
  on macOS arm64. Repository validation and whitespace checks passed. The race
  probes are descriptor-reader evidence, not new OS sandbox or Linux evidence.
  All code commits above are local signed commits.
- Observed: `7602336` connects `capture-tree.mjs` to the staging lease's process
  supervisor through a trusted internal runProcess callback. The wrapper requires
  an absolute Python path, canonicalizes it, uses -B/-I and a replacement minimal
  environment, imposes a 30-second timeout and 128 MiB limit per output stream, then
  freezes the parsed array and primitive records. A real staged command modifies
  an existing file and creates a nested file; both are captured before cleanup,
  originals remain unchanged, and attempts to mutate the returned records fail.
  The capture callback runs trusted host code; it is not an untrusted shell path.
- Observed: `ca10103` adds an optional trusted snapshot callback after preparation
  and before command execution, returning baseline alongside captured output.
  The integration test proves prepared runtime bytes appear unchanged in both
  manifests while the command's changed file differs. `7d9879d` adds raw tree
  comparison producing copied, frozen before/after records for additions, changes,
  and removals, omitting equal entries and preserving deterministic path order.
  These three features each had the intended failing test before implementation.
- Observed: `6c46397` verifies cancellation of a live Python capture helper. Original
  ownership drain rejects new work, waits for cancellation and cleanup, then permits
  renewal; the helper PID reports ESRCH, the stage is absent, and the original file
  is unchanged. The baseline integration also compares actual helper output and
  excludes the unchanged prepared runtime. These regressions passed existing code.
- Observed: combined staged output/process, helper/race, and tree-comparison tests
  passed 22 tests with one expected Darwin platform skip. Repository validation and
  whitespace checks passed. No complete formatter or Linux runtime suite was run.
- Observed: `441c119` rejects duplicate paths in either snapshot before comparison;
  previously a later record could hide an earlier change. `c23e02a` requires
  canonical relative UTF-8 paths: absolute paths, empty/dot/dot-dot components,
  NUL, and unpaired surrogates are rejected instead of being normalized or decoded
  into a different path. Non-UTF-8 filesystem names are not supported for publication.
- Observed: `a6e6519` validates array/object shape and exact file/directory/symlink
  fields, permission-bit integer modes, canonical Base64 bytes, and nonempty UTF-8
  link target strings without NUL. A discovered type-coercion case using ['file']
  also failed before the strict string-type fix. `51ebab0` requires each non-root
  entry's immediate recorded parent to be a directory, independent of record order.
  These four increments each had intended failing cases before implementation.
- Observed: the final combined comparison, staged output/process, and helper/race
  suite passed 26 tests with one expected Darwin platform skip. Repository validation
  and whitespace checks passed. All four implementation commits are locally signed.
- Incomplete: validation currently runs before comparison; captureTree itself returns
  frozen raw helper output. Neither result authorizes publication. Absolute/escaping
  link targets remain raw data pending full link-graph validation. Original lease
  scope, filesystem aliases, original preimages/modes, and publication semantics
  still require validation. Do not expose shell publication on the strength of the
  record-format checks alone.
- Incomplete: Python is not a pinned mise runtime. Integration fixtures use the
  explicitly supplied /usr/bin/python3; other helper tests use test-environment
  python3. Neither is a production discovery contract. Pin the managed interpreter
  through mise.toml/mise.lock, resolve its trusted absolute executable in launcher
  orchestration, and extend scripts/pi/doctor.mjs plus CI/validator coverage. Existing
  npm package preparation needs no Python package dependency. Validate the selected
  installation rather than treating an arbitrary project PATH entry as trusted.
- Next test list: exact/zero resource-limit boundaries; explicit traversal-depth
  bounds; root and directory-before-open swaps; concurrent content changes;
  static special-file rejection; raw external-link capture without reads; complete
  graph-based escaping-link validation before publication. Descriptor-relative
  reads do not promise a point-in-time consistent tree while a detached child
  mutates it. Snapshot/helper failure before command launch, command-failure
  suppression of capture, helper timeout/output overflow, and cleanup failure after
  successful capture also need direct coverage. Add mode/type/link comparison,
  positive Unicode/binary boundary cases, and link-graph escape cases before using
  differences for publication. Record shape, duplicate paths, lexical paths, and
  immediate-parent consistency have direct failure coverage.
- Next integration: validate captured manifests, enforce original lease roots,
  reject escaping link graphs and malformed records, preflight all original state,
  and define tested partial-publication/rollback semantics. Empty projects/new-only
  shell invocations, directory creation/deletion, file deletion, modes, and type
  changes remain required. The staged API still requires an existing file.
- Remaining adoption gates are unchanged: external formatter config/runtime
  closure, doctor parser-version checking, complete generic shell/helper publication,
  Linux confinement, LSP auxiliary containment/recovery, authenticated validation,
  and final migration. Keep existing agent assets until all gates pass.

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
