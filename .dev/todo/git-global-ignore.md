# Git global ignoreの管理

- 状態: 実装・runtime反映・検証完了

## 目的

OSやeditorが生成する一時fileをrepositoryごとに設定せず、Gitのglobal ignoreとして
chezmoiで一元管理する。

## Commit単位TODO

- [x] Commit 1: `~/.config/git/ignore`と`core.excludesFile`をchezmoi管理へ追加し、
  runtime反映後にglobal ignoreとして機能することを確認する。
- [x] Commit 2: repository内の`.claude/`をglobal ignoreへ追加し、chezmoi sourceの
  `dot_claude/`は追跡対象のままであることを確認する。

## 検証

- `git config --global --get core.excludesFile`
- repository固有のignoreを持たない一時repositoryで`.DS_Store`がignoreされること
- `chezmoi diff`
- `python3 scripts/ci/validate-repository.py`
- `git diff --check`
