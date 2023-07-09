local keyset = vim.keymap.set

keyset('n', '<ESC><ESC>', ':nohlsearch<CR>', {noremap=true, silent=true})
keyset('n', 'sv', ':vs<CR>', {noremap=true, silent=true})
keyset('n', 'ss', ':sp<CR>', {noremap=true, silent=true})
keyset('n', 'st', ':tabnew<CR>', {noremap=true, silent=true})
keyset('n', 'sn', 'gt', {noremap=true, silent=true})
keyset('n', 'sp', 'gT', {noremap=true, silent=true})
keyset('n', 'sq', ':q<CR>', {noremap=true, silent=true})

keyset('n', '<F3>', '<C-w>w', {noremap=true, silent=true})
keyset('t', '<F3>', '<ESC><C-w>w', {noremap=true, silent=true})
keyset('t', '<ESC>', '<C-Bslash><C-n>')
keyset('n', '<Bslash>', '$', {noremap=true, silent=true})

keyset('i', '<C-h>', '<C-o>h',  {noremap=true, silent=true})
keyset('i', '<C-j>', '<C-o>j',  {noremap=true, silent=true})
keyset('i', '<C-k>', '<C-o>k',  {noremap=true, silent=true})
keyset('i', '<C-l>', '<C-o>l',  {noremap=true, silent=true})

keyset('n', '<F8>', ':packadd tagbar<CR>:TagbarToggle<CR>', {noremap=true, silent=true})
keyset('n', 'ff', ':packadd fern.vim<CR>:packadd fern-git-status.vim<CR>:Fern . -drawer<CR>', {noremap=true, silent=true})
