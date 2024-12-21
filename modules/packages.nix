{pkgs, ...}:
{
  environment.systemPackages = with pkgs; [
    vim
    wget
    git
    zsh
    gcc
    gnumake
  ];

  programs.mtr.enable = true;
  programs.gnupg.agent = {
    enable = true;
    enableSSHSupport = true;
  };

  programs.zsh.enable = true;
  services.openssh.enable = true;
}
