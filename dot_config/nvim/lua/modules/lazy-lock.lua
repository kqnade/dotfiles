-- Materialize the Renovate-managed plugin lock into Neovim's state directory.
-- The source file stays in the dotfiles checkout. Chezmoi does not deploy it,
-- and lazy.nvim must not rewrite it: a rewrite would drop the repository and
-- version fields Renovate matches.

local M = {}

local LOCK_RELATIVE = vim.fs.joinpath("dot_config", "nvim", "lazy-lock.json")

local function dotfiles_root()
  local configured = vim.env.DOTFILES_ROOT
  if type(configured) == "string" and configured ~= "" then
    return configured
  end
  return vim.fs.joinpath(vim.env.HOME, "repos", "github.com", "kqnade", "dotfiles")
end

function M.source_path()
  return vim.fs.joinpath(dotfiles_root(), LOCK_RELATIVE)
end

function M.read()
  local source = M.source_path()
  if vim.fn.filereadable(source) ~= 1 then
    error("Neovim plugin lock not found: " .. source)
  end
  return vim.json.decode(table.concat(vim.fn.readfile(source), "\n"))
end

-- lazy.nvim is not a plugin spec, so :Lazy restore never checks out its entry.
function M.pin(name)
  local pin = M.read()[name]
  local commit = type(pin) == "table" and pin.commit or nil
  if type(commit) ~= "string" or not commit:match("^%x+$") or #commit ~= 40 then
    error("Neovim plugin lock has no commit for " .. name)
  end
  return pin
end

function M.materialize()
  local pins = M.read()
  local names = vim.tbl_keys(pins)
  table.sort(names)

  local lines = { "{" }
  for index, name in ipairs(names) do
    local pin = pins[name]
    local comma = index == #names and "" or ","
    lines[#lines + 1] = string.format(
      '  %q: { "branch": %q, "commit": %q }%s',
      name,
      pin.branch,
      pin.commit,
      comma
    )
  end
  lines[#lines + 1] = "}"

  local directory = vim.fn.stdpath("state")
  vim.fn.mkdir(directory, "p")
  local target = vim.fs.joinpath(directory, "lazy-lock.json")
  vim.fn.writefile(lines, target)
  return target
end

return M
