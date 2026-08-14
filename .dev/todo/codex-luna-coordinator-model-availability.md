# Codex Luna coordinator model availability

## Objective

Codexの`luna_parallelizer` custom agentを、repository ruleが要求するread-heavyな
横断調査で正常に起動できる状態にする。

## Confirmed observations

- Observed: `spawn_agent`で`agent_type: luna_parallelizer`を指定すると、
  `Unknown model gpt-5.6-luna`で起動に失敗した。
  Provenance: Codex collaboration tool response, 2026-08-14 Asia/Tokyo.
- Observed: tool responseが利用可能なmodelとして示したのは`gpt-5.6-sol`と
  `gpt-5.6-terra`だった。
  Provenance: 同じCodex collaboration tool response, 2026-08-14 Asia/Tokyo.
- Observed: `dot_codex/agents/luna-parallelizer.toml`はcoordinator modelを
  `gpt-5.6-luna`に固定している。
  Provenance: current worktree file inspection, 2026-08-14 Asia/Tokyo.
- Inference: repository設定と実行環境のmodel availabilityのどちらが原因かは、
  現時点では確定していない。

## Scope

- `luna_parallelizer`起動時のmodel解決経路と利用可能modelを確認する。
- repository設定または実行環境の問題として原因を特定する。
- repository側の変更が必要な場合は、期待するdelegation境界を保ったまま修正し、
  coordinatorを実際に起動して検証する。

## Non-goals

- 原因未確認のままLuna以外のmodelへ恒久的に切り替えること。
- delegation ruleやlarge implementation routingの再設計。

## Durable records

- None: 原因特定前で、昇格すべき設計判断や再利用可能な調査結果はまだない。

## Commit checklist

- [ ] `luna_parallelizer`のmodel解決失敗を再現し、原因を特定する。repository側の修正が
  必要な場合だけ最小変更を行い、coordinatorの起動とread-only packetの完了を確認する。
