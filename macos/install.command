#!/usr/bin/env bash
# Double-click target on macOS. Delegates to install.sh with the same args.
# Drop or rename install.sh to break this; the .command extension only differs
# in how Finder handles it.
set -euo pipefail
cd "$(dirname "$0")"
bash ./install.sh "$@"
