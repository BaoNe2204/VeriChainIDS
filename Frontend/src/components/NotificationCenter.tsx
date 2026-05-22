import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell, Check, CheckCheck, Trash2, RefreshCw, ChevronLeft, ChevronRight,
  AlertTriangle, Ticket, Server, Shield, Info, ExternalLink
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';
import { NotificationsApi } from '../services/api';
import { formatRelativeNotification } from '../utils/dateUtils';

const PAGE_SIZE = 20;

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  Ticket:  { icon: <Ticket size={12} />, color: 'text-purple-400 bg-purple-500/10', label: 'Ticket' },
  Alert:   { icon: <AlertTriangle size={12} />, color: 'text-rose-400 bg-rose-500/10', label: 'Cảnh báo' },
  Server:  { icon: <Server size={12} />, color: 'text-blue-400 bg-blue-500/10', label: 'Server' },
  Security:{ icon: <Shield size={12} />, color: 'text-amber-400 bg-amber-500/10', label: 'Bảo mật' },
};

function typeConfig(type: string) {
  return TYPE_CONFIG[type] ?? { icon: <Info size={12} />, color: 'text-slate-400 bg-slate-500/10', label: type };
}

interface NotificationCenterProps {
  theme: Theme;
}

export const NotificationCenter = ({ theme }: NotificationCenterProps) => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filterRead, setFilterRead] = useState<string>(''); // '' | 'true' | 'false'
  const [filterType, setFilterType] = useState('');

  const load = useCallback(async (pageNum = 1) => {
    setLoading(true); setError(null);
    try {
      const [dataRes, countRes] = await Promise.all([
        NotificationsApi.getNotifications(pageNum, PAGE_SIZE, filterRead ? filterRead === 'true' : undefined, filterType || undefined),
        NotificationsApi.getUnreadCount(),
      ]);
      if (dataRes) {
        setNotifications(dataRes.items);
        setPage(dataRes.page);
        setTotalPages(dataRes.totalPages);
        setTotalCount(dataRes.totalCount);
      } else {
        setError('Không tải được thông báo.');
      }
      setUnreadCount(countRes);
    } catch { setError('Lỗi kết nối'); }
    finally { setLoading(false); }
  }, [filterRead, filterType]);

  useEffect(() => { load(1); }, [load]);

  const handleMarkRead = async (id: string) => {
    await NotificationsApi.markAsRead(id);
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, isRead: true } : n));
    setUnreadCount(c => Math.max(0, c - 1));
  };

  const handleMarkAllRead = async () => {
    await NotificationsApi.markAllAsRead();
    setNotifications(ns => ns.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const handleDelete = async (id: string) => {
    await NotificationsApi.deleteNotification(id);
    setNotifications(ns => ns.filter(n => n.id !== id));
  };

  const handleClearRead = async () => {
    await NotificationsApi.clearRead();
    setNotifications(ns => ns.filter(n => !n.isRead));
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h2 className={cn('text-2xl font-bold', theme === 'dark' ? 'text-white' : 'text-slate-900')}>Thông báo</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            {unreadCount > 0 ? `${unreadCount} chưa đọc / ${totalCount} tổng` : `${totalCount} thông báo`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {unreadCount > 0 && (
            <button onClick={handleMarkAllRead}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all">
              <CheckCheck size={14} /> Đánh dấu tất cả đã đọc
            </button>
          )}
          <button onClick={handleClearRead}
            className={cn('p-2.5 rounded-lg border transition-all text-xs font-medium', theme === 'dark' ? 'border-slate-700 hover:bg-slate-800 text-slate-400' : 'border-slate-200 hover:bg-slate-100 text-slate-600')}>
            <Trash2 size={14} />
          </button>
          <button onClick={() => load(page)} className={cn('p-2.5 rounded-lg border transition-all', theme === 'dark' ? 'border-slate-700 hover:bg-slate-800 text-slate-400' : 'border-slate-200 hover:bg-slate-100 text-slate-600')}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className={cn('rounded-xl border p-4 flex flex-wrap gap-3 items-center', theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm')}>
        <span className="text-xs font-bold text-slate-500 uppercase shrink-0">Lọc:</span>
        <select value={filterRead} onChange={e => { setFilterRead(e.target.value); setPage(1); }}
          className={cn('px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/50',
            theme === 'dark' ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900')}>
          <option value="">Tất cả</option>
          <option value="false">Chưa đọc</option>
          <option value="true">Đã đọc</option>
        </select>
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}
          className={cn('px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/50',
            theme === 'dark' ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900')}>
          <option value="">Tất cả loại</option>
          <option value="Ticket">Ticket</option>
          <option value="Alert">Cảnh báo</option>
          <option value="Server">Server</option>
          <option value="Security">Bảo mật</option>
        </select>
      </div>

      {/* Error */}
      {error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-rose-500 text-sm">{error}</div>}

      {/* Notification list */}
      <div className={cn('rounded-xl border overflow-hidden', theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm')}>
        <div className="divide-y divide-inherit">
          {loading ? (
            <div className="px-5 py-14 text-center text-slate-500">
              <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
              <p className="text-sm">Đang tải thông báo…</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <Bell size={28} className="mx-auto mb-2 text-slate-600" />
              <p className={cn('font-medium', theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                {filterRead || filterType ? 'Không có thông báo phù hợp' : 'Chưa có thông báo nào'}
              </p>
            </div>
          ) : (
            notifications.map(n => {
              const tc = typeConfig(n.type);
              return (
                <div key={n.id} className={cn(
                  'flex items-start gap-3 px-5 py-4 transition-colors group',
                  n.isRead
                    ? theme === 'dark' ? 'bg-transparent hover:bg-slate-800/20' : 'bg-transparent hover:bg-slate-50'
                    : theme === 'dark' ? 'bg-blue-500/5 hover:bg-blue-500/8' : 'bg-blue-50/50 hover:bg-blue-50',
                )}>
                  {/* Icon */}
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5', tc.color)}>
                    {tc.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn('text-sm font-semibold leading-snug', n.isRead
                        ? theme === 'dark' ? 'text-slate-400' : 'text-slate-600'
                        : theme === 'dark' ? 'text-white' : 'text-slate-900')}>
                        {n.title}
                      </p>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap shrink-0">{formatRelativeNotification(n.createdAt)}</span>
                    </div>
                    <p className={cn('text-xs mt-0.5 leading-relaxed', theme === 'dark' ? 'text-slate-400' : 'text-slate-600')}>
                      {n.message}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', tc.color)}>{tc.label}</span>
                      {!n.isRead && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {n.isRead ? null : (
                      <button onClick={() => handleMarkRead(n.id)}
                        className={cn('p-1.5 rounded-lg border text-xs transition-all hover:bg-slate-800',
                          theme === 'dark' ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500')}>
                        <Check size={13} />
                      </button>
                    )}
                    {n.link && (
                      <a href={n.link} target="_blank" rel="noopener noreferrer"
                        className={cn('p-1.5 rounded-lg border text-xs transition-all hover:bg-slate-800',
                          theme === 'dark' ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500')}>
                        <ExternalLink size={13} />
                      </a>
                    )}
                    <button onClick={() => handleDelete(n.id)}
                      className={cn('p-1.5 rounded-lg border text-xs transition-all hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-400',
                        theme === 'dark' ? 'border-slate-700 text-slate-500' : 'border-slate-200 text-slate-400')}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className={cn('flex items-center justify-between px-5 py-3 border-t', theme === 'dark' ? 'border-slate-800' : 'border-slate-100')}>
            <p className="text-xs text-slate-500">Hiển thị {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCount)} / {totalCount.toLocaleString('vi-VN')}</p>
            <div className="flex gap-1">
              <button onClick={() => { setPage(p => Math.max(1, p - 1)); load(page - 1); }} disabled={page <= 1}
                className={cn('p-1.5 rounded-lg border transition-all disabled:opacity-30', theme === 'dark' ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-600')}>
                <ChevronLeft size={15} />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let p: number;
                if (totalPages <= 7) p = i + 1;
                else if (page <= 4) p = i === 6 ? totalPages : i + 1;
                else if (page >= totalPages - 3) p = i === 0 ? 1 : totalPages - 6 + i;
                else p = i === 0 ? 1 : i === 6 ? totalPages : page - 3 + i;
                return (
                  <button key={p} onClick={() => { setPage(p); load(p); }}
                    className={cn('w-8 h-8 text-xs rounded-lg border transition-all',
                      page === p ? 'bg-blue-600 border-blue-600 text-white font-bold'
                        : theme === 'dark' ? 'border-slate-700 hover:bg-slate-800 text-slate-400' : 'border-slate-200 hover:bg-slate-100 text-slate-600')}>
                    {p}
                  </button>
                );
              })}
              <button onClick={() => { setPage(p => Math.min(totalPages, p + 1)); load(page + 1); }} disabled={page >= totalPages}
                className={cn('p-1.5 rounded-lg border transition-all disabled:opacity-30', theme === 'dark' ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-600')}>
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationCenter;
