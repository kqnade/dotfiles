{
  description = "A Simple flake for k47de's nixos env";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";
    nixos.url = "github:nixos/nixpkgs/nixos-24.11";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    nixvim = {
      url = "github:nix-community/nixvim";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, nixos, home-manager, nixvim}: {
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
