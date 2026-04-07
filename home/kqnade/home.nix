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
      uv
      zellij
    ];
    sessionVariables = {
      GPG_KEYID = "360717BE50563D9A11129B001E661B785273DED3";
    };
  };

  programs.home-manager.enable = true;

  imports = [
    ./modules/git
    ./modules/zsh
    ./modules/direnv.nix
  ];
}
