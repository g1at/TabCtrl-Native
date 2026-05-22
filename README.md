# TabCtrl Native Messaging Bridge

中文版：[README_ZH.md](README_ZH.md)

This directory contains TabCtrl's optional native messaging bridge. The browser
extension can call allowlisted local CLIs through the `native_bridge` tool, but
the bridge is disabled by default. The tool is exposed to the model only after
the user enables Settings > Lab.

TabCtrl still prefers browser tools for reading pages, clicking, typing, and
short edits. The native bridge is intended for structured APIs, batch work, long
document writes, and file upload workflows such as Feishu/Lark. `run` calls are
approved by the extension unless explicitly auto-approved, and the native host
always enforces its own platform command allowlist from
`<platform>/bridge.config.json`.

## Pick your platform

| OS | Folder | One-click | Advanced |
|---|---|---|---|
| Windows | [`windows/`](windows/) | `install.bat` | `install.ps1` |
| macOS | [`macos/`](macos/) | `install.command` | `install.sh` |
| Linux | [`linux/`](linux/) | — | `install.sh` |

Each platform folder is fully self-contained — grab just the one matching your
OS.

## Layout

```text
native/
|-- README.md                         # This file
|-- README_ZH.md                   # Chinese translation
|-- common/                           # Source of truth (sync'd into each platform/)
|   |-- host.cjs                      # Native messaging host
|   |-- generate-manifest.cjs         # Chrome/Edge manifest generator
|   |-- bridge.config.schema.json     # Editor schema for bridge.config.json
|   |-- com.tabctrl.bridge.json       # Manifest template
|   `-- sync-host.cjs                 # dev: sync common/ -> platforms
|-- windows/
|   |-- README.md
|   |-- install.bat / uninstall.bat   # One-click
|   |-- install.ps1 / uninstall.ps1   # Parameterized
|   |-- tabctrl-bridge.cmd            # Host wrapper
|   |-- bridge.config.json            # Allowlist for Windows
|   `-- (sync'd copies of common/*)
|-- macos/
|   |-- README.md
|   |-- install.command               # One-click (Finder double-click)
|   |-- install.sh / uninstall.sh     # Parameterized
|   |-- tabctrl-bridge.sh
|   |-- bridge.config.json
|   `-- (sync'd copies of common/*)
`-- linux/
    |-- README.md
    |-- install.sh / uninstall.sh
    |-- tabctrl-bridge.sh
    |-- bridge.config.json
    `-- (sync'd copies of common/*)
```

The installer writes `com.tabctrl.bridge.installed.json` into the platform
folder. It contains a machine-local absolute path and is not portable.

## Requirements

- Chrome, Chromium, or Microsoft Edge with the TabCtrl extension installed.
- Node.js available from the shell used by the native host wrapper.
- Any CLI you want to expose, such as `feishu` or `lark-cli`, installed for the
  same OS user that runs the browser.

## Windows Installation

Double-click `native\windows\install.bat`, or from a PowerShell prompt:

```powershell
powershell -ExecutionPolicy Bypass -File .\native\windows\install.ps1
```

Register for Edge:

```powershell
powershell -ExecutionPolicy Bypass -File .\native\windows\install.ps1 -Chrome Edge
```

By default the installer registers the Chrome Web Store extension id:

```text
bniefocpdldneagigjlhbllgdjohmeie
```

For a load-unpacked development build, pass the extension id explicitly:

```powershell
powershell -ExecutionPolicy Bypass -File .\native\windows\install.ps1 -ExtensionId <extension_id>
```

If the local `manifest.json` contains a stable `key`, you can derive the
development extension id from it:

```powershell
powershell -ExecutionPolicy Bypass -File .\native\windows\install.ps1 -UseManifestKey
```

The Windows installer writes `native\windows\com.tabctrl.bridge.installed.json`
and registers it under the current-user registry:

```text
HKCU\Software\Google\Chrome\NativeMessagingHosts\com.tabctrl.bridge
HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.tabctrl.bridge
```

Uninstall: double-click `native\windows\uninstall.bat` (pass `-Chrome Edge`
or `-Chrome All` to widen scope).

## macOS Installation

Double-click `native/macos/install.command` in Finder, or:

```bash
bash native/macos/install.sh --browser chrome
bash native/macos/install.sh --browser chromium
bash native/macos/install.sh --browser edge
```

For a load-unpacked development build:

```bash
bash native/macos/install.sh --browser chrome --extension-id <extension_id>
bash native/macos/install.sh --browser chrome --use-manifest-id
```

The user-level manifest is written to one of:

```text
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.tabctrl.bridge.json
~/Library/Application Support/Chromium/NativeMessagingHosts/com.tabctrl.bridge.json
~/Library/Application Support/Microsoft Edge/NativeMessagingHosts/com.tabctrl.bridge.json
```

Uninstall:

```bash
bash native/macos/uninstall.sh --browser chrome
```

## Linux Installation

```bash
bash native/linux/install.sh --browser chrome
bash native/linux/install.sh --browser chromium
bash native/linux/install.sh --browser edge
```

For a load-unpacked development build:

```bash
bash native/linux/install.sh --browser chrome --extension-id <extension_id>
bash native/linux/install.sh --browser chrome --use-manifest-id
```

The user-level manifest is written to one of:

```text
~/.config/google-chrome/NativeMessagingHosts/com.tabctrl.bridge.json
~/.config/chromium/NativeMessagingHosts/com.tabctrl.bridge.json
~/.config/microsoft-edge/NativeMessagingHosts/com.tabctrl.bridge.json
```

Uninstall:

```bash
bash native/linux/uninstall.sh --browser chrome
```

The macOS/Linux installers make `tabctrl-bridge.sh` executable. They also
check that `node` is available.

## Command Allowlist

Edit the platform config for your operating system to control which logical
commands the host can run:

- Windows: `native/windows/bridge.config.json`
- macOS: `native/macos/bridge.config.json`
- Linux: `native/linux/bridge.config.json`

The host selects the current platform config automatically. For backwards
compatibility it also falls back to the legacy `native/config/<platform>/bridge.config.json`
location used by older installs, then to a root-level `native/bridge.config.json`.

The default Windows config exposes Feishu/Lark CLI candidates:

```json
{
  "$schema": "../common/bridge.config.schema.json",
  "commands": {
    "feishu": {
      "win32": [
        "%APPDATA%\\npm\\feishu.cmd",
        "%APPDATA%\\npm\\feishu",
        "feishu.cmd",
        "feishu",
        "lark-cli.cmd",
        "lark-cli"
      ]
    }
  },
  "maxTimeoutMs": 120000,
  "maxOutputBytes": 1048576,
  "allowCwd": false
}
```

The keys under `commands` are logical command names used by TabCtrl. Each
platform file may contain only the candidates relevant to that OS, but the host
still supports the legacy combined format. It expands `%APPDATA%`, `$HOME`,
`${HOME}`, and `~`, then resolves candidates itself. It does not call `which`,
`where`, or a shell to resolve commands.

`common/bridge.config.schema.json` provides editor hints and basic validation.
The host itself remains the source of truth for command allowlisting, risk
diagnostics, and path resolution.

## Custom Commands

Advanced users may add trusted purpose-built CLIs:

```json
{
  "commands": {
    "pandoc": {
      "win32": ["pandoc.exe"],
      "darwin": ["/opt/homebrew/bin/pandoc", "pandoc"],
      "linux": ["/usr/bin/pandoc", "pandoc"]
    },
    "corp-ticket": {
      "win32": ["corp-ticket.exe"],
      "darwin": ["corp-ticket"],
      "linux": ["corp-ticket"]
    }
  }
}
```

This still does not allow arbitrary shell strings. The model can only request a
structured call such as:

```json
{
  "action": "run",
  "command": "pandoc",
  "args": ["--version"]
}
```

The host passes `args` as a string array to the resolved allowlisted executable.
Except for the Windows `.cmd` and `.bat` compatibility path, it does not wrap
commands in `sh -c`, `bash -lc`, `cmd /c`, or `powershell -Command`.

## Safety Guidance

Recommended:

- Narrow, purpose-built CLIs with clear argument semantics.
- Tools such as `feishu`, `lark-cli`, `pandoc`, or read-only internal query
  tools.

Use caution:

- High-capability tools such as `git`, `curl`, `docker`, `kubectl`, `npm`,
  `pip`, and package managers. Keep them on manual approval if you expose them.

Avoid:

- Shells and general-purpose interpreters such as `cmd`, `powershell`, `bash`,
  `sh`, `python`, `node`, `ruby`, and `perl`. Allowlisting them effectively
  turns the bridge into arbitrary code execution.

The selected platform config controls what local programs can run. Settings >
Lab > auto-approved commands only controls whether TabCtrl skips the
confirmation prompt for a logical command. Keep new commands on manual approval
until their call pattern is predictable.

## Windows `.cmd` and `.bat` Compatibility

Many npm-installed CLIs on Windows are `.cmd` wrappers. The host handles them
in two ways:

1. **Node-direct bypass (preferred)** — npm-generated wrappers end in a line
   like `"%_prog%" "%dp0%\node_modules\<pkg>\bin\<entry>.js" %*`. The host
   parses this, recovers the `.js` path (path-traversal guarded to stay under
   the .cmd's own directory), and spawns Node directly with that script. This
   skips cmd.exe entirely, so JSON, quotes, `%`, `!`, newlines, and Chinese
   text in args all pass through unchanged.

2. **cmd.exe wrapper (fallback)** — for hand-written `.cmd`/`.bat` files that
   don't follow the npm pattern, the host runs `cmd.exe /d /s /c` with quoted
   args. In this fallback path the host still rejects characters that would
   break the command-line boundary: quotes, percent expansion, delayed
   expansion, newlines, and NUL.

Practical rules for the fallback path:

- Simple arguments, Chinese text, and URLs containing `&` are quoted as a
  single argument.
- Large Markdown, JSON, data URIs, and complex URLs should be passed through
  `native_bridge.input`, a CLI file argument, or the generic `argFiles`
  protocol described below.
- Prefer a real `.exe` or a fixed purpose-built wrapper when a CLI provides one.

For Feishu `docx create` and `docx update`, long `native_bridge.input` content is
automatically materialized to a temporary `content.md` file and passed as
`-f <file>` when no explicit content or file argument is already present.

For Feishu writes that the CLI itself supports through `-f <path>` (the JSON
arguments on `bitable create-record`, `update-record`, `create-app`,
`create-table`, `batch-create-fields`, `batch-create-tables`, `batch-create`,
`batch-update`; `docx batch-update-blocks`; `sheet write`, `append`,
`write-batch`; `board create-notes`), the host transparently substitutes
`--fields '{…}'` / `--records '[…]'` / `--values …` / `--nodes …` /
`--tables …` with `-f <tmp>/<name>.json` so Windows callers never have to
fight cmd.exe quoting.

### Generic `argFiles` for any CLI

For user-extended commands or feishu arguments without a documented `-f`
fallback (`bitable create-field --property`, `search --filter-json`, …), the
host accepts a generic `argFiles` field. Each placeholder appearing in `args`
is replaced by a path to a temporary file holding the provided content. The
host cleans the temp directory up regardless of how the call ended.

```json
{
  "action": "run",
  "command": "my-tool",
  "args": ["--config", "$cfg", "--payload", "$body"],
  "argFiles": {
    "$cfg": "{\"foo\":\"bar\"}",
    "$body": { "content": "name=Alice\nrole=admin", "fileName": "form.txt" }
  }
}
```

Rules:

- A placeholder must appear in `args` to be materialized; unused entries are
  ignored.
- Up to 32 placeholders per message.
- Values are either a string (treated as `content`) or `{ content, fileName? }`.
  `fileName` is sanitized to a safe basename; collisions get a counter suffix.
- Substitution happens before the Feishu-specific fallbacks, so a placeholder
  that already supplies a real path skips the `--fields → -f` rewrite.

This gives any `.cmd`-wrapped CLI a reliable way to receive JSON, multiline
text, or quote-bearing payloads on Windows without going through `cmd.exe`
argument escaping.

## Supported Actions

### `ping`

Checks whether the native host is installed and reachable.

```json
{ "action": "ping" }
```

### `which`

Resolves an allowlisted logical command to the concrete executable path.

```json
{ "action": "which", "command": "feishu" }
```

### `diagnose`

Reads the selected platform config, resolves candidates for the current
platform, and reports risky configuration choices such as shells, interpreters,
high-capability tools, missing commands, or `allowCwd`. It does not execute local
commands.

```json
{ "action": "diagnose" }
```

### `run`

Runs an allowlisted command with string-array arguments. Optional `input` is
passed as stdin, except for the Feishu docx materialization path described
above.

```json
{
  "action": "run",
  "command": "feishu",
  "args": ["--help"],
  "timeout_ms": 10000
}
```

The response includes `exitCode`, `stdout`, `stderr`, elapsed time, timeout
state, truncation state, and whether input was materialized to a temporary file.
The extension treats Feishu CLI `exitCode=2` as partial success and `exitCode=3`
as success with warnings; both require verification before continuing.

## Size and Timeout Limits

- Extension to native host: Chrome native messaging allows messages up to
  64 MiB.
- Native host to extension: Chrome native messaging allows messages up to
  1 MiB.
- `maxTimeoutMs` defaults to 120000 ms.
- `maxOutputBytes` defaults to 1048576 bytes and caps captured stdout/stderr.

For commands that can produce large output, prefer CLIs that support filtering,
pagination, or writing artifacts to files. Returning very large stdout/stderr
can exceed Chrome's native messaging response limit.

## Using the Bridge in TabCtrl

1. Install the native host for your browser and platform.
2. Make sure your platform config points to installed CLI candidates.
3. Enable Settings > Lab in TabCtrl.
4. Run "Check bridge" to verify native messaging connectivity.
5. Run "Check config" to inspect resolved paths and risk diagnostics.
6. Add auto-approved commands only after you trust the command pattern.

Even when Lab is enabled, the model does not bypass approvals automatically.
Unconfigured commands, destructive calls, and risky configurations are still
blocked by approval rules or by the native host allowlist.

## Migration from the old layout

The previous layout placed `host.cjs`, `generate-manifest.cjs`,
`tabctrl-bridge.{cmd,sh}`, and `install-*.ps1` / `install-*.sh` directly under
`native/`, with configs under `native/config/<platform>/`. If you installed
before this restructure, your registry / user-level manifest still points at
the old paths and the host will fail to launch.

To migrate:

1. Pull the new `native/` tree.
2. Re-run the installer for your platform (`native/windows/install.bat`,
   `native/macos/install.command`, or `bash native/linux/install.sh`).
3. The installer rewrites `com.tabctrl.bridge.installed.json` and the OS
   registration to point at the new platform folder.

No data lives in the bridge install — uninstalling and reinstalling is safe.

## Developer notes

- Edit **only** the files under `common/` when changing shared sources. Run
  `node native/common/sync-host.cjs` to push the changes into each platform
  folder. CI runs `--check` to catch drift.
- Per-platform `bridge.config.json` is *not* sync'd (it intentionally differs
  per OS).
- Tests load the host from `native/common/host.cjs`.

## Troubleshooting

- If `ping` fails, reinstall the native manifest for the correct browser and
  extension id, then reload the extension.
- If `which` fails, check your platform config, PATH, and whether the CLI is
  installed for the same OS user that runs the browser.
- If `run` fails with `.cmd` argument safety errors on Windows, move complex
  content into `native_bridge.input` or use a non-`.cmd` executable.
- If a command times out, pass a smaller `timeout_ms` for quick probes or raise
  `maxTimeoutMs` up to the extension-side cap of 120000 ms.
- If large command output fails to return, reduce output at the CLI level or
  write the full result to a file and return a concise summary.
