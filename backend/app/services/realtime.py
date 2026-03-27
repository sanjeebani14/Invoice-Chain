import anyio
from dataclasses import dataclass
from fastapi import WebSocket
from typing import Optional


@dataclass
class ConnectionMeta:
    user_id: int
    role: str


class NotificationHub:
    def __init__(self) -> None:
        self.connections: set[WebSocket] = set()
        self.connection_meta: dict[WebSocket, ConnectionMeta] = {}
        self.invoice_rooms: dict[int, set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int, role: str) -> None:
        await websocket.accept()
        self.connections.add(websocket)
        self.connection_meta[websocket] = ConnectionMeta(user_id=user_id, role=role)

    def disconnect(self, websocket: WebSocket) -> None:
        self.connections.discard(websocket)
        self.connection_meta.pop(websocket, None)
        for members in self.invoice_rooms.values():
            members.discard(websocket)

    def subscribe_invoice(self, websocket: WebSocket, invoice_id: int) -> None:
        if websocket not in self.connections:
            return
        self.invoice_rooms.setdefault(invoice_id, set()).add(websocket)

    def unsubscribe_invoice(self, websocket: WebSocket, invoice_id: int) -> None:
        if invoice_id in self.invoice_rooms:
            self.invoice_rooms[invoice_id].discard(websocket)
            if not self.invoice_rooms[invoice_id]:
                self.invoice_rooms.pop(invoice_id, None)

    async def broadcast_event(
        self,
        event_type: str,
        payload: dict,
        roles: Optional[set[str]] = None,
        user_ids: Optional[set[int]] = None,
        invoice_id: Optional[int] = None,
    ) -> None:
        if not self.connections:
            return

        message = {"event": event_type, "payload": payload}
        stale: list[WebSocket] = []
        if invoice_id is not None:
            room_targets = set(self.invoice_rooms.get(invoice_id, set()))
            user_targets: set[WebSocket] = set()
            if user_ids is not None:
                for connection, meta in self.connection_meta.items():
                    if meta.user_id in user_ids:
                        user_targets.add(connection)
            targets = list(room_targets | user_targets)
        else:
            targets = list(self.connections)

        for connection in targets:
            meta = self.connection_meta.get(connection)
            if meta is None:
                stale.append(connection)
                continue

            role_match = roles is None or meta.role in roles
            user_match = user_ids is None or meta.user_id in user_ids
            if roles is not None and user_ids is not None:
                if not (meta.role in roles or meta.user_id in user_ids):
                    continue
            else:
                if not (role_match and user_match):
                    continue

            try:
                await connection.send_json(message)
            except Exception:
                stale.append(connection)

        for dead in stale:
            self.disconnect(dead)

    def broadcast_from_sync(
        self,
        event_type: str,
        payload: dict,
        roles: Optional[set[str]] = None,
        user_ids: Optional[set[int]] = None,
        invoice_id: Optional[int] = None,
    ) -> None:
        try:
            anyio.from_thread.run(
                self.broadcast_event,
                event_type,
                payload,
                roles,
                user_ids,
                invoice_id,
            )
        except Exception:
            return


notification_hub = NotificationHub()
