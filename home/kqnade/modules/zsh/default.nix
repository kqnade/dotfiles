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
    enableCompletion = true;
    autosuggestion.enable = true;
    syntaxHighlighting.enable = true;
    zplug = {
      enable = true;
      plugins = [
        { name = "zsh-users/zsh-autosuggestions"; }
        { name = "romkatv/powerlevel10k"; tags = [ as:theme depth:1 ]; }
      ];
    };
    initExtra = ''
      [[ ! -f ${./zsh/p10k.zsh} ]] || source ${./zsh/p10k.zsh}
    '';
    
  };

}
