{ config, pkgs, ... }:

{
  home.username = "kqnade";
  home.homeDirectory = "/home/kqnade";
  home.stateVersion = "24.11"; # Please read the comment before changing.
  home.packages = with pkgs; [
    ghq
    gh
    glab
    delta
    tmux
    eza
    bat
    fd
    mise
    fzf
    fzy
  ];

  programs.home-manager.enable = true;

  imports = [
    ./modules/git
    ./modules/zsh
    ./modules/nixvim
  ];

  home.sessionVariables = rec {
    GPG_KEYID = "3FB8AE32BA2DF93E54C640A0228245D67A8FDBC1";
  };
}
