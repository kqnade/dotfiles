{ pkgs, ... }:
{
  hardware.pulseaudio.enable = false;
  security.rtkit.enable = true;
  services.pipewire = {
    enable = true;
    alsa.enable = true;
    pulse.enable = true;
  };
  environment.systemPackages = [
    pkgs.pamixer
  ];
}
