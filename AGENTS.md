# AGENTS.md

Concise guidance for agents working in this dotfiles repository.

## What this repository is

Cross-platform dotfiles managed by **mise** and **chezmoi**. Supported targets
are macOS arm64/x64, Fedora x64, Arch Linux x64, and Fedora/Arch under WSL x64.

## Public commands

| Task | Command |
|------|---------|
| Bootstrap a machine | `mise bootstrap --yes` |
| Apply dotfiles | `mise run apply` |
| Diagnose state | `mise run doctor` |
| Format manifest and lockfile | `mise run format` |
| Preview chezmoi changes | `chezmoi diff` |
| Generate commit message | `git cc` |

`install.sh` is the fresh-machine entry point. It installs mise into
`~/.local/bin`, checks out this repository at
`~/repos/github.com/kqnade/dotfiles`, and runs the bootstrap command.

## Architecture facts

- Root `mise.toml` is the only bootstrap and global-tool definition.
- `dot_config/mise/config.toml.tmpl` includes root `mise.toml` verbatim so
  chezmoi can materialize it as `~/.config/mise/config.toml`.
- All tools are explicitly pinned. `mise.lock` covers `macos-arm64`,
  `macos-x64`, and `linux-x64`.
- macOS GUI apps and Fedora/Arch system packages live in `[bootstrap.packages]`.
- macOS uses its built-in zsh, Git, SSH, and Xcode Command Line Tools.
- macOS Casks use mise's built-in `brew-cask` manager; the repository does not require a
  Brewfile or an external `brew` CLI.
- Intel macOS uses Cargo fallbacks for sheldon, delta, fd, and atuin, plus an
  npm fallback for pnpm.
- `dot_codex/modify_private_config.toml` enforces stable Codex defaults in
  `~/.codex/config.toml` while preserving Codex-managed tables and sibling runtime state.
- `mise run apply` is the only normal dotfile mutation path. Chezmoi does not
  install packages or manage services.

## chezmoi source layout

- Files prefixed `dot_` deploy to `~/.<name>`.
- `dot_config/` deploys to `~/.config/`.
- `private_*` forces private permissions.
- `.chezmoiexternal.toml.tmpl` owns the SKK dictionary source files.
- Deleted managed targets must be listed in `.chezmoiremove`.

## yaskkserv2

- Built on every supported OS from
  `cargo:https://github.com/wachikun/yaskkserv2`.
- Listens on `127.0.0.1:1178`.
- Dictionary generation is handled by `scripts/build-skk-dictionary.sh`.
- mise owns `dev.mise.yaskkserv2` as a LaunchAgent or systemd user unit.
- `scripts/remove-legacy-yaskkserv2.sh` removes only the previous
  `com.user.yaskkserv2` / `yaskkserv2.service` definitions before mise enables
  its service.
- Bootstrap scripts resolve their checkout through `scripts/lib/runtime.sh`.
  `DOTFILES_ROOT` is an internal override for CI and disposable worktrees.
- Bootstrap is not complete until `127.0.0.1:1178` accepts connections.

## 1Password / SSH

- macOS/Linux desktop use the native 1Password SSH agent socket.
- WSL deploys `~/.local/bin/{op,ssh,ssh-add}` proxies to the corresponding
  Windows executables.
- WSL commit signing uses `op-ssh-sign-wsl.exe`.

## Colemak keybindings

Keep this mapping consistent when editing Vim or Neovim:

| Colemak | QWERTY | Action |
|---------|--------|--------|
| `m/n/e/i` | `h/j/k/l` | movement |
| `s/t` | `i/a` | insert/append |
| `x/c/v` | `d/y/p` | delete/copy/paste |

## Claude Code global config

- `dot_claude/` deploys to `~/.claude/`.
- Claude Code mutates `settings.json` at runtime, so expected drift should be
  folded back into the source when intentional.
- Hooks use the `executable_` prefix and are wired in
  `dot_claude/settings.json.tmpl`.
- Claude is authorized only for GitHub repositories whose remote owner is
  `livesense-inc` or `jobtalk`. The shell wrapper checks before launching Claude, and
  the `UserPromptSubmit` and `PreToolUse` hooks reject every other repository,
  including missing or unrecognized remotes.
- Claude's unconditional global rules live in `dot_claude/rules/` and are limited to
  coding, verification, operations, Git, and PRD/STD delivery boundaries.
