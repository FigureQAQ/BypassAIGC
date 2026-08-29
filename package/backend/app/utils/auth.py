import secrets
import string


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
