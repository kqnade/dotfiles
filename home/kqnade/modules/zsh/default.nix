{...}:
{
  programs.zsh = {
    enable = true;
    defaultKeymap = "vicmd";
    shellAliases = {
      ls = "eza -G --group-directories-first --git --icons=always";
      la = "eza -la --group-directories-first --icons=always";
      g = "git";
      vi = "nvim";
      vim = "nvim";
    };
    syntaxHighlighting.enable = true;
    enableCompletion = false;
    zplug = {
      enable = true;
      plugins = [
        { name = "zsh-users/zsh-history-substring-search"; tags = [as:plugin]; }
        { name = "b4b4r07/enhancd"; tags = [from:github use:init.sh]; }
        { name = "mafredri/zsh-async"; tags = [from:github]; }
        { name = "sindresorhus/pure"; tags = [use:pure.zsh from:github as:theme]; }
        { name = "marlonrichert/zsh-autocomplete"; tags = [use:zsh-autocomplete.plugin.zsh];}
      ];
    };
    initExtra = ''
      bindkey              '^I'         menu-complete
      bindkey "$terminfo[kcbt]" reverse-menu-complete
      zstyle ':completion:*' completer _expand _complete _ignored _approximate _expand_alias
      zstyle ':autocomplete:*' default-context curcontext 
      zstyle ':autocomplete:*' min-input 0
      autoload -Uz compinit
      compinit
    '';
  };
}
