#!/usr/bin/env node
/* TabCtrl native messaging host. */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = __dirname;
const NATIVE_DIR = path.dirname(ROOT);

function configFolderForPlatform(platform = process.platform) {
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "macos";
  if (platform === "linux") return "linux";
  return platform;
}

// New layout: native/<platform>/bridge.config.json sits next to the sync'd
// host.cjs copy. When this file runs from native/common/ (dev / tests), the
// resolved path points at the sibling platform directory under native/.
function defaultConfigPath(platform = process.platform) {
  const folder = configFolderForPlatform(platform);
  if (path.basename(ROOT) === folder) {
    return path.join(ROOT, "bridge.config.json");
  }
  return path.join(NATIVE_DIR, folder, "bridge.config.json");
}

function configPathCandidates(options = {}) {
  const env = options.env || process.env;
  const explicit = options.configPath || env.TABCTRL_NATIVE_CONFIG;
  if (explicit) return [path.resolve(String(explicit))];
  const platform = options.platform || process.platform;
  const folder = configFolderForPlatform(platform);
  // Order: explicit new layout → sibling platform dir → legacy native/config/.
  // Duplicates are de-duped by loadConfigWithMeta via the first-success loop.
  const candidates = [
    defaultConfigPath(platform),
    path.join(NATIVE_DIR, folder, "bridge.config.json"),
    path.join(NATIVE_DIR, "config", folder, "bridge.config.json"),
    path.join(NATIVE_DIR, "config", "bridge.config.json"),
    path.join(NATIVE_DIR, "bridge.config.json"),
  ];
  return [...new Set(candidates)];
}

function defaultConfig() {
  return {
    commands: {
      feishu: {
        win32: [
          "%APPDATA%\\npm\\feishu.cmd",
          "%APPDATA%\\npm\\feishu",
          "feishu.cmd",
          "feishu",
          "lark-cli.cmd",
          "lark-cli",
        ],
        darwin: [
          "/opt/homebrew/bin/feishu",
          "/usr/local/bin/feishu",
          "$HOME/.local/bin/feishu",
          "feishu",
          "lark-cli",
        ],
        linux: [
          "$HOME/.local/bin/feishu",
          "/usr/local/bin/feishu",
          "/usr/bin/feishu",
          "feishu",
          "lark-cli",
        ],
      },
    },
    maxTimeoutMs: 120000,
    maxOutputBytes: 1024 * 1024,
    allowCwd: false,
  };
}

function mergeConfig(defaults, raw) {
  const config = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const rawCommands = config.commands && typeof config.commands === "object" && !Array.isArray(config.commands)
    ? config.commands
    : {};
  return {
    ...defaults,
    ...config,
    commands: { ...defaults.commands, ...rawCommands },
  };
}

function loadConfigWithMeta(options = {}) {
  if (typeof options === "string") options = { configPath: options };
  const defaults = defaultConfig();
  const candidates = configPathCandidates(options);
  let lastError = "";
  for (const configPath of candidates) {
    try {
      const source = fs.readFileSync(configPath, "utf8");
      const raw = JSON.parse(source);
      return {
        config: mergeConfig(defaults, raw),
        configPath,
        configCandidates: candidates,
        loaded: true,
        usedDefaults: false,
      };
    } catch (error) {
      lastError = `${configPath}: ${String(error.message || error)}`;
    }
  }
  return {
    config: defaults,
    configPath: candidates[0],
    configCandidates: candidates,
    loaded: false,
    usedDefaults: true,
    error: lastError,
  };
}

function loadConfig() {
  return loadConfigWithMeta().config;
}

// Chrome native messaging protocol caps a single message at 64 MB.
const MAX_NATIVE_MESSAGE_BYTES = 64 * 1024 * 1024;

