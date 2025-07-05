{
  description = "A Simple flake for k47de's nixos env";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";
    nixos.url = "github:nixos/nixpkgs/nixos-25.05";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    nixvim = {
      url = "github:nix-community/nixvim";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    nixos-wsl.url = "github:nix-community/nixos-wsl";
  };

  outputs =
    {
      self,
      nixpkgs,
      nixos,
      home-manager,
      nixvim,
      nixos-wsl,
    }:
    {
      nixosConfigurations = {
        atraqutia = nixos.lib.nixosSystem {
          system = "x86_64-linux";
          modules = [
            ./hosts/atraqutia-configuration.nix
          ];
        };
        beltox = nixos.lib.nixosSystem {
          system = "x86_64-linux";
          modules = [
            ./hosts/beltox-configuration.nix
          ];
        };
        zenith = nixos.lib.nixosSystem {
          system = "x86_64-linux";
          modules = [
            nixos-wsl.nixosModules.wsl
            ./hosts/zenith-configuration.nix
          ];
        };
      };
      homeConfigurations = {
        kqnade = home-manager.lib.homeManagerConfiguration {
          pkgs = import nixpkgs {
            system = "x86_64-linux";
          };
          modules = [
            ./home/kqnade/home.nix
            nixvim.homeManagerModules.nixvim
          ];
        };
        kqnade-i3 = home-manager.lib.homeManagerConfiguration {
          pkgs = import nixpkgs {
            system = "x86_64-linux";
          };
          modules = [
            ./home/kqnade/i3home.nix
            nixvim.homeManagerModules.nixvim
          ];
        };
      };
    };
}
