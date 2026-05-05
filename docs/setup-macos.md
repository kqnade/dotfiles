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

## 4. SKK 辞書サーバ (yaskkserv2)

`Brewfile` で `delphinus/yaskkserv2` tap から HEAD ビルドの `yaskkserv2` /
`yaskkserv2_make_dictionary` をインストール（rust は brew が build deps として
内部処理）。続いて `run_onchange_after_install-yaskkserv2.sh.tmpl` が：

1. `~/.skk/SKK-JISYO.{L,geo,propernoun,assoc,JIS3_4,law}` をマージして
   `~/.skk/dictionary.yaskkserv2` を生成
2. `~/Library/LaunchAgents/com.user.yaskkserv2.plist` を配置 →
   `launchctl bootstrap` で `127.0.0.1:1178` に常駐

起動引数：
- `--google-japanese-input=notfound`: 辞書未収録語を Google 日本語入力で補完
- `--google-cache-filename=~/Library/Caches/yaskkserv2/google.cache`: 補完結果のキャッシュ
- `KeepAlive` は `Crashed:true / SuccessfulExit:false`（明示停止時は再起動しない）

Neovim の skkeleton はこのサーバを参照する設定（`sources = { "skk_server" }`）。
**macSKK** の `設定 → 辞書 → SKKServ` で `127.0.0.1:1178` を指定すると、
nvim と macOS IME で同じ辞書サーバを共有できます。

ログ: `~/Library/Logs/yaskkserv2.{log,err}`
停止: `launchctl bootout gui/$(id -u)/com.user.yaskkserv2`

## 補足: 現在の `defaults` を参照する

新しい設定を script に追加したいときの確認手順：

```bash
defaults read <domain>             # 例: defaults read com.apple.dock
defaults read-type <domain> <key>  # 値の型を確認
```

`Brewfile` は macOS / Linuxbrew 共通フォーマット。
`if OS.mac?` ガードにより `cask` (`font-udev-gothic`) と `pinentry-mac`
は macOS でのみ取り込まれます。
