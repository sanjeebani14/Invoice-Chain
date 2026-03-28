from __future__ import annotations

import anyio
from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import main as main_app
from app.auth.hashing import hash_password, verify_password
from app.auth.tokens import create_access_token
from app.database import get_db
from app.models import Base, PasswordResetToken, RefreshToken, User, UserRole
from app.routers import auth as auth_router
from app.services import email as email_service
from app.services import auth_service
from app.services.realtime import notification_hub

TEST_DB_URL = "sqlite:///./test_auth_wallet_realtime.db"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, expire_on_commit=False)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app = main_app.app
app.dependency_overrides[get_db] = override_get_db
main_app.SessionLocal = TestingSessionLocal
client = TestClient(app)


def setup_module(module):
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def teardown_module(module):
    Base.metadata.drop_all(bind=engine)


def _seed_user(email: str, password: str, role: UserRole = UserRole.INVESTOR) -> User:
    db = TestingSessionLocal()
    try:
        db.query(PasswordResetToken).delete()
        db.query(RefreshToken).delete()
        db.query(User).delete()
        db.commit()

        user = User(
            email=email,
            password_hash=hash_password(password),
            role=role,
            is_active=True,
            email_verified=True,
            verified_at=datetime.utcnow(),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        db.add(
            RefreshToken(
                user_id=user.id,
                token_hash=hash_password("seed-refresh-token"),
                expires_at=datetime.utcnow() + timedelta(days=7),
                is_revoked=False,
            )
        )
        db.commit()
        return user
    finally:
        db.close()


def test_password_reset_wallet_and_realtime_smoke_flow():
    user = _seed_user(email="investor-smoke@test.com", password="old_password_123")

    original_send_reset_email = email_service.send_password_reset_email
    original_token_hex = auth_service.secrets.token_hex

    email_service.send_password_reset_email = lambda *_args, **_kwargs: True
    auth_service.secrets.token_hex = lambda *args, **kwargs: "smoke-reset-token"

    try:
        forgot = client.post(
            "/auth/forgot-password",
            json={"email": user.email},
        )
        assert forgot.status_code == 200

        db = TestingSessionLocal()
        try:
            token_row = (
                db.query(PasswordResetToken)
                .filter(PasswordResetToken.user_id == user.id)
                .first()
            )
            assert token_row is not None
            assert token_row.is_used is False
        finally:
            db.close()

        reset = client.post(
            "/auth/reset-password",
            json={"token": "smoke-reset-token", "new_password": "new_password_123"},
        )
        assert reset.status_code == 200

        db = TestingSessionLocal()
        try:
            refreshed_user = db.query(User).filter(User.id == user.id).first()
            assert refreshed_user is not None
            assert verify_password("new_password_123", refreshed_user.password_hash)
            assert not verify_password("old_password_123", refreshed_user.password_hash)

            refresh_tokens = (
                db.query(RefreshToken).filter(RefreshToken.user_id == user.id).all()
            )
            assert refresh_tokens
            assert all(token.is_revoked for token in refresh_tokens)
        finally:
            db.close()

        old_login = client.post(
            "/auth/login",
            json={"email": user.email, "password": "old_password_123"},
        )
        assert old_login.status_code == 401

        new_login = client.post(
            "/auth/login",
            json={"email": user.email, "password": "new_password_123"},
        )
        assert new_login.status_code == 200

        wallet_ok = client.patch(
            "/api/v1/profile/me",
            json={"wallet_address": "0x1234567890abcdef1234567890abcdef12345678"},
        )
        assert wallet_ok.status_code == 200
        assert (
            wallet_ok.json().get("wallet_address")
            == "0x1234567890abcdef1234567890abcdef12345678"
        )

        wallet_bad = client.patch(
            "/api/v1/profile/me",
            json={"wallet_address": "not-a-wallet"},
        )
        assert wallet_bad.status_code == 400

        access_token = create_access_token(user.id)
        ws_headers = {"cookie": f"access_token={access_token}"}

        with client.websocket_connect("/ws/notifications", headers=ws_headers) as ws:
            ws.send_json({"action": "subscribe", "invoice_id": 501})
            subscribed = ws.receive_json()
            assert subscribed["event"] == "subscribed"
            assert subscribed["payload"]["invoice_id"] == 501

            anyio.run(
                notification_hub.broadcast_event,
                "auction_bid_placed",
                {"invoice_id": 501, "amount": 1200.0},
                {"investor"},
                {user.id},
                501,
            )
            evt = ws.receive_json()
            assert evt["event"] == "auction_bid_placed"
            assert evt["payload"]["invoice_id"] == 501

            ws.send_json({"action": "unsubscribe", "invoice_id": 501})
            unsubscribed = ws.receive_json()
            assert unsubscribed["event"] == "unsubscribed"
            assert unsubscribed["payload"]["invoice_id"] == 501
    finally:
        email_service.send_password_reset_email = original_send_reset_email
        auth_service.secrets.token_hex = original_token_hex
