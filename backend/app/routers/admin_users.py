from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_admin
from ..auth.hashing import hash_password
from ..database import get_db
from ..models import User, UserRole
from ..schemas.admin_users import (
    AdminUserCreate,
    AdminUserListResponse,
    AdminUserOut,
    AdminUserUpdate,
)

router = APIRouter(prefix="/api/v1/admin/users", tags=["Admin - Users"])


@router.post("/", response_model=AdminUserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: AdminUserCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    if len(payload.password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters")

    new_user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        is_active=payload.is_active,
        email_verified=payload.email_verified,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return AdminUserOut.from_orm(new_user)


@router.get("/", response_model=AdminUserListResponse)
def list_users(
    role: UserRole | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    query = db.query(User)

    if role is not None:
        # Include legacy SME rows when filtering for SELLER.
        if role == UserRole.SELLER:
            query = query.filter(User.role.in_([UserRole.SELLER, UserRole.SME]))
        else:
            query = query.filter(User.role == role)

    if is_active is not None:
        query = query.filter(User.is_active == is_active)

    users = query.order_by(User.created_at.desc()).all()
    return {"users": [AdminUserOut.from_orm(user) for user in users]}


@router.patch("/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: int,
    payload: AdminUserUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if payload.role is None and payload.is_active is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No updates provided")

    if payload.role is not None:
        user.role = payload.role

    if payload.is_active is not None:
        if current_admin.id == user.id and payload.is_active is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot deactivate your own account",
            )
        user.is_active = payload.is_active

    if current_admin.id == user.id and user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove your own admin role",
        )

    db.add(user)
    db.commit()
    db.refresh(user)

    return AdminUserOut.from_orm(user)
