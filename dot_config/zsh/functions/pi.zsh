pi() {
  local telemetry_launcher="${PI_TELEMETRY_LAUNCHER:-$HOME/.local/bin/pi-telemetry}"
  if [[ ! -x "$telemetry_launcher" ]]; then
    print -u2 "Pi telemetry launcher is unavailable: $telemetry_launcher"
    return 127
  fi
  "$telemetry_launcher" "$@"
}
