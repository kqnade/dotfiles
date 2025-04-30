{
  plugins.gitsigns = {
    enable = true;
    lazyLoad = {
      enable = true;
      settings = {
        event = [
          "UIEnter"
        ];
      };
    };
    settings = {
      current_line_blame = false;
      current_line_blame_opts = {
        virt_text = true;
        virt_text_pos = "eol";
      };
      signcolumn = true;
      signs = {
        add = {
          text = "│";
        };
        change = {
          text = "│";
        };
        changedelete = {
          text = "~";
        };
        delete = {
          text = "_";
        };
        topdelete = {
          text = "‾";
        };
        untracked = {
          text = "┆";
        };
      };
      watch_gitdir = {
        follow_files = true;
      };
    };
  };
}
