{ lib, ... }:

{
  imports = [
    ./home.nix
  ];

  programs.firefox.enable = true;

  xsession.windowManager.i3 = {
    enable = true;
    config =
      let
        mod = "Mod4";
      in
      {
        modifier = "${mod}";
        gaps = {
          inner = 10;
          outer = 5;
        };
        keybindings = lib.mkOptionDefault {
          "${mod}+Return" = "exec kitty";
          "${mod}+d" = "exec rofi -show run";
          "${mod}+Shift+d" = "exec rofi -show window -matching fuzzy''";

          "${mod}+v" = "split v";
          "${mod}+s" = "split h";

          "${mod}+h" = "focus left";
          "${mod}+j" = "focus down";
          "${mod}+k" = "focus up";
          "${mod}+l" = "focus right";

          "${mod}+Shift+h" =
            "exec --no-startup-id killall -v .autotiling-wrapped; move left; exec --no-startup-id autotiling &";
          "${mod}+Shift+j" =
            "exec --no-startup-id killall -v .autotiling-wrapped; move down; exec --no-startup-id autotiling &";
          "${mod}+Shift+k" =
            "exec --no-startup-id killall -v .autotiling-wrapped; move up; exec --no-startup-id autotiling &";
          "${mod}+Shift+l" =
            "exec --no-startup-id killall -v .autotiling-wrapped; move right; exec --no-startup-id autotiling &";

        };
      };
  };
}
