local wezterm = require("wezterm")
local config = wezterm.config_builder()

-- Font
-- Fallback chain: prefer UDEVGothic NF where available, then any
-- JetBrainsMono Nerd Font (scoop's nerd-fonts bucket on Windows), then
-- the OS's default monospace font as a last resort. wezterm picks the
-- first one that resolves.
config.font = wezterm.font_with_fallback({
	"UDEV Gothic NFLG",
	"UDEVGothic NF",
	"JetBrainsMono Nerd Font",
	"Cascadia Code",
})
config.font_size = 12.0

-- Window
config.window_padding = {
	left = 12,
	right = 12,
	top = 12,
	bottom = 12,
}
config.window_background_opacity = 0.6

-- Cursor
config.default_cursor_style = "SteadyBlock"

-- Window decorations: integrate traffic light buttons into tab bar
config.window_decorations = "INTEGRATED_BUTTONS|RESIZE"

-- Misc
config.audible_bell = "Disabled"
config.window_close_confirmation = "NeverPrompt"

-- ---------------------------------------------------------------------------
-- Per-OS shell setup
-- On Windows, default to PowerShell and expose a launcher menu (Ctrl+Shift+L)
-- with MSYS2 UCRT64 and auto-discovered WSL distros, so switching between
-- environments doesn't require a separate Windows Terminal.
-- ---------------------------------------------------------------------------
if wezterm.target_triple:find("windows") then
	local home = os.getenv("USERPROFILE") or ""
	local msys2_bash = home .. "\\scoop\\apps\\msys2\\current\\usr\\bin\\bash.exe"

	config.default_prog = { "pwsh.exe", "-NoLogo" }

	local launch_menu = {
		{ label = "PowerShell",     args = { "pwsh.exe", "-NoLogo" } },
		{ label = "Command Prompt", args = { "cmd.exe" } },
		{
			label = "MSYS2 UCRT64",
			args = { msys2_bash, "--login", "-i" },
			set_environment_variables = {
				MSYSTEM = "UCRT64",
				CHERE_INVOKING = "1",
			},
		},
	}

	-- Auto-discover WSL distros at config-load time. `wsl.exe -l -q` outputs
	-- UTF-16 LE with a BOM, so strip the BOM and null padding before splitting.
	local ok, stdout, _ = wezterm.run_child_process({ "wsl.exe", "-l", "-q" })
	if ok and stdout then
		stdout = stdout:gsub("^\255\254", ""):gsub("\0", "")
		for distro in stdout:gmatch("[^\r\n]+") do
			local trimmed = distro:gsub("^%s+", ""):gsub("%s+$", "")
			if trimmed ~= "" then
				table.insert(launch_menu, {
					label = "WSL: " .. trimmed,
					-- --cd ~ starts in the WSL user's $HOME instead of the
					-- Windows-side cwd that wezterm inherits.
					args = { "wsl.exe", "-d", trimmed, "--cd", "~" },
				})
			end
		end
	end

	config.launch_menu = launch_menu

	config.keys = {
		{
			key = "L",
			mods = "CTRL|SHIFT",
			action = wezterm.action.ShowLauncherArgs({
				flags = "FUZZY|LAUNCH_MENU_ITEMS",
			}),
		},
	}
end

return config
