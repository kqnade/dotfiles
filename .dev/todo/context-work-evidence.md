# ContextとMemoryを分離する

- 状態: 実装中

## Commit単位TODO

- [x] Commit 1: `.dev/contexts/`をPR・Sanity Review対象となる詳細な対話出力と作業証跡、
  `.dev/memory/`を将来のtaskで再利用する抽出知識として分離し、Rules、DesignDoc、
  skills、repository validatorへ反映する。
- [ ] Commit 2: 復元したmain / trunk contextへ今回の誤削減、revert、branch cleanup、
  検証結果を追記し、runtimeとrepositoryを検証する。
