# BypassAIGC

面向中文学术文章和一般长文本的本地预处理工具。项目通过兼容 OpenAI API 的模型接口，对文本或文档进行分段、结构识别和预处理，并尽量保持原始文档结构。

[![Release](https://img.shields.io/github/v/release/FigureQAQ/BypassAIGC?display_name=tag)](https://github.com/FigureQAQ/BypassAIGC/releases/latest)
[![Build](https://github.com/FigureQAQ/BypassAIGC/actions/workflows/build-exe.yml/badge.svg)](https://github.com/FigureQAQ/BypassAIGC/actions/workflows/build-exe.yml)

当前版本：**v2.8.16**（2026-08-29）

## 主要功能

- 文章预处理：按段落和字符数分块，识别标题、摘要、正文、列表、表格、图片、代码和参考文献等结构。
- 多种输入：支持直接粘贴文本，以及上传 `.docx`、`.pdf`、`.txt` 和 `.md` 文件。
- 多种输出：支持文本结果预览、处理状态实时更新，以及按原格式下载可用结果。
- 四种处理模式：可单独降低 AIGC 率、单独降低重复率、同时降低两项，或仅进行语言润色。
- 进度预览：实时显示当前处理阶段、完成百分比、段落位置和处理状态。
- 原格式导出：文本输出为 `.txt`，Markdown 输出为 `.md`，Word 输出为 `.docx`，PDF 输出为 `.pdf`；Word 和 Markdown 尽量保留原文档结构。
- API 配置：用户在页面中输入 API Key、Base URL 和模型后即可使用。
- 配置记忆：API 配置保存在当前浏览器的 `localStorage` 中，下次打开无需重复配置。
- 本地运行：后端默认监听 `9800` 端口，适合个人电脑或局域网环境使用。

### 处理模式

在文章预处理页面中，用户可以选择以下任一模式：

1. **降低 AIGC 率**：优化语言表达，降低文本的 AI 痕迹。
2. **降低重复率**：改写文本表达，降低与已有内容的重复程度。
3. **降低 AIGC 率 + 降低重复率**：先进行 AIGC 率优化，再进行重复率优化。
4. **仅润色**：改善语言流畅度和表达质量，不执行降低 AIGC 率或降低重复率处理。

四种模式均支持直接粘贴文本和上传文档，处理流程会根据所选模式执行对应阶段。

## v2.8.8 变更

- 取消账号登录、注册、管理员登录和管理后台。
- 删除前端账号管理、管理员管理、提示词管理、数据库管理和会话监控等多余模块。
- 程序启动后直接进入文章预处理页面，根路径 `/` 自动跳转到 `/article-preprocessor`。
- 移除前端认证令牌和登录失效跳转逻辑，所有请求使用本地访问身份完成任务关联。
- 打包启动入口不再注册 `/api/auth/*`、`/api/admin/*` 路由，也不再生成管理员密码配置。
- 后端与前端版本号统一为 `2.8.8`。

## v2.8.10 修复

- 修复旧版本数据库只有随机本地卡密时，新版固定使用 `local-use` 导致“无效的卡密”的问题。
- 启动时自动确保 `local-use` 本地身份存在，并兼容旧的本地访问身份。

## v2.8.11 修复

- Windows 打包版改为无控制台窗口运行，避免双击时黑色窗口一闪而过造成误判。
- 重复双击时检测已运行服务并打开现有文章预处理页面。
- 启动时自动将旧版 GPT/OpenAI 默认配置迁移为 DeepSeek。
- 浏览器中遗留的 GPT 默认模型和 OpenAI 默认地址会自动迁移为 DeepSeek。

## v2.8.12 修复

- 修复 Windows 无控制台模式下 `sys.stdout` 和 `sys.stderr` 为空导致启动中断的问题。
- 保留无黑框启动体验，同时确保后台服务可以正常监听 `9800` 端口。

## v2.8.13 变更

- 保留并明确展示三种核心处理模式：降低 AIGC 率、降低重复率、同时降低 AIGC 率和重复率。
- 统一前端处理模式名称和进度提示，避免将“降低重复率”简写为“降重”造成理解歧义。
- 同步更新前后端版本号及发布文档。

## v2.8.14 变更

- 新增“仅润色”模式，仅改善语言表达和流畅度，不执行降低 AIGC 率或降低重复率处理。
- 保留原有三种处理模式及其处理逻辑。

## v2.8.15 变更

- 增加实时进度预览，显示当前处理阶段、进度百分比和段落处理位置。
- 导出时自动按照源文件类型选择输出格式，避免文档被导出为不匹配的格式。
- Word 和 Markdown 输入继续使用保格式导出逻辑；PDF 使用 PDF 输出，纯文本使用 TXT 输出。

## v2.8.16 修复

- 修复文章预处理任务创建接口等待异步 AI 任务完成，导致页面长期停留在“正在初始化预处理任务...”的问题。
- 预处理接口现在先返回任务编号，前端通过实时进度流继续显示分割、标记和校验进度。
- 增加预处理请求超时提示，避免网络异常时页面无限等待。

## 快速开始

### 使用 Release

从 [GitHub Releases](https://github.com/FigureQAQ/BypassAIGC/releases) 下载对应系统的压缩包：

- Windows：`BypassAIGC-Windows-vX.X.X.zip`
- Linux：`BypassAIGC-Linux-vX.X.X.tar.gz`
- macOS：`BypassAIGC-macOS-vX.X.X.tar.gz`

解压后运行对应的启动脚本或可执行文件。程序启动后会打开浏览器并进入文章预处理页面：

```text
http://localhost:9800/article-preprocessor
```

### 源码运行

环境要求：

- Python 3.10 或更高版本
- Node.js 18 或更高版本
- npm

在仓库根目录执行：

```powershell
.\start.bat
```

启动脚本会创建 Python 虚拟环境、安装依赖、构建前端并启动服务。手动开发时，可分别在 `package/backend` 和 `package/frontend` 中安装依赖并启动后端、前端。

## API 配置

首次进入文章预处理页面时，在“API 配置”区域填写：

| 配置项 | 说明 | DeepSeek 示例 |
| --- | --- | --- |
| API Key | 个人模型服务密钥 | `sk-...` |
| Base URL | OpenAI 兼容接口地址 | `https://api.deepseek.com` |
| 模型 | 服务商提供的模型名称 | `deepseek-v4-flash` |

点击保存后即可处理文本或文档。配置只保存在当前浏览器，不会写入 Git 仓库，也不会由项目 README 或示例配置文件保存真实密钥。更换浏览器、清除站点数据或使用无痕窗口后，需要重新输入配置。

除 DeepSeek 外，也可以使用其他提供 OpenAI 兼容接口的服务，但必须确认其 Base URL、模型名称、请求格式和上下文长度符合服务商文档。

## 输入与输出说明

- `.docx`：提取可处理的正文内容，尽量保留标题、图片、表格、分页和原始样式。
- `.pdf`：支持可提取文本的 PDF；扫描件或纯图片 PDF 可能无法识别。
- `.txt`：兼容 UTF-8、UTF-8 BOM 和 GB18030 编码。
- `.md`：保留 Markdown 的基本结构。
- 直接输入：适用于短文本、片段、摘要和 Markdown 内容。

处理过程中请保持浏览器页面打开。任务完成后可在结果区域核对内容，并下载处理结果。超长文档建议适当降低单块字符数，以减少模型上下文超限风险。

## 本地接口

服务启动后可访问：

- 前端页面：`http://localhost:9800/article-preprocessor`
- 健康检查：`http://localhost:9800/health`
- API 文档：`http://localhost:9800/docs`

本版本不提供账号登录和管理员后台；不要再访问或配置 `/admin`、`/api/admin/*` 和 `/api/auth/*`。

## 配置文件

源码启动时可在仓库根目录创建 `.env`。至少需要配置模型服务信息：

```properties
OPENAI_API_KEY=your-api-key-here
OPENAI_BASE_URL=https://api.deepseek.com
POLISH_MODEL=deepseek-v4-flash
ENHANCE_MODEL=deepseek-v4-flash
SERVER_HOST=127.0.0.1
SERVER_PORT=9800
```

如果已经在网页中保存 API 配置，前端请求会优先携带当前浏览器中的配置，无需每次重新编辑 `.env`。`.env` 仅用于后端默认配置，切勿将真实 API Key 提交到 Git。

## 开发与验证

后端测试：

```powershell
cd package/backend
pytest
```

前端构建：

```powershell
cd package/frontend
npm run build
```

## 数据与隐私

- API Key 保存在当前浏览器的站点本地存储中，并通过请求发送到用户配置的模型服务。
- 文本和文档内容会发送到用户填写的模型服务商，请先阅读对应服务商的隐私政策和数据处理条款。
- 本项目不提供云端账号体系，不负责托管用户 API Key 或长期保存用户原文。
- 本地任务数据和数据库文件通常位于运行目录，请根据需要自行备份或清理。

## 许可证

请以仓库中的许可证文件为准。
