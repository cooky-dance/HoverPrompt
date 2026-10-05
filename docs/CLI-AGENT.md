# HoverPrompt CLI 与 Agent

## 安装或更新（Windows / Chrome / Edge）

1. 在原扩展管理页面重新加载 HoverPrompt，再刷新网页。
2. 设置 → 本地 CLI → 本地 CLI 缓存桥接：复制安装命令。终端进入扩展加载目录（包含 cli 子目录）或完整项目包根目录，再执行该命令。需要 Node.js。
3. 安装脚本仅注册当前用户的 Chrome/Edge Native Messaging 主机，并把 CLI 放到 `%LOCALAPPDATA%\HoverPrompt\cli\imageprompt.mjs`。已有桥接也必须再运行一次安装命令，更新 native-host。
4. 开启“本地 CLI 缓存桥接”，点击刷新本地缓存。若要自动化网页扫描/提交，还要开启“允许 CLI 扫描网页和提交任务”（默认关闭）。
5. 保持浏览器运行并选中目标 HTTP/HTTPS 网页。Agent 必须有本机终端权限；纯远端 Agent 无法直接访问你的本机缓存。

## 设置中的一键复制窗口

选择“只读资料库”“扫描网页”或“扫描并提交最多20张”，点击复制 Agent 指令。窗口同时列明命令功能、安装步骤和请求费用提示。

## PowerShell 示例

```powershell
$cli = Join-Path $env:LOCALAPPDATA 'HoverPrompt\cli\imageprompt.mjs'
node $cli local doctor
node $cli local discover --extension-id YOUR_EXTENSION_ID
node $cli local library
node $cli local pairs
node $cli local reindex
node $cli local scan --scope loaded
node $cli local search --site pinterest.com --query "古风" --scope scroll
```

`local search` 会打开 Pinterest 搜索结果页，滚动采集最多 20 屏，并从扩展历史主库中过滤已完成和正在处理的图片。它只返回候选图片与 `id`，不会调用模型。对其他网站，先取得该网站的搜索结果页 URL，再用 `local search --url "https://example.com/search?q=..."`；不同网站的搜索路径并不通用。

需要反推时，先核对返回的图片数量与页面，再明确限定提交数量：`node $cli local submit --scan-id 搜索返回的id --limit 20`。提交时还会按 URL 和图片内容哈希再次跳过重复记录。用 `local get` 查询每个任务的最终状态；`jobs` 仅表示已入队。

扫描输出包含 `id`、`tabId`、`images`、`steps`、`reason`。将实际 id 代入提交命令：

```powershell
node $cli local submit --scan-id ACTUAL_SCAN_ID --limit 20
node $cli local get ACTUAL_TASK_ID
node $cli local image ACTUAL_TASK_ID
```

提交输出的 `jobs` 是已入队任务，不代表完成。用 `local get` 查看状态、提示词、用时；`done` 表示分析完成，`failed` 表示失败。`local image` 返回实际图片路径，Agent 可通过本地文件/图像工具读取。

本机缓存的配对文件名采用 `000001-短码.json` 与 `000001-短码.jpg`（也可能是 PNG/WebP），其中序号递增且删除后不复用。JSON 内保留扩展任务原始 `id`，另有 `sequence` 和 `cacheId`。`local get`、`local image` 可使用原 ID 或 `cacheId`；`local pairs` 按序号输出两份文件的确切路径，便于把同一张图片提交给魔搭 API 并记录其返回任务 ID。旧 UUID 文件用 `local reindex` 整理，运行前先备份缓存目录。

- `local doctor`：检查本机桥接文件、授权扩展 ID、缓存和已接收/过期命令，不清理数据，不将安装成功误报为浏览器连接成功。
- `local discover`：支持 Chrome、Edge 和 Tabbit；查找镜像缓存与指定扩展的原始数据库路径；不解析 LevelDB，不扫描网页。
- `local scan --scope visible|loaded|scroll`：当前可见、已加载累计缓存、自动滚动采集（原有最多20屏）。沿用小图片与 Pinterest 过滤，和图片“提示词”按钮是否显示无关。可用 `--tab-id` 指定网页。
- `local submit --scan-id ID --limit N`：最多100张/次，默认跳过已完成或处理中任务的相同 URL/图片内容；失败历史允许再次提交。使用扩展现有 API、语言、并发、频率、超时、重试配置。也可用 `--urls` 传入 HTTP/HTTPS 图片地址 JSON 数组，`--focus` 指定重点，`--skip-duplicates false` 明确关闭去重。
- 本地读缓存无需登录。扫描不调用模型；提交可能产生个人 API 费用或消耗云端月额度。
- `login/me/analyze/batch/status/library/export`（不带 local）：原有云端命令，需要云服务授权；云端 export 生成图片+提示词 ZIP。
- CLI 响应为机器可读 JSON；这与用户历史资料库导出采用 JSONL/CSV/ZIP 是不同用途。
- `local search ... --max-screens 1-60 --close-tab true`（2.6.0）：调整滚动屏数；采集完成后关闭搜索标签页。
- `local snapshot [--url URL | --tab-id ID] [--screenshot false] [--wait 秒] [--close-tab true]`（2.6.0）：返回 `url`、`title`、`text`（前 6000 字）、`links`、`controls`、`images`，截图保存为 `screenshotPath`。适合在 Agent 无法操作浏览器时，把快照交给模型判断下一步，例如是否遇到登录墙、验证码，或者该词没有结果。`--close-tab` 只关闭本命令自己打开的标签页。
- 中断恢复（2.6.0）：扩展重新加载后，任务页会自动把卡在 queued/running 的任务重新排队，不会重复抢占其他已打开页面正在执行的任务。

## 注意

关闭 CLI 控制后不接受新命令。浏览器后台休眠时首次响应可能等待约30秒。CLI 默认等待180秒，可用 `--timeout` 设置10–300秒；超时后不要盲目再提交，应先读 `local library` 确认有没有已经入队的任务。提交按命令稳定任务 ID 处理，重投同一个已接收命令不会创建重复任务。

首次提交时若设置页未打开，扩展会创建一个后台设置标签页，用于执行现有任务队列。Agent 不需要打开或读取扩展页面，但执行期间应保留该标签页和浏览器。CLI 当前针对 Windows 本地桥接；未安装桥接时会报错，不会假装已经扫描或分析。

验证使用本地 Native Messaging 协议、命令文件队列及浏览器模拟 API/DOM，包括读缓存、扫描传递、提交入队、重复跳过、关闭控制拒绝提交和复制指令。本机桥接已注册；实际浏览器扫描和模型提交仍需通过真实链路验证。

Native Messaging 配置参考：[Chrome 官方文档](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)。

## 一步安装并列出功能

在扩展加载目录运行 `powershell -NoProfile -ExecutionPolicy Bypass -File ".\cli\agent-setup.ps1" -ExtensionId YOUR_EXTENSION_ID`。脚本安装/更新桥接和 CLI、执行 doctor、列出 help；不会提交分析。设置下方“复制一键安装指令”提供带当前扩展 ID 的简短 Agent 指令。浏览器开关仍在本地 CLI 中开启。

分页提交：`local submit --scan-id ID --limit 100`，再执行 `local submit --scan-id ID --limit 100 --offset 100`。offset 按去重后的图片列表计算；失败或超时先查看资料库，避免重复请求。
