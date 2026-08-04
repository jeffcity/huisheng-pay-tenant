import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("构建从唯一源文件生成一致的本地入口和发布产物", async () => {
  await promisify(execFile)(process.execPath, ["scripts/build.mjs"]);
  const [source, index, dist] = await Promise.all([
    readFile("src/demo.html", "utf8"),
    readFile("index.html", "utf8"),
    readFile("dist/index.html", "utf8"),
  ]);

  assert.equal(index, source);
  assert.equal(dist, source);
  assert.match(index, /<!doctype html>/i);
  assert.doesNotMatch(index, /\/Users\/|file:\/\//i);
});
