local wezterm = require("wezterm")
local config = wezterm.config_builder()

-- Font
config.font = wezterm.font("UDEV Gothic NFLG")
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

return config
