"use client";
import { Search, Bell, RefreshCw } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface TopNavbarProps {
  autoRefresh: boolean;
  onToggleRefresh: () => void;
}

export function TopNavbar({ autoRefresh, onToggleRefresh }: TopNavbarProps) {
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
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-destructive text-destructive-foreground">
            3
          </Badge>
        </Button>
        <Avatar className="h-7 w-7">
          <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">
            AD
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
