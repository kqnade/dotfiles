# Scroll Reverserのbootstrap管理

- 状態: 実装・検証完了

## 目的

macOSのScroll Reverserを手動Cask導入ではなく、`mise bootstrap`で再現・更新できる
system packageとして管理する。

## Commit単位TODO

- [x] Commit 1: `brew-cask:scroll-reverser`を許可されたpackageへ追加し、既存installの
  検出、fresh applyのdry-run、repository validationを通す。

## TDD

先に`validate-mise.py`へ期待するmanagerとpackageを追加し、未実装の`mise.toml`に対して
失敗することを確認する。Greenでは次を確認する。

- `python3.11 scripts/ci/validate-mise.py`
- `mise bootstrap packages status --json`
- `mise bootstrap packages apply --manager brew-cask --dry-run`
- `mise run format`
- `python3 scripts/ci/validate-repository.py`
- `git diff --check`

macOS標準のPython 3.9では`tomllib`をimportできないため、`validate-mise.py`は利用可能な
Python 3.11で実行した。期待値だけを先に変更したRedではmanager allowlist mismatchを
確認した。実装後、miseは既存のScroll Reverser 1.9を`installed`として検出し、
`brew-cask`のdry-runは再インストール不要と判定した。
