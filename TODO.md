# TODO

v2の未完了事項です。CIや実機検証で新しい問題が見つかった場合も、再現条件と
完了条件を添えてここへ追加します。

## P0: 対応環境の実機CI

- [ ] FedoraまたはArchのVM runnerでuser systemdを検証する。
  - `bash install.sh` をskipなしで完走させる。
  - `mise run doctor` が全項目成功する。
  - `dev.mise.yaskkserv2.service` がactiveになり、`127.0.0.1:1178`へ接続できる。
  - 2回目の `mise bootstrap --yes` でも状態が変わらない。
- [ ] FedoraまたはArchを使うself-hosted WSL runnerを追加する。
  - `op`、`ssh`、`ssh-add` proxyがWindows側の各executableを呼び出せる。
  - 1Password SSH agent経由で公開鍵を列挙できる。
  - `op-ssh-sign-wsl.exe` を使ったtest commitの署名を検証できる。
  - systemd user serviceとyaskkserv2のport検査が成功する。

## P1: installerの境界条件

- [ ] 空のHOMEからrepository cloneを行う `install.sh` のintegration testを追加する。
  - `DOTFILES_REPO_URL` と `DOTFILES_REPO_REF` でCI自身のcommitを取得する。
  - 既存checkoutを使う経路と新規clone経路の両方を検証する。
- [ ] curlまたはGitが存在しない最小Fedora/Arch imageでprerequisite導入を検証する。
  - OS package managerで不足分だけが導入される。
  - その後のbootstrapが通常のjobと同じ結果になる。

## P2: CI運用

- [ ] 初回のfull CI結果からjob時間とnetwork転送量を記録し、cache対象を決める。
  - pinまたはlock変更時に確実にinvalidateされる。
  - cacheなしでも再現できる状態を維持する。
- [ ] 同じcommitに対するbranch pushとpull requestの重複実行を解消する。
  - forkからのpull request検証は失わない。
  - mainと手動実行ではfull jobが必ず動く。
