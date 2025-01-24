{ config, lib, pkgs, ... }:
{
  imports =
    [
      ./../modules
    ];

  networking.hostName = "Zenith";

  wsl.enable = true;
  wsl.defaultUser = "kqnade";

  environment.systemPackages = [
    pkgs.wget
  ];
  programs.nix-ld = {
    enable = true;
  };

  # Do NOT change this value unless you have manually inspected all the changes it would make to your configuration,
  # and migrated your data accordingly.
  #
  # For more information, see `man configuration.nix` or https://nixos.org/manual/nixos/stable/options#opt-system.stateVersion .
  system.stateVersion = "24.11"; # Did you read the comment?
}