function writeMessage(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

function startNativeHost(stdin = process.stdin, onExit = (code) => process.exit(code)) {
  let inputBuffer = Buffer.alloc(0);
  let aborted = false;
  const abort = (error, code = 1) => {
    if (aborted) return;
    aborted = true;
    try { writeMessage({ ok: false, error: String(error) }); } catch {}
    onExit(code);
  };
  stdin.on("data", (chunk) => {
    if (aborted) return;
    inputBuffer = Buffer.concat([inputBuffer, chunk]);
    while (inputBuffer.length >= 4) {
      const size = inputBuffer.readUInt32LE(0);
      if (size > MAX_NATIVE_MESSAGE_BYTES) {
        abort(`Native message exceeds protocol limit of ${MAX_NATIVE_MESSAGE_BYTES} bytes (header reported ${size}).`);
        return;
      }
      if (inputBuffer.length < 4 + size) return;
      const body = inputBuffer.slice(4, 4 + size);
      inputBuffer = inputBuffer.slice(4 + size);
      handleRawMessage(body).catch((error) => {
        writeMessage({ ok: false, error: String(error.message || error) });
      });
    }
  });
  // Chrome closes stdin when the message port is disconnected. Without this
  // listener the host process would keep running forever, accumulating zombie
  // node.exe processes on every sendNativeMessage call.
  stdin.on("end", () => onExit(0));
  stdin.on("close", () => onExit(0));
}

async function handleRawMessage(body) {
  let message;
  try {
    message = JSON.parse(body.toString("utf8"));
  } catch {
    writeMessage({ ok: false, error: "Invalid JSON message." });
    return;
  }
  const started = Date.now();
  const id = message.id || "";
  try {
    const result = await handleMessage(message);
    writeMessage({ id, ok: true, elapsedMs: Date.now() - started, ...result });
  } catch (error) {
    writeMessage({ id, ok: false, elapsedMs: Date.now() - started, error: String(error.message || error) });
  }
}

async function handleMessage(message) {
  const action = String(message.action || "");
  if (action === "ping") {
    return {
      action,
      bridge: "tabctrl-native",
      platform: process.platform,
      node: process.version,
    };
  }

  const config = loadConfig();
  if (action === "diagnose") {
    return diagnoseConfig();
  }

  const command = String(message.command || "").trim();
  if (!command) throw new Error(`${action} requires command.`);
  const resolved = resolveAllowedCommand(config, command);

  if (action === "which") {
    return {
      action,
      command,
      path: resolved,
    };
  }

  if (action === "run") {
    return await runCommand(config, resolved, message);
  }

  throw new Error(`Unsupported native bridge action: ${action}`);
}

function diagnoseConfig(options = {}) {
  const meta = loadConfigWithMeta(options);
  return validateConfig(meta.config, {
    ...options,
    configPath: meta.configPath,
    configCandidates: meta.configCandidates,
    configLoaded: meta.loaded,
    configError: meta.error || "",
    usedDefaults: meta.usedDefaults,
  });
}

const SHELL_OR_INTERPRETER_NAMES = new Set([
  "cmd", "powershell", "pwsh", "bash", "sh", "zsh", "fish",
  "python", "python3", "node", "nodejs", "perl", "ruby", "php",
  "osascript", "wscript", "cscript",
]);

const HIGH_CAPABILITY_TOOL_NAMES = new Set([
  "git", "curl", "wget", "ssh", "scp", "rsync",
  "docker", "podman", "kubectl", "helm",
  "npm", "npx", "pnpm", "yarn", "pip", "pip3",
  "brew", "choco", "scoop", "winget",
]);

function issue(level, code, message, extra = {}) {
  return { level, code, message, ...extra };
}

function normalizedCommandName(value) {
  const first = String(value || "").trim().split(/\s+/)[0] || "";
  return path.basename(first).replace(/\.(?:cmd|bat|exe|com|ps1|sh)$/i, "").toLowerCase();
}

function candidateRisk(command, candidate) {
  const name = normalizedCommandName(candidate);
  if (!name) return null;
  if (SHELL_OR_INTERPRETER_NAMES.has(name)) {
    return issue(
      "error",
      "dangerous_candidate",
      `Candidate "${candidate}" for "${command}" is a shell or interpreter. It can turn Lab into arbitrary code execution; use a purpose-built CLI wrapper instead.`,
      { command, candidate },
    );
  }
  if (HIGH_CAPABILITY_TOOL_NAMES.has(name)) {
    return issue(
      "warn",
      "high_capability_candidate",
      `Candidate "${candidate}" for "${command}" is high-capability. Keep it manual-approval only and prefer a narrower wrapper when possible.`,
      { command, candidate },
    );
  }
  if (/[|;&<>`]/.test(String(candidate))) {
    return issue(
      "warn",
      "shell_syntax_candidate",
      `Candidate "${candidate}" contains shell syntax. The host does not run candidate strings through a shell; use a plain executable name or path.`,
      { command, candidate },
    );
  }
  return null;
}

function validateConfig(config = {}, options = {}) {
  const platform = options.platform || process.platform;
  const errors = [];
  const warnings = [];
  const commands = [];
  const configPath = options.configPath || defaultConfigPath(platform);

  if (options.configLoaded === false) {
    warnings.push(issue(
      "warn",
      "config_not_loaded",
      `Could not read native config; using built-in defaults. ${options.configError || ""}`.trim(),
    ));
  }

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    errors.push(issue("error", "config_shape", "Native config must be a JSON object."));
  }

  if (!config.commands || typeof config.commands !== "object" || Array.isArray(config.commands)) {
    errors.push(issue("error", "commands_shape", "Native config must contain a commands object."));
  }

  const timeout = Number(config.maxTimeoutMs);
  if (!Number.isFinite(timeout) || timeout < 1000) {
    errors.push(issue("error", "timeout_invalid", "maxTimeoutMs must be at least 1000."));
  } else if (timeout > 120000) {
    warnings.push(issue("warn", "timeout_high", "maxTimeoutMs is higher than the extension-side cap of 120000 ms."));
  }

  const maxOutputBytes = Number(config.maxOutputBytes);
  if (!Number.isFinite(maxOutputBytes) || maxOutputBytes < 4096) {
    errors.push(issue("error", "output_limit_invalid", "maxOutputBytes must be at least 4096."));
  } else if (maxOutputBytes > 10 * 1024 * 1024) {
    warnings.push(issue("warn", "output_limit_high", "maxOutputBytes is very high; large local output may flood the model context."));
  }

  if (config.allowCwd === true) {
    warnings.push(issue("warn", "allow_cwd_enabled", "allowCwd is enabled. Local commands may run from model-provided directories."));
  } else if (config.allowCwd !== false && config.allowCwd != null) {
    errors.push(issue("error", "allow_cwd_invalid", "allowCwd must be true or false."));
  }

  const commandMap = config.commands && typeof config.commands === "object" && !Array.isArray(config.commands)
    ? config.commands
    : {};
  for (const command of Object.keys(commandMap).sort()) {
    if (!/^[A-Za-z0-9._-]+$/.test(command)) {
      errors.push(issue("error", "command_name_invalid", `Command key "${command}" must use only letters, numbers, dots, underscores, or hyphens.`, { command }));
    }
    const candidates = commandCandidates(config, command, platform);
    if (!candidates.length) {
      warnings.push(issue("warn", "no_platform_candidates", `Command "${command}" has no candidates for ${platform}.`, { command }));
    }
    for (const candidate of candidates) {
      const risk = candidateRisk(command, candidate);
      if (risk?.level === "error") errors.push(risk);
      else if (risk) warnings.push(risk);
    }
    let resolved = "";
    let resolveError = "";
    try {
      resolved = resolveAllowedCommand(config, command, options);
    } catch (error) {
      resolveError = String(error.message || error);
      warnings.push(issue("warn", "command_not_found", resolveError, { command }));
    }
    commands.push({
      command,
      candidates,
      resolved,
      ok: !!resolved,
      error: resolveError || undefined,
    });
  }

  return {
    action: "diagnose",
    ok: errors.length === 0,
    platform,
    configPath,
    configCandidates: options.configCandidates || configPathCandidates({ platform }),
    configLoaded: options.configLoaded !== false,
    allowCwd: !!config.allowCwd,
    maxTimeoutMs: Number(config.maxTimeoutMs || 0),
    maxOutputBytes: Number(config.maxOutputBytes || 0),
    commands,
    errors,
    warnings,
    summary: `${errors.length} error(s), ${warnings.length} warning(s), ${commands.length} command(s)`,
  };
}

function pushCandidates(out, value) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) pushCandidates(out, item);
    return;
  }
  if (typeof value === "string" && value.trim()) out.push(value);
}

function uniq(values) {
  return [...new Set(values)];
}

function commandCandidates(config, command, platform = process.platform) {
  const entry = config.commands?.[command];
  if (Array.isArray(entry)) return entry;
  if (entry && typeof entry === "object") {
    const out = [];
    pushCandidates(out, entry[platform]);
    if (platform === "darwin") pushCandidates(out, entry.macos);
    if (platform === "win32") pushCandidates(out, entry.windows);
    if (platform === "linux" || platform === "darwin") pushCandidates(out, entry.unix);
    pushCandidates(out, entry.candidates);
    pushCandidates(out, entry.default);
    return uniq(out);
  }
  if (Array.isArray(config.allowedCommands) && config.allowedCommands.includes(command)) return [command];
  return [];
}

function resolveAllowedCommand(config, command, options = {}) {
  const candidates = commandCandidates(config, command, options.platform || process.platform);
  if (!candidates.length) {
    throw new Error(`Command "${command}" is not in the native bridge config allowlist.`);
  }
  for (const candidate of candidates) {
    const resolved = resolveOnPath(candidate, options);
    if (resolved) return resolved;
  }
  throw new Error(`Allowlisted command "${command}" was not found on PATH.`);
}

function envValue(env, name) {
  return env[name] || env[name.toUpperCase()] || env[name.toLowerCase()] || "";
}

function expandEnvVars(value, env = process.env, homeDir = os.homedir()) {
  let text = String(value || "");
  if (text === "~") text = homeDir;
  else if (text.startsWith("~/") || text.startsWith("~\\")) text = path.join(homeDir, text.slice(2));
  return text
    .replace(/%([^%]+)%/g, (_, name) => envValue(env, name))
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => envValue(env, name))
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => envValue(env, name));
}

function hasPathSeparator(command) {
  return /[\\/]/.test(command);
}

function candidateExtensions(command, platform, env) {
  if (platform !== "win32" || path.extname(command)) return [""];
  const pathext = String(env.PATHEXT || ".COM;.EXE;.BAT;.CMD");
  return pathext.split(";").map((ext) => ext.trim()).filter(Boolean);
}

function executableFile(pathname) {
  try {
    const stat = fs.statSync(pathname);
    return stat.isFile();
  } catch {
    return false;
  }
}

function resolveExistingCandidate(candidate, platform, env) {
  for (const ext of candidateExtensions(candidate, platform, env)) {
    const pathname = candidate + ext;
    if (executableFile(pathname)) return pathname;
  }
  return "";
}

function resolveOnPath(command, options = {}) {
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const root = options.root || ROOT;
  const expanded = expandEnvVars(command, env, options.homeDir || os.homedir());
  if (!expanded) return "";

  if (path.isAbsolute(expanded)) return resolveExistingCandidate(expanded, platform, env);

  if (hasPathSeparator(expanded)) {
    return (
      resolveExistingCandidate(path.resolve(root, expanded), platform, env) ||
      resolveExistingCandidate(path.resolve(process.cwd(), expanded), platform, env)
    );
  }

  const pathValue = env.PATH || env.Path || env.path || "";
  for (const dir of String(pathValue).split(path.delimiter).filter(Boolean)) {
    const resolved = resolveExistingCandidate(path.join(dir, expanded), platform, env);
    if (resolved) return resolved;
  }
  return "";
}

function normalizeArgs(args) {
  if (!Array.isArray(args)) return [];
  return args.map((arg) => String(arg));
}

function clampTimeout(config, timeoutMs) {
  const max = Math.max(1000, Number(config.maxTimeoutMs || 120000));
  const requested = Math.max(1000, Number(timeoutMs || max));
  return Math.min(requested, max);
}

function capOutput(text, maxBytes) {
  const value = String(text || "");
  const limit = Math.max(4096, Number(maxBytes || 1024 * 1024));
  const buf = Buffer.from(value, "utf8");
  if (buf.length <= limit) return { text: value, truncated: false };
  return {
    text: buf.slice(0, limit).toString("utf8") + `\n[truncated ${buf.length - limit} bytes]`,
    truncated: true,
  };
}

// Safety relies on the caller wrapping the result with quoteWinArg. If quotes
// are ever stripped, cmd.exe will re-parse the inner text and `& | < > ^` would
// regain their special meaning.
function assertSafeWindowsCmdArg(value) {
  const text = String(value);
  if (/[\0\r\n"%!]/.test(text)) {
    throw new Error("Windows .cmd/.bat native calls reject quotes, percent expansion, delayed expansion, and control characters in args. Use native_bridge input/stdin or a non-.cmd executable for complex content.");
  }
}

function quoteWinArg(value) {
  assertSafeWindowsCmdArg(value);
  const text = String(value);
  return `"${text}"`;
}

// npm installs a CLI as `foo.cmd` whose final line is roughly
//   "%_prog%"  "%dp0%\node_modules\<pkg>\bin\<entry>.js" %*
// If we can recover that .js path, we can spawn Node directly and skip the
// cmd.exe quoting rules that otherwise break JSON / quote / % / ! args.
function resolveCmdToNodeScript(cmdPath) {
  try {
    if (!cmdPath || typeof cmdPath !== "string") return null;
    const ext = path.extname(cmdPath).toLowerCase();
    if (ext !== ".cmd" && ext !== ".bat") return null;
    const content = fs.readFileSync(cmdPath, "utf8");
    // Look for a quoted .js path that uses %~dp0/%dp0% (npm wrapper) or an
    // absolute drive path. Non-greedy so we stop at the closing quote.
    const match = content.match(/"((?:%~?dp0%?\\?|[A-Za-z]:[\\/])[^"]+?\.js)"/i);
    if (!match) return null;
    const cmdDir = path.dirname(cmdPath);
    let scriptPath = match[1].replace(/%~?dp0%?\\?/gi, cmdDir + path.sep);
    const resolved = path.normalize(scriptPath);
    // Path-traversal guard: the script must live under the .cmd's directory
    // (npm-generated wrappers always point into <cmdDir>/node_modules/...).
    const cmdRoot = path.normalize(cmdDir + path.sep).toLowerCase();
    if (!resolved.toLowerCase().startsWith(cmdRoot)) return null;
    if (!executableFile(resolved)) return null;
    return resolved;
  } catch {
    return null;
  }
}

// Computes how spawnPortable would invoke the process, without spawning.
// Exposed for testing and so callers can reason about whether their args
// will pass through cmd.exe (and thus must be safe for it).
function planSpawnPortable(commandPath, args, options) {
  const ext = path.extname(commandPath).toLowerCase();
  if (process.platform === "win32" && (ext === ".cmd" || ext === ".bat")) {
    const nodeScript = resolveCmdToNodeScript(commandPath);
    if (nodeScript) {
      // Direct Node invocation — args go through standard CommandLineToArgvW
      // escaping. Quotes/JSON/percent/bang in args are passed verbatim.
      return {
        mode: "node-direct",
        file: process.execPath,
        args: [nodeScript, ...args],
        options,
      };
    }
    // Fallback: cmd.exe wrapper with safe-quote enforcement.
    const parts = [commandPath, ...args].map(quoteWinArg).join(" ");
    const line = `"${parts}"`;
    return {
      mode: "cmd-wrap",
      file: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", line],
      options: { ...options, windowsVerbatimArguments: true },
    };
  }
  return { mode: "direct", file: commandPath, args, options };
}

function spawnPortable(commandPath, args, options) {
  const plan = planSpawnPortable(commandPath, args, options);
  return spawn(plan.file, plan.args, plan.options);
}

function hasContentArg(args) {
  return args.some((arg) => arg === "-c" || arg === "--content" || arg === "-f" || arg === "--file");
}

function shouldMaterializeFeishuDocxInput(message, args) {
  if (!message.input) return false;
  const command = String(message.command || "").toLowerCase();
  if (command !== "feishu" && command !== "lark-cli") return false;
  if (String(args[0] || "").toLowerCase() !== "docx") return false;
  const subcommand = String(args[1] || "").toLowerCase();
  if (subcommand !== "create" && subcommand !== "update") return false;
  return !hasContentArg(args);
}

// feishu CLI subcommands whose JSON arg has a documented `-f <path>` equivalent.
// Keyed by "<module>/<subcommand>". CLI support verified in
// skills/feishu-cli-native/reference/{feishu-cli-full,bitable-reference,docx-advanced,sheet}.md.
const FEISHU_JSON_ARG_FILE_FALLBACK = new Map([
  // bitable: records / fields / tables
  ["bitable/create-record", { argName: "--fields", file: "fields.json" }],
  ["bitable/update-record", { argName: "--fields", file: "fields.json" }],
  ["bitable/create-app", { argName: "--fields", file: "fields.json" }],
  ["bitable/create-table", { argName: "--fields", file: "fields.json" }],
  ["bitable/batch-create-fields", { argName: "--fields", file: "fields.json" }],
  ["bitable/batch-create-tables", { argName: "--tables", file: "tables.json" }],
  ["bitable/batch-create", { argName: "--records", file: "records.json" }],
  ["bitable/batch-update", { argName: "--records", file: "records.json" }],
  // docx: block batch updates
  ["docx/batch-update-blocks", { argName: "--records", file: "updates.json" }],
  // sheet: cell values
  ["sheet/write", { argName: "--values", file: "data.json" }],
  ["sheet/append", { argName: "--values", file: "rows.json" }],
  ["sheet/write-batch", { argName: "--values", file: "batch.json" }],
  // board: whiteboard nodes
  ["board/create-notes", { argName: "--nodes", file: "nodes.json" }],
]);

// JSON args that have NO `-f <file>` equivalent in the feishu CLI. These used
// to be unusable from Windows because cmd.exe mangled the quoting; the
// .cmd→node-direct bypass in spawnPortable now handles them, so this map is
// only consulted when that bypass is unavailable (non-npm .cmd wrappers).
const FEISHU_JSON_ARG_NO_FALLBACK = new Map([
  ["bitable/create-field", "--property"],
  ["bitable/update-field", "--property"],
  ["bitable/search", "--filter-json"],
  ["docx/create-table", "--values"],
  ["docx/write-table-cells", "--values"],
]);

function feishuModulePath(message, args) {
  if (!Array.isArray(args) || args.length < 2) return "";
  const command = String(message.command || "").toLowerCase();
  if (command !== "feishu" && command !== "lark-cli") return "";
  const moduleName = String(args[0] || "").toLowerCase();
  const subcommand = String(args[1] || "").toLowerCase();
  if (!moduleName || !subcommand) return "";
  return `${moduleName}/${subcommand}`;
}

function findFeishuJsonArgFallback(message, args) {
  const key = feishuModulePath(message, args);
  if (!key) return null;
  const spec = FEISHU_JSON_ARG_FILE_FALLBACK.get(key);
  if (!spec) return null;
  if (args.includes("-f") || args.includes("--file")) return null;
  const argIdx = args.indexOf(spec.argName);
  if (argIdx < 0 || argIdx + 1 >= args.length) return null;
  const value = String(args[argIdx + 1] || "");
  if (!/["%!\r\n\0]/.test(value)) return null;
  return { argIdx, value, file: spec.file };
}

// On Windows, surface a clearer hint when the user hits a JSON arg that the
// CLI itself does not support reading from a file. The host cannot rescue
// these via -f materialization.
function feishuUnsupportedJsonArgHint(message, args) {
  if (process.platform !== "win32") return "";
  const key = feishuModulePath(message, args);
  if (!key) return "";
  const argName = FEISHU_JSON_ARG_NO_FALLBACK.get(key);
  if (!argName) return "";
  const argIdx = args.indexOf(argName);
  if (argIdx < 0 || argIdx + 1 >= args.length) return "";
  const value = String(args[argIdx + 1] || "");
  if (!/["%!\r\n\0]/.test(value)) return "";
  return `${key} ${argName} contains characters Windows cmd.exe cannot pass safely, and the CLI has no -f fallback for this argument. Workarounds: (1) run feishu CLI directly outside native_bridge, or (2) point native_bridge config at a non-.cmd entry point (e.g. node.exe + feishu's bin script).`;
}

function materializeToTempFile(content, fileName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tabctrl-feishu-"));
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, content, "utf8");
  const cleanup = () => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  };
  return { filePath, cleanup };
}

// Generic protocol for arbitrary CLIs (incl. user-extended commands).
// Caller passes message.argFiles = { "<placeholder>": "<content>" | {content, fileName?} },
// and any args matching <placeholder> are replaced by paths to temp files
// holding the content. Lets any .cmd-wrapped CLI receive JSON / multiline /
// quote-bearing payloads via -f-style arguments instead of fighting cmd.exe.
const MAX_ARG_FILES = 32;

function normalizeArgFileSpec(raw) {
  if (typeof raw === "string") return { content: raw, fileName: "" };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return {
      content: String(raw.content ?? ""),
      fileName: String(raw.fileName || ""),
    };
  }
  return null;
}

function safeArgFileName(name, fallback) {
  // path.basename strips directories; the regex strips anything that could let
  // a hostile fileName escape the temp dir or surprise downstream CLIs.
  const base = path.basename(String(name || "")).replace(/[^A-Za-z0-9._-]/g, "_");
  return base || fallback;
}

function materializeArgFiles(message, args) {
  const argFiles = message.argFiles;
  if (!argFiles || typeof argFiles !== "object" || Array.isArray(argFiles)) return null;

  const entries = Object.entries(argFiles);
  if (!entries.length) return null;
  if (entries.length > MAX_ARG_FILES) {
    throw new Error(`argFiles exceeds the per-message limit of ${MAX_ARG_FILES} entries.`);
  }

  const active = [];
  for (const [placeholder, raw] of entries) {
    const spec = normalizeArgFileSpec(raw);
    if (!spec) continue;
    if (!args.includes(placeholder)) continue;
    active.push({ placeholder, spec });
  }
  if (!active.length) return null;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tabctrl-argfiles-"));
  const cleanup = () => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  };

  const usedNames = new Set();
  const mapping = new Map();
  try {
    let counter = 0;
    for (const { placeholder, spec } of active) {
      counter += 1;
      let fileName = safeArgFileName(spec.fileName, `arg${counter}.dat`);
      if (usedNames.has(fileName)) {
        const ext = path.extname(fileName);
        const stem = path.basename(fileName, ext);
        fileName = `${stem}.${counter}${ext || ".dat"}`;
      }
      usedNames.add(fileName);
      const filePath = path.join(dir, fileName);
      fs.writeFileSync(filePath, spec.content, "utf8");
      mapping.set(placeholder, filePath);
    }
  } catch (error) {
    cleanup();
    throw error;
  }

  const newArgs = args.map((arg) => (mapping.has(arg) ? mapping.get(arg) : arg));
  return { args: newArgs, cleanup };
}

