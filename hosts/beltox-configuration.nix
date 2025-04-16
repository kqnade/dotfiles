{ config, lib, pkgs, ... }:
{
  imports =
    [
      ./hardconf/versapro-hardware-configuration.nix
      ./../modules
      ./../modules/desktop/audio.nix
      ./../modules/desktop/i3wm
    ];

  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;

  networking.hostName = "Beltox";
  networking.networkmanager.enable = true;
  console = {
    keyMap = "jp106";
  };

  # Do NOT change this value unless you have manually inspected all the changes it would make to your configuration,
  # and migrated your data accordingly.
  #
  # For more information, see `man configuration.nix` or https://nixos.org/manual/nixos/stable/options#opt-system.stateVersion .
  system.stateVersion = "24.11"; # Did you read the comment?
}

