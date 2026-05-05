#!/usr/bin/env bash
# Health check for the dotfiles environment. Read-only: never installs or
# modifies anything. Intended to be the first command on a fresh machine
# after `chezmoi apply`, and a quick "is everything still wired up?" check
# afterwards.
#
# Usage:
#   bash scripts/doctor.sh           # full report
#   bash scripts/doctor.sh -q        # only show WARN/FAIL lines
#
# Exit code: 1 if any FAIL, otherwise 0.

set -uo pipefail

if [[ -t 1 ]]; then
  C_OK=$'\033[1;32m'; C_WARN=$'\033[1;33m'; C_FAIL=$'\033[1;31m'
  C_DIM=$'\033[2m';   C_RESET=$'\033[0m'
else
  C_OK=''; C_WARN=''; C_FAIL=''; C_DIM=''; C_RESET=''
fi

QUIET=0
case "${1:-}" in
  -q|--quiet) QUIET=1 ;;
  -h|--help)  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
esac

PASS=0; WARN=0; FAIL=0

ok()      { ((QUIET)) || printf '%s[ OK ]%s %s\n' "$C_OK"   "$C_RESET" "$*"; PASS=$((PASS+1)); }
warn()    {              printf '%s[WARN]%s %s\n' "$C_WARN" "$C_RESET" "$*"; WARN=$((WARN+1)); }
fail()    {              printf '%s[FAIL]%s %s\n' "$C_FAIL" "$C_RESET" "$*"; FAIL=$((FAIL+1)); }
section() { ((QUIET)) || printf '\n%s== %s ==%s\n' "$C_DIM" "$*" "$C_RESET"; }

have() { command -v "$1" >/dev/null 2>&1; }

check_tool() {
  local cmd=$1 desc=${2:-$1} kind=${3:-required}
  if have "$cmd"; then
    ok "$desc"
  elif [[ "$kind" == "optional" ]]; then
    warn "$desc not found (optional)"
  else
    fail "$desc not found"
  fi
}

uname_s=$(uname -s)

# ---------------------------------------------------------------------------
section "core tools"
check_tool chezmoi
check_tool mise
check_tool starship
check_tool git
check_tool nvim     "neovim"
check_tool gh
check_tool ghq
check_tool tmux
check_tool gpg
check_tool pass

case "$uname_s" in
  Linux|Darwin)
    check_tool zsh
    check_tool sheldon
    ;;
esac

# ---------------------------------------------------------------------------
section "cli utilities"
for t in fzf rg fd bat eza delta glab gomi git-lfs; do
  check_tool "$t" "$t" optional
done

# ---------------------------------------------------------------------------
section "chezmoi"
if have chezmoi; then
  if chezmoi doctor >/dev/null 2>&1; then
    ok "chezmoi doctor: clean"
  else
    warn "chezmoi doctor reports issues — run \`chezmoi doctor\`"
  fi

  diff_out=$(chezmoi diff 2>/dev/null || true)
  if [[ -z "$diff_out" ]]; then
    ok "chezmoi diff: no drift"
  else
    warn "chezmoi diff: drift detected — run \`chezmoi diff\` / \`chezmoi apply\`"
  fi
fi

# ---------------------------------------------------------------------------
section "mise"
if have mise; then
  if mise doctor >/dev/null 2>&1; then
    ok "mise doctor: clean"
  else
    warn "mise doctor reports issues — run \`mise doctor\`"
  fi
fi

# ---------------------------------------------------------------------------
if have sheldon; then
  section "sheldon"
  if sheldon source >/dev/null 2>&1; then
    ok "sheldon source: ok"
  else
    fail "sheldon source failed — run \`sheldon source\` to see the error"
  fi
fi

# ---------------------------------------------------------------------------
section "credentials"
if have gh; then
  if gh auth status >/dev/null 2>&1; then
    ok "gh auth: signed in"
  else
    warn "gh not authenticated — run \`gh auth login\`"
  fi
fi

if have pass; then
  if pass ls >/dev/null 2>&1; then
    ok "pass: store accessible"
  else
    warn "pass store missing or gpg key locked"
  fi
fi

if have gpg; then
  if gpg --list-secret-keys --with-colons 2>/dev/null | grep -q '^sec'; then
    ok "gpg: secret key present"
  else
    warn "no gpg secret key — \`gpg --import\` your private key"
  fi
fi

# ---------------------------------------------------------------------------
# SKK dictionaries — list mirrors .chezmoiexternal.toml.tmpl
section "skk dictionaries"
SKK_DIR="$HOME/.skk"
skk_present=0; skk_total=0
for d in L geo propernoun assoc JIS3_4 law emoji; do
  skk_total=$((skk_total+1))
  [[ -f "$SKK_DIR/SKK-JISYO.$d" ]] && skk_present=$((skk_present+1))
done
if [[ "$skk_present" -eq "$skk_total" ]]; then
  ok "$SKK_DIR: $skk_present/$skk_total dictionaries present"
else
  warn "$SKK_DIR: only $skk_present/$skk_total dictionaries present — run \`chezmoi apply\`"
fi

# ---------------------------------------------------------------------------
if have nvim; then
  section "neovim"
  if timeout 15 nvim --headless '+qa!' </dev/null >/dev/null 2>&1; then
    ok "nvim loads init.lua without error"
  else
    fail "nvim init.lua failed to load — run \`nvim\` to see the error"
  fi
fi

# ---------------------------------------------------------------------------
((QUIET)) || printf '\n%s—— summary ——%s\n' "$C_DIM" "$C_RESET"
printf '%sPASS%s=%d  %sWARN%s=%d  %sFAIL%s=%d\n' \
  "$C_OK"   "$C_RESET" "$PASS" \
  "$C_WARN" "$C_RESET" "$WARN" \
  "$C_FAIL" "$C_RESET" "$FAIL"

(( FAIL > 0 )) && exit 1 || exit 0
