{ pkgs, ... }:

{
  home = {
    username = "kqnade";
    homeDirectory = "/home/kqnade";
    stateVersion = "24.11"; # Please read the comment before changing.
    packages = with pkgs; [
      ghq
      gh
      glab
      eza
      bat
      fd
      fzf
      fzy
      direnv
    ];
    sessionVariables = {
      GPG_KEYID = "3FB8AE32BA2DF93E54C640A0228245D67A8FDBC1";
    };
  };

  programs.home-manager.enable = true;

  imports = [
    ./modules/git
    ./modules/zsh
    ./modules/nixvim
    ./modules/direnv.nix
  ];
}
