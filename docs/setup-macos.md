# macOS セットアップ

リポジトリは ghq 規約に従って `~/ghq/github.com/kqnade/dotfiles` に配置することを想定しています。

## 1. chezmoi の取得と適用

`chezmoi init --apply` を一度走らせれば、以降のすべてのセットアップ
（Homebrew のインストール、`brew bundle`、macOS の `defaults` 適用）は
`run_onchange_setup-macos.sh.tmpl` が自動で行います。

```bash
# chezmoi がまだ無い場合のみ
brew install chezmoi || /bin/bash -c "$(curl -fsSL https://get.chezmoi.io)"

chezmoi init --apply kqnade
```

## 2. 自動化されている内容

`run_onchange_setup-macos.sh.tmpl` が `chezmoi apply` のたびに：

1. **Homebrew が無ければインストール**（Apple Silicon / Intel 両対応）
2. `~/Brewfile` を `brew bundle` で適用（`Brewfile` の内容が変わると自動再実行）
3. `defaults write` で macOS の各種設定を適用：
   - NSGlobalDomain: 拡張子表示、F-key 標準化、キーリピート高速化、トラックパッド速度
   - Dock: 左寄せ・自動非表示・サイズ・最近使ったアプリ非表示
   - Finder: 隠しファイル表示、アイコン表示、フォルダ優先ソート、デスクトップ表示項目
   - メニューバー時計: 曜日表示・日付非表示・AM/PM
   - トラックパッド: タップでクリック
   - Stage Manager 無効、通知プレビュー要約無効

設定を変更したい場合は `run_onchange_setup-macos.sh.tmpl` を直接編集してください。
ファイルの内容が変わると次回の `chezmoi apply` で再実行されます。

## 3. ツールのインストール

```bash
mise install
```

## 補足: 現在の `defaults` を参照する

新しい設定を script に追加したいときの確認手順：

```bash
defaults read <domain>             # 例: defaults read com.apple.dock
defaults read-type <domain> <key>  # 値の型を確認
```

`Brewfile` は macOS / Linuxbrew 共通フォーマット。
`if OS.mac?` ガードにより `cask` (`font-udev-gothic`) と `pinentry-mac`
は macOS でのみ取り込まれます。
