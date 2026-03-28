from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_admin
from ..auth.hashing import hash_password
from ..database import get_db
from ..models import (
    EmailVerificationToken,
    KycSubmission,
    RefreshToken,
    User,
    UserRole,
)
from ..schemas.admin_users import (
    AdminUserCreate,
    AdminUserListResponse,
    AdminUserOut,
    AdminUserUpdate,
)

router = APIRouter()


def _quote_ident(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _cleanup_user_foreign_keys(db: Session, user_id: int) -> None:

    inspector = inspect(db.bind)
    nullify_column_names = {
        "reviewed_by",
        "resolved_by",
        "approved_by",
        "rejected_by",
        "updated_by",
        "created_by",
        "deleted_by",
    }

    for table_name in inspector.get_table_names():
        if table_name == "users":
            continue

        columns = {col["name"]: col for col in inspector.get_columns(table_name)}
        for fk in inspector.get_foreign_keys(table_name):
            referred_table = fk.get("referred_table")
            referred_columns = fk.get("referred_columns") or []
            constrained_columns = fk.get("constrained_columns") or []
            if (
                referred_table != "users"
                or referred_columns != ["id"]
                or len(constrained_columns) != 1
            ):
                continue

            fk_column = constrained_columns[0]
            column_info = columns.get(fk_column, {})
            is_nullable = bool(column_info.get("nullable", True))

            table_sql = _quote_ident(table_name)
            column_sql = _quote_ident(fk_column)

            if is_nullable and fk_column in nullify_column_names:
                db.execute(
                    text(
                        f"UPDATE {table_sql} SET {column_sql} = NULL WHERE {column_sql} = :user_id"
                    ),
                    {"user_id": user_id},
                )
            else:
                db.execute(
                    text(f"DELETE FROM {table_sql} WHERE {column_sql} = :user_id"),
                    {"user_id": user_id},
                )


@router.post("/", response_model=AdminUserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: AdminUserCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    if len(payload.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters",
        )

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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    if payload.role is None and payload.is_active is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No updates provided"
        )

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


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    if current_admin.id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account",
        )

    # Remove dependent rows first to satisfy FK constraints.
    db.query(RefreshToken).filter(RefreshToken.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(EmailVerificationToken).filter(
        EmailVerificationToken.user_id == user_id
    ).delete(synchronize_session=False)

    # KYC submissions owned by this user can be removed.
    db.query(KycSubmission).filter(KycSubmission.user_id == user_id).delete(
        synchronize_session=False
    )

    # If this user acted as reviewer, keep submissions but clear reviewer reference.
    db.query(KycSubmission).filter(KycSubmission.reviewed_by == user_id).update(
        {KycSubmission.reviewed_by: None},
        synchronize_session=False,
    )

    _cleanup_user_foreign_keys(db, user_id)

    db.delete(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        detail = "Cannot delete user because related records still exist"
        constraint_name = getattr(getattr(exc, "orig", None), "diag", None)
        constraint_name = getattr(constraint_name, "constraint_name", None)
        if constraint_name:
            detail = (
                f"Cannot delete user due to foreign key constraint: {constraint_name}"
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
        ) from exc

    return {"message": "User deleted"}
