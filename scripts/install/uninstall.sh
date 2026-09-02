#!/bin/sh
set -eu
binary="${MATHOS_INSTALL_DIR:-$HOME/.local/bin}/mathos"; rm -f "$binary"
if [ "${1:-}" = "--purge" ]; then rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/mathos" "${XDG_CONFIG_HOME:-$HOME/.config}/mathos"; else echo "User data and research workspaces preserved."; fi
