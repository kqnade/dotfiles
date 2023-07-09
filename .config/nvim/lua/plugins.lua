-- This file can be loaded by calling `lua require('plugins')` from your init.vim

-- Only required if you have packer configured as `opt`
vim.cmd [[packadd packer.nvim]]

return require('packer').startup(function(use)
  -- Packer can manage itself
  use 'wbthomason/packer.nvim'
  use 'lewis6991/impatient.nvim'
  use {'lambdalisue/fern.vim', opt=true} 
  use {'tpope/vim-surround',opt=true, event='VimEnter'}
  use {'junegunn/fzf', opt=true, cmd='Ag'}
  use {'junegunn/fzf.vim', opt=true, cmd='Ag'}
  use {'machakann/vim-highlightedyank', opt=true, event='TextYankPost'}
  use {'simeji/winresizer'}
  use 'lambdalisue/nerdfont.vim'
  use {'lambdalisue/fern-git-status.vim', opt=true}
  use "folke/tokyonight.nvim"
  use {'preservim/tagbar', cmd = {'TagbarToggle'}}
  use {"akinsho/toggleterm.nvim", tag = '*',opt=true, event = 'VimEnter',
    config = function()
      require("toggleterm").setup()
    end
  }
  use {
  'nvim-lualine/lualine.nvim', opt = true, event = 'VimEnter',
    requires = { 'nvim-tree/nvim-web-devicons', opt = true },
    config = function()
      require('lualine').setup {
        options = {
          globalstatus = true,
        }
      }
    end
  }
  use {
    'nvim-treesitter/nvim-treesitter',
    run = function()
      local ts_update = require('nvim-treesitter.install').update({ with_sync = true })
      ts_update()
  end, opt=true, event='VimEnter'}
  use {'neoclide/coc.nvim', branch = 'release', opt=true, event='VimEnter'}
  use {'sheerun/vim-polyglot', opt=true, event = 'VimEnter'}
end)

