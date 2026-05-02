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
> `dot_config/ghostty/`, `dot_config/kitty/`, `private_dot_gnupg/` は
> `.chezmoiignore` で除外され、PowerShell プロファイル
> (`Documents/PowerShell/Microsoft.PowerShell_profile.ps1`) が代わりに展開されます。

## 6. MSYS2 で Linux ライクな bash 環境

Windows でも開発感覚を Linux/macOS に揃えるため、MSYS2（scoop で導入済）を
`%USERPROFILE%` を `$HOME` として使うように設定します。これで chezmoi が
配置した `~/.bashrc` がそのまま読まれます。

### MSYS2 の HOME を Windows ユーザーホームに統一

`C:\Users\<user>\.bash_profile` を作成し、bash 起動時に `~/.bashrc` を読むようにします
（chezmoi の `dot_bashrc.tmpl` で `~/.bashrc` は配置されているので、`bash_profile`
だけ手動で 1 回作成）：

```powershell
@'
# Source ~/.bashrc on login shells too.
[[ -r ~/.bashrc ]] && source ~/.bashrc
'@ | Set-Content -Encoding UTF8 $HOME\.bash_profile
```

そして MSYS2 がデフォルトで使う `/home/<user>` ではなく Windows ホーム
(`C:\Users\<user>`) を `$HOME` に使わせるため、`C:\msys64\etc\nsswitch.conf`
を編集して以下のように設定します（管理者権限が必要）：

```
db_home: windows
```

これで MSYS2 の bash を起動すると `$HOME` が `/c/Users/<user>` になり、chezmoi 管理下の
`.bashrc` / `.gitconfig` / `.config/zsh/aliases.zsh` などが自動で利用できます。

### 動作確認

スタートメニューから「MSYS2 UCRT64」（または MSYS2 MINGW64）を起動：

```bash
echo $HOME              # /c/Users/<user> となるはず
which mise              # /c/Users/<user>/scoop/shims/mise.exe
which starship          # 同上
mise --version
```

> **補足**: MSYS2 は複数の "サブシステム"（MSYS / UCRT64 / MINGW64 / CLANG64）
> を持ちますが、日常開発には **UCRT64** が推奨されます。スタートメニューでは
> "MSYS2 UCRT64" を起動してください。
