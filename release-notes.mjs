/* 岛屿 · 生成 APK 发布说明
 * 取 changelog.json 里最新一天的第一条更新，写成 release-notes.txt（标题 + 正文，纯文字）。
 * 岛屿里「检查更新」发现新版本时，会把这段文字显示给用户。 */
import fs from 'node:fs';

let list = [];
try { list = JSON.parse(fs.readFileSync('changelog.json', 'utf8')); } catch (e) { list = []; }
if (!Array.isArray(list)) list = [];

const newestDate = list.map((x) => String(x.date || '')).sort().pop() || '';
const top = list.find((x) => String(x.date || '') === newestDate) || {};
const title = String(top.title || '').trim();
const body = String(top.body || '').trim();
const text = [title, body].filter(Boolean).join('\n\n') || '岛屿的新版安装包。';

fs.writeFileSync('release-notes.txt', text + '\n', 'utf8');
console.log('Release notes written:', title || '(无标题)');
