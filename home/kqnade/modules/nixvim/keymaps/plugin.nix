{
  keymaps = [
    # neo-tree
    {
      action = "<CMD>Neotree toggle<CR>";
      key = "<C-n>";
      mode = "n";
      options = {
        silent = true;
        noremap = true;
        desc = "neo-tree: toggle neo-tree";
      };
    }
    {
      action = "<CMD>ToggleTerm direction=float<CR>";
      key = "tt";
      mode = "n";
      options = {
        silent = true;
        noremap = true;
        desc = "ToggleTerm: toggle terminal (float mode)";
      };
    }
    {
      action = "<CMD>ToggleTerm direction=vertical<CR>";
      key = "tv";
      mode = "n";
      options = {
        silent = true;
        noremap = true;
        desc = "ToggleTerm: toggle terminal (vertical mode)";
      };
    }
    {
      action = "<CMD>AerialNavToggle<CR>";
      key = "<C-m>";
      mode = "n";
      options = {
        silent = true;
        noremap = true;
        desc = "Aerial: Toggle aerial navigation window";
      };
    }
    {
      action = "<CMD>AerialToggle<CR>";
      key = "<C-\\>";
      mode = "n";
      options = {
        silent = true;
        noremap = true;
        desc = "Aerial: Toggle aerial window";
      };
    }
  ];
}
