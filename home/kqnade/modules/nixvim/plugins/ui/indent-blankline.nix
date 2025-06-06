{
  plugins = {
    indent-blankline = {
      enable = true;
      settings = {
        indent = {
          char = "│"; # "│" or "▎"
          tab_char = "│";
        };
        scope.enabled = true;
        exclude = {
          buftypes = [
            "terminal"
            "nofile"
          ];
          filetypes = [
            "help"
            "alpha"
            "dashboard"
            "neo-tree"
            "Trouble"
            "trouble"
            "lazy"
            "mason"
            "notify"
            "toggleterm"
            "lazyterm"
          ];
        };
      };
    };
  };
}
