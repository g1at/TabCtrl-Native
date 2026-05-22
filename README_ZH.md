# TabCtrl 本机消息桥接

English version: [README.md](README.md)

这个目录包含 TabCtrl 可选的 native bridge。扩展通过 `native_bridge` 工具调用本机白名单 CLI，但默认不会启用；只有在 Settings -> Lab 打开后，模型才会看到并请求调用。

TabCtrl 仍优先使用浏览器工具完成读取、点击、输入和短文本编辑。native bridge 更适合飞书/Lark 这类结构化 API、批量处理、长文档写入、文件上传等场景。`run` 调用默认经过扩展侧审批；Settings -> Lab 的免审批命令只跳过确认弹窗，native host 本身仍只会执行当前平台配置允许的逻辑命令。

## 选择你的平台

| 系统 | 文件夹 | 一键 | 进阶 |
|---|---|---|---|
| Windows | [`windows/`](windows/) | `install.bat` | `install.ps1` |
| macOS | [`macos/`](macos/) | `install.command` | `install.sh` |
| Linux | [`linux/`](linux/) | — | `install.sh` |

每个平台目录都是自包含的——只拿对应自己系统的那一份就够。

## 目录

```text
native/
|-- README.md                         # 英文
|-- README_ZH.md                   # 本文件
|-- common/                           # 源（同步到各 platform/）
|   |-- host.cjs                      # 本机消息 host
|   |-- generate-manifest.cjs         # Chrome/Edge manifest 生成器
|   |-- bridge.config.schema.json     # bridge.config.json 的编辑器 schema
|   |-- com.tabctrl.bridge.json       # manifest 模板
|   `-- sync-host.cjs                 # 开发：把 common/ 同步到各平台
|-- windows/
|   |-- README.md
|   |-- install.bat / uninstall.bat   # 一键
|   |-- install.ps1 / uninstall.ps1   # 带参数
|   |-- tabctrl-bridge.cmd            # host 启动器
|   |-- bridge.config.json            # Windows 白名单
|   `-- （common/* 的同步副本）
|-- macos/
|   |-- README.md
|   |-- install.command               # 一键（Finder 双击）
|   |-- install.sh / uninstall.sh     # 带参数
|   |-- tabctrl-bridge.sh
|   |-- bridge.config.json
|   `-- （common/* 的同步副本）
`-- linux/
    |-- README.md
    |-- install.sh / uninstall.sh
    |-- tabctrl-bridge.sh
    |-- bridge.config.json
    `-- （common/* 的同步副本）
```

最终用户只需要拿到对应自己系统的目录即可——每个平台目录都是自包含的。开发者只在 `common/` 下改源文件，跑 `node native/common/sync-host.cjs` 把改动同步到三个平台目录；CI 用 `--check` 模式校验是否漂移。

## Windows 安装

双击 `native\windows\install.bat`，或在 PowerShell 终端跑：

```powershell
powershell -ExecutionPolicy Bypass -File .\native\windows\install.ps1
```

注册 Edge：

```powershell
powershell -ExecutionPolicy Bypass -File .\native\windows\install.ps1 -Chrome Edge
```

安装脚本默认注册 Chrome Web Store 版本的扩展 ID：`bniefocpdldneagigjlhbllgdjohmeie`。如果你正在调试 Load unpacked 开发版，可以手动传入开发版扩展 ID：

```powershell
powershell -ExecutionPolicy Bypass -File .\native\windows\install.ps1 -ExtensionId <extension_id>
```

也可以从当前 `manifest.json` 的 `key` 推导开发版扩展 ID：

```powershell
powershell -ExecutionPolicy Bypass -File .\native\windows\install.ps1 -UseManifestKey
```

Windows 脚本会生成 `native\windows\com.tabctrl.bridge.installed.json`，并写入当前用户注册表：

```text
HKCU\Software\Google\Chrome\NativeMessagingHosts\com.tabctrl.bridge
HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.tabctrl.bridge
```

卸载：双击 `native\windows\uninstall.bat`（带 `-Chrome Edge` 或 `-Chrome All` 可扩大范围）。

## macOS 安装

在 Finder 双击 `native/macos/install.command`，或在终端：

```bash
bash native/macos/install.sh --browser chrome     # Chrome
bash native/macos/install.sh --browser chromium   # Chromium
bash native/macos/install.sh --browser edge       # Edge
```

用户级 manifest 会写入：

```text
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.tabctrl.bridge.json
~/Library/Application Support/Chromium/NativeMessagingHosts/com.tabctrl.bridge.json
~/Library/Application Support/Microsoft Edge/NativeMessagingHosts/com.tabctrl.bridge.json
```

卸载：

```bash
bash native/macos/uninstall.sh --browser chrome
```

调试 Load unpacked 开发版时，可以传入 `--extension-id <id>`，或使用 `--use-manifest-id` 从本地 `manifest.json` 的 `key` 推导扩展 ID。

## Linux 安装

```bash
bash native/linux/install.sh --browser chrome     # Chrome
bash native/linux/install.sh --browser chromium   # Chromium
bash native/linux/install.sh --browser edge       # Edge
```

用户级 manifest 会写入：

```text
~/.config/google-chrome/NativeMessagingHosts/com.tabctrl.bridge.json
~/.config/chromium/NativeMessagingHosts/com.tabctrl.bridge.json
~/.config/microsoft-edge/NativeMessagingHosts/com.tabctrl.bridge.json
```

卸载：

```bash
bash native/linux/uninstall.sh --browser chrome
```

macOS/Linux 脚本会自动给 `tabctrl-bridge.sh` 加执行权限。系统需要能从终端运行 `node`。
调试 Load unpacked 开发版时，可以传入 `--extension-id <id>`，或使用 `--use-manifest-id` 从本地 `manifest.json` 的 `key` 推导扩展 ID。

## 配置命令白名单

编辑当前系统对应的配置文件：

- Windows：`native/windows/bridge.config.json`
- macOS：`native/macos/bridge.config.json`
- Linux：`native/linux/bridge.config.json`

host 会自动选择当前平台配置。为了兼容旧版本，如果新位置不存在，host 仍会回退到旧的 `native/config/<platform>/bridge.config.json` 和更早的根目录 `native/bridge.config.json`。

默认 Windows 配置列出飞书/Lark CLI 候选：

```json
{
  "$schema": "../common/bridge.config.schema.json",
  "commands": {
    "feishu": {
      "win32": ["%APPDATA%\\npm\\feishu.cmd", "feishu.cmd", "feishu", "lark-cli.cmd", "lark-cli"]
    }
  },
  "maxTimeoutMs": 120000,
  "maxOutputBytes": 1048576,
  "allowCwd": false
}
```

`commands` 的键是 TabCtrl 使用的逻辑命令名。每个平台文件可以只保留该系统相关候选；host 仍兼容旧的合并配置格式。host 会展开 `%APPDATA%`、`$HOME`、`${HOME}`、`~`，并自己扫描 `PATH`，不会通过 `which`、`where` 或 shell 来解析命令。

`common/bridge.config.schema.json` 提供编辑器提示和基础类型校验。它支持平台键 `win32`、`windows`、`darwin`、`macos`、`linux`、`unix`、`candidates` 和 `default`，也支持旧版 `allowedCommands`。schema 是编辑辅助，实际执行仍以 native host 的 allowlist、风险诊断和路径解析为准。

## 高级用户自定义命令

TabCtrl 不禁止极客用户扩展平台配置。你可以加入自己信任的专用 CLI，例如文档转换、内部工单、知识库、构建产物查询等工具：

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

这类命令仍然不是"任意 shell 字符串"。模型只能调用：

```json
{
  "action": "run",
  "command": "pandoc",
  "args": ["--version"]
}
```

host 会把 `args` 当作字符串数组传给白名单程序。除 Windows `.cmd/.bat` wrapper 的兼容路径外，host 不会自动套 `sh -c`、`bash -lc`、`cmd /c` 或 `powershell -Command`。

### 风险分级建议

- 推荐：只加入目的单一、参数语义明确、不会执行任意脚本的专用 CLI，例如 `feishu`、`lark-cli`、`pandoc`、公司内部只读查询工具。
- 谨慎：`git`、`curl`、`docker`、`kubectl`、`npm`、`pip`、`uv` 等工具能力很大，可能写文件、发网络请求、改集群或运行脚本。确实要用时，不建议加入免审批命令列表。
- 不建议：`cmd`、`powershell`、`bash`、`sh`、`python`、`node`、`ruby`、`perl` 等 shell 或通用解释器。把它们加入白名单后，模型可以通过参数间接执行任意代码；这等同于把 native bridge 扩展成高风险本机自动化入口。

平台配置控制"能不能执行某个本机程序"；Settings -> Lab 里的"免审批命令"只控制"是否跳过审批弹窗"。两者不要混淆。即使你把某个命令加入配置，也建议先保持每次审批，确认调用模式稳定后再考虑免审批。

## Windows `.cmd/.bat` 兼容与加固

Windows 上 npm 安装的 CLI 常常是 `.cmd` wrapper。host 有两条处理路径：

1. **Node 直通（首选）** —— npm 生成的 wrapper 最后一行形如 `"%_prog%" "%dp0%\node_modules\<pkg>\bin\<entry>.js" %*`。host 会解析这一行恢复出真实的 `.js` 入口路径（受路径逃逸保护：必须落在 .cmd 所在目录之下），然后直接 `spawn(node, [script.js, ...args])`，跳过 cmd.exe。这样 JSON、引号、`%`、`!`、换行、中文等所有字符都能原样传递。

2. **cmd.exe 包装（回退）** —— 对于手写的、不符合 npm 模板的 `.cmd`/`.bat`，host 仍用 `cmd.exe /d /s /c` 启动并加引号。此时 host 会拒绝可能破坏命令行边界的字符：引号、百分号、感叹号、换行和 NUL。

回退路径的实践规则：

- 简单参数、中文参数、带 `&` 的 URL 会被整体加引号传入。
- 大段 Markdown、JSON、data URI、复杂 URL 建议通过 `native_bridge.input`、CLI 文件参数或下面介绍的通用 `argFiles` 协议传递。
- 如果某个 CLI 提供真正的 `.exe` 或固定脚本入口，优先把它放在候选列表前面。

飞书 `docx create/update` 已经支持长内容通过 `native_bridge.input` 自动写入临时 `.md` 文件并追加 `-f <file>`，这是推荐路径。

对于飞书 CLI 自身支持 `-f <path>` 的写入命令（`bitable` 系列的 `create-record` / `update-record` / `create-app` / `create-table` / `batch-create-fields` / `batch-create-tables` / `batch-create` / `batch-update`、`docx batch-update-blocks`、`sheet write` / `append` / `write-batch`、`board create-notes`），host 会在 Windows 上自动把内联 JSON 参数（`--fields` / `--records` / `--values` / `--nodes` / `--tables`）替换为 `-f <tmp>/<name>.json`，调用方无需处理 cmd.exe 的引号转义。

### 通用 `argFiles` —— 任意 CLI 都能用文件传参

对于用户拓展命令，或飞书 CLI 中没有 `-f` 替代的 JSON 参数（如 `bitable create-field --property`、`bitable search --filter-json`），host 提供通用的 `argFiles` 字段：消息里声明的占位符出现在 `args` 中时，会被替换为指向临时文件的真实路径，文件内容由调用方提供。调用结束后 host 自动清理临时目录。

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

规则：

- 占位符必须出现在 `args` 中才会被材化；不出现的条目会被忽略。
- 每条消息最多 32 个占位符。
- 值可以是字符串（直接作为 `content`）或 `{ content, fileName? }`；`fileName` 会被清洗为安全的基名，重名会自动追加计数后缀。
- 替换发生在飞书专用回退之前，所以如果占位符已经提供了真实路径，`--fields → -f` 之类的二次重写不会再触发。

这让任何 `.cmd` 包装的 CLI 都能在 Windows 上稳定接收 JSON、多行文本或带引号的内容，不再受 cmd.exe 转义影响。

## 支持的 native_bridge 动作

### `ping`

检查 native host 是否安装并可连接。

```json
{ "action": "ping" }
```

### `which`

检查某个白名单逻辑命令能否解析到真实路径。

```json
{ "action": "which", "command": "feishu" }
```

### `diagnose`

检查当前平台配置是否能正常读取、当前平台候选命令是否存在，以及是否包含 shell、解释器、高能力工具或 `allowCwd` 这类高风险配置。该动作只读配置，不执行本地命令。

```json
{ "action": "diagnose" }
```

### `run`

执行白名单命令。参数必须是字符串数组；可以传入 `input` 作为 stdin 或长文档内容。

```json
{
  "action": "run",
  "command": "feishu",
  "args": ["--help"],
  "timeout_ms": 10000
}
```

`run` 返回 `exitCode`、`stdout`、`stderr`、运行耗时和是否截断。扩展侧会把飞书 CLI 的 `exitCode=2` 视为部分成功、`exitCode=3` 视为成功但有警告，两者都需要继续验证。

## 在 TabCtrl 中使用

1. 安装对应平台的 native host。
2. 确认当前平台配置中的 CLI 候选能在当前用户环境运行。
3. 在 TabCtrl Settings -> Lab 启用 native bridge。
4. 点击"检查桥接"。
5. 点击"检查配置"，确认当前平台候选、解析路径和风险提示。

启用后，模型不会自动绕过审批。只有写入 Settings -> Lab 免审批命令列表的逻辑命令会跳过确认；未配置命令、破坏性调用和高风险配置仍会被审批规则或 native host 拦住。

## 从旧布局迁移

之前的目录把 `host.cjs`、`generate-manifest.cjs`、`tabctrl-bridge.{cmd,sh}`、`install-*.ps1` / `install-*.sh` 直接放在 `native/` 下，配置放在 `native/config/<platform>/`。如果你是在重构前安装的，注册表/用户级 manifest 仍指向旧路径，host 会启动失败。

迁移步骤：

1. 拉取新的 `native/` 目录。
2. 重跑当前平台的 installer（`native/windows/install.bat`、`native/macos/install.command` 或 `bash native/linux/install.sh`）。
3. installer 会重写 `com.tabctrl.bridge.installed.json` 和系统注册项，指向新的平台目录。

bridge 安装本身不保存数据，卸载并重装是安全的。

## 开发者注意

- 只在 `common/` 下修改共享源文件，跑 `node native/common/sync-host.cjs` 把改动同步到三个平台目录；CI 跑 `--check` 模式校验是否漂移。
- 各平台的 `bridge.config.json` **不**走同步（它本来就因系统不同而不同）。
- 测试加载的是 `native/common/host.cjs`。

## 故障排查

- `ping` 失败：重新跑对应浏览器 / 扩展 ID 的安装脚本，然后重新加载扩展。
- `which` 失败：检查平台配置、`PATH` 和目标 CLI 是否安装在当前用户环境下。
- Windows 上 `run` 报 `.cmd` 参数安全错误：把复杂内容放到 `native_bridge.input`，或换非 `.cmd` 入口。
- 命令超时：把 `timeout_ms` 调小用于探测，或把 `maxTimeoutMs` 调高（上限 120000 ms）。
- 大量输出失败：在 CLI 端做过滤/分页/落盘，只返回摘要。
