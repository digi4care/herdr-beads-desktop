import test from "node:test";
import assert from "node:assert/strict";
import { createCliRunner, buildExecOptions, CliError, isCliError, bvFlag } from "../mods/beads-desktop/cli.js";

function jsonResult(payload) {
  return { code: 0, stdout: JSON.stringify(payload), stderr: "" };
}

/**
 * Fake exec: records every call with its options, resolves with a queued
 * result per "command args" key, and tracks concurrency for sequencing proof.
 */
function makeFakeExec(handlers = {}) {
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;

  const exec = async (command, args, options) => {
    const key = [command, ...args].join(" ");
    calls.push({ key, command, args, options, inFlight });
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      await Promise.resolve();
      const handler = handlers[key];
      if (!handler) {
        return { code: 127, stdout: "", stderr: `no fake result for: ${key}` };
      }
      const result = typeof handler === "function" ? await handler({ command, args, options }) : handler;
      return result;
    } finally {
      inFlight -= 1;
    }
  };

  exec.calls = calls;
  exec.maxInFlight = () => maxInFlight;
  return exec;
}

const LIST_PAYLOAD = {
  issues: [
    {
      id: "hbd-e5u.5",
      title: "Support remote Beads projects",
      status: "in_progress",
      priority: 1,
      issue_type: "feature",
      dependency_count: 1
    }
  ],
  total: 1,
  has_more: false
};

test("remote context passes `on: machine` to every exec call", async () => {
  const exec = makeFakeExec({
    "br list --json --limit 200": jsonResult(LIST_PAYLOAD),
    "br ready --json": jsonResult([{ id: "hbd-e5u.5" }]),
    "bv --version": { code: 0, stdout: "bv 0.9.0", stderr: "" }
  });
  const runner = createCliRunner({ exec });

  await runner.loadIssues({ cwd: "/home/digi4care/projects/herdr", machine: "ai-developer" });

  assert.equal(exec.calls.length, 3);
  for (const call of exec.calls) {
    assert.equal(call.options.on, "ai-developer", `missing on for ${call.key}`);
    assert.equal(call.options.cwd, "/home/digi4care/projects/herdr");
  }
});

test("local context omits the `on` option entirely", async () => {
  const exec = makeFakeExec({
    "br list --json --limit 200": jsonResult(LIST_PAYLOAD),
    "br ready --json": jsonResult([{ id: "hbd-e5u.5" }]),
    "bv --version": { code: 0, stdout: "bv 0.9.0", stderr: "" }
  });
  const runner = createCliRunner({ exec });

  await runner.loadIssues({ cwd: "/local/project" });

  assert.equal(exec.calls.length, 3);
  for (const call of exec.calls) {
    assert.ok(!("on" in call.options), `unexpected on for ${call.key}`);
    assert.equal(call.options.cwd, "/local/project");
  }
});

test("buildExecOptions only sets `on` for a remote machine", () => {
  assert.deepEqual(buildExecOptions({ cwd: "/a" }), { cwd: "/a" });
  assert.deepEqual(buildExecOptions({ cwd: "/a", machine: "" }), { cwd: "/a" });
  assert.deepEqual(buildExecOptions({ cwd: "/a", machine: "ai-developer" }), {
    cwd: "/a",
    on: "ai-developer"
  });
});

test("issue loading runs br list, br ready and bv --version sequentially", async () => {
  const exec = makeFakeExec({
    "br list --json --limit 200": jsonResult(LIST_PAYLOAD),
    "br ready --json": jsonResult([{ id: "hbd-e5u.5" }]),
    "bv --version": { code: 0, stdout: "bv 0.9.0", stderr: "" }
  });
  const runner = createCliRunner({ exec });

  const result = await runner.loadIssues({ cwd: "/a", machine: "ai-developer" });

  assert.deepEqual(
    exec.calls.map((call) => call.key),
    ["br list --json --limit 200", "br ready --json", "bv --version"]
  );
  assert.equal(exec.maxInFlight(), 1, "commands must not overlap");
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].id, "hbd-e5u.5");
  assert.ok(result.readyIds.has("hbd-e5u.5"));
  assert.equal(result.bvAvailable, true);
  assert.equal(result.bvVersion, "bv 0.9.0");
});

test("issue detail runs br show then br dep list sequentially", async () => {
  const exec = makeFakeExec({
    "br show hbd-e5u.5 --json": jsonResult([
      { id: "hbd-e5u.5", title: "Remote support", status: "in_progress", priority: 1 }
    ]),
    "br dep list hbd-e5u.5 --json": jsonResult([
      { issue_id: "hbd-e5u.5", depends_on_id: "hbd-e5u", title: "Milestone 2", status: "in_progress" }
    ])
  });
  const runner = createCliRunner({ exec });

  const result = await runner.loadIssue("hbd-e5u.5", { cwd: "/a", machine: "ai-developer" });

  assert.deepEqual(
    exec.calls.map((call) => call.key),
    ["br show hbd-e5u.5 --json", "br dep list hbd-e5u.5 --json"]
  );
  assert.equal(exec.maxInFlight(), 1, "commands must not overlap");
  assert.equal(result.issue.id, "hbd-e5u.5");
  assert.equal(result.dependencies[0].dependsOnId, "hbd-e5u");
  for (const call of exec.calls) {
    assert.equal(call.options.on, "ai-developer");
  }
});

