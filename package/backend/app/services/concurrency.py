import asyncio
from time import monotonic
from typing import Dict, List, Optional
from datetime import datetime, timezone
from app.config import settings

# 等待并发权限的最大超时时间（秒）
ACQUIRE_TIMEOUT = 3600  # 1小时


class ConcurrencyManager:
    """并发控制管理器"""
    
    def __init__(self, max_concurrent: int = None):
        self.max_concurrent = max_concurrent or settings.MAX_CONCURRENT_USERS
        self.max_per_user = max(1, settings.MAX_CONCURRENT_PER_USER)
        self.active_sessions: Dict[str, datetime] = {}
        self.active_per_user: Dict[int, int] = {}
        self._session_user: Dict[str, int] = {}
        self._queued_session_user: Dict[str, Optional[int]] = {}
        self.queue: List[str] = []
        self._lock = asyncio.Lock()
        self._condition = asyncio.Condition(self._lock)  # 添加条件变量
    
    async def acquire(self, session_id: str, user_id: Optional[int] = None, timeout: float = ACQUIRE_TIMEOUT) -> bool:
        """获取执行权限
        
        Args:
            session_id: 会话ID
            user_id: 用户ID，用于限制单个用户的并发任务数
            timeout: 等待超时时间（秒），默认1小时
            
        Returns:
            True if acquired, False if timed out or removed from queue
        """
        async with self._condition:
            # 如果已经在活跃会话中,直接返回
            if session_id in self.active_sessions:
                return True
            
            if self._can_acquire_locked(user_id):
                self.active_sessions[session_id] = datetime.now(timezone.utc)
                self._track_user_locked(session_id, user_id)
                return True

            if session_id not in self.queue:
                self.queue.append(session_id)
                self._queued_session_user[session_id] = user_id
            
            # 等待被唤醒，设置超时防止无限等待
            start_time = monotonic()
            try:
                while session_id not in self.active_sessions and session_id in self.queue:
                    # 使用 wait_for 设置超时
                    remaining_timeout = timeout - (monotonic() - start_time)
                    if remaining_timeout <= 0:
                        self._remove_queued_locked(session_id)
                        return False
                    try:
                        await asyncio.wait_for(
                            self._condition.wait(),
                            timeout=min(remaining_timeout, 60),
                        )
                    except asyncio.TimeoutError:
                        continue
            except asyncio.CancelledError:
                self._remove_queued_locked(session_id)
                self._activate_waiting_locked()
                self._condition.notify_all()
                raise
            
            return session_id in self.active_sessions
    
    async def release(self, session_id: str):
        """释放执行权限"""
        async with self._condition:
            user_id = self._session_user.pop(session_id, None)
            if user_id is not None:
                count = self.active_per_user.get(user_id, 0) - 1
                if count <= 0:
                    self.active_per_user.pop(user_id, None)
                else:
                    self.active_per_user[user_id] = count
            if session_id in self.active_sessions:
                del self.active_sessions[session_id]
            self._remove_queued_locked(session_id)
            self._activate_waiting_locked()
            self._condition.notify_all()  # 唤醒所有等待者
    
    async def get_status(self, session_id: Optional[str] = None) -> Dict:
        """获取队列状态"""
        async with self._lock:
            current_users = len(self.active_sessions)
            queue_list = list(self.queue)
            
            status = {
                "current_users": current_users,
                "max_users": self.max_concurrent,
                "queue_length": len(queue_list),
                "your_position": None,
                "estimated_wait_time": None
            }
            
            if session_id and session_id in queue_list:
                position = queue_list.index(session_id) + 1
                status["your_position"] = position
                # 估算等待时间(假设每个任务平均5分钟)
                status["estimated_wait_time"] = position * 300
            
            return status
    
    def is_active(self, session_id: str) -> bool:
        """检查会话是否活跃"""
        return session_id in self.active_sessions
    
    def get_active_count(self) -> int:
        """获取活跃会话数量"""
        return len(self.active_sessions)

    async def update_limit(self, new_limit: int):
        """更新并发限制"""
        async with self._condition:
            self.max_concurrent = max(1, new_limit)
            self._activate_waiting_locked()
            self._condition.notify_all()  # 唤醒所有等待者以检查新的限制

    async def update_per_user_limit(self, new_limit: int):
        """更新单用户并发限制"""
        async with self._condition:
            self.max_per_user = max(1, new_limit)
            self._activate_waiting_locked()
            self._condition.notify_all()

    def _can_acquire_locked(self, user_id: Optional[int]) -> bool:
        if len(self.active_sessions) >= self.max_concurrent:
            return False
        if user_id is None:
            return True
        return self.active_per_user.get(user_id, 0) < self.max_per_user

    def _track_user_locked(self, session_id: str, user_id: Optional[int]):
        self._queued_session_user.pop(session_id, None)
        if user_id is None:
            return
        self._session_user[session_id] = user_id
        self.active_per_user[user_id] = self.active_per_user.get(user_id, 0) + 1

    def _remove_queued_locked(self, session_id: str):
        if session_id in self.queue:
            self.queue.remove(session_id)
        self._queued_session_user.pop(session_id, None)

    def _activate_waiting_locked(self):
        """尝试为等待队列中的会话分配执行权限 (需持有锁)"""
        for next_session in list(self.queue):
            if len(self.active_sessions) >= self.max_concurrent:
                break
            user_id = self._queued_session_user.get(next_session)
            if not self._can_acquire_locked(user_id):
                continue
            self.queue.remove(next_session)
            self.active_sessions[next_session] = datetime.now(timezone.utc)
            self._track_user_locked(next_session, user_id)


# 全局并发管理器实例
concurrency_manager = ConcurrencyManager()
