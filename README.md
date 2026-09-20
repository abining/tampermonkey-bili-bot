# bilibili 视频总结 Beta

将旧版 `tampermonkey-script/bili.js` 拆分迁移为 React + TypeScript + Vite 工程，并通过 `vite-plugin-monkey` 输出可直接安装的 Tampermonkey 脚本。

## 功能

- 按当前 BVID、CID 和 P 号提取并隔离字幕、摘要与分析结果。
- 支持 OpenAI 兼容接口、流式摘要、模型列表、摘要预设和连续追问。
- 支持评论、弹幕、全面分析、手动字幕、TXT/SRT 下载和评论区填充。
- 支持配置字幕转写后端；接口约定见 [`docs/backend-subtitle-api.md`](docs/backend-subtitle-api.md)。
- 支持 API 生图、Google Flow、Flomo 和配置导入导出。
- 使用 React Shadow DOM 面板，支持拖动、缩放、悬浮按钮和位置持久化。
- 兼容旧版配置与摘要缓存迁移。

## 开发与打包

需要 Node.js 20+ 和 pnpm。

```bash
pnpm install
pnpm dev
pnpm build
```

构建产物：

```text
dist/bilibili-video-summary-beta.user.js
```

在 Tampermonkey 中新建脚本，将构建产物完整粘贴后保存即可安装。测试 Beta 时请停用旧版 `bili.js`，避免两个脚本同时监听页面和发送请求。

## 配置

打开脚本面板右上角的设置页，在“AI 与模型”中填写兼容接口地址、API Key 和模型名称，也可以从接口读取模型列表。

API Key 只保存在浏览器本地配置中，不会写入源码或构建产物。配置导出默认排除所有密钥；只有主动勾选“导出时包含 API Key”才会包含。

## 多分集隔离

- 路由键：`BVID + P`。
- 视频上下文键：`BVID + CID + P`。
- 摘要缓存键额外包含模型、预设、提示词哈希和字幕哈希。
- 字幕响应按请求发起时的路由键和时间戳归属，迟到响应不能写入新分集。
- SPA 路由通过 history 事件、`urlchange` 和 URL 轮询共同检测。
- 切集时取消旧任务并递增 route generation，旧 AI 流和旧分析结果会被丢弃。
- 当前会话内按视频上下文缓存字幕，往返分集时不依赖播放器重复发起字幕请求。
- 用户脚本在 `document-start` 启动，以便在播放器首个字幕请求前安装捕获器。

## 目录

```text
src/cache/                 摘要缓存
src/config/                默认配置、API Profile 和提示词预设
src/contracts/             运行时契约与状态模型
src/flow/                  Google Flow 接收与自动化
src/platform/bilibili/     视频上下文、字幕、评论、弹幕和评论框
src/runtime/               应用、路由、解析和功能控制器
src/services/              AI、模型、生图、下载和第三方服务
src/storage/               配置迁移、导入导出和位置存储
src/ui/                    React 主面板、结果页和设置页
```

## 已知限制

- B站本身没有字幕的分集需要上传或粘贴字幕。
- 浏览器目录自动保存依赖 File System Access API 和用户授权。
- Google Flow 页面结构变化时，自动化选择器可能需要同步更新。

## 环境配置与自动测试

项目使用 Vite mode 区分开发和正式打包：

- `.env.development`：可提交的开发默认值，更新地址指向本机 CORS 服务。
- `.env.development.local`：本机开发覆盖，优先级高于 `.env.development`，由 `*.local` 自动忽略。
- `.env.prod`：可提交的正式发布配置，`pnpm build` 和 GitHub Actions 固定读取该文件。
- `.env.example`：变量说明模板；所有 `VITE_*` 配置都是公开配置，禁止放入 API Key、Cookie 或密码。

常用命令：

```bash
# 开发模式构建，读取 .env.development(.local)
pnpm run build:dev

# 正式构建，固定读取 .env.prod；默认 build 也是正式构建
pnpm run build

# 依次验证开发和正式 metadata，结束后保留正式产物
pnpm run test:userscript
```

本地 Tampermonkey 自动更新/安装测试：

```bash
pnpm run test:userscript:dev
pnpm run serve:userscript
```

服务只监听 `127.0.0.1:5510`，并为 userscript 响应附加 `Access-Control-Allow-Origin: *` 和禁用缓存响应头。随后打开终端打印的 `USERSCRIPT_URL`，Tampermonkey 会进入安装/更新页。AI 自动测试时会执行相同步骤，完成安装后刷新 Bilibili 页面并检查脚本 UI 与控制台错误。

正式发布由 `.github/workflows/release.yml` 处理：推送与 `package.json` 版本一致的 `v*` 标签后，GitHub Actions 会读取仓库中的 `.env.prod`、执行正式构建与 metadata 校验，然后上传 Release 产物。
