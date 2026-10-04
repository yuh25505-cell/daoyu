/* 岛屿 · 桌面 App 注册表 */
'use strict';

/* 每个桌面 App 在自己的 js 文件里调用 registerApp(名称, 打开函数)。
 * 桌面图标点击时按 data-app 名称查表；未注册的 App 保持原有的“开发中”提示。 */
var APP_REGISTRY = {};
function registerApp(name, openFn){
  APP_REGISTRY[name] = openFn;
}
