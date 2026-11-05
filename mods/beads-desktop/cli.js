import {
  parseBrDependencies,
  parseBrList,
  parseBrReady,
  parseBrShow,
  parseBvNext,
  parseBvTriage
} from "./data.js";

/**
 * Read-only CLI runner for a Beads project.
 *
 * Every command runs through an injected `exec` function, so the same runner
 * works for a local project (no `on` option) and for a remote project on a
 * Herdr machine (`on: <machine>`). The runner never shells out to `ssh` itself
 * and never runs a bare `bv` (bv is always called with an explicit flag).
 */

const ALLOWED_COMMANDS = new Set(["br", "bv"]);

export class CliError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "CliError";
    this.command = details.command ?? null;
    this.args = Array.isArray(details.args) ? [...details.args] : [];
    this.code = Number.isInteger(details.code) ? details.code : null;
    this.stdout = typeof details.stdout === "string" ? details.stdout : "";
    this.stderr = typeof details.stderr === "string" ? details.stderr : "";
    if (details.cause !== undefined) this.cause = details.cause;
  }
}

export function isCliError(value) {
  return value instanceof CliError;
}

/**
 * Build the options object for `exec`. `on` is only present for a remote
 * context; locally the key is omitted entirely.
 */
export function buildExecOptions(context = {}) {
  const options = {};
  const cwd = typeof context.cwd === "string" ? context.cwd.trim() : "";
  const machine = typeof context.machine === "string" ? context.machine.trim() : "";
  if (cwd) options.cwd = cwd;
  if (machine) options.on = machine;
  return options;
}

/**
 * br reports some failures as a JSON error object on stdout (e.g. a sync
 * conflict) while exiting non-zero. Prefer that structured message.
 */
function structuredMessage(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    const message = parsed?.error?.message ?? parsed?.error ?? parsed?.message;
    return typeof message === "string" && message.trim() ? message.trim() : null;
  } catch {
    return null;
  }
}

function detailMessage(result, label) {
  const stderr = `${result?.stderr || ""}`.trim();
  if (stderr) return stderr;
  const fromStdout = structuredMessage(result?.stdout);
  if (fromStdout) return fromStdout;
  const stdout = `${result?.stdout || ""}`.trim();
  if (stdout) return stdout;
  if (Number.isInteger(result?.code)) return `${label} exited with code ${result.code}.`;
  return `${label} failed.`;
}

function errorMessage(err) {
  if (!err) return "Command failed.";
  if (typeof err === "string") return err;
  if (typeof err?.message === "string" && err.message.trim()) return err.message.trim();
  return String(err);
}

function parseJsonStdout(result, label) {
  if (result?.code !== 0) {
    throw new CliError(detailMessage(result, label), {
      code: Number.isInteger(result?.code) ? result.code : null,
      stdout: typeof result?.stdout === "string" ? result.stdout : "",
      stderr: typeof result?.stderr === "string" ? result.stderr : ""
    });
  }
  const output = `${result?.stdout || ""}`.trim();
  if (!output) {
    throw new CliError(`${label} returned empty output.`, {
      code: 0,
      stdout: "",
      stderr: typeof result?.stderr === "string" ? result.stderr : ""
    });
  }
  try {
    return JSON.parse(output);
  } catch (err) {
    throw new CliError(`${label} returned invalid JSON: ${errorMessage(err)}`, {
      code: 0,
      stdout: output,
      stderr: typeof result?.stderr === "string" ? result.stderr : "",
      cause: err
    });
  }
}

export const BV_MODES = Object.freeze({
  next: "--robot-next",
  triage: "--robot-triage"
});

export function bvFlag(mode) {
  if (mode === "next" || mode === "triage") return BV_MODES[mode];
  throw new CliError(`Unknown bv mode: ${mode}`, { args: [] });
}

/**
 * @param {object} deps
 * @param {(command: string, args: string[], options: {cwd?: string, on?: string}) => Promise<{code: number, stdout: string, stderr: string}>} deps.exec
 */
