# AGENTS.md

Repository-specific instructions for agents changing this dotfiles repository.

## Repository model

This repository converges a complete user environment on macOS arm64, Fedora x64,
Arch Linux x64, and Fedora/Arch under WSL x64. Intel macOS is not a supported target.

- **mise** owns tools, system packages, user settings, OS defaults, services, hooks, and the
  public tasks that orchestrate setup.
- **chezmoi** renders and applies files into the home directory. It does not install packages or
  own service lifecycles by itself.
- `install.sh` is the fresh-machine entry point. It installs mise into `~/.local/bin`, clones or
  reuses `~/repos/github.com/kqnade/dotfiles`, trusts its mise configuration, and runs
  `mise bootstrap --yes`.
- Company Claude Code is installed only with `install.sh --with-work-claude` or an explicit
  `data.claude_work_enabled = true` in the local chezmoi config. The default is false.
- `mise.work.toml` and `mise.work.lock` own the optional Claude pin and download metadata.
  Root `mise.toml` owns settings, standard pinned
  mise tools, and public tasks. `mise/config.toml` owns
  bootstrap packages, user settings, OS defaults, services, and hooks. OS packages intentionally
  use the package managers' `latest` version.
- `dot_config/mise/config.toml.tmpl` combines the base manifests and the enabled work overlay
  into `~/.config/mise/config.toml`. `mise.lock` records `macos-arm64`, `macos-x64`, and `linux-x64`
  archives. macOS x64 lock entries are upstream metadata, not Intel macOS support.

## Before changing files

1. Confirm the repository remote and inspect `git status`. Repositories owned by
   `livesense-inc` or `jobtalk` require an approved work account. A client installation alone
   does not authorize access.
2. If `.dev/todo/` contains an item relevant to the request, read only that item and follow only
   its task-relevant links.
3. Verify decision-changing claims against the current request, files, Git state, tests, runtime
   behavior, or primary sources. Current evidence overrides stale records.
4. Make the smallest correct change. Preserve user-authored and concurrent changes, avoid
   unrelated cleanup, and report failures explicitly.
5. Use `mise run apply` when the repository should apply its complete managed dotfile state. A
   direct `chezmoi apply` updates chezmoi-managed files but bypasses zsh cache rebuilding and the
   service application performed by the wrapper.

## Public commands

| Task | Command |
|---|---|
| Converge packages, tools, dotfiles, defaults, and services | `mise bootstrap --yes` |
| Apply dotfiles, rebuild the zsh cache, and apply managed services | `mise run apply` |
| Diagnose tools, packages, dotfiles, fonts, SKK, services, and WSL proxies | `mise run doctor` |
| Format the mise manifests and `mise.lock` | `mise run format` |
| Preview chezmoi-managed file changes | `chezmoi diff` |
| Run the repository validators | `mise exec -- python3 scripts/ci/validate-repository.py` |
| Create a signed local commit | `git commit -m '<gitmoji> <type>: <summary>'` |

Run focused checks first, then the repository validator when the affected contract requires it.
Always inspect the final diff and run `git diff --check` before handing work off. Report the commands
run, their results, and anything left unverified. For complex or high-risk changes, use a fresh-context
read-only review within the authorized client/account boundary. Isolate concurrent writers in separate
worktrees; small changes do not require a multi-agent workflow.

## Where to make changes

| Intent | Source |
|---|---|
| mise tool, setting, or public task | `mise.toml` |
| System package, macOS Cask/default, user setting, service, or bootstrap hook | `mise/config.toml` |
| Bootstrap/apply/doctor behavior | `scripts/` |
| zsh alias or function | `dot_config/zsh/aliases.zsh` or `dot_config/zsh/functions/<name>.zsh` |
| Neovim LSP or formatter | `dot_config/nvim/lua/modules/configs/lsp/init.lua` or `dot_config/nvim/lua/modules/configs/editor/conform.lua` |
| Optional work Claude tool pin | `mise.work.toml` |
| Client runtime paths and 1Password references | `.chezmoidata.toml` |
| Shared workflow skill | `dot_agents/skills/<name>/` |
| Common user instructions | `dot_agents/AGENTS.md` |
| Cursor personal alwaysApply rule | `dot_cursor/rules/` |
| Claude-specific rule, setting, hook, or skill link | `dot_claude/` |

Chezmoi source names describe their deployed targets: `dot_` becomes a leading `.`,
`dot_config/` deploys to `~/.config/`, and `private_*` enforces private permissions. SKK external
dictionary sources belong in `.chezmoiexternal.toml.tmpl`; removed managed targets belong in
`.chezmoiremove`.

## Platform invariants

- macOS uses its built-in zsh, Git, SSH, and Xcode Command Line Tools. Casks use mise's built-in
  `brew-cask` manager; no Brewfile or external `brew` CLI is required.
- macOS support is Apple Silicon. Do not add an Intel CI job or Cargo source fallbacks that exist
  only for macOS x64.
- macOS and Linux desktop use the native 1Password SSH agent socket. WSL deploys
  `~/.local/bin/{op,ssh,ssh-add}` proxies to the corresponding Windows executables and uses
  `op-ssh-sign-wsl.exe` for commit signing. Keep WSL proxies separate from native Windows support.
