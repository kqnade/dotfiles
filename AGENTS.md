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
| Update pins and lockfile | `mise run update` |
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
- Fedora and Arch system packages live in `[bootstrap.packages]`.
- macOS uses its built-in zsh, Git, SSH, and Xcode Command Line Tools.
- Intel macOS uses Cargo fallbacks for sheldon, delta, fd, and atuin, plus an
  npm fallback for pnpm.
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
- Review agents live in `agents/*.md`; workflow skills live in
  `skills/*/SKILL.md`.

## Adding things

- mise tool or system package: root `mise.toml`
- zsh alias: `dot_config/zsh/aliases.zsh`
- zsh function: `dot_config/zsh/functions/<name>.zsh`
- Neovim LSP: `dot_config/nvim/lua/modules/configs/lsp/init.lua`
- Neovim formatter: `dot_config/nvim/lua/modules/configs/editor/conform.lua`
- OpenCode config: `dot_config/opencode/opencode.json`
- Claude rule/agent/skill/hook: `dot_claude/{rules,agents,skills,hooks}/`

## Conventions

- Commit messages use gitmoji prefixes.
- Default branch is `main`.
- Do not modify Neovim configuration as part of bootstrap cleanup.
- Keep WSL proxies separate from native Windows support.
- CI performs real installs and applies rather than preview-only runs. macOS
  arm64 exercises every public interface; Intel macOS runs install/apply/doctor
  and builds all source fallbacks; Fedora exercises all Linux components and
  Arch exercises packages.
- GitHub-hosted Linux containers cannot run a user systemd manager. The Linux
  job starts yaskkserv2 directly and checks its port; systemd and WSL runtime
  coverage require dedicated runners.
