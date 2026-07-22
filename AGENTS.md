# AGENTS.md

Concise guidance for agents working in this dotfiles repo.

## What this repo is

Cross-platform dotfiles managed by **chezmoi**, with dev tools centralized in **mise**. Supports Fedora (primary), Arch Linux, macOS, and Windows.

## Verified commands

| Task | Command |
|------|---------|
| Apply config | `chezmoi apply` (zsh alias: `ca`) |
| Edit a config | `chezmoi edit <file>` (zsh alias: `ce`) |
| Diff before apply | `chezmoi diff` |
| Install/update dev tools | `mise install` |
| Install bootstrap packages | `mise bootstrap packages install --yes` |
| Generate commit message | `git cc` (staged diff → Codex → gitmoji commit) |

## Architecture facts that are easy to miss

### chezmoi source layout

- Files prefixed `dot_` deploy to `~/.<name>` (e.g. `dot_zshrc` → `~/.zshrc`).
- `dot_config/` deploys to `~/.config/`.
- `Documents/` deploys to `~/Documents/` (Windows PowerShell profile).
- `run_onchange_*.tmpl` runs once when its rendered content changes.
- `private_*` forces `0600`/`0700` permissions.

### OS install paths

| OS | Entry point | Manifest |
|----|-------------|----------|
| Fedora | `bash scripts/install-linux.sh` | `Dnffile` + `mise bootstrap packages install` |
| Arch | `bash scripts/install-linux.sh` | `metapkgs/base/PKGBUILD` |
| macOS | `chezmoi apply` | `Brewfile` |
| Windows | `chezmoi apply` | `scoopfile.json` |

Fedora/Arch both run `mise bootstrap packages install --yes` after OS packages. Intel Mac falls back to Homebrew for tools that mise's aqua registry lacks darwin/amd64 binaries for (`atuin`, `btop`, `delta`, `fd`, `sheldon`).

### mise is the source of truth for dev tools

Add CLI tools or language runtimes in `dot_config/mise/config.toml.tmpl`, not in OS package manifests. OS manifests are only for bootstrap (shell, git, build toolchain, fonts, system services).

### Setup order matters

```bash
# Fedora example
bash scripts/install-linux.sh
chezmoi init --source . --apply
mise install
chezmoi apply   # again, so yaskkserv2/font scripts can use newly installed tools
```

### yaskkserv2 (SKK dictionary server)

- Listens on `127.0.0.1:1178`.
- Linux: built from `github:wachikun/yaskkserv2` via mise after rust is installed; systemd user unit at `~/.config/systemd/user/yaskkserv2.service`.
- macOS: installed from `delphinus/yaskkserv2` Homebrew tap; launchd agent at `~/Library/LaunchAgents/com.user.yaskkserv2.plist`.
- Dictionary sources (`~/.skk/SKK-JISYO.*`) are chezmoi externals; rebuilt only when newer than `~/.skk/dictionary.yaskkserv2`.
- If binaries are missing, the run_onchange script exits non-zero intentionally so chezmoi retries on the next apply.

### 1Password / SSH

- macOS/Linux desktop: native 1Password SSH agent socket is set as `SSH_AUTH_SOCK`.
- WSL: `~/.local/bin/{op,ssh,ssh-add}` proxy to Windows `.exe` binaries. 1Password desktop SSH agent must be enabled on the Windows side.
- Commit signing uses SSH via 1Password; WSL uses `op-ssh-sign-wsl.exe`.

### Colemak keybindings

Maintained across Vim/Neovim:

| Colemak | QWERTY | Action |
|---------|--------|--------|
| `m/n/e/i` | `h/j/k/l` | movement |
| `s/t` | `i/a` | insert/append |
| `x/c/v` | `d/y/p` | delete/copy/paste |

Keep this mapping when editing Neovim configs.

### Claude Code global config (`dot_claude/` → `~/.claude/`)

