from __future__ import annotations

import re
from enum import StrEnum


class ErrorCode(StrEnum):
    API_CONFIG_MISSING = "E1001"
    API_AUTH_FAILED = "E1002"
    API_REQUEST_FAILED = "E1003"
    API_TIMEOUT = "E1004"
    INPUT_INVALID = "E2001"
    FILE_UNSUPPORTED = "E2002"
    FILE_READ_FAILED = "E2003"
    TASK_NOT_FOUND = "E3001"
    TASK_FAILED = "E3002"
    INTERNAL_ERROR = "E9001"


def sanitize_message(message: str) -> str:
    """Remove secrets and keep error reports free of document content."""
    value = str(message or "")
    value = re.sub(r"(?i)(api[_ -]?key|authorization|bearer)\s*[:=]\s*\S+", r"\1=[REDACTED]", value)
    value = re.sub(r"\bsk-[A-Za-z0-9_-]{12,}\b", "sk-[REDACTED]", value)
    return value[:2000]


def code_for_status(status_code: int, detail: object = "") -> ErrorCode:
    detail_text = str(detail).lower()
    if status_code == 401 or "api key" in detail_text or "认证" in detail_text:
        return ErrorCode.API_AUTH_FAILED
    if status_code == 404:
        return ErrorCode.TASK_NOT_FOUND
    if status_code == 408 or status_code == 504 or "超时" in detail_text:
        return ErrorCode.API_TIMEOUT
    if status_code == 422 or "输入" in detail_text or "文件" in detail_text:
        return ErrorCode.INPUT_INVALID
    if status_code >= 500:
        return ErrorCode.INTERNAL_ERROR
    return ErrorCode.API_REQUEST_FAILED
