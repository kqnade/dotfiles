{config, lib, ...}:
{
  time.timeZone = "Asia/Tokyo";
  nix.settings.experimental-features = [ "nix-command" "flakes" ];
  i18n.defaultLocale = "en_US.UTF-8";
  nixpkgs.config.allowUnfree = true;
}
