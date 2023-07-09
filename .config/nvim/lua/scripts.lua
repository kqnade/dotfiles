vim.cmd([[
    autocmd BufWritePost plugins.lua source <afile> | PackerCompile
  augroup end
]])

