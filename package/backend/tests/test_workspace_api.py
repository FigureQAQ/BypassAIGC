from datetime import datetime, timedelta
from functools import partial

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from openai import AsyncOpenAI
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.models import OptimizationSession, User
from app.routes.optimization import router as optimization_router
from app.word_formatter import routes as formatter


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    app = FastAPI()
    app.include_router(optimization_router)
    app.include_router(formatter.router)

    def test_db():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = test_db
    with Session(engine) as db:
        user = User(card_key="test-user")
        db.add(user)
        db.flush()
        started_at = datetime.utcnow() - timedelta(minutes=3)
        db.add_all(
            OptimizationSession(
                user_id=user.id,
                session_id=status,
                original_text="Example",
                status=status,
                current_stage="polish",
                created_at=started_at,
                completed_at=started_at + timedelta(seconds=42.5) if status == "completed" else None,
            )
            for status in ("queued", "processing", "completed", "failed", "stopped")
        )
        db.commit()
    with TestClient(app) as test_client:
        test_client.params = {"card_key": "test-user"}
        yield test_client
    engine.dispose()


def test_elapsed_time_in_history_details_and_progress(client):
    history = client.get("/optimization/sessions")
    assert history.status_code == 200
    elapsed_by_status = {row["status"]: row["elapsed_seconds"] for row in history.json()}
    assert elapsed_by_status.keys() == {"queued", "processing", "completed", "failed", "stopped"}
    for status, elapsed in elapsed_by_status.items():
        base = f"/optimization/sessions/{status}"
        detail = client.get(base)
        progress = client.get(f"{base}/progress")
        assert detail.status_code == progress.status_code == 200
        values = (elapsed, detail.json()["elapsed_seconds"], progress.json()["elapsed_seconds"])
        if status in {"queued", "processing"}:
            assert 180 <= values[0] <= values[1] <= values[2]
        else:
            expected = 42.5 if status == "completed" else None
            assert values == (expected, expected, expected)


@pytest.mark.parametrize("upstream_status, expected_status", [(200, 200), (401, 401), (500, 502)])
def test_model_listing_uses_configured_provider_and_handles_errors(
    client, monkeypatch, upstream_status, expected_status
):
    def upstream(request):
        assert str(request.url) == "https://models.example.com/v1/models"
        assert request.headers["Authorization"] == "Bearer example-credential"
        if upstream_status != 200:
            return httpx.Response(upstream_status, json={"error": {"message": "example-credential"}})
        return httpx.Response(200, json={"object": "list", "data": [
            {"id": name, "created": 0, "object": "model", "owned_by": "example"}
            for name in ("beta", "alpha", "beta")
        ]})

    upstream_client = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
    monkeypatch.setattr(formatter, "AsyncOpenAI", partial(AsyncOpenAI, http_client=upstream_client))
    response = client.post("/word-formatter/preprocess/models", json={
        "api_key": "example-credential",
        "base_url": "https://models.example.com/v1",
    })
    assert upstream_client.is_closed
    assert response.status_code == expected_status
    if expected_status == 200:
        assert response.json() == ["alpha", "beta"]
    assert "example-credential" not in response.text
