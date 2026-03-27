import { getBackendOrigin } from "@/lib/backendOrigin";

export interface RealtimeMessage {
  event: string;
  payload: Record<string, unknown>;
}

export interface NotificationSocketHandle {
  close: () => void;
  subscribeInvoice: (invoiceId: number) => void;
  unsubscribeInvoice: (invoiceId: number) => void;
}

export function buildNotificationWsUrl(): string {
  const origin = getBackendOrigin();
  const wsBase = origin.startsWith("https://")
    ? origin.replace("https://", "wss://")
    : origin.replace("http://", "ws://");
  return `${wsBase}/ws/notifications`;
}

export function openNotificationSocket(
  onMessage: (message: RealtimeMessage) => void,
): NotificationSocketHandle {
  let ws: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let reconnectAttempt = 0;
  let closedManually = false;
  const pendingSubscriptions = new Set<number>();

  const sendJson = (payload: Record<string, unknown>) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  const connect = () => {
    ws = new WebSocket(buildNotificationWsUrl());

    ws.onopen = () => {
      reconnectAttempt = 0;
      for (const invoiceId of pendingSubscriptions) {
        sendJson({ action: "subscribe", invoice_id: invoiceId });
      }
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as RealtimeMessage;
        if (parsed?.event) {
          onMessage(parsed);
        }
      } catch {
        // Ignore malformed notification frames.
      }
    };

    ws.onclose = () => {
      if (closedManually) return;
      const baseDelay = Math.min(1000 * (2 ** reconnectAttempt), 15000);
      const jitter = Math.floor(Math.random() * 250);
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(connect, baseDelay + jitter);
    };
  };

  connect();

  const heartbeat = window.setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      sendJson({ action: "ping" });
    }
  }, 25000);

  return {
    subscribeInvoice: (invoiceId: number) => {
      pendingSubscriptions.add(invoiceId);
      sendJson({ action: "subscribe", invoice_id: invoiceId });
    },
    unsubscribeInvoice: (invoiceId: number) => {
      pendingSubscriptions.delete(invoiceId);
      sendJson({ action: "unsubscribe", invoice_id: invoiceId });
    },
    close: () => {
      closedManually = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      window.clearInterval(heartbeat);
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    },
  };
}
