from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, defer
from sqlalchemy import func, and_, case
from typing import List
import io
import json
from urllib.parse import quote
from app.database import get_db, SessionLocal
from app.models.models import User, OptimizationSession, OptimizationSegment, ChangeLog
from app.schemas import (
    OptimizationCreate, SessionResponse, SessionDetailResponse,
    QueueStatusResponse, ProgressUpdate, ChangeLogResponse, ExportConfirmation
)
from app.services.optimization_service import OptimizationService
from app.services.concurrency import concurrency_manager
from app.services.document_export_service import build_export
from app.services.document_ingestion_service import DocumentIngestionError, dumps_meta, ingest_document
from app.services.stream_manager import stream_manager
from app.utils.auth import generate_session_id
from datetime import datetime
import asyncio
from app.config import settings
from sse_starlette.sse import EventSourceResponse

router = APIRouter(prefix="/optimization", tags=["optimization"])


def get_current_user(card_key: str, db: Session = Depends(get_db)) -> User:
    """获取当前用户"""
    user = db.query(User).filter(
        User.card_key == card_key,
        User.is_active.is_(True)
    ).first()

    if not user:
        raise HTTPException(status_code=401, detail="无效的卡密")

    user.last_used = datetime.utcnow()
    db.commit()

    return user


def check_optimization_usage(user: User):
    usage_limit = user.usage_limit if user.usage_limit is not None else settings.DEFAULT_USAGE_LIMIT
    usage_count = user.usage_count or 0
    if usage_limit > 0 and usage_count >= usage_limit:
        raise HTTPException(status_code=403, detail="该卡密已达到使用次数限制")
    return usage_count


def validate_processing_mode(processing_mode: str):
    valid_modes = ['paper_polish', 'paper_enhance', 'paper_polish_enhance', 'emotion_polish']
    if processing_mode not in valid_modes:
        raise HTTPException(
            status_code=400,
            detail=f"无效的处理模式。支持的模式: {', '.join(valid_modes)}"
        )


def get_initial_stage(processing_mode: str) -> str:
    if processing_mode == 'emotion_polish':
        return 'emotion_polish'
    if processing_mode == 'paper_enhance':
        return 'enhance'
    return 'polish'


def build_download_response(content: bytes, filename: str, media_type: str):
    encoded_filename = quote(filename, safe='')
    try:
        filename.encode('ascii')
        ascii_fallback = filename
    except UnicodeEncodeError:
        ascii_fallback = f"download.{filename.rsplit('.', 1)[-1]}" if '.' in filename else "download"

    return StreamingResponse(
        io.BytesIO(content),
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded_filename}",
        },
    )


async def run_optimization(session_id: int):
    """后台运行优化任务，使用独立数据库会话。"""
    db = SessionLocal()
    try:
        session_obj = db.query(OptimizationSession).filter(
            OptimizationSession.id == session_id
        ).first()

        if not session_obj:
            return

        service = OptimizationService(db, session_obj)
        await service.start_optimization()
    finally:
        db.close()


