// 页面注册表一致性：每个页面的 sourceKey 都能落到真实源文件；导航覆盖全部页面。
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modules = JSON.parse(await readFile(path.join(root, "src/legacy/modules.json"), "utf8"));

test("页面注册表包含 23 个页面", () => {
  assert.equal(Object.keys(modules).length, 23);
});

test("租户钱包与商户资金划转导航口径一致", async () => {
  const [loginHtml, systemHtml, overviewHtml] = await Promise.all([
    readFile(path.join(root, "public/legacy/sources/login.html"), "utf8"),
    readFile(path.join(root, "public/legacy/sources/system.html"), "utf8"),
    readFile(path.join(root, "public/legacy/sources/overview.html"), "utf8")
  ]);
  assert.equal(modules.wallets.label, "租户钱包");
  assert.equal(modules.funds.label, "资金划转");
  assert.equal(modules.funds.navLabel, "商户资金划转");
  assert.match(overviewHtml, /<h1 class="page-title">租户钱包<\/h1>/);
  assert.match(loginHtml, /id: "funding", label: "资金划转"[^\n]+tenant\.wallet_transfer\.view/);
  assert.match(systemHtml, /id:'funding',page:'资金划转'[^\n]+tenant\.wallet_transfer\.view/);
  assert.doesNotMatch(systemHtml, /id:'funding',page:'资金申请'/);
  assert.doesNotMatch(overviewHtml, /data-action="todo-source"[^>]+data-target="资金申请"/);
  assert.doesNotMatch(overviewHtml, /type: "资金申请处理"[^\n]+target: "资金申请"/);
});

test("每个页面的源文件存在于 public/legacy/sources", async () => {
  const keys = new Set(Object.values(modules).map(m => m.sourceKey));
  assert.equal(keys.size, 4);
  for (const key of keys) {
    await stat(path.join(root, "public/legacy/sources", `${key}.html`));
  }
});

test("每个页面都有 label/group/module/sourceKey/sourceName", () => {
  for (const [id, m] of Object.entries(modules)) {
    assert.ok(m.label, `${id} 缺 label`);
    assert.ok(m.group, `${id} 缺 group`);
    assert.ok(m.module, `${id} 缺 module`);
    assert.ok(m.sourceKey, `${id} 缺 sourceKey`);
    assert.ok(m.sourceName, `${id} 缺 sourceName`);
    assert.equal(m.sourceKey, m.module, `${id} sourceKey 与 module 不一致`);
  }
});

test("导航覆盖全部非 utility 页面，utility 页面恰好 2 个", async () => {
  const { NAV_GROUPS, UTILITY_ITEMS, MODULES } = await import("../src/modules.js");
  const navIds = NAV_GROUPS.flatMap(g => g.items.map(i => i.id));
  const utilityIds = UTILITY_ITEMS.map(i => i.id);
  assert.equal(utilityIds.length, 2);
  for (const id of Object.keys(MODULES)) {
    const covered = navIds.includes(id) || utilityIds.includes(id);
    assert.ok(covered, `${id} 未出现在导航或工具区`);
  }
  assert.equal(new Set([...navIds, ...utilityIds]).size, Object.keys(MODULES).length);
});
