{...}:
{
  plugins.telescope = {
    enable = true;
    keymaps = {
      "ff" = "find_files";
      "fg" = "line_grep";
      "fb" = "buffers";
      "fh" = "help_tags";
    };
    lazyLoad = {
      settings = {
        cmd = "Telescope";
        keys = [
          "ff"
          "fg"
          "fb"
          "fh"
        ];
      };
    };
  };
}
