# TabCtrl Native Bridge — Linux

Self-contained install bundle. Use this folder if you're on Linux.

## Install

```bash
bash native/linux/install.sh                            # Chrome + Store id
bash native/linux/install.sh --browser chromium         # Chromium
bash native/linux/install.sh --browser edge             # Microsoft Edge
bash native/linux/install.sh --browser chrome --extension-id <id>
bash native/linux/install.sh --browser chrome --use-manifest-id
```

The user-level manifest lands in one of:

- `~/.config/google-chrome/NativeMessagingHosts/com.tabctrl.bridge.json`
- `~/.config/chromium/NativeMessagingHosts/com.tabctrl.bridge.json`
- `~/.config/microsoft-edge/NativeMessagingHosts/com.tabctrl.bridge.json`

## Uninstall

```bash
bash native/linux/uninstall.sh --browser chrome
```

## What's in this folder

| File | Purpose |
|---|---|
| `install.sh` | Installer (zero-arg defaults to Chrome + Store id) |
| `uninstall.sh` | Removes the user-level manifest |
| `tabctrl-bridge.sh` | Host launcher |
| `host.cjs` | Native messaging host (sync'd from `../common/host.cjs`) |
| `generate-manifest.cjs` | Manifest generator (sync'd copy) |
| `bridge.config.json` | Allowlist of CLIs this host may run |
| `bridge.config.schema.json` | Editor schema for the config |
| `com.tabctrl.bridge.json` | Manifest template |

## Requirements

- Any modern Linux with `bash` and Node.js on `PATH`
- Google Chrome, Chromium, or Microsoft Edge with the TabCtrl extension loaded
