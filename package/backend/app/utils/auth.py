import secrets
import string
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from app.config import settings


def generate_card_key(length: int = 16, prefix: str = "") -> str:
    """生成卡密"""
    chars = string.ascii_uppercase + string.digits
    random_part = ''.join(secrets.choice(chars) for _ in range(length))
    if prefix:
        return f"{prefix}-{random_part}"
    return random_part


def generate_access_link(card_key: str, base_url: str = "http://localhost:9800") -> str:
    """生成访问链接"""
    return f"{base_url}/access/{card_key}"


def generate_session_id() -> str:
    """生成会话ID"""
    return secrets.token_urlsafe(32)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except (TypeError, ValueError):
        return False


def get_password_hash(password: str) -> str:
    """哈希密码"""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def hash_password(password: str) -> str:
    return get_password_hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建访问令牌"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> Optional[dict]:
    """验证令牌"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


def create_user_token(user_id: int, username: str) -> str:
    expires = timedelta(hours=getattr(settings, "USER_TOKEN_EXPIRE_HOURS", 24))
    return create_access_token(
        data={"sub": str(user_id), "username": username, "role": "user"},
        expires_delta=expires,
    )


def get_user_from_token(token: str) -> Optional[int]:
    payload = verify_token(token)
    if not payload or payload.get("role") != "user":
        return None
    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        return None
