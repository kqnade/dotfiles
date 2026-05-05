# Windows セットアップ (PowerShell 7 + scoop)

WSL を使う場合は [Linux セットアップ](./setup-linux.md) の手順がそのまま流用できます。
ここではネイティブ Windows（PowerShell 7 + scoop）を前提とします。

> **リポジトリ配置規約**: Linux/macOS の `~/ghq/github.com/kqnade/dotfiles`
> と概念的に揃え、Windows では `Z:\` (開発ドライブ) を ghq root 相当として
> `Z:\github.com\kqnade\dotfiles` を使います。`.chezmoi.toml.tmpl` の
> `sourceDir` はこの規約に基づき OS で自動分岐します。

## 1. scoop と chezmoi のインストール

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
scoop install git chezmoi
```

## 2. リポジトリの配置

```powershell
New-Item -ItemType Directory -Force -Path Z:\github.com\kqnade | Out-Null
git clone https://github.com/kqnade/dotfiles.git Z:\github.com\kqnade\dotfiles
Set-Location Z:\github.com\kqnade\dotfiles
```

## 3. 設定の適用

```powershell
chezmoi init --source .
chezmoi apply
```

`run_onchange_install-scoop-packages.ps1` が自動実行され、`scoopfile.json` の
buckets / apps が一括インストールされます（次回以降は manifest 変更時のみ再実行）。

## 4. ツールのインストール

CLI ツール群と言語ランタイムは scoop ではなく mise で precompiled バイナリとして取得します：

```powershell
mise install
```

`dot_config/mise/config.toml.tmpl` の Windows レンダリングは、source build が必要な `lua` / `ruby` を自動的に除外しています。

## 5. PowerShell プロファイルの読み込み確認

```powershell
. $PROFILE
```

> Windows では `dot_zshrc`, `dot_config/zsh/`, `dot_config/sheldon/`,
> `dot_config/ghostty/`, `private_dot_gnupg/` は
> `.chezmoiignore` で除外され、PowerShell プロファイル
> (`Documents/PowerShell/Microsoft.PowerShell_profile.ps1`) が代わりに展開されます。

## 6. MSYS2 で Linux ライクな bash 環境

`chezmoi apply` は以下を自動セットアップします：

- **`dot_bash_profile`** → `~/.bash_profile` に配置（ログインシェル時に `~/.bashrc` を読む）
- **`dot_bashrc.tmpl`** → `~/.bashrc` に配置（mise / starship / fzf 起動 + aliases 読込）
- **`run_onchange_setup-msys2.ps1.tmpl`** → scoop 配下の MSYS2 の
  `etc\nsswitch.conf` を `db_home: windows` に書き換え（admin 不要、scoop 管理下なのでユーザー所有）

つまり Windows 機の初回 `chezmoi apply` 後、**手動セットアップは何もありません**。
MSYS2 を起動すると：

```bash
echo $HOME              # /c/Users/<user>
which mise              # /c/Users/<user>/scoop/shims/mise
which starship          # 同上
```

> **補足**: MSYS2 は複数のサブシステム（MSYS / UCRT64 / MINGW64 / CLANG64）を持ちますが、
> 日常開発には **MSYS2 UCRT64** ショートカットからの起動を推奨します。
