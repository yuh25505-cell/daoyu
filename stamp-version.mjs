/* 岛屿 · 版本戳
 * 给当前这一份代码算出一个"构建号"（版本号 + 内容指纹），写进：
 *   version.json      —— 网页版「检查更新」去线上读取、与本机对比
 *   js-core-version.js —— 当前这份代码自带的构建号（页面加载时读到的就是它）
 *   sw.js 的 BUILD_STAMP —— 让每次发布 sw.js 的字节都不同，浏览器会自动发现新版本
 * 指纹覆盖 index.html、全部脚本样式、manifest、changelog.json 与 sw.js，所以只要发布了新内容，构建号一定会变。
 * 用法：node stamp-version.mjs（或 npm run stamp）。可重复运行，内容没变时结果不变。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(root, name));
const pkg = JSON.parse(read('package.json').toString('utf8'));
const version = String(pkg.version || '0.0.0');

const STAMP_RE = /const BUILD_STAMP = '[^']*';/;
const swText = read('sw.js').toString('utf8');
if (!STAMP_RE.test(swText)) throw new Error("sw.js 里找不到 const BUILD_STAMP = '…'; 这一行");

const shell = [...swText.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]);
const names = [...new Set([...shell, 'index.html', 'manifest.webmanifest', 'changelog.json', 'sw.js'])]
  .filter((n) => n !== 'js-core-version.js')
  .sort();

const TEXT = /\.(js|css|html|json|webmanifest)$/i;
const hash = crypto.createHash('sha256');
for (const name of names) {
  if (!fs.existsSync(path.join(root, name))) throw new Error('缺少文件：' + name);
  let buf = read(name);
  if (TEXT.test(name)) {
    let text = buf.toString('utf8').replace(/\r\n/g, '\n');
    if (name === 'sw.js') text = text.replace(STAMP_RE, "const BUILD_STAMP = '';");
    buf = Buffer.from(text, 'utf8');
  }
  hash.update(name + '\0');
  hash.update(buf);
  hash.update('\0');
}
const build = `${version}-${hash.digest('hex').slice(0, 8)}`;

fs.writeFileSync(path.join(root, 'version.json'), JSON.stringify({ name: '岛屿', version, build }, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'js-core-version.js'),
`/* 岛屿 · 当前代码的构建号（由 stamp-version.mjs 自动生成，请勿手改） */
'use strict';
var ISLAND_VERSION = '${version}';
var ISLAND_BUILD = '${build}';
`);
fs.writeFileSync(path.join(root, 'sw.js'), swText.replace(STAMP_RE, `const BUILD_STAMP = '${build}';`));

console.log('Stamped build:', build, `(${names.length} files)`);