- Codex receives `~/.codex/AGENTS.md` as a symlink to the canonical
  `~/.agents/rules/git.md`. It uses `git cc` outside the two Claude-only namespaces.
- Cross-client workflow skills have one canonical source in `dot_agents/skills/`.
  Claude receives symlinks from `dot_claude/skills/`; Codex and OpenCode discover
  `~/.agents/skills/` directly. Do not copy a skill into client-specific directories.
- The installed set is organized by desired effect rather than by source workflow:
  `evidence-review`, `context-handoff`, `security-audit`, `prose-proofreading`,
  `assumption-pruning`, `peer-consultation`, and t-wada-style
  `test-driven-development`. `using-workflow-skills` is the routing guardrail.
- Cross-session context and security coverage use the current Git worktree's `.dev/`,
  resolved by `using-workflow-skills/scripts/workflow-state-root`. Claude automatic
  memory remains disabled. Current-worktree repository-owned records are normal project
  context after identity, provenance, and freshness checks; imported records require
  stricter reconciliation.
- Linked worktrees do not share `.dev/` content. ADRs, design documents, todo state,
  handoffs, and audit records remain with the worktree and branch that produced them.
- Repositories in the `livesense-inc` or `jobtalk` remote-owner/local namespace keep
  `.dev/` local. On an explicitly authorized state write, the resolver idempotently adds
  `/.dev/` to the clone's `.git/info/exclude`; it never adds that rule elsewhere.
- `AGENT_WORKFLOW_STATE_HOME` is an explicit repository-external fallback, not the
  default and not an automatic recovery path.

## AI-assisted development records

- `.dev/` is the source of truth for this repository's AI-assisted workflow state and the
  default repository-scoped continuity backend. It is repository content, not Claude
  automatic memory. Check record identity, provenance, and freshness; when a factual claim
  conflicts with the current request, files, Git state, tests, runtime behavior, or primary
  sources, current evidence governs.
- Never redirect a linked worktree's records into the primary worktree's `.dev/`.
- Do not automatically ignore `.dev/` outside the `livesense-inc` and `jobtalk`
  namespaces. Whether another repository tracks it belongs to that repository's policy.
- When an active work item is relevant to the current request, inspect only that item,
  then follow its task-relevant links to `.dev/designdoc/`, `.dev/adr/`,
  `.dev/research/`, `.dev/contexts/`, and `.dev/memory/`.
- `.dev/contexts/` records detailed task-relevant dialogue output, implementation work,
  failures, and verification for a branch, change, or PR. Load only task-relevant context,
  verify its provenance and staleness, and preserve existing task evidence when correcting
  it. Context from another worktree, an import, a legacy workflow, or with incomplete
  provenance is candidate evidence until reconciled.
- `.dev/memory/` is existing repository content, not Claude memory. Never load unrelated
  entries automatically or use them to bypass current-state verification.
- `.dev/todo/` contains only active work. Delete a work-item file when its final item is
  complete. Before deletion, promote durable decisions, design, and research, and preserve
  the completed AI work and dialogue evidence in the relevant context. Add memory only when
  a confirmed fact should be reused beyond the current work item. Git history records the
  completed plan but does not replace those records.
- This repository's detailed record contract is documented in
  `.dev/designdoc/ai-assisted-development.md`.

## Adding things

- mise tool, system package, or macOS Cask: root `mise.toml`
- zsh alias: `dot_config/zsh/aliases.zsh`
- zsh function: `dot_config/zsh/functions/<name>.zsh`
- Neovim LSP: `dot_config/nvim/lua/modules/configs/lsp/init.lua`
- Neovim formatter: `dot_config/nvim/lua/modules/configs/editor/conform.lua`
- OpenCode config: `dot_config/opencode/opencode.json`
- Claude rule/agent/skill/hook: `dot_claude/{rules,agents,skills,hooks}/`

## Conventions

- Commit messages use gitmoji prefixes.
- Default branch is `trunk`.
- Do not modify Neovim configuration as part of bootstrap cleanup.
- Keep WSL proxies separate from native Windows support.
- CI performs real installs and applies rather than preview-only runs. macOS
  arm64 exercises every public interface; Intel macOS runs install/apply/doctor
  and builds all source fallbacks; Fedora exercises all Linux components and
  Arch exercises packages.
- GitHub-hosted Linux containers cannot run a user systemd manager. The Linux
  job starts yaskkserv2 directly and checks its port; systemd and WSL runtime
  coverage require dedicated runners.
