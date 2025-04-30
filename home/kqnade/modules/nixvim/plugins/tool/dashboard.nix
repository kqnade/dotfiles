{
  plugins.dashboard = {
    enable = true;
    lazyLoad = {
      enable = true;
      settings = {
        event = [
          "VimEnter"
        ];
      };
    };
    settings = {
      change_to_vcs_root = true;
      config = {
        footer = [ ];
        header = [
          "███╗   ██╗██╗██╗  ██╗██╗   ██╗██╗███╗   ███╗"
          "████╗  ██║██║╚██╗██╔╝██║   ██║██║████╗ ████║"
          "██╔██╗ ██║██║ ╚███╔╝ ██║   ██║██║██╔████╔██║"
          "██║╚██╗██║██║ ██╔██╗ ╚██╗ ██╔╝██║██║╚██╔╝██║"
          "██║ ╚████║██║██╔╝ ██╗ ╚████╔╝ ██║██║ ╚═╝ ██║"
          "╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚═╝     ╚═╝"
        ];
        mru = {
          limit = 20;
        };
        project = {
          enable = false;
        };
        shortcut = [
          {
            action = {
              __raw = "function(path) vim.cmd('Telescope find_files') end";
            };
            desc = "Files";
            group = "Label";
            icon = " ";
            icon_hl = "@variable";
            key = "f";
          }
        ];
      };
      theme = "hyper";
    };
  };
}
