import asyncio
import threading
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.services.concurrency import ConcurrencyManager
from app.services.stream_manager import StreamManager
from app.word_formatter.services.job_manager import JobManager, JobStatus


class ConcurrencyManagerTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancelled_waiter_is_removed_from_queue(self):
        manager = ConcurrencyManager(max_concurrent=1)
        await manager.acquire("active", user_id=1)

        waiting_task = asyncio.create_task(
            manager.acquire("waiting", user_id=2, timeout=30)
        )
        await asyncio.sleep(0)
        self.assertIn("waiting", manager.queue)

        waiting_task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await waiting_task

        self.assertNotIn("waiting", manager.queue)
        self.assertNotIn("waiting", manager._queued_session_user)
        await manager.release("active")


class StreamManagerTests(unittest.IsolatedAsyncioTestCase):
    async def test_slow_connection_keeps_only_latest_messages(self):
        manager = StreamManager(queue_max_size=2)
        queue = await manager.connect("session")

        await manager.broadcast("session", {"type": "content", "value": 1})
        await manager.broadcast("session", {"type": "content", "value": 2})
        await manager.broadcast("session", {"type": "content", "value": 3})

        self.assertEqual(queue.qsize(), 2)
        first = queue.get_nowait()
        second = queue.get_nowait()
        self.assertIn('"value": 2', first)
        self.assertIn('"value": 3', second)

        await manager.disconnect("session", queue)
        self.assertNotIn("session", manager.connections)


class JobManagerTests(unittest.IsolatedAsyncioTestCase):
    async def test_format_job_does_not_block_event_loop(self):
        manager = JobManager(max_concurrent_jobs=1)
        job = manager.create_job(input_text="test")
        started = threading.Event()

        def fake_compile(*_args):
            started.set()
            time.sleep(0.1)
            return SimpleNamespace(success=True, docx_bytes=b"docx", error=None)

        with patch(
            "app.word_formatter.services.job_manager.compile_document",
            side_effect=fake_compile,
        ):
            task = asyncio.create_task(manager.run_job(job.job_id))
            await asyncio.wait_for(asyncio.to_thread(started.wait), timeout=1)
            await asyncio.sleep(0.01)
            self.assertFalse(task.done())
            await task

        self.assertEqual(job.status, JobStatus.COMPLETED)

    async def test_cancelled_job_stays_cancelled(self):
        manager = JobManager(max_concurrent_jobs=1)
        job = manager.create_job(input_text="test")
        started = threading.Event()

        def fake_compile(*_args):
            started.set()
            time.sleep(0.1)
            return SimpleNamespace(success=True, docx_bytes=b"docx", error=None)

        with patch(
            "app.word_formatter.services.job_manager.compile_document",
            side_effect=fake_compile,
        ):
            task = asyncio.create_task(manager.run_job(job.job_id))
            await asyncio.wait_for(asyncio.to_thread(started.wait), timeout=1)
            self.assertTrue(await manager.cancel_job(job.job_id))
            with self.assertRaises(asyncio.CancelledError):
                await task

        self.assertEqual(job.status, JobStatus.CANCELLED)
        self.assertNotIn(job.job_id, manager._running_tasks)

    async def test_cleanup_loop_is_idempotent_and_stops_cleanly(self):
        manager = JobManager()
        await manager.start_cleanup_loop(interval_hours=1)
        cleanup_task = manager._cleanup_task
        await manager.start_cleanup_loop(interval_hours=1)

        self.assertIs(manager._cleanup_task, cleanup_task)
        await manager.shutdown()
        self.assertIsNone(manager._cleanup_task)
        self.assertTrue(cleanup_task.done())


if __name__ == "__main__":
    unittest.main()