function combineCleanups(fns) {
  const list = fns.filter(Boolean);
  return () => {
    for (const fn of list.splice(0)) {
      try { fn(); } catch {}
    }
  };
}

function prepareCommandInput(message, args) {
  const input = message.input ? String(message.input) : "";
  const cleanups = [];
  let currentArgs = args;
  let materialized = false;

  try {
    // 1. Generic placeholder-based argFiles (works for any command).
    const generic = materializeArgFiles(message, currentArgs);
    if (generic) {
      currentArgs = generic.args;
      cleanups.push(generic.cleanup);
      materialized = true;
    }

    // 2. Feishu docx Markdown body via message.input → -f <tmp>/content.md.
    if (input && shouldMaterializeFeishuDocxInput(message, currentArgs)) {
      const { filePath, cleanup } = materializeToTempFile(input, "content.md");
      return {
        args: [...currentArgs, "-f", filePath],
        stdin: "",
        cleanup: combineCleanups([...cleanups, cleanup]),
        materializedInputFile: true,
      };
    }

    // 3. Feishu-specific JSON arg fallback for known --fields/--records/etc.
    const jsonFallback = findFeishuJsonArgFallback(message, currentArgs);
    if (jsonFallback) {
      const { filePath, cleanup } = materializeToTempFile(jsonFallback.value, jsonFallback.file);
      const newArgs = currentArgs.slice();
      newArgs.splice(jsonFallback.argIdx, 2, "-f", filePath);
      return {
        args: newArgs,
        stdin: input,
        cleanup: combineCleanups([...cleanups, cleanup]),
        materializedInputFile: true,
      };
    }
  } catch (error) {
    combineCleanups(cleanups)();
    throw error;
  }

  return {
    args: currentArgs,
    stdin: input,
    cleanup: cleanups.length ? combineCleanups(cleanups) : () => {},
    materializedInputFile: materialized,
  };
}

