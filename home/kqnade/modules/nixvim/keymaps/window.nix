{ ... }:
{
  keymaps = [
    # window focus move
    {
      action = "<C-w>h";
      key = "<C-h>";
      mode = "n";
      options = {
        silent = true;
        noremap = true;
        desc = "window: Focus left";
      };
    }
    {
      action = "<C-w>j";
      key = "<C-j>";
      mode = "n";
      options = {
        silent = true;
        noremap = true;
        desc = "window: Focus down";
      };
    }
    {
      action = "<C-w>k";
      key = "<C-k>";
      mode = "n";
      options = {
        silent = true;
        noremap = true;
        desc = "window: Focus up";
      };
    }
    {
      action = "<C-w>l";
      key = "<C-l>";
      mode = "n";
      options = {
        silent = true;
        noremap = true;
        desc = "window: Focus right";
      };
    }

    # vertical window resize
    {
      action = "<CMD>vertical resize -5<CR>";
      key = "<A-h>";
      mode = "n";
      options = {
        silent = true;
        noremap = true;
        desc = "window: Resize -5 vertically";
      };
    }
    {
      action = "<CMD>vertical resize +5<CR>";
      key = "<A-l>";
      mode = "n";
      options = {
        silent = true;
        noremap = true;
        desc = "window: Resize +5 vertically";
      };
    }
    # horizontal window resize
    {
      action = "<CMD>resize -2<CR>";
      key = "<A-j>";
      mode = "n";
      options = {
        silent = true;
        noremap = true;
        desc = "window: Resize -2 horizontally";
      };
    }
    {
      action = "<CMD>resize +2<CR>";
      key = "<A-k>";
      mode = "n";
      options = {
        silent = true;
        noremap = true;
        desc = "window: Resize +2 horizontally";
      };
    }

    # Terminal Job<-->Normal switch
    {
      action = "<c-\\><c-n><Plug>(esc)";
      key = "<ESC>";
      mode = "t";
      options = {
        silent = true;
        noremap = true;
        desc = "window: Terminal mode switch";
      };
    }
    {
      action = "i<ESC>";
      key = "<Plug>(esc)<ESC>";
      mode = "n";
      options = {
        silent = true;
        noremap = true;
        desc = "window: Terminal mode switch";
      };
    }
  ];
}
