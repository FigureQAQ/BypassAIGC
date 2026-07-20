from pydantic_settings import BaseSettings
from typing import Optional
import os
import sys


def get_exe_dir():
    """获取 exe 所在目录，用于定位 .env 和数据库文件"""
    if getattr(sys, 'frozen', False):
        # 运行在 PyInstaller 打包的 exe 中
        return os.path.dirname(sys.executable)
    else:
        # 正常 Python 运行
        return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_env_file_path():
    """获取统一配置文件路径。

    源码运行优先使用仓库根目录的 .env；打包运行继续使用可执行文件
    同目录的 .env。BYPASSAIGC_ENV_FILE 可显式覆盖路径。
    """
    override_path = os.getenv("BYPASSAIGC_ENV_FILE")
    if override_path:
        return os.path.abspath(os.path.expanduser(override_path))

    app_dir = get_exe_dir()
    if getattr(sys, 'frozen', False):
        return os.path.join(app_dir, '.env')

    repository_root = os.path.dirname(os.path.dirname(app_dir))
    candidates = [
        os.path.join(repository_root, '.env'),
        os.path.join(os.path.dirname(app_dir), '.env'),
        os.path.join(app_dir, '.env'),
    ]
    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate
    return candidates[0]


def get_default_database_url():
    """获取默认数据库 URL，指向 exe 同目录"""
    exe_dir = get_exe_dir()
    db_path = os.path.join(exe_dir, 'ai_polish.db')
    return f"sqlite:///{db_path}"


class Settings(BaseSettings):
    # 服务器配置
    SERVER_HOST: str = "0.0.0.0"
    SERVER_PORT: int = 9800

    # 数据库配置 - 默认使用 exe 同目录
    DATABASE_URL: str = get_default_database_url()
    
    # Redis 配置
    REDIS_URL: str = "redis://IP:6379/0"
    
    # OpenAI API 配置
    OPENAI_API_KEY: str = "pwd"
    OPENAI_BASE_URL: str = "http://IP:PORT/v1"
    
    # 第一阶段模型配置 (论文润色)
    POLISH_MODEL: str = "gpt-5"
    POLISH_API_KEY: Optional[str] = None
    POLISH_BASE_URL: Optional[str] = None
    
    # 第二阶段模型配置 (原创性增强)
    ENHANCE_MODEL: str = "gpt-5"
    ENHANCE_API_KEY: Optional[str] = None
    ENHANCE_BASE_URL: Optional[str] = None
    
    # 并发配置
    MAX_CONCURRENT_USERS: int = 5
    MAX_CONCURRENT_PER_USER: int = 3
    DEFAULT_USAGE_LIMIT: int = 1
    SEGMENT_SKIP_THRESHOLD: int = 15
    AUTO_CREATE_LOCAL_USER: bool = False
    LOCAL_ACCESS_KEY: Optional[str] = None

    # Word Formatter 文件上传限制 (MB)，0 表示无限制
    MAX_UPLOAD_FILE_SIZE_MB: int = 0

    # PDF 导出字体配置
    PDF_FONT_PATH: Optional[str] = None
    PDF_FONT_NAME: str = "DocumentChineseFont"

    # 会话压缩配置
    HISTORY_COMPRESSION_THRESHOLD: int = 5000  # 汉字数量阈值
    COMPRESSION_MODEL: str = "gpt-5"
    COMPRESSION_API_KEY: Optional[str] = None
    COMPRESSION_BASE_URL: Optional[str] = None
    
    # 感情文章润色模型配置
    EMOTION_MODEL: Optional[str] = None
    EMOTION_API_KEY: Optional[str] = None
    EMOTION_BASE_URL: Optional[str] = None
    
    # 流式输出配置
    USE_STREAMING: bool = False  # 默认使用非流式模式，避免被API阻止
    STREAM_QUEUE_MAX_SIZE: int = 256  # 单个 SSE 连接最多缓存的消息数

    # API 请求起始时间的最小间隔（秒）
    API_REQUEST_INTERVAL: int = 1
    API_MAX_RETRIES: int = 3
    API_RETRY_BASE_DELAY: int = 2
    API_RETRY_MAX_DELAY: int = 20

    # 思考模式配置
    THINKING_MODE_ENABLED: bool = False
    THINKING_MODE_EFFORT: str = "low"  # 思考强度: none, low, medium, high, xhigh
    
    # JWT 密钥
    SECRET_KEY: str = "your-secret-key-change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    USER_TOKEN_EXPIRE_HOURS: int = 24
    
    # 管理员账户
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "admin123"
    
    class Config:
        env_file = get_env_file_path()
        case_sensitive = True


# 加载 exe 目录下的 .env 文件
_env_path = get_env_file_path()
if os.path.exists(_env_path):
    from dotenv import load_dotenv
    load_dotenv(_env_path)

settings = Settings()


def reload_settings():
    """重新加载配置 - 直接更新现有 settings 对象的属性"""
    global settings
    
    # 重新读取 .env 文件到环境变量 - 使用 exe 目录
    env_path = get_env_file_path()
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip()
                    os.environ[key] = value
                    
                    # 直接更新 settings 对象的属性
                    if hasattr(settings, key):
                        # 获取字段类型并转换
                        field_type = type(getattr(settings, key))
                        try:
                            if field_type == int:
                                setattr(settings, key, int(value))
                            elif field_type == bool:
                                setattr(settings, key, value.lower() in ('true', '1', 'yes'))
                            else:
                                setattr(settings, key, value)
                        except (ValueError, TypeError):
                            setattr(settings, key, value)
    
    return settings
