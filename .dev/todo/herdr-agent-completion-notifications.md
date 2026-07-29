# Herdr reviewer完了通知

- 状態: 実装・runtime反映・検証完了
- ADR: [Herdr上の同一CLIでAdversarial Reviewを行う](../adr/0001-herdr-adversarial-review.md)

## 目的

Adversarial Reviewのcoordinatorが`herdr agent wait`で完了をpollingせず、各Claude
reviewerの終了eventからHerdr通知を直接送る。

## Commit単位TODO

- [x] Commit 1: Claudeの`Stop` / `StopFailure` hookからreviewer paneを判別して通知し、
  `adversarial-review` skillとADRから待機pane・pollingを削除する。

## TDD

先にrepository validatorへ次を追加し、未実装状態で失敗することを確認する。

- `Stop`と`StopFailure`にHerdr通知hookがある。
- hookがcurrent paneを取得し、Herdr notificationを送る。
- `adversarial-review` skillに`agent wait`、通知pane、Completion paneが残っていない。

Greenではhookを非Herdr pane、通常pane、Advocate pane、Challenger paneのfixtureで実行し、
対象reviewerだけが成功・失敗通知を送ることを確認する。

Redでは`Claude Stop hook must notify Herdr reviewer completion`を確認した。Greenでは
非Herdr paneと通常paneが無出力、Advocateの成功とChallengerの失敗が役割・scope付き通知に
なることを確認した。chezmoi runtimeへ反映後、Herdr sessionへの実通知も成功した。
