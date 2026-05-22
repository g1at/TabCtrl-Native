# TabCtrl Native Bridge — macOS

Self-contained install bundle. Use this folder if you're on macOS.

## One-click install

Double-click **`install.command`** in Finder. It launches Terminal, runs
`install.sh`, and registers the host for **Google Chrome** with the Chrome
Web Store extension id.

If macOS Gatekeeper blocks the script on first run:

1. Right-click `install.command` → Open → confirm Open in the prompt.
2. Or, in Terminal: `xattr -d com.apple.quarantine native/macos/install.command`.

## Advanced install

```bash
# Chromium / Edge:
bash native/macos/install.sh --browser chromium
bash native/macos/install.sh --browser edge

# Development build:
bash native/macos/install.sh --browser chrome --extension-id <id>
bash native/macos/install.sh --browser chrome --use-manifest-id
```

The user-level manifest lands in one of:

- `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.tabctrl.bridge.json`
- `~/Library/Application Support/Chromium/NativeMessagingHosts/com.tabctrl.bridge.json`
- `~/Library/Application Support/Microsoft Edge/NativeMessagingHosts/com.tabctrl.bridge.json`

## Uninstall

```bash
bash native/macos/uninstall.sh --browser chrome
```

## What's in this folder

| File | Purpose |
|---|---|
| `install.command` | One-click installer (Finder double-click target) |
| `install.sh` | Parameterized installer (advanced) |
| `uninstall.sh` | Removes the user-level manifest |
| `tabctrl-bridge.sh` | Host launcher |
| `host.cjs` | Native messaging host (sync'd from `../common/host.cjs`) |
| `generate-manifest.cjs` | Manifest generator (sync'd copy) |
| `bridge.config.json` | Allowlist of CLIs this host may run |
| `bridge.config.schema.json` | Editor schema for the config |
| `com.tabctrl.bridge.json` | Manifest template |

## Requirements

- macOS 12+ (Apple Silicon or Intel)
- Node.js installed and reachable on `PATH`
- Google Chrome, Chromium, or Microsoft Edge with the TabCtrl extension loaded