export function createCliRunner({ exec } = {}) {
  if (typeof exec !== "function") {
    throw new TypeError("createCliRunner requires an exec function.");
  }

  async function runRaw(command, args, options) {
    if (!ALLOWED_COMMANDS.has(command)) {
      throw new CliError(`Refusing to run unsupported command: ${command}`, { command, args });
    }
    if (!Array.isArray(args) || args.length === 0) {
      throw new CliError(`Refusing to run ${command} without arguments.`, { command, args: [] });
    }

    let result;
    try {
      result = await exec(command, [...args], options);
    } catch (err) {
      throw new CliError(errorMessage(err), { command, args, cause: err });
    }

    if (!result || typeof result !== "object") {
      throw new CliError(`${command} returned no result.`, { command, args });
    }
    return result;
  }

  async function runJson(command, args, options, label) {
    const result = await runRaw(command, args, options);
    try {
      return parseJsonStdout(result, label);
    } catch (err) {
      if (err instanceof CliError) {
        err.command = command;
        err.args = [...args];
        throw err;
      }
      throw err;
    }
  }

  /** br list --json */
  async function listIssues(context = {}) {
    const payload = await runJson(
      "br",
      ["list", "--json", "--limit", "200"],
      buildExecOptions(context),
      "br list"
    );
    return parseBrList(payload);
  }

  /** br ready --json */
  async function listReady(context = {}) {
    const payload = await runJson(
      "br",
      ["ready", "--json"],
      buildExecOptions(context),
      "br ready"
    );
    return parseBrReady(payload);
  }

  function isValidIssueId(issueId) {
    return typeof issueId === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(issueId);
  }

  /** br show <id> --json */
  async function showIssue(issueId, context = {}) {
    if (!isValidIssueId(issueId)) {
      throw new CliError("showIssue requires a safe issue id.", { command: "br" });
    }
    const payload = await runJson(
      "br",
      ["show", issueId, "--json"],
      buildExecOptions(context),
      `br show ${issueId}`
    );
    return parseBrShow(payload);
  }

  /** br dep list <id> --json */
  async function listDependencies(issueId, context = {}) {
    if (!isValidIssueId(issueId)) {
      throw new CliError("listDependencies requires a safe issue id.", { command: "br" });
    }
    const payload = await runJson(
      "br",
      ["dep", "list", issueId, "--json"],
      buildExecOptions(context),
      `br dep list ${issueId}`
    );
    return parseBrDependencies(payload);
  }

  /**
   * bv --version. Never throws: bv is optional and a failure must not break
   * issue data. Returns { available, version, error }.
   */
  async function checkBv(context = {}) {
    try {
      const result = await runRaw("bv", ["--version"], buildExecOptions(context));
      if (result.code !== 0) {
        return {
          available: false,
          version: null,
          error: new CliError(detailMessage(result, "bv --version"), {
            command: "bv",
            args: ["--version"],
            code: result.code,
            stdout: result.stdout ?? "",
            stderr: result.stderr ?? ""
          })
        };
      }
      const version = `${result.stdout || ""}`.trim();
      return { available: true, version: version || null, error: null };
    } catch (err) {
      return {
        available: false,
        version: null,
        error: err instanceof CliError ? err : new CliError(errorMessage(err), { command: "bv" })
      };
    }
  }

  /** bv --robot-next / bv --robot-triage */
  async function runBvAction(mode, context = {}) {
    const flag = bvFlag(mode);
    const payload = await runJson(
      "bv",
      [flag],
      buildExecOptions(context),
      `bv ${flag}`
    );
    if (mode === "next") return parseBvNext(payload);
    return parseBvTriage(payload);
  }

  return {
    buildExecOptions,
    listIssues,
    listReady,
    showIssue,
    listDependencies,
    checkBv,
    runBvAction,

    /**
     * Sequentially: br list -> br ready -> bv --version.
     * A bv failure does not fail the issue data.
     */
    async loadIssues(context = {}) {
      const list = await listIssues(context);
      const readyIds = await listReady(context);
      const bv = await checkBv(context);
      return {
        issues: list.issues,
        total: list.total,
        hasMore: list.hasMore,
        readyIds,
        bvAvailable: bv.available,
        bvVersion: bv.version,
        bvError: bv.error
      };
    },

    /** Sequentially: br show -> br dep list. */
    async loadIssue(issueId, context = {}) {
      const issue = await showIssue(issueId, context);
      const dependencies = await listDependencies(issueId, context);
      return { issue, dependencies };
    }
  };
}
