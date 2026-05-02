# 主な機能と設定

## Zsh (`.zshrc` / `dot_config/zsh/`)

* `sheldon` によるプラグイン管理（autosuggestions, syntax-highlighting, enhancd 等）。
* `fzf-tab` による補完のプレビュー。
* **`gg` 関数**: `ghq` 管理下のリポジトリを `fzf` で検索・プレビューし、ディレクトリを高速移動。
* エイリアス: `ls` (`eza`), `cat` (`bat`), `vi` (`vim`), `p` (`brew` / `paru` / `apt` を環境に応じて切り替え)。
* `dot_config/zsh/functions/` に関数を `.zsh` ファイルとして追加するだけで `.zshrc` から自動 source されます。

### Distro 固有の補正

* Ubuntu/Debian の `bat`/`fd` はバイナリ名が `batcat`/`fdfind` のため、それを検出して透過的にエイリアスします。
* Linuxbrew が `/home/linuxbrew/.linuxbrew/bin/brew` または `$HOME/.linuxbrew/bin/brew` にあれば自動的に `brew shellenv` を eval します。

## PowerShell (`Documents/PowerShell/Microsoft.PowerShell_profile.ps1`)

zsh 関数 (`gg`, `mkcd`, `ccd`, `ghq` ラッパ) と機能パリティを保つ PowerShell 版を同ファイル内に定義しています。Windows では `chezmoi apply` で `~\Documents\PowerShell\` に展開されます。

## Vim (`.vimrc`)

* **Colemak キーバインド**: `m/n/e/i` を方向キー（h/j/k/l）として割り当て。
* `s/t` を挿入（Insert/Append）に割り当て。
* `x/c/v` を切り取り・コピー・貼り付けに最適化。

| Colemak | QWERTY相当 | 用途 |
|---------|------------|------|
| `m/n/e/i` | `h/j/k/l` | 移動キー |
| `s/t` | `i/a` | 挿入/追加 |
| `x/c/v` | `d/y/p` | 削除/コピー/貼り付け |

## Neovim (`dot_config/nvim/`)

```
nvim/
├── init.lua                 # エントリーポイント
└── lua/
    ├── core/                # options, keymaps, autocmds
    └── modules/
        ├── plugins.lua      # lazy.nvimプラグイン定義
        └── configs/         # 個別プラグイン設定
            ├── lsp/
            ├── dap/
            ├── git/
            ├── editor/
            └── ui/
```

カスタマイズポイント：

* **LSP サーバー追加**: `dot_config/nvim/lua/modules/configs/lsp/init.lua`
* **フォーマッター追加**: `dot_config/nvim/lua/modules/configs/editor/conform.lua`

## Git (`.gitconfig`)

* ページャーとして `delta` を使用。
* 各種エイリアス（`ci`, `co`, `st`, `last`, `ccc`）。
* GPG によるコミット署名の有効化。
