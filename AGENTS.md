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
| Install system packages | `mise system install --yes` |
| Generate commit message | `git ccc` (staged diff → opencode → gitmoji commit) |

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
| Fedora | `bash scripts/install-linux.sh` | `Dnffile` + `mise system install` |
| Arch | `bash scripts/install-linux.sh` | `metapkgs/base/PKGBUILD` |
| macOS | `chezmoi apply` | `Brewfile` |
| Windows | `chezmoi apply` | `scoopfile.json` |

Fedora/Arch both run `mise system install --yes` after OS packages. Intel Mac falls back to Homebrew for tools that mise's aqua registry lacks darwin/amd64 binaries for (`atuin`, `btop`, `delta`, `fd`, `sheldon`).

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

## Adding things

- **mise tool**: `dot_config/mise/config.toml.tmpl`
- **zsh alias**: `dot_config/zsh/aliases.zsh`
- **zsh function**: create `dot_config/zsh/functions/<name>.zsh`
- **nvim LSP**: `dot_config/nvim/lua/modules/configs/lsp/init.lua`
- **nvim formatter**: `dot_config/nvim/lua/modules/configs/editor/conform.lua`
- **opencode config**: `dot_config/opencode/opencode.json`

## Conventions

- Commit messages use gitmoji prefixes; generate with `git ccc`.
- Default branch is `main`.
- PRs are verified by `.github/workflows/ci.yml`: `chezmoi apply --dry-run` on Ubuntu/macOS/Windows, real Fedora bootstrap, and shellcheck on rendered templates.
