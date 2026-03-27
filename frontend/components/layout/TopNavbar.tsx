"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Bell, RefreshCw } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { openNotificationSocket, type NotificationSocketHandle } from "@/lib/realtime";

interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  createdAt: number;
}

interface TopNavbarProps {
  autoRefresh: boolean;
  onToggleRefresh: () => void;
}

export function TopNavbar({ autoRefresh, onToggleRefresh }: TopNavbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const toNotification = (event: string, payload: Record<string, unknown>): NotificationItem => {
    const invoiceId = payload?.invoice_id ? String(payload.invoice_id) : "-";
    let title = "Platform update";
    let detail = `Event: ${event}`;

    if (event === "invoice_funded") {
      title = "Invoice funded";
      detail = `Invoice #${invoiceId} received a successful funding action.`;
    } else if (event === "auction_bid_placed") {
      title = "New auction bid";
      detail = `A bid was placed on invoice #${invoiceId}.`;
    } else if (event === "auction_outbid") {
      title = "Outbid alert";
      detail = `You were outbid on invoice #${invoiceId}.`;
    } else if (event === "auction_closed") {
      title = "Auction closed";
      detail = `Auction closed for invoice #${invoiceId}.`;
    } else if (event === "invoice_settled") {
      title = "Settlement complete";
      detail = `Invoice #${invoiceId} was settled and escrow released.`;
    } else if (event === "invoice_uploaded") {
      title = "Invoice uploaded";
      detail = `A new invoice upload was received for review.`;
    }

    return {
      id: `${event}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      title,
      detail,
      createdAt: Date.now(),
    };
  };

  useEffect(() => {
    const socket: NotificationSocketHandle = openNotificationSocket((message) => {
      const next = toNotification(message.event, message.payload || {});
      setItems((prev) => [next, ...prev].slice(0, 20));
    });

    return () => {
      socket.close();
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const orderedItems = useMemo(
    () => [...items].sort((a, b) => b.createdAt - a.createdAt),
    [items],
  );
  const unread = isOpen ? 0 : orderedItems.length;

  return (
    <header className="h-12 border-b border-border bg-card flex items-center justify-between px-4 gap-4">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search or jump to..."
            className="pl-9 w-64 h-8 text-sm"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleRefresh}
          className={autoRefresh ? "text-primary" : "text-muted-foreground"}
        >
          <RefreshCw
            className={`h-4 w-4 mr-1 ${autoRefresh ? "animate-spin" : ""}`}
            style={autoRefresh ? { animationDuration: "3s" } : {}}
          />
          <span className="hidden sm:inline text-xs">
            {autoRefresh ? "Auto" : "Paused"}
          </span>
        </Button>
        <div className="relative" ref={panelRef}>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-8 w-8"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-label="Toggle notifications"
          >
            <Bell className="h-4 w-4 text-muted-foreground" />
            {unread > 0 && (
              <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] bg-destructive text-destructive-foreground">
                {unread > 9 ? "9+" : unread}
              </Badge>
            )}
          </Button>

          {isOpen && (
            <div className="absolute right-0 top-10 z-50 w-80 rounded-md border border-border bg-popover shadow-lg">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <p className="text-sm font-semibold">Notifications</p>
                <button
                  onClick={() => setItems([])}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
              <div className="max-h-80 overflow-auto">
                {orderedItems.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-muted-foreground">No notifications yet.</p>
                ) : (
                  orderedItems.map((item) => (
                    <div key={item.id} className="border-b border-border px-3 py-2 last:border-b-0">
                      <p className="text-xs font-semibold text-foreground">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground/80">
                        {new Date(item.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <Avatar className="h-7 w-7">
          <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">
            AD
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