@router.post("/start", response_model=SessionResponse)
async def start_optimization(
    card_key: str,
    data: OptimizationCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """开始优化任务"""
    user = get_current_user(card_key, db)

    usage_count = check_optimization_usage(user)
    validate_processing_mode(data.processing_mode)
    initial_stage = get_initial_stage(data.processing_mode)

    from app.services.document_ingestion_service import count_words
    counts = count_words(data.original_text)

    # 创建会话
    session_id = generate_session_id()
    session = OptimizationSession(
        user_id=user.id,
        session_id=session_id,
        original_text=data.original_text,
        processing_mode=data.processing_mode,
        current_stage=initial_stage,
        status="queued",
        progress=0.0,
        polish_model=data.polish_config.model if data.polish_config else None,
        polish_api_key=data.polish_config.api_key if data.polish_config else None,
        polish_base_url=data.polish_config.base_url if data.polish_config else None,
        enhance_model=data.enhance_config.model if data.enhance_config else None,
        enhance_api_key=data.enhance_config.api_key if data.enhance_config else None,
        enhance_base_url=data.enhance_config.base_url if data.enhance_config else None,
        emotion_model=data.emotion_config.model if data.emotion_config else None,
        emotion_api_key=data.emotion_config.api_key if data.emotion_config else None,
        emotion_base_url=data.emotion_config.base_url if data.emotion_config else None,
        source_type="text",
        word_count=counts["word_count"],
        char_count=counts["char_count"],
        chinese_char_count=counts["chinese_char_count"],
        english_word_count=counts["english_word_count"],
        preserve_format_available=False
    )
    
    db.add(session)
    user.usage_count = usage_count + 1
    db.commit()
    db.refresh(session)
    
    # 添加后台任务
    background_tasks.add_task(run_optimization, session.id)
    
    return session


@router.post("/start-file", response_model=SessionResponse)
async def start_optimization_file(
    card_key: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    processing_mode: str = Form(default='paper_polish_enhance'),
    db: Session = Depends(get_db)
):
    """上传 Word/PDF 文档并开始优化任务"""
    user = get_current_user(card_key, db)
    usage_count = check_optimization_usage(user)
    validate_processing_mode(processing_mode)
    initial_stage = get_initial_stage(processing_mode)

    content = await file.read()
    try:
        ingestion = ingest_document(file.filename or "document", content, file.content_type)
    except DocumentIngestionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    session_id = generate_session_id()
    session = OptimizationSession(
        user_id=user.id,
        session_id=session_id,
        original_text=ingestion.original_text,
        processing_mode=processing_mode,
        current_stage=initial_stage,
        status="queued",
        progress=0.0,
        source_type=ingestion.source_type,
        source_filename=ingestion.source_filename,
        source_mime_type=ingestion.source_mime_type,
        source_file_size=ingestion.source_file_size,
        source_file_blob=ingestion.source_file_blob,
        source_text_hash=ingestion.source_text_hash,
        word_count=ingestion.word_count,
        char_count=ingestion.char_count,
        chinese_char_count=ingestion.chinese_char_count,
        english_word_count=ingestion.english_word_count,
        document_meta=dumps_meta(ingestion.document_meta),
        preserve_format_available=ingestion.preserve_format_available,
    )

    db.add(session)
    user.usage_count = usage_count + 1
    db.commit()
    db.refresh(session)

    if ingestion.blocks:
        session.total_segments = len(ingestion.blocks)
        for block in ingestion.blocks:
            replacement_strategy = "plain_fallback"
            if ingestion.source_type == "docx":
                replacement_strategy = "whole_paragraph"
            elif ingestion.source_type == "md":
                replacement_strategy = "markdown_block"

            segment = OptimizationSegment(
                session_id=session.id,
                segment_index=block.block_index,
                stage="polish",
                original_text=block.text,
                status="pending",
                source_block_id=block.block_id,
                source_block_type=block.block_type,
                source_block_index=block.block_index,
                source_text_offset_start=block.offset_start,
                source_text_offset_end=block.offset_end,
                replacement_strategy=replacement_strategy,
                structure_meta=json.dumps(block.structure_meta, ensure_ascii=False),
            )
            db.add(segment)
        db.commit()
        db.refresh(session)

    background_tasks.add_task(run_optimization, session.id)

    return session


@router.get("/status", response_model=QueueStatusResponse)
async def get_queue_status(
    card_key: str,
    session_id: str = None,
    db: Session = Depends(get_db)
):
    """获取队列状态"""
    user = get_current_user(card_key, db)
    
    status = await concurrency_manager.get_status(session_id)
    return QueueStatusResponse(**status)


@router.get("/sessions", response_model=List[SessionResponse])
async def list_sessions(
    card_key: str,
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """列出用户的所有会话（支持分页）"""
    user = get_current_user(card_key, db)
    
    # 限制最大返回数量为100，避免一次性加载过多数据
    limit = min(limit, 100)
    
    # 查询会话及其原始文本长度和预览文本
    results = db.query(
        OptimizationSession,
        func.length(OptimizationSession.original_text).label('original_char_count'),
        func.substring(OptimizationSession.original_text, 1, 50).label('preview_text')
    ).options(
        defer(OptimizationSession.original_text),
        defer(OptimizationSession.error_message)
    ).filter(
        OptimizationSession.user_id == user.id
    ).order_by(OptimizationSession.created_at.desc()).limit(limit).offset(offset).all()

    # 构造响应，手动注入 original_char_count 和 preview_text
    sessions = []
    for session, char_count, preview_text in results:
        session.original_char_count = char_count or 0
        session.preview_text = session.source_filename or preview_text or ""
        sessions.append(session)
        
    return sessions


@router.get("/sessions/{session_id}", response_model=SessionDetailResponse)
async def get_session_detail(
    session_id: str,
    card_key: str,
    db: Session = Depends(get_db)
):
    """获取会话详情"""
    user = get_current_user(card_key, db)
    
    session = db.query(OptimizationSession).filter(
        OptimizationSession.session_id == session_id,
        OptimizationSession.user_id == user.id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    # 获取段落
    segments = db.query(OptimizationSegment).filter(
        OptimizationSegment.session_id == session.id
    ).order_by(OptimizationSegment.segment_index).all()
    
    return SessionDetailResponse(
        **session.__dict__,
        segments=[seg.__dict__ for seg in segments]
    )


@router.get("/sessions/{session_id}/progress", response_model=ProgressUpdate)
async def get_session_progress(
    session_id: str,
    card_key: str,
    db: Session = Depends(get_db)
):
    """获取会话进度"""
    user = get_current_user(card_key, db)
    
    # 查询完整会话对象，但避免急切加载关联对象
    session = db.query(OptimizationSession).filter(
        OptimizationSession.session_id == session_id,
        OptimizationSession.user_id == user.id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    return ProgressUpdate(
        session_id=session.session_id,
        status=session.status,
        progress=session.progress,
        current_position=session.current_position,
        total_segments=session.total_segments,
        current_stage=session.current_stage,
        error_message=session.error_message
    )


@router.get("/sessions/{session_id}/stream")
async def stream_session_progress(
    session_id: str,
    request: Request,
    card_key: str,  # 简单的鉴权，实际可能需要更严格的检查
    db: Session = Depends(get_db)
):
    """流式获取会话进度和内容"""
    # 验证用户权限
    user = get_current_user(card_key, db)
    session = db.query(OptimizationSession).filter(
        OptimizationSession.session_id == session_id,
        OptimizationSession.user_id == user.id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    async def event_generator():
        queue = await stream_manager.connect(session_id)
        try:
            while True:
                if await request.is_disconnected():
                    break
                
                # 从队列获取消息，设置超时以便检查连接状态
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=1.0)
                    yield message
                except asyncio.TimeoutError:
                    # 发送心跳注释以保持连接活跃
                    yield ": keep-alive\n\n"
                    
        finally:
            await stream_manager.disconnect(session_id, queue)

    return EventSourceResponse(event_generator())


@router.get("/sessions/{session_id}/changes", response_model=List[ChangeLogResponse])
async def get_session_changes(
    session_id: str,
    card_key: str,
    db: Session = Depends(get_db)
):
    """获取会话的变更对照"""
    user = get_current_user(card_key, db)
    
    session = db.query(OptimizationSession).filter(
        OptimizationSession.session_id == session_id,
        OptimizationSession.user_id == user.id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    latest_log_subquery = db.query(
        ChangeLog.segment_index,
        ChangeLog.stage,
        func.max(ChangeLog.id).label("latest_id")
    ).filter(
        ChangeLog.session_id == session.id
    ).group_by(
        ChangeLog.segment_index,
        ChangeLog.stage
    ).subquery()

    change_logs = db.query(ChangeLog).join(
        latest_log_subquery,
        and_(
            ChangeLog.segment_index == latest_log_subquery.c.segment_index,
            ChangeLog.stage == latest_log_subquery.c.stage,
            ChangeLog.id == latest_log_subquery.c.latest_id
        )
    ).filter(
        ChangeLog.session_id == session.id
    ).order_by(
        ChangeLog.segment_index,
        case((ChangeLog.stage == "polish", 0), else_=1)
    ).all()

    parsed_changes = []
    for change in change_logs:
        detail = None
        if change.changes_detail:
            try:
                detail = json.loads(change.changes_detail)
            except json.JSONDecodeError:
                detail = {"raw": change.changes_detail}

        parsed_changes.append(
            ChangeLogResponse(
                id=change.id,
                segment_index=change.segment_index,
                stage=change.stage,
                before_text=change.before_text,
                after_text=change.after_text,
                changes_detail=detail,
                created_at=change.created_at
            )
        )

    return parsed_changes


@router.post("/sessions/{session_id}/export")
async def export_session(
    session_id: str,
    card_key: str,
    confirmation: ExportConfirmation,
    db: Session = Depends(get_db)
):
    """导出优化结果"""
    if not confirmation.acknowledge_academic_integrity:
        raise HTTPException(
            status_code=400,
            detail="必须确认学术诚信承诺"
        )
    
    user = get_current_user(card_key, db)
    
    session = db.query(OptimizationSession).filter(
        OptimizationSession.session_id == session_id,
        OptimizationSession.user_id == user.id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    if session.status != "completed":
        raise HTTPException(status_code=400, detail="会话未完成")
    
    # 获取所有段落
    segments = db.query(OptimizationSegment).filter(
        OptimizationSegment.session_id == session.id
    ).order_by(OptimizationSegment.segment_index).all()

    try:
        export_result = build_export(session, segments, confirmation.export_format)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return build_download_response(
        export_result.content,
        export_result.filename,
        export_result.media_type,
    )


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    card_key: str,
    db: Session = Depends(get_db)
):
    """删除会话"""
    user = get_current_user(card_key, db)
    
    session = db.query(OptimizationSession).filter(
        OptimizationSession.session_id == session_id,
        OptimizationSession.user_id == user.id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    db.delete(session)
    db.commit()
    
    return {"message": "会话已删除"}


@router.post("/sessions/{session_id}/retry")
async def retry_session(
    session_id: str,
    card_key: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """重新尝试处理失败的会话，继续未完成的段落"""
    user = get_current_user(card_key, db)

    session = db.query(OptimizationSession).filter(
        OptimizationSession.session_id == session_id,
        OptimizationSession.user_id == user.id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    if session.status not in ["failed", "stopped"]:
        raise HTTPException(status_code=400, detail="仅可对失败或已停止的会话执行重试")

    # 保留历史错误信息
    old_error = session.error_message or "未知错误"
    session.status = "queued"
    session.error_message = f"[重试中] 上次失败原因: {old_error}"
    db.commit()

    background_tasks.add_task(run_optimization, session.id)

    return {"message": "已重新排队处理未完成段落"}


@router.post("/sessions/{session_id}/stop")
async def stop_session(
    session_id: str,
    card_key: str,
    db: Session = Depends(get_db)
):
    """停止正在进行中的会话"""
    user = get_current_user(card_key, db)

    session = db.query(OptimizationSession).filter(
        OptimizationSession.session_id == session_id,
        OptimizationSession.user_id == user.id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    if session.status not in ["queued", "processing"]:
        raise HTTPException(status_code=400, detail="只能停止排队中或处理中的会话")

    # 更新状态为 stopped
    session.status = "stopped"
    session.error_message = "用户手动停止"
    db.commit()

    return {"message": "会话已停止"}
