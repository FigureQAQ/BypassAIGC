# AI 学术写作助手 - 可执行文件打包

## 当前文档能力

- 优化入口支持 Word（.docx）、PDF（.pdf）和 Markdown（.md/.markdown）上传。
- Word 与 Markdown 会优先只润色摘要、正文、致谢中的普通文本段落。
- Word 会保护目录、标题、图片、表格、参考文献、附录、图表题注、关键词、公式、代码和复杂符号语句。
- Markdown 会保护标题、目录、参考文献、附录、代码块、表格、公式、链接、图片、行内代码和复杂符号语句；导出 Markdown 时优先回填到原始文件结构。
- PDF 支持文本提取和 PDF 导出；扫描件或图片型 PDF 如果无法提取文本，会提示无法处理。

## PowerShell 中文支持

- `start-app.ps1` 和 `build.ps1` 会自动切换控制台到 UTF-8，并设置 PowerShell、Python、npm 的 UTF-8 输入输出。
- 两个 `.ps1` 文件已保存为 UTF-8 with BOM，兼容 Windows PowerShell 5.1，避免中文提示、日志和路径显示乱码。
- 推荐通过 `start-app.bat` 启动；它会先执行 `chcp 65001`，再调用 PowerShell 启动脚本。

本目录包含将前后端项目打包为单个可执行文件 (exe) 的代码和配置。

## 界面预览

项目截图位于仓库根目录的 `docs/` 目录，并已在根目录 [README.md](../README.md) 中展示，包括用户主界面、润色高亮预览、Word 保格式导出、管理后台数据面板、会话监控和 API 配置界面。

## 来源与功能差异

本仓库基于原作者 Yan Wenxin 的 BypassAIGC 项目整理和二次增强，遵循原项目的 CC BY-NC-SA 4.0 许可协议。原作者版权与许可声明保留在仓库根目录的 `LICENSE` 中。

本打包目录不是原作者官方发布版本，主要差异包括：

- 支持将前后端打包为单个可执行程序，并让 `.env` 和数据库文件默认保存在可执行文件同目录。
- 优化入口支持 Word、PDF、Markdown 上传，结果支持 TXT、Markdown、Word、PDF 导出。
- Word 与 Markdown 会优先处理摘要、正文、致谢中的普通文本段落，并保护目录、标题、参考文献、附录、图表题注、公式、代码、表格、图片和复杂符号语句。
- Word 导出尽量基于原始 `.docx` 替换正文段落，Markdown 导出尽量回填原始 Markdown 结构。
- 增加 PowerShell UTF-8 中文支持、Windows 一键启动脚本、GitHub Actions 三平台构建与 Release 产物。
- 增加单用户并发限制、用户默认提示词读取和后台任务数据库会话隔离等稳定性优化。

## 目录结构

```
package/
├── backend/           # 后端代码（修改版，支持 exe 模式）
├── frontend/          # 前端代码（修改版，生产环境配置）
├── main.py            # 统一入口文件
├── app.spec           # PyInstaller 打包配置
├── requirements.txt   # Python 依赖
├── build.sh           # Linux/macOS 构建脚本
├── build.ps1          # Windows 构建脚本
└── README.md          # 本文件
```

## 一键启动（Windows 源码开发版）

当前目录提供两个启动脚本：

```text
start-app.ps1
start-app.bat
```

推荐双击桌面快捷方式：

```text
AI学术写作助手-一键启动.lnk
```

或直接双击：

```text
package\start-app.bat
```

脚本会自动：

1. 同步 `C:\Users\Administrator\Desktop\.env` 到 `package\.env` 和 `package\backend\.env`
2. 清理旧的 9800 / 5174 端口进程
3. 启动后端 `http://localhost:9800`
4. 启动前端 `http://localhost:5174`
5. 打开浏览器

如果前端依赖不存在，脚本会自动执行 `npm ci`。

## Word 文档处理范围

优化入口支持上传 `.docx` 文档，并会在保留原文件结构的基础上替换可优化正文段落。

可优化范围：

- 摘要
- 正文
- 致谢
- 常见编号正文和说明类段落，例如 `第 1 部分：...`、`（1）...`、`1. 域适应：...`、`理论分析：...`

保持不变：

- 短标题和章节标题
- 图片
- 表格
- 目录
- 参考文献
- 附录
- 图表题注
- 关键词

正文识别会根据段落样式、章节编号、标点句式和段落长度综合判断，避免将带句号、冒号、分号的正文段落误判为标题。

## 本地构建

### 前置条件

- Python 3.9+（已升级 Pydantic/SQLAlchemy 相关依赖以兼容 Python 3.13）
- Node.js 18+
- pip 和 npm
- PDF 功能依赖 `PyMuPDF` 和 `reportlab`，会随 `requirements.txt` 安装

### 构建步骤

**Linux/macOS:**
```bash
cd package
chmod +x build.sh
./build.sh
```

**Windows:**
```powershell
cd package
.\build.ps1
```

构建完成后，可执行文件位于 `dist/` 目录。

## GitHub Actions 自动构建

项目配置了 GitHub Actions 工作流，可以自动构建 Windows、Linux 和 macOS 版本的可执行文件。

### 触发方式

1. **打标签触发**: 推送以 `v` 开头的标签时自动触发构建并创建 Release
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. **手动触发**: 在 GitHub Actions 页面手动运行工作流

### 构建产物

- `BypassAIGC-Windows-{version}.zip` - Windows 可执行文件
- `BypassAIGC-Linux-{version}.tar.gz` - Linux 可执行文件
- `BypassAIGC-macOS-{version}.tar.gz` - macOS 可执行文件

## 运行说明

1. 下载对应平台的可执行文件
2. 解压到任意目录
3. 首次运行会自动创建 `.env` 配置文件模板
4. 编辑 `.env` 文件，填入必要的配置：
   - API Key（OPENAI_API_KEY、POLISH_API_KEY 等）
   - 管理员密码（ADMIN_PASSWORD）
   - JWT 密钥（SECRET_KEY）
5. 再次运行程序
6. 程序会自动打开浏览器访问 http://localhost:9800

### 配置文件说明

`.env` 文件和数据库文件 (`ai_polish.db`) 都会保存在可执行文件同目录下，方便备份和迁移。

### 访问地址

- 用户界面: http://localhost:9800
- 管理后台: http://localhost:9800/admin
- API 文档: http://localhost:9800/docs

## 打包版运行差异

1. **运行方式**：源码开发通常需要分别启动前端和后端服务，打包版一键启动。
2. **配置位置**：打包版的 `.env` 和数据库文件在可执行文件同目录。
3. **前端访问**：打包版前后端在同一端口，无需代理。
4. **文档能力**：优化入口支持 Word、PDF、Markdown 上传，结果支持 TXT、Markdown、Word、PDF 导出。
5. **Word 保格式**：Word 导出会基于原始 `.docx` 替换可修改段落，保留标题、图片、表格、目录、参考文献等内容。

## 技术细节

### 前端修改
- 修改 `vite.config.js` 添加生产环境构建配置
- 修改 API 配置，生产环境直接使用根路径

### 后端修改
- 修改 `config.py`，支持动态获取 exe 目录下的配置文件
- 数据库路径默认指向 exe 同目录

### 统一入口
- `main.py` 创建 FastAPI 应用
- 挂载静态文件服务前端页面
- 处理 SPA 路由（admin、workspace 等）
- 自动打开浏览器

### PyInstaller 配置
- 包含所有必要的隐式导入
- 包含前端静态文件
- 包含后端应用代码
- 排除不必要的大型库
