{...}:
{
  plugins.treesitter = {
    enable = true;
    settings = {
      sync_install = true;
      auto_install = true;
      highlight = {
        enable = true;
        additional_vim_regex_highlighting = true;
        custom_captures = { };
      };
      indent = {
        enable = true;
      };
    };
    lazyLoad = {
      enable = true;
      settings = {
        event = [
          "BufRead"
          "BufEnter"
          "TextChanged"
          "BufWinEnter"
          "VimResized"
        ];
      };
    };
  };
}
