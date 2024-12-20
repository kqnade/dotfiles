{ config, pkgs, ... }:

{
  home.username = "kqnade";
  home.homeDirectory = "/home/kqnade";
  home.stateVersion = "24.11"; # Please read the comment before changing.
  home.packages = with pkgs; [
    gh
    ghq
    delta
    tmux
    eza
    bat
    fd
  ];

  programs.home-manager.enable = true;

  imports = [
    ./modules/git.nix
    ./modules/zsh.nix
    ./modules/nixvim.nix
  ];

  home.sessionVariables = rec {
    GPG_KEYID = "3FB8AE32BA2DF93E54C640A0228245D67A8FDBC1";
  };
}