function runCommand(config, commandPath, message) {
  return new Promise((resolve, reject) => {
    const timeoutMs = clampTimeout(config, message.timeoutMs);
    let prepared;
    try {
      prepared = prepareCommandInput(message, normalizeArgs(message.args));
    } catch (error) {
      reject(error);
      return;
    }
    const args = prepared.args;
    const cwd = config.allowCwd && message.cwd ? String(message.cwd) : ROOT;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      prepared.cleanup();
    };
    let child;
    try {
      child = spawnPortable(commandPath, args, {
        cwd,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
      });
    } catch (error) {
      cleanup();
      const hint = feishuUnsupportedJsonArgHint(message, args);
      if (hint && /reject/i.test(String(error?.message || error))) {
        const wrapped = new Error(`${error.message}\n${hint}`);
        wrapped.cause = error;
        reject(wrapped);
      } else {
        reject(error);
      }
      return;
    }
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch {}
    }, timeoutMs);

    // Cap in-memory buffering so a runaway child can't OOM the host. Keep ~2x
    // the eventual cap so capOutput still sees enough bytes to mark truncated.
    const maxBytes = Math.max(4096, Number(config.maxOutputBytes || 1024 * 1024));
    const streamCap = maxBytes * 2;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    child.stdout.on("data", (chunk) => {
      if (stdoutBytes >= streamCap) return;
      stdoutBytes += chunk.length;
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      if (stderrBytes >= streamCap) return;
      stderrBytes += chunk.length;
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      cleanup();
      reject(error);
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      cleanup();
      const out = capOutput(stdout, config.maxOutputBytes);
      const err = capOutput(stderr, config.maxOutputBytes);
      resolve({
        action: "run",
        command: path.basename(commandPath),
        exitCode,
        signal,
        timedOut,
        stdout: out.text,
        stderr: err.text,
        truncated: out.truncated || err.truncated,
        materializedInputFile: prepared.materializedInputFile,
      });
    });

    // child.stdin.end can throw EPIPE if the spawn delayed-errored (e.g.
    // ENOENT) and stdio is already gone. The 'error' handler above will reject
    // with the real cause; swallow EPIPE here so it doesn't become unhandled.
    try {
      if (prepared.stdin) child.stdin.end(prepared.stdin);
      else child.stdin.end();
    } catch {}
  });
}

if (require.main === module) {
  startNativeHost();
}

module.exports = {
  defaultConfig,
  configFolderForPlatform,
  defaultConfigPath,
  configPathCandidates,
  loadConfig,
  loadConfigWithMeta,
  startNativeHost,
  handleMessage,
  diagnoseConfig,
  validateConfig,
  commandCandidates,
  expandEnvVars,
  resolveOnPath,
  resolveAllowedCommand,
  normalizeArgs,
  clampTimeout,
  capOutput,
  assertSafeWindowsCmdArg,
  quoteWinArg,
  spawnPortable,
  resolveCmdToNodeScript,
  planSpawnPortable,
  shouldMaterializeFeishuDocxInput,
  prepareCommandInput,
  feishuUnsupportedJsonArgHint,
};
