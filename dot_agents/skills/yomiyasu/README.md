# yomiyasu

日本語の文章を、意味や条件を保ちながら自然で読みやすく整えるスキルです。

## 配布元とライセンス

- 配布元: <https://github.com/nanaism/yomiyasu>
- 収録版: `bc55e9210865d53044cc4340fa391530e230cd00`
- 収録範囲: `skills/yomiyasu/` のスキル本体、参照資料、検査スクリプト、ライセンス
- ライセンス: [MIT](LICENSE)。スクリプトに含まれるUnicodeデータは
  [Unicode License V3](UNICODE-LICENSE.txt)に従います。

## 使い方

Piでは `/skill:yomiyasu`、Claudeでは `/yomiyasu` の後に対象の文章やファイルを指定します。
本文だけが必要な場合は「本文だけ返して」と指定します。

Piの普段の会話には、`~/.agents/AGENTS.md` の会話方針が適用されます。
通常の返答や進捗報告に、文章推敲用のレポート形式は使いません。

検査ツールはPython標準ライブラリだけで動作します。対象やスクリプトは絶対パスで指定できます。

```sh
python3 ~/.agents/skills/yomiyasu/scripts/yomiyasu_lint.py /path/to/article.md
python3 ~/.agents/skills/yomiyasu/scripts/yomiyasu_diff.py /path/to/original.md /path/to/rewritten.md
```

検出結果は見直し候補です。自然な表現や、意味を保つために必要な表現まで機械的に直しません。

## 更新

配布元の対象版を確認し、収録範囲のファイルとライセンスをそろえて更新します。
収録版をこのファイルに記録し、`scripts/ci/test-client-workflow-reset.py` で配備とツールの動作を
検証してから `mise run apply` で適用します。
