from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.auth.tokens import decode_token
from app.database import SessionLocal
from app.models import User
from app.services.realtime import notification_hub

router = APIRouter()

@router.websocket("/ws/notifications")
async def notifications_ws(websocket: WebSocket):
    access_token = websocket.cookies.get("access_token")
    if not access_token:
        await websocket.close(code=1008)
        return

    try:
        payload = decode_token(access_token)
        if payload.get("type") != "access":
            await websocket.close(code=1008)
            return
        user_id = int(payload.get("user_id"))
    except Exception:
        await websocket.close(code=1008)
        return

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    finally:
        db.close()

    if not user:
        await websocket.close(code=1008)
        return

    await notification_hub.connect(websocket, user_id=user.id, role=str(user.role.value))
    try:
        while True:
            payload = await websocket.receive_json()
            action = str(payload.get("action") or "").lower()
            invoice_id_raw = payload.get("invoice_id")

            if action == "ping":
                await websocket.send_json({"event": "pong", "payload": {}})
                continue

            if action in {"subscribe", "unsubscribe"}:
                try:
                    invoice_id = int(invoice_id_raw)
                except (TypeError, ValueError):
                    await websocket.send_json(
                        {
                            "event": "error",
                            "payload": {"message": "invoice_id must be a valid integer"},
                        }
                    )
                    continue

                if action == "subscribe":
                    notification_hub.subscribe_invoice(websocket, invoice_id)
                    await websocket.send_json(
                        {
                            "event": "subscribed",
                            "payload": {"invoice_id": invoice_id},
                        }
                    )
                else:
                    notification_hub.unsubscribe_invoice(websocket, invoice_id)
                    await websocket.send_json(
                        {
                            "event": "unsubscribed",
                            "payload": {"invoice_id": invoice_id},
                        }
                    )
                continue

            await websocket.send_json(
                {
                    "event": "error",
                    "payload": {"message": "Unknown websocket action"},
                }
            )
    except WebSocketDisconnect:
        notification_hub.disconnect(websocket)
    except Exception:
        notification_hub.disconnect(websocket)
