{
  imports = [
    ./cmp
    ./lang
    ./ui
    ./tool
    ./themes.nix
    ./modules.nix
  ];

  #lazy loader
  plugins.lz-n = {
    enable = true;
  };
}
