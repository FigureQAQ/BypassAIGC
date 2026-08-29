from __future__ import annotations

import asyncio
import json
import os
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx

from app.config import settings
from app.error_codes import ErrorCode, sanitize_message


def _log_dir() -> Path:
    path = Path(settings.LOG_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


def create_error_report(
    code: ErrorCode | str,
    error: Exception | str,
    *,
    endpoint: Optional[str] = None,
    status_code: Optional[int] = None,
) -> Path:
    """Write a redacted diagnostic report and optionally upload it."""
    now = datetime.now(timezone.utc)
    report = {
        "timestamp": now.isoformat(),
        "error_code": str(code),
        "status_code": status_code,
        "endpoint": endpoint,
        "error": sanitize_message(error),
        "traceback": sanitize_message(traceback.format_exc()),
        "app_version": "2.8.17",
        "python_version": os.sys.version.split()[0],
    }
    path = _log_dir() / f"error-{now:%Y%m%d-%H%M%S-%f}.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if settings.AUTO_UPLOAD_ERROR_LOGS and settings.ERROR_REPORT_URL:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_upload_report(report))
        except RuntimeError:
            pass
    return path


async def _upload_report(report: dict) -> None:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(settings.ERROR_REPORT_URL, json=report)
    except Exception:
        # Diagnostics must never make the original request fail.
        return
