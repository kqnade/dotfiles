{...}:
{
  programs.zsh = {
    enable = true;
    shellAliases = {
      ls = "eza -G --group-directories-first --git --icons=always";
      la = "eza -la --group-directories-first --icons=always";

      g = "git";

      vi = "nvim";
      vim = "nvim";
    };
    syntaxHighlighting.enable = true;

  };
}
