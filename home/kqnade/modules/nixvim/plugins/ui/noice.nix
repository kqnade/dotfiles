{...}:
{
  plugins.noice = {
    enable = true;
    settings = {
      cmdline = {
        view = "cmdline";
      };
      messages = {
        enabled = true;
        view = "notify";
        view_error = "notify";
        view_warn = "notify";
        view_history = "messages";
        view_search = "virtualtext";
      };
    };
  };
  plugins.notify = {
    enable = true;
  };
}
