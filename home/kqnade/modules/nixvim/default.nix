{...}:
{
  programs.nixvim = {
    enable = true;
    imports = [
      ./plugins
      ./options.nix
      ./keymaps
    ];
  };
}
