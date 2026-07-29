# Fedora bootstrapのGit checkout所有者差異対応

- 状態: 実装・検証完了

## 目的

GitHub ActionsのFedora containerで、checkoutの所有者と実行UIDが異なる場合も
repository pre-commit hookを生成できるようにする。

## Commit単位TODO

- [x] Commit 1: pre-commit生成時だけ、解決済みの`DOTFILES_ROOT`をGitの
  `safe.directory`へ追加する。既存のcommand-scoped Git configは保持し、
  global configやwildcard trustは使用しない。

## TDD

`validate-repository.py`へ、既存の`GIT_CONFIG_COUNT`を保持しながらcheckout限定の
`safe.directory`を追加する期待値を先に追加した。helper未実装による失敗を確認後、
`scripts/lib/runtime.sh`へcommand-scoped helperを追加し、`scripts/bootstrap.sh`の
pre-commit生成だけに適用した。

検証:

- `python3 scripts/ci/validate-repository.py`
- `python3 scripts/ci/validate-mise.py`
- `bash -n scripts/lib/runtime.sh scripts/bootstrap.sh`
- `shellcheck -e SC1091 -S warning scripts/lib/runtime.sh scripts/bootstrap.sh`
- `shfmt -i 2 -ci -d scripts/lib/runtime.sh scripts/bootstrap.sh`
- `git diff --check`
