import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = JSON.parse(await readFile(path.join(root, "src/project.json"), "utf8"));
const sourcePath = path.resolve(root, project.source);

assert.ok(sourcePath.startsWith(path.join(root, "src") + path.sep), "Demo 源文件必须位于 src/ 内");

const html = await readFile(sourcePath, "utf8");
assert.match(html, /<!doctype html>/i, "Demo 源文件缺少 HTML doctype");
assert.match(html, new RegExp(`<title>\\s*${project.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*</title>`, "i"), "Demo 标题与项目配置不一致");
assert.ok(Buffer.byteLength(html) >= project.minimumBytes, "Demo 源文件体积异常，可能发生内容丢失");
assert.doesNotMatch(html, /\/Users\/|file:\/\//i, "Demo 源文件泄漏本机绝对路径");

await mkdir(path.join(root, "dist"), { recursive: true });
await Promise.all([
  writeFile(path.join(root, "index.html"), html),
  writeFile(path.join(root, "dist/index.html"), html),
]);

console.log(`已构建 ${project.name}：${Buffer.byteLength(html).toLocaleString("en-US")} bytes。`);