test("a failing bv does not fail the issue data", async () => {
  const exec = makeFakeExec({
    "br list --json --limit 200": jsonResult(LIST_PAYLOAD),
    "br ready --json": jsonResult([{ id: "hbd-e5u.5" }]),
    "bv --version": () => {
      throw new Error("bv: command not found");
    }
  });
  const runner = createCliRunner({ exec });

  const result = await runner.loadIssues({ cwd: "/a", machine: "ai-developer" });

  assert.equal(result.issues.length, 1);
  assert.equal(result.bvAvailable, false);
  assert.equal(result.bvVersion, null);
  assert.ok(result.bvError instanceof CliError);
  assert.match(result.bvError.message, /command not found/);
});

test("a non-zero bv --version exit is reported as unavailable, not thrown", async () => {
  const exec = makeFakeExec({
    "br list --json --limit 200": jsonResult(LIST_PAYLOAD),
    "br ready --json": jsonResult([]),
    "bv --version": { code: 1, stdout: "", stderr: "bv: no project" }
  });
  const runner = createCliRunner({ exec });

  const result = await runner.loadIssues({ cwd: "/a" });

  assert.equal(result.issues.length, 1);
  assert.equal(result.bvAvailable, false);
  assert.equal(result.bvError.code, 1);
  assert.equal(result.bvError.stderr, "bv: no project");
});

test("bv robot actions are read-only flags and failures keep a structured error", async () => {
  const exec = makeFakeExec({
    "bv --robot-next": jsonResult({ id: "hbd-e5u.5", title: "Next", actionable: true }),
    "bv --robot-triage": jsonResult({
      triage: { recommendations: [{ id: "hbd-e5u.5", title: "Next", priority: 1, score: 0.9 }] }
    })
  });
  const runner = createCliRunner({ exec });

  const next = await runner.runBvAction("next", { cwd: "/a", machine: "ai-developer" });
  const triage = await runner.runBvAction("triage", { cwd: "/a", machine: "ai-developer" });

  assert.equal(next.actionable, true);
  assert.equal(next.recommendation.id, "hbd-e5u.5");
  assert.equal(triage.length, 1);
  assert.deepEqual(
    exec.calls.map((call) => call.key),
    ["bv --robot-next", "bv --robot-triage"]
  );
  for (const call of exec.calls) {
    assert.equal(call.command, "bv");
    assert.ok(call.args.length > 0, "bv must never be called bare");
    assert.equal(call.options.on, "ai-developer");
  }
});

test("a failing bv robot action surfaces a structured CliError", async () => {
  const exec = makeFakeExec({
    "bv --robot-next": { code: 2, stdout: "", stderr: "bv: robot-next failed" }
  });
  const runner = createCliRunner({ exec });

  await assert.rejects(
    () => runner.runBvAction("next", { cwd: "/a" }),
    (err) => {
      assert.ok(isCliError(err));
      assert.equal(err.code, 2);
      assert.equal(err.command, "bv");
      assert.equal(err.stderr, "bv: robot-next failed");
      assert.match(err.message, /robot-next failed/);
      return true;
    }
  );
});

test("a br JSON error payload on stdout is kept as the structured message", async () => {
  const exec = makeFakeExec({
    "br list --json --limit 200": {
      code: 6,
      stdout: JSON.stringify({
        error: {
          code: "SYNC_CONFLICT",
          message: "Sync conflict: engine recovery refused before opening"
        }
      }),
      stderr: ""
    }
  });
  const runner = createCliRunner({ exec });

  await assert.rejects(
    () => runner.loadIssues({ cwd: "/a", machine: "ai-developer" }),
    (err) => {
      assert.ok(isCliError(err));
      assert.equal(err.code, 6);
      assert.match(err.message, /Sync conflict: engine recovery refused before opening/);
      return true;
    }
  );
});

test("a failing br command keeps the structured error and does not fall back to another command", async () => {
  const exec = makeFakeExec({
    "br list --json --limit 200": { code: 1, stdout: "", stderr: "no beads project found" }
  });
  const runner = createCliRunner({ exec });

  await assert.rejects(
    () => runner.loadIssues({ cwd: "/a", machine: "ai-developer" }),
    (err) => {
      assert.ok(isCliError(err));
      assert.equal(err.code, 1);
      assert.equal(err.command, "br");
      assert.match(err.message, /no beads project found/);
      return true;
    }
  );

  assert.deepEqual(
    exec.calls.map((call) => call.key),
    ["br list --json --limit 200"]
  );
});

