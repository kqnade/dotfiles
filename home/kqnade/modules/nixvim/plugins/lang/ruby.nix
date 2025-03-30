{ lib, pkgs, ... }:
{
  plugins = {
    lsp.servers.ruby_lsp = {
      enable = true;
    };
    conform-nvim.settings = {
      formatters_by_ft = {
        ruby = [ "rufo" ];
      };

      formatters = {
        rufo.command = lib.getExe pkgs.rufo;
      };
    };
    lint = {
      lintersByFt = {
        ruby = [ "rubocop" ];
      };

      linters = {
        rubocop.cmd = lib.getExe pkgs.rubocop;
      };
    };
  };
}
