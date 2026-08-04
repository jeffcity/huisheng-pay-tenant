import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = JSON.parse(await readFile(path.join(root, "src/project.json"), "utf8"));
const [source, index, dist] = await Promise.all([
  readFile(path.resolve(root, project.source), "utf8"),
  readFile(path.join(root, "index.html"), "utf8"),
  readFile(path.join(root, "dist/index.html"), "utf8"),
]);

assert.equal(index, source, "根目录 index.html 不是当前源文件构建结果");
assert.equal(dist, source, "dist/index.html 不是当前源文件构建结果");
assert.doesNotMatch(source, /\/Users\/|file:\/\//i, "构建内容泄漏本机绝对路径");
assert.doesNotMatch(source, /<(?:script|link)\b[^>]+(?:src|href)=["']https?:/i, "Demo 不应依赖外部可执行脚本或样式");
assert.ok(Buffer.byteLength(source) >= project.minimumBytes, "Demo 内容体积异常");

console.log(`检查通过：${project.name} 源文件与两份构建产物一致，无本机路径或外部可执行资源。`);
