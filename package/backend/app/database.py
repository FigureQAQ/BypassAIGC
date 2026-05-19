from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """数据库会话依赖"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """初始化数据库 - 安全地创建或更新数据库结构"""
    try:
        # 导入所有模型以确保它们被注册到 Base.metadata
        from app.models import models  # noqa: F401
        
        # 创建所有表（如果不存在）
        Base.metadata.create_all(bind=engine)
        
        # 检查并添加可能缺失的列（用于数据库迁移）
        _migrate_database_schema()
        
        # 自动添加性能优化索引
        _add_performance_indexes()
        
        print("✓ 数据库初始化成功")
        return True
    except Exception as e:
        print(f"✗ 数据库初始化失败: {str(e)}")
        raise


def _add_column_safely(conn, table_name, column_name, column_def):
    """安全地添加列（如果不存在）"""
    try:
        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_def}"))
        conn.commit()
        return True
    except Exception as e:
        # 列可能已存在或其他错误
        conn.rollback()
        return False


def _add_performance_indexes():
    """添加性能优化索引"""
    try:
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        
        # 定义需要的索引
        indexes = [
            # OptimizationSession indexes
            ("idx_opt_session_user_id", "optimization_sessions", "user_id"),
            ("idx_opt_session_status", "optimization_sessions", "status"),
            ("idx_opt_session_created_at", "optimization_sessions", "created_at"),
            
            # OptimizationSegment indexes
            ("idx_opt_segment_session_id", "optimization_segments", "session_id"),
            ("idx_opt_segment_index", "optimization_segments", "segment_index"),
            ("idx_opt_segment_status", "optimization_segments", "status"),
            
            # ChangeLog indexes
            ("idx_change_log_session_id", "change_logs", "session_id"),
            ("idx_change_log_segment_index", "change_logs", "segment_index"),
            ("idx_change_log_stage", "change_logs", "stage"),
        ]
        
        with engine.connect() as conn:
            for index_name, table_name, column_name in indexes:
                # 检查表是否存在
                if table_name not in tables:
                    continue
                
                try:
                    # 获取表上现有的索引
                    existing_indexes = inspector.get_indexes(table_name)
                    index_names = {idx['name'] for idx in existing_indexes}
                    
                    # 如果索引已存在，跳过
                    if index_name in index_names:
                        continue
                    
                    # 创建索引（SQLite 和 PostgreSQL 都支持相同语法）
                    conn.execute(text(
                        f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} ({column_name})"
                    ))
                    conn.commit()
                    print(f"  ✓ 添加索引: {index_name}")
                    
                except Exception as e:
                    # 索引可能已存在或其他错误
                    conn.rollback()
                    # 静默失败，不阻止应用启动
                    pass
    
    except Exception as e:
        print(f"  ⚠ 添加性能索引警告: {str(e)}")
        # 失败不应该阻止应用启动


def _migrate_database_schema():
    """迁移数据库结构 - 添加新列到已存在的表"""
    try:
        inspector = inspect(engine)
        
        # 检查表是否存在
        tables = inspector.get_table_names()
        
        with engine.connect() as conn:
            
                # 迁移 optimization_sessions 表
                if "optimization_sessions" in tables:
                    columns = {column["name"] for column in inspector.get_columns("optimization_sessions")}
                    
                    if "failed_segment_index" not in columns:
                        if _add_column_safely(conn, "optimization_sessions", "failed_segment_index", "INTEGER"):
                            print("  ✓ 添加字段: optimization_sessions.failed_segment_index")
                    
                    if "processing_mode" not in columns:
                        if _add_column_safely(conn, "optimization_sessions", "processing_mode", "VARCHAR(50) DEFAULT 'paper_polish_enhance'"):
                            print("  ✓ 添加字段: optimization_sessions.processing_mode")
                    
                    if "emotion_model" not in columns:
                        added = _add_column_safely(conn, "optimization_sessions", "emotion_model", "VARCHAR(100)")
                        _add_column_safely(conn, "optimization_sessions", "emotion_api_key", "VARCHAR(255)")
                        _add_column_safely(conn, "optimization_sessions", "emotion_base_url", "VARCHAR(255)")
                        if added:
                            print("  ✓ 添加字段: optimization_sessions.emotion_* 字段")

                    session_columns_to_add = {
                        "source_type": "VARCHAR(20) DEFAULT 'text'",
                        "source_filename": "VARCHAR(255)",
                        "source_mime_type": "VARCHAR(100)",
                        "source_file_size": "INTEGER",
                        "source_file_blob": "BLOB",
                        "source_text_hash": "VARCHAR(64)",
                        "word_count": "INTEGER DEFAULT 0",
                        "char_count": "INTEGER DEFAULT 0",
                        "chinese_char_count": "INTEGER DEFAULT 0",
                        "english_word_count": "INTEGER DEFAULT 0",
                        "document_meta": "TEXT",
                        "preserve_format_available": "BOOLEAN DEFAULT 0",
                    }
                    for column_name, column_def in session_columns_to_add.items():
                        if column_name not in columns:
                            if _add_column_safely(conn, "optimization_sessions", column_name, column_def):
                                print(f"  ✓ 添加字段: optimization_sessions.{column_name}")

                # 迁移 users 表
                if "users" in tables:
                    user_columns = {column["name"] for column in inspector.get_columns("users")}
                    
                    if "usage_limit" not in user_columns:
                        if _add_column_safely(conn, "users", "usage_limit", f"INTEGER DEFAULT {settings.DEFAULT_USAGE_LIMIT}"):
                            print("  ✓ 添加字段: users.usage_limit")
                    
                    if "usage_count" not in user_columns:
                        if _add_column_safely(conn, "users", "usage_count", "INTEGER DEFAULT 0"):
                            print("  ✓ 添加字段: users.usage_count")
                    
                    # 更新 NULL 值
                    try:
                        conn.execute(text(f"UPDATE users SET usage_limit = {settings.DEFAULT_USAGE_LIMIT} WHERE usage_limit IS NULL"))
                        conn.execute(text("UPDATE users SET usage_count = 0 WHERE usage_count IS NULL"))
                        conn.commit()
                    except Exception:
                        conn.rollback()
            
                # 迁移 optimization_segments 表
                if "optimization_segments" in tables:
                    segment_columns = {column["name"] for column in inspector.get_columns("optimization_segments")}
                    
                    if "is_title" not in segment_columns:
                        if _add_column_safely(conn, "optimization_segments", "is_title", "BOOLEAN DEFAULT 0"):
                            print("  ✓ 添加字段: optimization_segments.is_title")

                    segment_columns_to_add = {
                        "source_block_id": "VARCHAR(100)",
                        "source_block_type": "VARCHAR(50)",
                        "source_block_index": "INTEGER",
                        "source_text_offset_start": "INTEGER",
                        "source_text_offset_end": "INTEGER",
                        "replacement_strategy": "VARCHAR(50)",
                        "structure_meta": "TEXT",
                    }
                    for column_name, column_def in segment_columns_to_add.items():
                        if column_name not in segment_columns:
                            if _add_column_safely(conn, "optimization_segments", column_name, column_def):
                                print(f"  ✓ 添加字段: optimization_segments.{column_name}")

                # 迁移 custom_prompts 表
                if "custom_prompts" in tables:
                    prompt_columns = {column["name"] for column in inspector.get_columns("custom_prompts")}
                    
                    if "is_system" not in prompt_columns:
                        if _add_column_safely(conn, "custom_prompts", "is_system", "BOOLEAN DEFAULT 0"):
                            print("  ✓ 添加字段: custom_prompts.is_system")
                    
                    if "is_active" not in prompt_columns:
                        if _add_column_safely(conn, "custom_prompts", "is_active", "BOOLEAN DEFAULT 1"):
                            print("  ✓ 添加字段: custom_prompts.is_active")
    
    except Exception as e:
        print(f"  ⚠ 数据库迁移警告: {str(e)}")
        # 迁移失败不应该阻止应用启动
