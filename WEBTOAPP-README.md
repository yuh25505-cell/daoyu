# WebToApp 前端打包说明

这个工程已经整理成可被 WebToApp「Frontend / 前端」流程识别的标准项目根目录。

## 关键结构

- `package.json`：提供 NPM 项目入口与 `npm run build`
- `build.mjs`：无第三方依赖的构建脚本
- `dist/`：构建后输出目录
- `index.html`：PWA 主入口
- `assets/`：CSS、JavaScript、图标等静态资源

## 在 WebToApp 中

框架可以保持 `static website`，包管理器选择 `NPM`，输出目录填写 `dist`，然后执行/构建。

这个项目不依赖 Vite、React、Vue 等第三方构建依赖，因此不需要联网安装前端依赖即可执行 `npm run build`。

如果 WebToApp 直接要求选择「Frontend」的构建产物，也可以直接指定这个工程里的 `dist` 目录。


本版本同时包含 v1.44 的语言断句开关与记忆总结预设管理改动。推荐使用 `Frontend` → `NPM`，输出目录填写 `dist`。


### Android APK 原生能力（v1.50.0）

当前 APK 构建流程已加入一个 Capacitor 原生插件 `IslandNative`：

- **系统通知**：角色主动消息可通过 Android 原生通知渠道 `island_messages` 显示为系统通知，并支持点击通知回到对应聊天。
- **真实当前位置**：聊天「位置 → 我的当前位置」继续使用现有 `navigator.geolocation.getCurrentPosition()`，Android WebView 会在首次调用时请求真实设备的粗略/精确定位权限。
- **网页端兼容**：浏览器部署仍继续使用标准 Notification / Service Worker 与浏览器 Geolocation，不影响 PWA。
- **范围说明**：这里实现的是“应用运行时产生主动消息 → Android 系统通知”。若未来需要 App 被完全杀死、后台仍由服务器推送消息，则还需要接入 FCM 等真正的远程推送链路。

本版本 APK versionName 为 `1.50.0`；GitHub Actions 会按运行编号生成递增的 Android versionCode，便于覆盖安装升级。
