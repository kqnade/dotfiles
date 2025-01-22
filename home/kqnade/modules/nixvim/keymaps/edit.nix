{...}:
{
  keymaps = [
    {
      action = "<CMD>normal za<CR>";
      key = "<S-Tab>";
      mode = "n";
      options = {
        silent = true;
        noremap = true;
        desc = "edit: Toggle code fold";
      };
    }

    # to EOL
    {
      action = "y$";
      key = "Y";
      mode = "n";
      options = {
        silent = true;
        noremap = true;
        desc = "edit: Yank text to EOL";
      };
    }
    {
      action = "d$";
      key = "D";
      mode = "n";
      options = {
        silent = true;
        noremap = true;
        desc = "edit: Delete text to EOL";
      };
    }

    # Search result
    {
      action = "nzzzv";
      key = "n";
      mode = "n";
      options = {
        silent = true;
        noremap = true;
        desc = "edit: Next search result";
      };
    }
    {
      action = "Nzzzv";
      key = "N";
      mode = "n";
      options = {
        silent = true;
        noremap = true;
        desc = "edit: Prev search result";
      };
    }
    {
      action = "<CMD>nohlsearch<CR>";
      key = "<ESC>";
      mode = "n";
      options = {
        silent = true;
        noremap = true;
        desc = "edit: remove Highlight by search";
      };
    }

    # Join
    {
      action = "mzJ`z";
      key = "J";
      mode = "n";
      options = {
        silent = true;
        noremap = true;
        desc = "edit: Join next line";
      };
    }

  ];
}
