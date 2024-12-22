{...}:
{
  programs.git = {
    enable = true;
    userName = "kqnade";
    userEmail = "git@k4na.de";

    aliases = {
      ci = "commit";
      co = "checkout";
      br = "branch";
      st = "status";
      last = "log -1 HEAD";
      sub = "submodule update -- remote --merge";
    };

    signing = {
      key = "485A496FEC9ADAF7";
      signByDefault = true;
    };

    extraConfig = {
      credential."https://github.com".helper = "!gh auth git-credential";
      pull = {
        ff = "only";
	rebase = true;
      };
      init = {
        defaultBranch = "main";
      };
      rebase = {
        autoStash = true;
	autoSquash = true;
      };
      url = {
        "https*//github.com" = {
          insteadOf = "git://github.com";
	};
      };
      commit = {
        gpgSign = true;
      };
      tag = {
        gpgSign = true;
      };
      
    };
  };
}
