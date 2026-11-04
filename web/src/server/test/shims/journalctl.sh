unit=""
while [ $# -gt 0 ]; do case "$1" in -u) unit="$2"; shift;; esac; shift; done
tail -n 30 "$HOME/.fake-systemd/$unit.log" 2>/dev/null || echo "(no journal)"
