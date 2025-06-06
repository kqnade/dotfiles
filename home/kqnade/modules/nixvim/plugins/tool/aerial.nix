{
  plugins.aerial = {
    enable = true;
    settings = {
      attach_mode = "global";
      show_guides = true;
      autojump = true;
      backends = [
        "treesitter"
        "lsp"
        "markdown"
        "asciidoc"
        "man"
      ];
      close_on_select = true;
      close_automatic_events = [
        "unfocus"
        "switch_buffer"
        "unsupported"
      ];
      highlight_on_hover = true;
      highlight_on_jump = 400;
      float = {
        relative = "win";
      };
      nav = {
        autojump = true;
        preview = true;
      };
    };
  };
}
