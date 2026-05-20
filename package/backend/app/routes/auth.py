from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import User
from app.schemas import LoginRequest, LoginResponse
from app.utils.auth import (
    create_user_token,
    generate_access_link,
    generate_card_key,
    get_user_from_token,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def ensure_user_card_key(user: User, db: Session) -> User:
    """Give username/password users a private card key for legacy endpoints."""
    if user.card_key:
        return user

    while True:
        card_key = generate_card_key()
        exists = db.query(User).filter(User.card_key == card_key).first()
        if not exists:
            break

    user.card_key = card_key
    user.access_link = generate_access_link(card_key)
    db.commit()
    db.refresh(user)
    return user


def get_current_user_from_token(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未提供认证令牌")

    token = authorization.split(" ", 1)[1]
    user_id = get_user_from_token(token)
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="令牌无效或已过期")

    user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在或已被禁用")

    user.last_used = datetime.utcnow()
    db.commit()
    return ensure_user_card_key(user, db)


@router.post("/login", response_model=LoginResponse)
async def login(data: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    user = db.query(User).filter(
        User.username == data.username,
        User.is_active.is_(True),
    ).first()

    if not user or not user.password_hash or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")

    user.last_used = datetime.utcnow()
    user = ensure_user_card_key(user, db)
    token = create_user_token(user.id, user.username or "")
    return LoginResponse(
        access_token=token,
        username=user.username or "",
        display_name=user.display_name,
        card_key=user.card_key,
    )


@router.get("/me")
async def get_current_user_info(
    current_user: User = Depends(get_current_user_from_token),
):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "display_name": current_user.display_name,
        "card_key": current_user.card_key,
        "is_active": current_user.is_active,
        "created_at": current_user.created_at,
    }
