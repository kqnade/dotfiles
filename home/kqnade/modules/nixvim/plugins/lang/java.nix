{ pkgs, lib, ... }:
{
  plugins = {
    lsp.servers.jdtls.enable = true;

    conform-nvim.settings = {
      formatters_by_ft = {
        java = [ "google-java-format" ];
      };

      formatters = {
        google-java-format = {
          command = lib.getExe pkgs.google-java-format;
        };
      };
    };
  };
}
