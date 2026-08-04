import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("项目配置、脚本与维护边界完整", async () => {
  const [project, packageFile, readme, agents, workflow] = await Promise.all([
    readFile(new URL("../src/project.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../AGENTS.md", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8"),
  ]);

  assert.match(project.id, /^HS-(?:PLATFORM|TENANT|MERCHANT)$/);
  assert.equal(project.source, "src/demo.html");
  assert.ok(project.minimumBytes >= 100_000);
  assert.equal(packageFile.private, true);
  assert.equal(packageFile.type, "module");
  assert.equal(packageFile.scripts.build, "node scripts/build.mjs");
  assert.equal(packageFile.scripts.test, "node --test");
  assert.equal(packageFile.scripts.check, "node scripts/build.mjs && node --test && node scripts/check.mjs");
  assert.match(readme, /src\/demo\.html/);
  assert.match(agents, /唯一可编辑界面源文件/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /path: dist/);
});
