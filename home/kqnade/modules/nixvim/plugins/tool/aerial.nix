{
  plugins.aerial = {
    enable = true;
    settings = {
      attach_mode = "global";
      backends = [
        "treesitter"
        "lsp"
        "markdown"
        "asciidoc"
        "man"
      ];
      close_on_select = true;
      highlight_on_hover = true;
      highlight_on_jump = 350;
    };
  };
}
