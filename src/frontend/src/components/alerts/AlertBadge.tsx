/**
 * @file frontend/src/components/alerts/AlertBadge.tsx
 * @description Nav bar alert indicator bell icon with unread badge count.
 * Clicking opens the AlertTray popover.
 *
 * Place in RootLayout header between <HealthWidget /> and <UserNav />.
 */

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAlerts } from '@/context/alerts-context';
import { AlertTray } from './AlertTray';
import { cn } from '@/lib/utils';

export function AlertBadge() {
  const [open, setOpen] = useState(false);
  const { unreadCount } = useAlerts();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'relative h-8 w-8 rounded-full transition-colors',
            unreadCount > 0 ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
          aria-label={`Alerts${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none ring-1 ring-background">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[420px] p-0 shadow-xl border-border/70"
        sideOffset={8}
      >
        <AlertTray onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