- yaskkserv2 is built on every supported OS from
  `cargo:https://github.com/wachikun/yaskkserv2`. It serves the dictionary generated by
  `scripts/build-skk-dictionary.sh` on `127.0.0.1:1178` through a mise-managed LaunchAgent or
  systemd user unit. Bootstrap is not complete until the port accepts connections.
- Bootstrap scripts resolve the checkout through `scripts/lib/runtime.sh`; `DOTFILES_ROOT` is an
  internal override for CI and disposable worktrees.
- Do not modify Neovim configuration as part of bootstrap cleanup.
- Preserve the Colemak Vim/Neovim mapping: `m/n/e/i` maps to `h/j/k/l`, `s/t` maps to `i/a`, and
  `x/c/v` maps to `d/y/p`.

## Agent configuration model

Repository instructions use `AGENTS.md`; execution settings and authorization remain client-specific.
Shared skills live in `dot_agents/skills/`: `responsibility-boundary`, `claim-review`, and
`handoff`. Skills deploy to `~/.agents/skills/`; Claude uses the opt-in links in
`dot_claude/skills/`.
Common user instructions live in `dot_agents/AGENTS.md` and prioritize responsibility
splits, boundary contracts, human-authored PRs, and short bullet replies. Claude loads that
file through its managed user-level symlink. Cursor also gets a thin alwaysApply rule under
`dot_cursor/rules/` that carries the short personal contract and points at `~/.agents/AGENTS.md`
and the shared skills. It loads when `$HOME` is an ancestor of the workspace; see
`docs/ai-clients.md`.
Keep client-specific execution settings in their adapters.
Do not deploy custom subagent instructions or a workflow router. See `docs/ai-clients.md` for
client boundaries and `docs/ai-workflows.md` for the workflow.

- Claude safety rules, settings, and hooks live in `dot_claude/`. Automatic memory is
  disabled, so `claude` may start outside `livesense-inc` and `jobtalk` repositories.
  Company repositories still use the approved work account. The wrapper passes the work
  GitHub token and keeps the configuration directory at `~/.claude`.
- Cursor CLI is the standard AI client. Claude Code and its configuration are opt-in.
  An existing Claude repository hook is updated even without opt-in to keep Cursor working.
  The Claude repository hook distinguishes Cursor's imported hook events from actual Claude
  events. Cursor's terminal environment must not bypass checks on actual Claude launches.
- Removed managed targets belong in `.chezmoiremove`. Name specific files or managed symlinks;
  preserve unknown skills, credentials, and runtime state in their parent directories. Do not
  name a directory: chezmoi removes it recursively. Keep a retired entry until every machine
  has applied after it was added, then remove the entry so a later file at that path is left
  alone. After that convergence, drop standard config paths of retired clients first.
- Claude defaults live in `.chezmoitemplates/claude-settings.json.tmpl`;
  Claude reads both `CLAUDE.md` and `AGENTS.md`.
  The modifier preserves `tui` on macOS. Managed hooks replace any other hooks in the file.
  Other intentional Claude settings changes should be folded into the template.
- On Linux, opted-in Claude's Herdr integration is applied during bootstrap. Claude automatic
  memory remains disabled; durable workflow state uses the repository model below.

## Repository workflow state

`.dev/` is the current worktree's repository-owned source of truth for AI workflow state, not
automatic memory. The active workflow contract is in `docs/ai-workflows.md`. Older `.dev/` designs
and TODOs referring to absent routers or persistence helpers are historical evidence, not runtime
prerequisites; reconcile them with current files before use.

- Keep each linked worktree's `.dev/` independent. Never redirect, merge, or silently copy records
  into another worktree.
- `.dev/todo/` contains only active work. Before deleting a completed item, preserve required task
  evidence in `.dev/contexts/` and promote durable decisions or research to their owning records.
- Read task-relevant context only. Imported, legacy, cross-worktree, or incompletely provenanced
  records are candidate evidence until reconciled with current state.
- Do not create or write `.dev/`, change its ignore policy, or select an external backend unless an
  explicitly invoked workflow or repository instruction authorizes that state change.
- Only repositories in the `livesense-inc` or `jobtalk` namespace receive the clone-local
  `/.dev/` ignore rule. `AGENT_WORKFLOW_STATE_HOME` is an explicit fallback, never an automatic
  recovery path.

## Git and CI conventions

- Commit messages use gitmoji prefixes.
- Default branch is `trunk`.
- Each local commit must be a cohesive, reviewable Green increment. Stage only its paths or hunks,
  inspect the staged diff, and create a signed commit. Pushes and pull-request mutations require
  separate explicit authorization.
- CI always runs offline validators and behavior tests through `scripts/ci/validate-repository.py`.
  Foundation changes in PRs and weekly/manual runs also perform real installs: macOS arm64
  exercises work Claude opt-in and public interfaces, Fedora checks Linux components and package
  idempotency, and Arch checks system packages. Pushes to trunk run the lightweight suite only.
  Required checks aggregate through `ci-result`.
- GitHub-hosted Linux containers cannot run a user systemd manager. CI starts yaskkserv2 directly
  and checks its port; systemd and WSL runtime coverage require dedicated runners. See
  `docs/ci.md` for the complete matrix.
