# BypassAIGC 发布包说明

这是 BypassAIGC 的运行包目录。程序已取消账号登录、注册和管理员后台，启动后直接进入文章预处理页面。

## 使用方法

1. 编辑同目录 `.env`，填写 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`POLISH_MODEL` 和 `ENHANCE_MODEL`。
2. 运行上一级目录提供的启动脚本或本目录启动入口。
3. 浏览器打开 `http://localhost:9800/article-preprocessor`。
4. 也可以直接在页面的 API 配置区域填写 API Key、Base URL 和模型；保存后配置会保存在当前浏览器，下次无需重复输入。

支持 `.docx`、`.pdf`、`.txt`、`.md` 和直接粘贴文本。详细说明请查看仓库根目录 `README.md`。

本版本不提供账号密码，也不提供 `/admin`、`/api/admin/*` 或 `/api/auth/*` 接口。
