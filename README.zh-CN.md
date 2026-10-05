<p align="center"><img src="docs/banner-zh-CN.png" alt="HoverPrompt — 看到好图，一键反推提示词" width="100%"></p>

<h1 align="center">HoverPrompt</h1>

<p align="center">
  <b>看到好图，就在原地把它变成提示词。</b><br>
  一个 Chrome / Edge 浏览器扩展：把网页上的任何图片反推成详细的 AI 提示词，<br>
  接着生成新图，并把每一条提示词都存进可搜索的资料库。
</p>

<p align="center">
  <a href="https://hoverprompt.com/?lang=zh-CN"><b>官网</b></a> ·
  <a href="https://hoverprompt.com/pricing?lang=zh-CN">价格</a> ·
  <a href="https://hoverprompt.com/community?lang=zh-CN">社区</a> ·
  <a href="https://hoverprompt.com/models?lang=zh-CN">AI 模型说明</a> ·
  <a href="README.md"><b>English</b></a>
</p>

---

## 功能

- **一键反推**：在任何网站上把鼠标移到图片上，点「提示词」，就能得到中英双语（也可以加其他语言）的详细提示词，可直接用于 Midjourney、Stable Diffusion、Flux、ChatGPT 等生图模型。
- **整页收集**：挑选页面上的参考图（自动跳过广告、图标和重复图）；小红书笔记可以一键反推整篇的所有图片。
- **Skill 风格规则**：给反推加上写作规则（胶片质感、电商白底、汉服细节……），一个 Skill 包里的子 Skill 可以按图片自动挑选。
- **生成新图**：用**你自己的 API** 文生图、图生图：OpenAI 兼容 `/v1/images`、Google Gemini / Imagen、火山方舟 Seedream（即梦 / 豆包）、魔搭 ModelScope。每张结果都保留对应的提示词；批量图生图可以按 Key 设置并发和每日上限。
- **ChatGPT 生图工作台**：在扩展的工作台页面里，用你自己的 ChatGPT 网页账号生图，可以同时跑多批，结果自动存回资料库。
- **资料库**：所有反推记录和生成图集中在一处，可搜索，有成功率和耗时统计；图片和提示词可以一起导出为 ZIP。
- **本地 CLI 与 Agent**：用命令行读取资料库、扫描网页、跑批量流水线，也可以把现成的指令交给 AI Agent（见 [docs/CLI-AGENT.md](docs/CLI-AGENT.md)）。
- **可选的云端账号**：登录 [hoverprompt.com](https://hoverprompt.com/?lang=zh-CN) 后可以用积分做云端反推和生图、多设备同步、发布到社区。**不登录**也能用本地模式使用上面所有功能。
- 7 种界面语言；浅色、深色和玻璃质感主题。

## 截图

| | |
|---|---|
| ![一键反推任意图片](docs/screenshots/zh-CN/1-reverse.png) | ![多语言提示词](docs/screenshots/zh-CN/2-bilingual.png) |
| ![生成新图](docs/screenshots/zh-CN/3-generate.png) | ![提示词资料库](docs/screenshots/zh-CN/4-library.png) |

## 从源码安装

1. 下载或克隆本仓库。
2. 打开 `chrome://extensions`（Chrome）或 `edge://extensions`（Edge），打开**开发者模式**。
3. 点**加载已解压的扩展程序**，选择 [`extension`](extension) 文件夹。
4. 固定 HoverPrompt 图标，打开任意网页，把鼠标移到图片上即可。

需要 Chrome 或 Edge 111 及以上版本。无需构建：扩展是纯 JavaScript。

## 登录（可选）

打开扩展设置 → **账号与同步** → **登录**，会打开 hoverprompt.com 的授权页面，在那里用邮箱验证码或 GitHub 确认这台设备。扩展只会拿到你账号的访问令牌，不会保存任何密码；随时可以在同一页面退出。

登录后可以用积分做云端反推和生图、多设备同步资料库、分享到社区，还可以领取 [7 天免费 Plus 体验](https://hoverprompt.com/pricing?lang=zh-CN)。

## 使用自己的 API Key

本地模式下使用你自己的模型和生图 API（设置 → **API 来源** 和 **生图**）。

- **本仓库不包含任何 API Key、令牌或密钥**，也请不要把你自己的提交进来。
- 你填写的 Key 只保存在浏览器的扩展存储（`chrome.storage.local`）里，只发送到你配置的 API 地址，不会上传到 HoverPrompt。
- 也可以用本机模型（例如 `localhost` 上的 Ollama），完全免费。

## 本地 CLI

`extension/cli` 里是一个小型 Node.js 命令行工具和 Native Messaging 桥接，用来读取扩展的本地缓存：

```powershell
# 在 extension 文件夹里运行（Windows，Chrome / Edge）；扩展 ID 在 chrome://extensions 页面上可以看到
powershell -ExecutionPolicy Bypass -File cli/install-local-bridge.ps1 -ExtensionId 你的扩展ID
node "$env:LOCALAPPDATA\HoverPrompt\cli\imageprompt.mjs" local doctor
```

然后打开**设置 → 本地 CLI → 本地 CLI 缓存桥接**。全部命令和 Agent 指令见 [docs/CLI-AGENT.md](docs/CLI-AGENT.md)。

## 目录结构

```
extension/            浏览器扩展（Manifest V3），以“已解压”方式加载这个文件夹
  manifest.json
  background.js       后台：右键菜单、任务、云端和 CLI 消息
  content.js          网页上的按钮和悬浮窗
  app.js, api.js      反推：本机模型 / 你自己的 API / 云端
  imagegen*.js        用你自己的 API 生图
  chatgpt-*.js        ChatGPT 生图工作台（在你自己的 ChatGPT 会话里运行）
  cloud.js            可选的 HoverPrompt 账号：登录、同步、积分
  cli/                本地 CLI 和 Native Messaging 桥接
  _locales/           商店名称和介绍（英文、简体中文）
docs/                 截图和 CLI / Agent 使用说明
```

## 隐私

本地模式下所有数据都留在你的浏览器里；登录后，只有你选择同步的内容才会发送到 HoverPrompt。详见[隐私政策](https://hoverprompt.com/privacy?lang=zh-CN)、[服务条款](https://hoverprompt.com/terms?lang=zh-CN)和[内容政策](https://hoverprompt.com/acceptable-use?lang=zh-CN)。

ChatGPT 生图工作台在你自己的浏览器里、用你自己的账号操作 ChatGPT 网页；HoverPrompt 与 OpenAI 没有关联。请按你所连接服务的条款使用。

## 参与贡献

欢迎提交 Issue 和 Pull Request。请让每次改动小而集中，用“加载已解压的扩展程序”测试后再提交，提交内容里不要包含任何 API Key 或个人数据。

## 许可证

[MIT](LICENSE) © 2026 HoverPrompt。字体使用 SIL Open Font License（[extension/fonts/OFL.txt](extension/fonts/OFL.txt)），图标来自 [Lucide](https://lucide.dev)（[extension/icons/LUCIDE-LICENSE.txt](extension/icons/LUCIDE-LICENSE.txt)）。

HoverPrompt 的名称和图标用于标识官方扩展和网站；你自己发布的版本请使用其他名称和图标。