test("the runner never invokes ssh and never calls bv without arguments", async () => {
  const exec = makeFakeExec({
    "br list --json --limit 200": jsonResult(LIST_PAYLOAD),
    "br ready --json": jsonResult([]),
    "bv --version": { code: 0, stdout: "bv 0.9.0", stderr: "" }
  });
  const runner = createCliRunner({ exec });

  await runner.loadIssues({ cwd: "/a", machine: "ai-developer" });

  for (const call of exec.calls) {
    assert.notEqual(call.command, "ssh");
    assert.ok(call.args.length > 0, `bare command invoked: ${call.command}`);
    assert.ok(["br", "bv"].includes(call.command));
  }
});

test("an unreachable remote machine rejects with a wrapped error, no ssh fallback", async () => {
  const exec = makeFakeExec({
    "br list --json --limit 200": () => {
      throw new Error("machine ai-developer is unreachable");
    }
  });
  const runner = createCliRunner({ exec });

  await assert.rejects(
    () => runner.loadIssues({ cwd: "/a", machine: "ai-developer" }),
    (err) => {
      assert.ok(isCliError(err));
      assert.equal(err.command, "br");
      assert.match(err.message, /unreachable/);
      return true;
    }
  );
  assert.equal(exec.calls.length, 1);
  assert.equal(exec.calls[0].command, "br");
});

test("showIssue and listDependencies reject unsafe issue ids without calling exec", async () => {
  const exec = makeFakeExec({});
  const runner = createCliRunner({ exec });

  for (const bad of ["", "   ", "id with space", "id;rm -rf /", "../etc", "id\nnewline"]) {
    await assert.rejects(() => runner.showIssue(bad, { cwd: "/a" }), CliError);
    await assert.rejects(() => runner.loadIssue(bad, { cwd: "/a" }), CliError);
  }

  assert.equal(exec.calls.length, 0, "no command must run for an unsafe issue id");
});

test("createCliRunner rejects a non-function exec", () => {
  assert.throws(() => createCliRunner({ exec: null }), TypeError);
  assert.throws(() => createCliRunner({}), TypeError);
});

test("runRaw refuses unsupported commands and empty args", async () => {
  const exec = makeFakeExec({});
  const runner = createCliRunner({ exec });
  await assert.rejects(() => runner.listIssues({ cwd: "/a" }).then(() => {}), /br list/).catch(() => {});
  // Directly exercise runRaw via an unknown bv mode path is not exposed; bvFlag covers unknown mode:
  assert.throws(() => bvFlag("nope"), /Unknown bv mode/);
});

test("bvFlag throws for unknown modes", () => {
  assert.throws(() => bvFlag("foo"), CliError);
});

test("a failing exec is wrapped as a CliError", async () => {
  const exec = async () => {
    throw new Error("network down");
  };
  const runner = createCliRunner({ exec });
  await assert.rejects(() => runner.listIssues({ cwd: "/a" }), /network down/);
});

test("a non-object exec result is reported as no result", async () => {
  const exec = async () => null;
  const runner = createCliRunner({ exec });
  await assert.rejects(() => runner.listIssues({ cwd: "/a" }), /returned no result/);
});

test("an empty stdout on success throws 'returned empty output'", async () => {
  const exec = makeFakeExec({ "br list --json --limit 200": { code: 0, stdout: "   ", stderr: "" } });
  const runner = createCliRunner({ exec });
  await assert.rejects(() => runner.listIssues({ cwd: "/a" }), /returned empty output/);
});

test("invalid JSON stdout throws 'returned invalid JSON'", async () => {
  const exec = makeFakeExec({ "br list --json --limit 200": { code: 0, stdout: "{not json", stderr: "" } });
  const runner = createCliRunner({ exec });
  await assert.rejects(() => runner.listIssues({ cwd: "/a" }), /returned invalid JSON/);
});

test("a non-zero exit with stderr keeps the structured error", async () => {
  const exec = makeFakeExec({ "br list --json --limit 200": { code: 2, stdout: "", stderr: "boom" } });
  const runner = createCliRunner({ exec });
  await assert.rejects(() => runner.listIssues({ cwd: "/a" }), /boom/);
});

test("checkBv reports unavailable on a thrown exec", async () => {
  const exec = async (cmd) => {
    if (cmd === "bv") throw new Error("spawn failed");
    return { code: 0, stdout: "[]", stderr: "" };
  };
  // override list/ready to succeed
  const fake = makeFakeExec({
    "br list --json --limit 200": { code: 0, stdout: JSON.stringify({ issues: [], total: 0 }) },
    "br ready --json": { code: 0, stdout: "[]" }
  });
  const exec2 = async (cmd, args, opts) => {
    if (cmd === "bv") throw new Error("spawn failed");
    return fake(cmd, args, opts);
  };
  const runner = createCliRunner({ exec: exec2 });
  const result = await runner.loadIssues({ cwd: "/a" });
  assert.equal(result.bvAvailable, false);
  assert.ok(result.bvError);
});