- `settings.json` is plain JSON managed by chezmoi. Claude Code mutates it at runtime
  (`/config` changes to model, effortLevel, enabledPlugins), so `chezmoi diff` showing
  drift there is expected — fold wanted runtime changes back into the source.
- `hooks/` use the chezmoi `executable_` prefix. They are wired globally in `settings.json`
  (except `auto-test.sh`, deployed but unwired — enable per project with a fast test suite).
- `block-dangerous-commands.sh` blocks `git push` to main/master; override per project
  with the `CLAUDE_PROTECTED_BRANCHES` env var.
- Review agents live in `agents/*.md`, workflow skills in `skills/*/SKILL.md`.
  `/setupdotclaude` copies selected pieces from `~/.claude/` into a project's `.claude/`
  after scanning it.
- Removing a deployed file: delete it from `dot_claude/` AND list its target path in
  `.chezmoiremove`, or `chezmoi apply` will leave the orphan in `~/.claude/`.

### Agent Mail identity across worktrees

- Normalize a ghq worktree path of
  `<ghq-root>/<host>/<owner>/<repo>@<worktree>` to the single Agent Mail project
  `<ghq-root>/<host>/<owner>/<repo>`. Never register or use the `@<worktree>` path
  as an Agent Mail `project_key`.
- Use the non-empty `AGENT_MAIL_PROJECT` exported by the shell as the
  `project_key` for every Agent Mail tool call; do not replace it with `$PWD` or
  a worktree path. If it is unavailable, resolve the base repo with
  `wt home-path` (or `_wt_base` for an older wt) and export the resulting
  absolute path before registering an agent or calling Agent Mail.
- Outside a wt-enabled shell, the equivalent Git fallback is
  `dirname "$(git rev-parse --path-format=absolute --git-common-dir)"`; verify that
  the resulting basename has no `@<worktree>` suffix before using it.
- Resolve the agent name from `AGENT_MAIL_AGENT`/`AGENT_NAME` or Agent Mail's pane
  identity. If none exists, register an identity automatically and retain the
  returned name for the session; do not ask the user to supply an Agent Mail ID.
- `WORKTREES_ENABLED=true` lets the Agent Mail service recognize linked worktrees,
  including shells opened from Herdr workspaces.

### Agent Mail communication

- Treat Agent Mail as concise agent-to-agent task communication, not formal
  email. Omit greetings, pleasantries, signatures, and ceremonial wording.
- Lead with the request or conclusion. Include only the relevant context,
  affected paths, constraints, and completion criteria.
- Keep replies focused on the result, changed paths, verification, and blockers.
- Make requests actionable and explicit; do not hide the required action inside
  background explanation.
- A managing or coordinating agent must check Agent Mail when a managed agent
  becomes `idle` or `done`; `done` is also a result-collection trigger, not a
  terminal state to ignore.
- The managing agent must collect relevant replies and surface their results to
  the user. Do not assume the user will open the mailbox or relay messages
  between agents.

## Adding things

- **mise tool**: `dot_config/mise/config.toml.tmpl`
- **zsh alias**: `dot_config/zsh/aliases.zsh`
- **zsh function**: create `dot_config/zsh/functions/<name>.zsh`
- **nvim LSP**: `dot_config/nvim/lua/modules/configs/lsp/init.lua`
- **nvim formatter**: `dot_config/nvim/lua/modules/configs/editor/conform.lua`
- **opencode config**: `dot_config/opencode/opencode.json`
- **Claude rule/agent/skill/hook**: `dot_claude/{rules,agents,skills,hooks}/` (hooks need the `executable_` prefix and wiring in `dot_claude/settings.json`)

## Conventions

- Commit messages use gitmoji prefixes; generate with `git cc`.
- Default branch is `main`.
- PRs are verified by `.github/workflows/ci.yml`: `chezmoi apply --dry-run` on Ubuntu/macOS/Windows, real Fedora bootstrap, and shellcheck on rendered templates.
