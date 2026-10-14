import { useEffect, useState, useRef } from 'react';
import { Bell } from 'lucide-react';
import { subscribeNotifications, markAllNotificationsRead, toDate } from '@/integrations/firebase/firestore';
import { format } from 'date-fns';

interface Props {
  userId: string;
}

export default function NotificationBell({ userId }: Props) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeNotifications(userId, setNotifications);
    return () => unsub();
  }, [userId]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unread = notifications.filter((n) => !n.read).length;

  const handleOpen = () => {
    setOpen((v) => !v);
    if (!open && unread > 0) {
      markAllNotificationsRead(userId).catch(console.error);
    }
  };

  const typeIcon: Record<string, string> = {
    test_scheduled: '🔬',
    test_uploaded: '📤',
    appointment: '📅',
    result_reviewed: '✅',
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5 text-gray-600" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-cyan-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">Notifications</p>
            {unread > 0 && <p className="text-xs text-cyan-600">{unread} unread</p>}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {notifications.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No notifications yet</p>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 text-sm ${n.read ? 'bg-white' : 'bg-cyan-50'}`}
                >
                  <p className="font-medium text-gray-800">
                    {typeIcon[n.type] ?? '📌'} {n.title}
                  </p>
                  <p className="text-gray-500 text-xs mt-0.5">{n.message}</p>
                  <p className="text-gray-400 text-[10px] mt-1">
                    {format(toDate(n.createdAt), 'MMM d · h:mm a')}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
