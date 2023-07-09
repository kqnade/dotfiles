-- Automatically generated packer.nvim plugin loader code

if vim.api.nvim_call_function('has', {'nvim-0.5'}) ~= 1 then
  vim.api.nvim_command('echohl WarningMsg | echom "Invalid Neovim version for packer.nvim! | echohl None"')
  return
end

vim.api.nvim_command('packadd packer.nvim')

local no_errors, error_msg = pcall(function()

_G._packer = _G._packer or {}
_G._packer.inside_compile = true

local time
local profile_info
local should_profile = false
if should_profile then
  local hrtime = vim.loop.hrtime
  profile_info = {}
  time = function(chunk, start)
    if start then
      profile_info[chunk] = hrtime()
    else
      profile_info[chunk] = (hrtime() - profile_info[chunk]) / 1e6
    end
  end
else
  time = function(chunk, start) end
end

local function save_profiles(threshold)
  local sorted_times = {}
  for chunk_name, time_taken in pairs(profile_info) do
    sorted_times[#sorted_times + 1] = {chunk_name, time_taken}
  end
  table.sort(sorted_times, function(a, b) return a[2] > b[2] end)
  local results = {}
  for i, elem in ipairs(sorted_times) do
    if not threshold or threshold and elem[2] > threshold then
      results[i] = elem[1] .. ' took ' .. elem[2] .. 'ms'
    end
  end
  if threshold then
    table.insert(results, '(Only showing plugins that took longer than ' .. threshold .. ' ms ' .. 'to load)')
  end

  _G._packer.profile_output = results
end

time([[Luarocks path setup]], true)
local package_path_str = "/home/k4nade/.cache/nvim/packer_hererocks/2.1.0-beta3/share/lua/5.1/?.lua;/home/k4nade/.cache/nvim/packer_hererocks/2.1.0-beta3/share/lua/5.1/?/init.lua;/home/k4nade/.cache/nvim/packer_hererocks/2.1.0-beta3/lib/luarocks/rocks-5.1/?.lua;/home/k4nade/.cache/nvim/packer_hererocks/2.1.0-beta3/lib/luarocks/rocks-5.1/?/init.lua"
local install_cpath_pattern = "/home/k4nade/.cache/nvim/packer_hererocks/2.1.0-beta3/lib/lua/5.1/?.so"
if not string.find(package.path, package_path_str, 1, true) then
  package.path = package.path .. ';' .. package_path_str
end

if not string.find(package.cpath, install_cpath_pattern, 1, true) then
  package.cpath = package.cpath .. ';' .. install_cpath_pattern
end

time([[Luarocks path setup]], false)
time([[try_loadstring definition]], true)
local function try_loadstring(s, component, name)
  local success, result = pcall(loadstring(s), name, _G.packer_plugins[name])
  if not success then
    vim.schedule(function()
      vim.api.nvim_notify('packer.nvim: Error running ' .. component .. ' for ' .. name .. ': ' .. result, vim.log.levels.ERROR, {})
    end)
  end
  return result
end

time([[try_loadstring definition]], false)
time([[Defining packer_plugins]], true)
_G.packer_plugins = {
  ["coc.nvim"] = {
    loaded = false,
    needs_bufread = false,
    only_cond = false,
    path = "/home/k4nade/.local/share/nvim/site/pack/packer/opt/coc.nvim",
    url = "https://github.com/neoclide/coc.nvim"
  },
  ["fern-git-status.vim"] = {
    loaded = false,
    needs_bufread = false,
    path = "/home/k4nade/.local/share/nvim/site/pack/packer/opt/fern-git-status.vim",
    url = "https://github.com/lambdalisue/fern-git-status.vim"
  },
  ["fern.vim"] = {
    loaded = false,
    needs_bufread = true,
    path = "/home/k4nade/.local/share/nvim/site/pack/packer/opt/fern.vim",
    url = "https://github.com/lambdalisue/fern.vim"
  },
  fzf = {
    commands = { "Ag" },
    loaded = false,
    needs_bufread = false,
    only_cond = false,
    path = "/home/k4nade/.local/share/nvim/site/pack/packer/opt/fzf",
    url = "https://github.com/junegunn/fzf"
  },
  ["fzf.vim"] = {
    commands = { "Ag" },
    loaded = false,
    needs_bufread = false,
    only_cond = false,
    path = "/home/k4nade/.local/share/nvim/site/pack/packer/opt/fzf.vim",
    url = "https://github.com/junegunn/fzf.vim"
  },
  ["impatient.nvim"] = {
    loaded = true,
    path = "/home/k4nade/.local/share/nvim/site/pack/packer/start/impatient.nvim",
    url = "https://github.com/lewis6991/impatient.nvim"
  },
  ["lualine.nvim"] = {
    after = { "nvim-web-devicons" },
    config = { "\27LJ\2\2]\0\0\3\0\6\0\t6\0\0\0'\1\1\0B\0\2\0029\0\2\0005\1\4\0005\2\3\0=\2\5\1B\0\2\1K\0\1\0\foptions\1\0\0\1\0\1\17globalstatus\2\nsetup\flualine\frequire\0" },
    loaded = false,
    needs_bufread = false,
    only_cond = false,
    path = "/home/k4nade/.local/share/nvim/site/pack/packer/opt/lualine.nvim",
    url = "https://github.com/nvim-lualine/lualine.nvim"
  },
  ["nerdfont.vim"] = {
    loaded = true,
    path = "/home/k4nade/.local/share/nvim/site/pack/packer/start/nerdfont.vim",
    url = "https://github.com/lambdalisue/nerdfont.vim"
  },
  ["nvim-treesitter"] = {
    loaded = false,
    needs_bufread = false,
    only_cond = false,
    path = "/home/k4nade/.local/share/nvim/site/pack/packer/opt/nvim-treesitter",
    url = "https://github.com/nvim-treesitter/nvim-treesitter"
  },
  ["nvim-web-devicons"] = {
    load_after = {
      ["lualine.nvim"] = true
    },
    loaded = false,
    needs_bufread = false,
    path = "/home/k4nade/.local/share/nvim/site/pack/packer/opt/nvim-web-devicons",
    url = "https://github.com/nvim-tree/nvim-web-devicons"
  },
  ["packer.nvim"] = {
    loaded = true,
    path = "/home/k4nade/.local/share/nvim/site/pack/packer/start/packer.nvim",
    url = "https://github.com/wbthomason/packer.nvim"
  },
  tagbar = {
    commands = { "TagbarToggle" },
    loaded = false,
    needs_bufread = false,
    only_cond = false,
    path = "/home/k4nade/.local/share/nvim/site/pack/packer/opt/tagbar",
    url = "https://github.com/preservim/tagbar"
  },
  ["toggleterm.nvim"] = {
    config = { "\27LJ\2\0028\0\0\2\0\3\0\0066\0\0\0'\1\1\0B\0\2\0029\0\2\0B\0\1\1K\0\1\0\nsetup\15toggleterm\frequire\0" },
    loaded = false,
    needs_bufread = false,
    only_cond = false,
    path = "/home/k4nade/.local/share/nvim/site/pack/packer/opt/toggleterm.nvim",
    url = "https://github.com/akinsho/toggleterm.nvim"
  },
  ["tokyonight.nvim"] = {
    loaded = true,
    path = "/home/k4nade/.local/share/nvim/site/pack/packer/start/tokyonight.nvim",
    url = "https://github.com/folke/tokyonight.nvim"
  },
  ["vim-highlightedyank"] = {
    loaded = false,
    needs_bufread = false,
    only_cond = false,
    path = "/home/k4nade/.local/share/nvim/site/pack/packer/opt/vim-highlightedyank",
    url = "https://github.com/machakann/vim-highlightedyank"
  },
  ["vim-polyglot"] = {
    loaded = false,
    needs_bufread = true,
    only_cond = false,
    path = "/home/k4nade/.local/share/nvim/site/pack/packer/opt/vim-polyglot",
    url = "https://github.com/sheerun/vim-polyglot"
  },
  ["vim-surround"] = {
    loaded = false,
    needs_bufread = false,
    only_cond = false,
    path = "/home/k4nade/.local/share/nvim/site/pack/packer/opt/vim-surround",
    url = "https://github.com/tpope/vim-surround"
  },
  winresizer = {
    loaded = true,
    path = "/home/k4nade/.local/share/nvim/site/pack/packer/start/winresizer",
    url = "https://github.com/simeji/winresizer"
  }
}

time([[Defining packer_plugins]], false)

-- Command lazy-loads
time([[Defining lazy-load commands]], true)
pcall(vim.api.nvim_create_user_command, 'Ag', function(cmdargs)
          require('packer.load')({'fzf.vim', 'fzf'}, { cmd = 'Ag', l1 = cmdargs.line1, l2 = cmdargs.line2, bang = cmdargs.bang, args = cmdargs.args, mods = cmdargs.mods }, _G.packer_plugins)
        end,
        {nargs = '*', range = true, bang = true, complete = function()
          require('packer.load')({'fzf.vim', 'fzf'}, {}, _G.packer_plugins)
          return vim.fn.getcompletion('Ag ', 'cmdline')
      end})
pcall(vim.api.nvim_create_user_command, 'TagbarToggle', function(cmdargs)
          require('packer.load')({'tagbar'}, { cmd = 'TagbarToggle', l1 = cmdargs.line1, l2 = cmdargs.line2, bang = cmdargs.bang, args = cmdargs.args, mods = cmdargs.mods }, _G.packer_plugins)
        end,
        {nargs = '*', range = true, bang = true, complete = function()
          require('packer.load')({'tagbar'}, {}, _G.packer_plugins)
          return vim.fn.getcompletion('TagbarToggle ', 'cmdline')
      end})
time([[Defining lazy-load commands]], false)

vim.cmd [[augroup packer_load_aucmds]]
vim.cmd [[au!]]
  -- Event lazy-loads
time([[Defining lazy-load event autocommands]], true)
vim.cmd [[au VimEnter * ++once lua require("packer.load")({'nvim-treesitter', 'lualine.nvim', 'vim-surround', 'vim-polyglot', 'toggleterm.nvim', 'coc.nvim'}, { event = "VimEnter *" }, _G.packer_plugins)]]
vim.cmd [[au TextYankPost * ++once lua require("packer.load")({'vim-highlightedyank'}, { event = "TextYankPost *" }, _G.packer_plugins)]]
time([[Defining lazy-load event autocommands]], false)
vim.cmd("augroup END")

_G._packer.inside_compile = false
if _G._packer.needs_bufread == true then
  vim.cmd("doautocmd BufRead")
end
_G._packer.needs_bufread = false

if should_profile then save_profiles() end

end)

if not no_errors then
  error_msg = error_msg:gsub('"', '\\"')
  vim.api.nvim_command('echohl ErrorMsg | echom "Error in packer_compiled: '..error_msg..'" | echom "Please check your config for correctness" | echohl None')
end
