import test from "node:test";
import assert from "node:assert/strict";
import {
  SETTINGS_SHARED_KEY,
  DEFAULT_SETTINGS,
  FONT_SCALES,
  normalizeSettings,
  mergeSettings,
  parseSettings,
  serializeSettings,
  scaleFont,
  settingsEqual
} from "../mods/beads-desktop/settings.js";

test("settings module exposes shared key, frozen defaults and font scales", () => {
  assert.equal(SETTINGS_SHARED_KEY, "beads-desktop:settings");
  assert.deepEqual(DEFAULT_SETTINGS, {
    fontScale: 1,
    buttonVariant: "ghost",
    buttonContent: "text",
    detailsRender: "rendered",
    mermaidRender: false,
    viewMode: "list"
  });
  assert.ok(Object.isFrozen(DEFAULT_SETTINGS));
  assert.deepEqual(FONT_SCALES, [0.9, 1, 1.15]);
});

test("normalizeSettings returns a complete settings object for defaults", () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings("nonsense"), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings(42), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings([]), DEFAULT_SETTINGS);
});

test("normalizeSettings keeps valid values", () => {
  assert.deepEqual(
    normalizeSettings({
      fontScale: 1.15,
      buttonVariant: "solid",
      buttonContent: "icon",
      detailsRender: "raw",
      mermaidRender: false
    }),
    {
      fontScale: 1.15,
      buttonVariant: "solid",
      buttonContent: "icon",
      detailsRender: "raw",
      mermaidRender: false,
      viewMode: "list"
    }
  );
});

test("normalizeSettings accepts numeric strings for fontScale only when exact members", () => {
  assert.equal(normalizeSettings({ fontScale: "1.15" }).fontScale, 1.15);
  assert.equal(normalizeSettings({ fontScale: "0.9" }).fontScale, 0.9);
  assert.equal(normalizeSettings({ fontScale: "1" }).fontScale, 1);
  assert.equal(normalizeSettings({ fontScale: "1.05" }).fontScale, 1);
  assert.equal(normalizeSettings({ fontScale: 1.05 }).fontScale, 1);
});

test("normalizeSettings falls back per invalid field", () => {
  assert.equal(normalizeSettings({ fontScale: 0 }).fontScale, 1);
  assert.equal(normalizeSettings({ fontScale: true }).fontScale, 1);
  assert.equal(normalizeSettings({ fontScale: null }).fontScale, 1);
  assert.equal(normalizeSettings({ buttonVariant: "fancy" }).buttonVariant, "ghost");
  assert.equal(normalizeSettings({ buttonVariant: 3 }).buttonVariant, "ghost");
  assert.equal(normalizeSettings({ buttonContent: "both" }).buttonContent, "text");
  assert.equal(normalizeSettings({ detailsRender: "html" }).detailsRender, "rendered");
  assert.equal(normalizeSettings({ mermaidRender: "true" }).mermaidRender, false);
  assert.equal(normalizeSettings({ mermaidRender: 0 }).mermaidRender, false);
  assert.equal(normalizeSettings({ mermaidRender: 1 }).mermaidRender, false);
});

test("normalizeSettings drops unknown keys", () => {
  const result = normalizeSettings({
    fontScale: 1,
    unknownKey: "x",
    nested: { a: 1 },
    __proto__: { polluted: true }
  });
  assert.deepEqual(Object.keys(result).sort(), Object.keys(DEFAULT_SETTINGS).sort());
  assert.equal(result.polluted, undefined);
});

test("parseSettings accepts JSON strings and objects and never throws", () => {
  assert.deepEqual(parseSettings('{"fontScale":0.9}').fontScale, 0.9);
  assert.deepEqual(parseSettings({ fontScale: 0.9 }).fontScale, 0.9);
  assert.deepEqual(parseSettings("{not json"), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings(""), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings("null"), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings("[]"), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('"a string"'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings(123), DEFAULT_SETTINGS);
  assert.doesNotThrow(() => parseSettings(undefined));
});

test("serializeSettings produces normalized JSON with stable key order", () => {
  const serialized = serializeSettings({
    mermaidRender: false,
    detailsRender: "raw",
    buttonContent: "icon",
    buttonVariant: "solid",
    fontScale: 1.15,
    junk: true
  });
  assert.equal(
    serialized,
    '{"fontScale":1.15,"buttonVariant":"solid","buttonContent":"icon","detailsRender":"raw","mermaidRender":false,"viewMode":"list"}'
  );
  assert.equal(
    serializeSettings({ fontScale: "bad", buttonVariant: "bad" }),
    '{"fontScale":1,"buttonVariant":"ghost","buttonContent":"text","detailsRender":"rendered","mermaidRender":false,"viewMode":"list"}'
  );
});

test("settings roundtrip through parse and serialize", () => {
  const settings = {
    fontScale: 0.9,
    buttonVariant: "solid",
    buttonContent: "icon",
    detailsRender: "raw",
    mermaidRender: false,
    viewMode: "list"
  };
  assert.deepEqual(parseSettings(serializeSettings(settings)), settings);
});

test("mergeSettings keeps untouched fields and skips null or undefined patch values", () => {
  const current = {
    fontScale: 1.15,
    buttonVariant: "solid",
    buttonContent: "icon",
    detailsRender: "raw",
    mermaidRender: false,
    viewMode: "list"
  };

  assert.deepEqual(mergeSettings(current, { buttonVariant: "ghost" }), {
    ...current,
    buttonVariant: "ghost"
  });

  assert.deepEqual(mergeSettings(current, null), current);
  assert.deepEqual(mergeSettings(current, undefined), current);
  assert.deepEqual(mergeSettings(current, { fontScale: null, mermaidRender: undefined }), current);
  assert.deepEqual(mergeSettings(current, { fontScale: "0.9" }).fontScale, 0.9);
});

test("scaleFont rounds, enforces a minimum and ignores invalid input", () => {
  assert.equal(scaleFont(14, 1), 14);
  assert.equal(scaleFont(14, 1.15), 16);
  assert.equal(scaleFont(13, 1.15), 15);
  assert.equal(scaleFont(16, 0.9), 14);
  assert.equal(scaleFont(10, 0.9), 9);
  assert.equal(scaleFont(1, 1), 9);
  assert.equal(scaleFont(14, NaN), 14);
  assert.equal(scaleFont(NaN, 1.15), NaN);
  assert.equal(scaleFont(14, Infinity), 14);
});

test("settingsEqual compares normalized settings", () => {
  assert.equal(settingsEqual(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS }), true);
  assert.equal(settingsEqual({ fontScale: "1.15" }, { fontScale: 1.15 }), true);
  assert.equal(settingsEqual({ fontScale: 1 }, { fontScale: 1.15 }), false);
  assert.equal(settingsEqual({ buttonVariant: "solid" }, { buttonVariant: "ghost" }), false);
  assert.equal(settingsEqual(undefined, undefined), true);
});
