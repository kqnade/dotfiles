local global      = vim.g
local opt         = vim.opt
vim.scriptcoding  = 'utf-8'

vim.loader.enable()

vim.cmd.colorscheme "tokyonight-night"
global.mapleader = "//"

global.did_install_default_menus = false
global.did_install_syntax_menu = false
global.did_indent_on = false
global.did_load_ftplugin = false
global.loaded_2html_plugin = false
global.loaded_gzip = false
global.loaded_man = false
global.loaded_matchit = false
global.loaded_matchparen = false
global.loaded_netrwPlugin = false
global.loaded_remote_plugins = false
global.loaded_shada_plugin = false
global.loaded_spellfile_plugin = false
global.loaded_tarPlugin = false
global.loaded_tutor_mode_plugin = false
global.loaded_zipPlugin = false
global.skip_loading_mswin = false
----------------------------------------------------------------------------
-- Search
opt.ignorecase = true -- 検索文字列が小文字の場合は大文字小文字を区別なく検索する
opt.smartcase = true -- 検索文字列に大文字がairline_theme = 'wombat'含まれている場合は区別して検索する
opt.wrapscan = true -- 検索時に最後まで行ったら最初に戻る

---------------------------------------------------------------------------
-- Edit
opt.expandtab = true -- タブ入力を複数の空白入力に置き換える
opt.tabstop = 2 -- 連続した空白に対してタブキーやバックスペースキーでカーソルが動く幅
opt.shiftwidth = 2 -- 行頭でのTab文字の表示幅
opt.smartindent = true -- 改行時に前の行の構文をチェックし次の行のインデントを増減する

-- Add angle brackets to the list of recognized characters in a pair
opt.matchpairs:append({ "<:>" })

opt.hidden = true

-- この時間の間 (ミリ秒単位) 入力がなければ、スワップファイルがディスクに書き込まれる
opt.updatetime = 100

opt.swapfile = true
opt.undofile = true

---------------------------------------------------------------------------
-- View
opt.termguicolors = true
opt.mouse = "a" -- Enable mouse input
opt.showmode = false
opt.number = true -- 行番号を表示
opt.relativenumber = true
opt.cursorline = true -- 現在の行を強調表示
opt.linebreak = true
opt.showbreak = "\\"
opt.breakat = " 	;:,!?"
opt.whichwrap = "b,s,h,l,<,>,[,],~" -- カーソルの左右移動で行末から次の行の行頭への移動が可能になる
opt.breakindent = true

-- Display candidates by popup menu.
opt.wildmode = "full"

-- Display all the information of the tag by the supplement of the Insert mode.
opt.showfulltag = true
-- Complete all candidates
opt.wildignorecase = true

-- Completion setting.
opt.completeopt = "menuone"
-- Don't complete from other buffer.
opt.complete = "."
-- Use "/" for path completion
opt.completeslash = "slash"
