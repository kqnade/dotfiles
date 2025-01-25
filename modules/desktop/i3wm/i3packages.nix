{pkgs, ...}:
{
  environment.systemPackages = with pkgs; [
    kitty
    firefox
    rofi
    discord
    spotify
    bitwarden-desktop
  ];
}
