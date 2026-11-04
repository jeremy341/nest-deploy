state="$HOME/.fake-systemd"; mkdir -p "$state"
cmd="$1"; unit="${2:-}"
unitfile="$HOME/units/$unit"
pidfile="$state/$unit.pid"
alive() { [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; }
case "$cmd" in
  daemon-reload|enable|disable) exit 0 ;;
  show)
    echo "LoadState=$([ -f "$unitfile" ] && echo loaded || echo not-found)"
    if alive; then
      pid=$(cat "$pidfile")
      echo "ActiveState=active"; echo "SubState=running"; echo "MainPID=$pid"; echo "NRestarts=0"
      echo "MemoryCurrent=$(awk '/VmRSS/{print $2*1024}' /proc/$pid/status 2>/dev/null || echo 0)"
      echo "ActiveEnterTimestampMonotonic=$(awk '{print $22*10000}' /proc/$pid/stat 2>/dev/null || echo 0)"
    else
      echo "ActiveState=$([ -f "$unitfile" ] && echo failed || echo inactive)"; echo "SubState=dead"; echo "MainPID=0"
      echo "MemoryCurrent=18446744073709551615"
    fi
    exit 0 ;;
  is-system-running) echo running; exit 0 ;;
  is-active) if alive; then echo active; else echo failed; fi; exit 0 ;;
  stop) alive && kill "$(cat "$pidfile")" 2>/dev/null; rm -f "$pidfile"; exit 0 ;;
  restart|start)
    [ -f "$unitfile" ] || { echo "Unit $unit not found" >&2; exit 5; }
    alive && kill "$(cat "$pidfile")" 2>/dev/null
    wd=$(grep '^WorkingDirectory=' "$unitfile" | cut -d= -f2-)
    envfile=$(grep '^EnvironmentFile=' "$unitfile" | cut -d= -f2-)
    port=$(grep '^Environment=PORT=' "$unitfile" | sed 's/^Environment=PORT=//')
    start=$(grep '^ExecStart=' "$unitfile" | sed -E 's/^ExecStart=\/bin\/bash -lc "(.*)"$/\1/')
    # resolve the symlink so the process does not pin the link itself (Windows)
    cd "$(cd "$wd" && pwd -P)" || exit 1
    ( set -a; [ -f "$envfile" ] && . "$envfile"; set +a; export PORT="$port"; setsid nohup bash -c "$start" >"$state/$unit.log" 2>&1 < /dev/null & echo $! > "$pidfile" )
    sleep 0.4
    exit 0 ;;
  *) echo "fake systemctl: unsupported $cmd" >&2; exit 1 ;;
esac
