import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Terminal, RefreshCw, Download, Filter, ChevronLeft, ChevronRight,
  Shield, User, Server, AlertTriangle, CreditCard, Settings, Search,
  X, Activity, BarChart3, Clock, ShieldCheck, Plus, Trash2, Edit, Wifi,
  Zap, ArrowUp, ArrowDown, TrendingUp, Eye, ToggleLeft, ToggleRight
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';
import { AuditLogsApi, type AuditLogEntry } from '../services/api';
import { formatDateOnlyVi, formatDateTime, formatTimestampRelativeAbsolute } from '../utils/dateUtils';
import { createSignalRConnection } from '../services/api';

const PAGE_SIZE = 25;
const AUTO_REFRESH_INTERVAL = 30000; // 30s

const ACTION_CATEGORIES: { label: string; actions: string[] }[] = [
  { label: 'Xác thực',      actions: ['LOGIN','LOGOUT','LOGIN_FAILED','PASSWORD_CHANGED','PASSWORD_RESET','TWO_FA_ENABLED','TWO_FA_DISABLED'] },
  { label: 'Người dùng',    actions: ['USER_CREATED','USER_UPDATED','USER_DELETED','USER_ROLE_CHANGED'] },
  { label: 'Server',         actions: ['SERVER_ADDED','SERVER_UPDATED','SERVER_DELETED','API_KEY_CREATED','API_KEY_REVOKED','API_KEY_REGENERATED'] },
  { label: 'Cảnh báo',       actions: ['ALERT_TRIGGERED','ALERT_ACKNOWLEDGED','ALERT_RESOLVED','ALERT_DELETED'] },
  { label: 'Block IP',       actions: ['AUTO_BLOCKED','MANUAL_BLOCK','IP_UNBLOCKED','RATE_LIMIT_BLOCKED'] },
  { label: 'Whitelist',      actions: ['WHITELIST_ADDED','WHITELIST_REMOVED'] },
  { label: 'Ticket',         actions: ['TICKET_CREATED','TICKET_STATUS_CHANGED','TICKET_ASSIGNED','TICKET_COMMENT_ADDED'] },
  { label: 'Thanh toán',     actions: ['PAYMENT_INITIATED','PAYMENT_COMPLETED','PAYMENT_FAILED'] },
  { label: 'Gói cước',       actions: ['TRIAL_SUBSCRIPTION_CREATED','SUBSCRIPTION_CREATED','SUBSCRIPTION_UPDATED','SUBSCRIPTION_CANCELLED'] },
  { label: 'Khác',           actions: ['SETTINGS_UPDATED','DEFENSE_TRIGGERED','NOTIFICATION_SENT'] },
];

function getActionCategory(action: string): string {
  for (const cat of ACTION_CATEGORIES) {
    if (cat.actions.some(a => action.toUpperCase().includes(a))) return cat.label;
  }
  return 'Khác';
}

function getActionColor(action: string): { bg: string; text: string; border: string; dot: string } {
  const a = action.toUpperCase();
  if (a.includes('FAILED') || a.includes('DELETED') || a.includes('ERROR'))
    return { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20', dot: 'bg-rose-500' };
  if (a.includes('CREATED') || a.includes('ADDED') || a.includes('LOGIN') || a.includes('TRIGGERED'))
    return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', dot: 'bg-emerald-500' };
  if (a.includes('UPDATED') || a.includes('CHANGED'))
    return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', dot: 'bg-amber-500' };
  if (a.includes('BLOCKED'))
    return { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20', dot: 'bg-orange-500' };
  if (a.includes('ACKNOWLEDGED') || a.includes('RESOLVED'))
    return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', dot: 'bg-blue-500' };
  return { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20', dot: 'bg-slate-500' };
}

function getActionIcon(action: string): React.ReactNode {
  const a = action.toUpperCase();
  if (a.includes('LOGIN')) return <Wifi size={11} />;
  if (a.includes('USER')) return <User size={11} />;
  if (a.includes('SERVER') || a.includes('API_KEY')) return <Server size={11} />;
  if (a.includes('ALERT') || a.includes('BLOCKED')) return <Shield size={11} />;
  if (a.includes('WHITELIST')) return <ShieldCheck size={11} />;
  if (a.includes('PAYMENT') || a.includes('SUBSCRIPTION')) return <CreditCard size={11} />;
  if (a.includes('TICKET')) return <Plus size={11} />;
  if (a.includes('DELETED')) return <Trash2 size={11} />;
  if (a.includes('UPDATED') || a.includes('CHANGED')) return <Edit size={11} />;
  return <Activity size={11} />;
}

const ENTITY_ICONS: Record<string, React.ReactNode> = {
  User: <User size={12} />,
  Server: <Server size={12} />,
  Alert: <AlertTriangle size={12} />,
  BlockedIP: <Shield size={12} />,
  Payment: <CreditCard size={12} />,
  Subscription: <CreditCard size={12} />,
  Settings: <Settings size={12} />,
  Ticket: <Plus size={12} />,
  Whitelist: <ShieldCheck size={12} />,
  TrafficLog: <Activity size={12} />,
};

interface SystemLogsProps {
  theme: Theme;
  t: any;
}

interface AuditStat {
  action: string;
  count: number;
}

interface TimelinePoint {
  Date: string;
  Count: number;
}

interface TopUser {
  UserId: string;
  UserName: string;
  Email: string;
  ActionCount: number;
}

export const SystemLogs = ({ theme, t }: SystemLogsProps) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [stats, setStats] = useState<AuditStat[]>([]);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** API trả 403 — khác với “chưa có log” */
  const [auditAccessDenied, setAuditAccessDenied] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [selectedEntity, setSelectedEntity] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [daysRange, setDaysRange] = useState(7);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [newLogsCount, setNewLogsCount] = useState(0);
  const [viewMode, setViewMode] = useState<'table' | 'timeline'>('table');
  const [exporting, setExporting] = useState(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastLoadTime = useRef<string>(new Date().toISOString());

  // Load stats
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [statsRes, timelineRes, topUsersRes] = await Promise.allSettled([
        AuditLogsApi.getStats(daysRange),
        AuditLogsApi.getTimeline(daysRange),
        AuditLogsApi.getTopUsers(daysRange, 5),
      ]);

      const denied = [statsRes, timelineRes, topUsersRes].some(
        (r) =>
          r.status === 'fulfilled' &&
          !r.value.success &&
          r.value.httpStatus === 403
      );
      if (denied) setAuditAccessDenied(true);

      if (statsRes.status === 'fulfilled' && statsRes.value.success) {
        setStats(statsRes.value.data as AuditStat[]);
      }
      if (timelineRes.status === 'fulfilled' && timelineRes.value.success) {
        setTimeline(timelineRes.value.data as TimelinePoint[]);
      }
      if (topUsersRes.status === 'fulfilled' && topUsersRes.value.success) {
        setTopUsers(topUsersRes.value.data as TopUser[]);
      }
    } catch { /* silent */ } finally {
      setStatsLoading(false);
    }
  }, [daysRange]);

  // Load logs
  const loadLogs = useCallback(async (pageNum = 1) => {
    setLoading(true);
    setError(null);
    try {
      const filters: Parameters<typeof AuditLogsApi.getAll>[2] = {};
      if (selectedAction) filters.action = selectedAction;
      if (selectedEntity) filters.entityType = selectedEntity;
      if (dateFrom) filters.fromDate = dateFrom;
      if (dateTo) filters.toDate = dateTo;

      const res = await AuditLogsApi.getAll(pageNum, PAGE_SIZE, filters);
      if (res.success && res.data) {
        setAuditAccessDenied(false);
        setLogs(res.data.items ?? []);
        setPage(res.data.page);
        setTotalPages(res.data.totalPages);
        setTotalCount(res.data.totalCount);
        lastLoadTime.current = new Date().toISOString();
        return;
      }

      if (res.httpStatus === 403) {
        setAuditAccessDenied(true);
        setError(
          'Bạn không có quyền xem nhật ký hệ thống. Chỉ tài khoản Admin hoặc SuperAdmin mới được phép (vai trò User không xem được).'
        );
        return;
      }
      if (res.httpStatus === 401) {
        setError(res.message || 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
        return;
      }
      setError(
        res.message?.trim() ||
          'Không tải được nhật ký. Kiểm tra API đang chạy và tài khoản của bạn.'
      );
    } catch (err) {
      console.error('[SystemLogs] Load logs error:', err);
      setError('Lỗi kết nối đến máy chủ.');
    } finally {
      setLoading(false);
    }
  }, [selectedAction, selectedEntity, dateFrom, dateTo]);

  // Check for new logs
  const checkNewLogs = useCallback(async () => {
    try {
      const res = await AuditLogsApi.getCountSince(lastLoadTime.current, selectedAction || undefined, selectedEntity || undefined);
      if (res.success && res.data && (res.data as any).count > 0) {
        setNewLogsCount((res.data as any).count);
      }
    } catch { /* silent */ }
  }, [selectedAction, selectedEntity]);

  // Initial load
  useEffect(() => {
    loadStats();
    loadLogs(1);
  }, [loadStats, loadLogs]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(() => {
        loadLogs(page);
        loadStats();
        checkNewLogs();
      }, AUTO_REFRESH_INTERVAL);
    } else {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
        autoRefreshRef.current = null;
      }
      setNewLogsCount(0);
    }
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [autoRefresh, loadLogs, loadStats, checkNewLogs, page]);

  // Real-time SignalR
  useEffect(() => {
    const { connect, disconnect } = createSignalRConnection({
      onAuditLogReceived: (auditLog) => {
        setLogs(prev => [auditLog as unknown as AuditLogEntry, ...prev.slice(0, PAGE_SIZE - 1)]);
        setTotalCount(prev => prev + 1);
        setNewLogsCount(prev => prev + 1);
      },
    });
    connect();
    return disconnect;
  }, []);

  const displayLogs = searchQuery.trim()
    ? logs.filter(log =>
        log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.details ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.userName ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.ipAddress ?? '').includes(searchQuery)
      )
    : logs;

  const handleExport = async () => {
    setExporting(true);
    try {
      const filters = {
        action: selectedAction || undefined,
        entityType: selectedEntity || undefined,
        fromDate: dateFrom || undefined,
        toDate: dateTo || undefined,
      };
      await AuditLogsApi.exportCsv(filters);
    } catch (err) {
      console.error('[SystemLogs] Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  // Stats
  const topActions = stats.slice(0, 8);
  const totalActivity = stats.reduce((sum, s) => sum + s.count, 0);
  const maxCount = topActions.length > 0 ? topActions[0].count : 1;

  // Timeline chart
  const maxTimeline = timeline.length > 0 ? Math.max(...timeline.map(t => t.Count), 1) : 1;

  // Recent timeline
  const recentLogs = logs.slice(0, 5);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h2 className={cn('text-2xl font-bold', theme === 'dark' ? 'text-white' : 'text-slate-900')}>
            Nhật ký hệ thống
          </h2>
          <p className="text-slate-400 text-sm mt-0.5">
            {totalCount > 0
              ? `${totalCount.toLocaleString('vi-VN')} hoạt động — trang ${page}/${totalPages}`
              : 'Theo dõi mọi hoạt động trong hệ thống'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* New logs badge */}
          {newLogsCount > 0 && (
            <button
              onClick={() => { loadLogs(1); setNewLogsCount(0); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow animate-pulse"
            >
              <Zap size={14} />
              {newLogsCount} mới
            </button>
          )}

          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all',
              autoRefresh
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : theme === 'dark'
                  ? 'border-slate-700 text-slate-400 hover:bg-slate-800'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-100'
            )}
            title={autoRefresh ? 'Tắt tự động làm mới' : 'Bật tự động làm mới (30s)'}
          >
            {autoRefresh ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
            <span className="hidden sm:inline">{autoRefresh ? 'Tự động' : 'Tắt tự động'}</span>
          </button>

          {/* View mode */}
          <button
            onClick={() => setViewMode(v => v === 'table' ? 'timeline' : 'table')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all',
              theme === 'dark'
                ? 'border-slate-700 text-slate-400 hover:bg-slate-800'
                : 'border-slate-200 text-slate-600 hover:bg-slate-100'
            )}
            title={viewMode === 'table' ? 'Chế độ timeline' : 'Chế độ bảng'}
          >
            {viewMode === 'table' ? <Clock size={15} /> : <BarChart3 size={15} />}
          </button>

          {/* Refresh */}
          <button
            onClick={() => { loadLogs(page); loadStats(); setNewLogsCount(0); }}
            className={cn(
              'p-2.5 rounded-lg border transition-all',
              theme === 'dark'
                ? 'border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white'
                : 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            )}
            title="Làm mới"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>

          {/* Export */}
          <button
            onClick={handleExport}
            disabled={displayLogs.length === 0 || exporting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-bold transition-all shadow"
          >
            {exporting ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />}
            {exporting ? 'Đang xuất…' : 'Xuất CSV'}
          </button>
        </div>
      </div>

      {/* Stats Dashboard */}
      <div className={cn(
        'rounded-2xl border p-5',
        theme === 'dark' ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm',
      )}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-blue-400" />
            <h3 className={cn('text-sm font-semibold', theme === 'dark' ? 'text-white' : 'text-slate-800')}>
              Thống kê hoạt động
            </h3>
          </div>
          <div className="flex gap-1">
            {[7, 30, 90].map(d => (
              <button
                key={d}
                onClick={() => setDaysRange(d)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all',
                  daysRange === d
                    ? 'bg-blue-600 text-white'
                    : theme === 'dark'
                      ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                )}
              >
                {d} ngày
              </button>
            ))}
          </div>
        </div>

        {statsLoading ? (
          <div className="flex items-center justify-center h-24 text-slate-500">
            <RefreshCw size={16} className="animate-spin mr-2" /> Đang tải thống kê…
          </div>
        ) : auditAccessDenied ? (
          <div className="text-center text-amber-500/90 text-sm py-4">
            Không có quyền tải thống kê nhật ký. Chỉ Admin hoặc SuperAdmin được xem mục này.
          </div>
        ) : stats.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-4">
            Chưa có dữ liệu hoạt động trong {daysRange} ngày qua
          </div>
        ) : (
          <div className="space-y-2">
            {/* Top stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 mb-4">
              <StatCard
                theme={theme}
                label="Tổng hoạt động"
                value={totalActivity}
                color="blue"
                icon={<Activity size={14} />}
              />
              <StatCard
                theme={theme}
                label="Tạo mới / Đăng nhập"
                value={stats.filter(s => s.action.includes('CREATED') || s.action.includes('ADDED') || s.action.includes('LOGIN')).reduce((sum, s) => sum + s.count, 0)}
                color="emerald"
                icon={<Plus size={14} />}
              />
              <StatCard
                theme={theme}
                label="Cập nhật"
                value={stats.filter(s => s.action.includes('UPDATED') || s.action.includes('CHANGED')).reduce((sum, s) => sum + s.count, 0)}
                color="amber"
                icon={<Edit size={14} />}
              />
              <StatCard
                theme={theme}
                label="Lỗi / Xóa"
                value={stats.filter(s => s.action.includes('FAILED') || s.action.includes('DELETED')).reduce((sum, s) => sum + s.count, 0)}
                color="rose"
                icon={<Trash2 size={14} />}
              />
              <StatCard
                theme={theme}
                label="Block IP"
                value={stats.filter(s => s.action.includes('BLOCKED')).reduce((sum, s) => sum + s.count, 0)}
                color="orange"
                icon={<Shield size={14} />}
              />
            </div>

            {/* Timeline chart */}
            {timeline.length > 0 && (
              <div className={cn(
                'rounded-xl p-3 mb-3',
                theme === 'dark' ? 'bg-slate-800/50' : 'bg-slate-50'
              )}>
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Xu hướng hoạt động</p>
                <div className="flex items-end gap-1 h-12">
                  {timeline.map((point, idx) => {
                    const heightPct = (point.Count / maxTimeline) * 100;
                    const date = new Date(point.Date);
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-0.5 group cursor-help">
                        <span className="text-[9px] text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          {point.Count}
                        </span>
                        <div
                          className="w-full rounded-t-sm bg-blue-500/60 hover:bg-blue-500 transition-all min-h-[2px]"
                          style={{ height: `${Math.max(heightPct, 5)}%` }}
                          title={`${point.Date}: ${point.Count} hoạt động`}
                        />
                        <span className="text-[8px] text-slate-600">
                          {date.getDate()}/{date.getMonth() + 1}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top users */}
            {topUsers.length > 0 && (
              <div className={cn(
                'rounded-xl p-3 mb-3',
                theme === 'dark' ? 'bg-slate-800/50' : 'bg-slate-50'
              )}>
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Người dùng hoạt động nhiều nhất</p>
                <div className="space-y-1.5">
                  {topUsers.map((u, idx) => (
                    <div key={u.UserId || (u as any).userId || idx} className="flex items-center gap-2">
                      <span className={cn(
                        'text-[10px] font-bold min-w-[16px] text-center',
                        idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-400' : idx === 2 ? 'text-orange-400' : 'text-slate-600'
                      )}>
                        #{idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className={cn('text-xs font-semibold truncate', theme === 'dark' ? 'text-slate-200' : 'text-slate-700')}>
                            {u.UserName}
                          </span>
                          <span className="text-[10px] font-mono text-blue-400 ml-2">{u.ActionCount} lượt</span>
                        </div>
                        <div className={cn('h-1 rounded-full mt-0.5', theme === 'dark' ? 'bg-slate-700' : 'bg-slate-200')}>
                          <div
                            className="h-full rounded-full bg-blue-500 transition-all"
                            style={{ width: `${(u.ActionCount / topUsers[0].ActionCount) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action bars */}
            <div className="space-y-1.5">
              {topActions.map((stat) => {
                const color = getActionColor(stat.action);
                const pct = (stat.count / maxCount) * 100;
                return (
                  <button
                    key={stat.action}
                    onClick={() => {
                      setSelectedAction(stat.action);
                      setPage(1);
                      loadLogs(1);
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all group hover:opacity-90',
                      theme === 'dark' ? 'bg-slate-800/50 hover:bg-slate-800' : 'bg-slate-50 hover:bg-slate-100'
                    )}
                  >
                    <span className={cn('text-[10px] font-mono font-medium min-w-[180px] text-left shrink-0', color.text)}>
                      {stat.action}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-slate-700/30 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', color.dot)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 min-w-[32px] text-right">
                      {stat.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Recent Activity Timeline */}
      {!loading && recentLogs.length > 0 && (
        <div className={cn(
          'rounded-2xl border p-5',
          theme === 'dark' ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm',
        )}>
          <div className="flex items-center gap-2 mb-4">
            <Clock size={16} className="text-blue-400" />
            <h3 className={cn('text-sm font-semibold', theme === 'dark' ? 'text-white' : 'text-slate-800')}>
              Hoạt động gần đây
            </h3>
          </div>
          <div className="relative">
            <div className={cn('absolute left-[15px] top-0 bottom-0 w-px', theme === 'dark' ? 'bg-slate-700' : 'bg-slate-200')} />
            <div className="space-y-3">
              {recentLogs.map((log) => {
                const { bg, text, dot, border } = getActionColor(log.action);
                const ts = formatTimestampRelativeAbsolute(log.timestamp);
                return (
                  <button
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className="w-full flex items-start gap-3 pl-0.5 pr-2 py-1.5 rounded-lg transition-all hover:opacity-80 text-left"
                  >
                    <div className={cn('w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10', bg, 'border', border)}>
                      <span className={text}>{getActionIcon(log.action)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn('text-xs font-semibold', text)}>{log.action}</span>
                        <span className="text-[10px] text-slate-500">{getActionCategory(log.action)}</span>
                        {log.entityType && (
                          <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded font-medium',
                            theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'
                          )}>
                            {log.entityType}
                          </span>
                        )}
                      </div>
                      <p className={cn(
                        'text-[11px] truncate mt-0.5',
                        theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                      )}>
                        {log.details ?? '—'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] text-slate-500">{ts.relative}</p>
                      {log.userName && (
                        <p className="text-[10px] text-blue-400 mt-0.5">{log.userName}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Search + Filter bar */}
      <div className={cn(
        'rounded-xl border p-4 transition-all',
        theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm',
      )}>
        <div className="flex gap-3 items-center mb-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Tìm theo hành động, chi tiết, người dùng, IP…"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
              className={cn(
                'w-full pl-9 pr-4 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all',
                theme === 'dark'
                  ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-600'
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400',
              )}
            />
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all shrink-0',
              showFilters
                ? 'bg-blue-600 border-blue-600 text-white'
                : theme === 'dark'
                  ? 'border-slate-700 text-slate-400 hover:bg-slate-800'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-100',
            )}
          >
            <Filter size={14} />
            Bộ lọc
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-700/30">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Hành động</label>
              <select
                value={selectedAction}
                onChange={e => { setSelectedAction(e.target.value); setPage(1); }}
                className={cn(
                  'w-full px-3 py-1.5 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/50',
                  theme === 'dark'
                    ? 'bg-slate-950 border-slate-800 text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-900',
                )}
              >
                <option value="">Tất cả hành động</option>
                {ACTION_CATEGORIES.flatMap(cat =>
                  cat.actions.map(a => (
                    <option key={a} value={a}>{cat.label}: {a.replace(/_/g, ' ')}</option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Đối tượng</label>
              <select
                value={selectedEntity}
                onChange={e => { setSelectedEntity(e.target.value); setPage(1); }}
                className={cn(
                  'w-full px-3 py-1.5 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/50',
                  theme === 'dark'
                    ? 'bg-slate-950 border-slate-800 text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-900',
                )}
              >
                <option value="">Tất cả đối tượng</option>
                {['User', 'Server', 'Alert', 'Ticket', 'BlockedIP', 'Whitelist', 'Payment', 'Subscription'].map(e => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Từ ngày</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                  className={cn(
                    'w-full px-3 py-1.5 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/50',
                    theme === 'dark'
                      ? 'bg-slate-950 border-slate-800 text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-900',
                  )}
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Đến ngày</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => { setDateTo(e.target.value); setPage(1); }}
                  className={cn(
                    'w-full px-3 py-1.5 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/50',
                    theme === 'dark'
                      ? 'bg-slate-950 border-slate-800 text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-900',
                  )}
                />
              </div>
            </div>
            {(selectedAction || selectedEntity || dateFrom || dateTo) && (
              <div className="sm:col-span-3 flex justify-end">
                <button
                  onClick={() => {
                    setSelectedAction('');
                    setSelectedEntity('');
                    setDateFrom('');
                    setDateTo('');
                    setPage(1);
                  }}
                  className="text-xs text-slate-500 hover:text-rose-500 transition-colors"
                >
                  ✕ Xóa bộ lọc
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div
          className={cn(
            'rounded-xl border px-4 py-3 text-sm flex items-center gap-2',
            auditAccessDenied
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
              : 'border-rose-500/20 bg-rose-500/10 text-rose-500',
          )}
        >
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className={cn(
        'rounded-xl border overflow-hidden',
        theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm',
      )}>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className={cn(
                'text-[10px] uppercase tracking-wider',
                theme === 'dark' ? 'bg-slate-950/80 text-slate-500' : 'bg-slate-50 text-slate-400',
              )}>
                <th className="px-5 py-3.5 font-medium">Hành động</th>
                <th className="px-5 py-3.5 font-medium">Đối tượng</th>
                <th className="px-5 py-3.5 font-medium hidden md:table-cell">Chi tiết</th>
                <th className="px-5 py-3.5 font-medium">Người dùng</th>
                <th className="px-5 py-3.5 font-medium hidden lg:table-cell">IP</th>
                <th className="px-5 py-3.5 font-medium">Thời gian</th>
              </tr>
            </thead>
            <tbody className={cn('divide-y', theme === 'dark' ? 'divide-slate-800' : 'divide-slate-100')}>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center text-slate-500">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
                    Đang tải nhật ký…
                  </td>
                </tr>
              ) : displayLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <Terminal size={28} className="mx-auto mb-2 text-slate-600" />
                    <p className={cn('font-medium', theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                      {searchQuery || selectedAction || selectedEntity || dateFrom || dateTo
                        ? 'Không có kết quả phù hợp'
                        : 'Chưa có nhật ký hoạt động'}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      {searchQuery || selectedAction || selectedEntity || dateFrom || dateTo
                        ? 'Thử thay đổi bộ lọc'
                        : 'Các hoạt động sẽ xuất hiện khi có thao tác trên hệ thống'}
                    </p>
                  </td>
                </tr>
              ) : (
                displayLogs.map(log => {
                  const { bg, text, border } = getActionColor(log.action);
                  const ts = formatTimestampRelativeAbsolute(log.timestamp);
                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className={cn(
                        'transition-colors cursor-pointer',
                        theme === 'dark'
                          ? 'hover:bg-slate-800/30'
                          : 'hover:bg-slate-50',
                      )}
                    >
                      <td className="px-5 py-3.5 align-top">
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            'text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap',
                            bg, text, border,
                          )}>
                            {log.action}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-600 mt-0.5">{getActionCategory(log.action)}</p>
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        {log.entityType ? (
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className={cn(
                              'p-1 rounded',
                              theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'
                            )}>
                              {ENTITY_ICONS[log.entityType] ?? <Terminal size={12} />}
                            </span>
                            <span className={theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}>
                              {log.entityType}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                        {log.entityId && (
                          <p className="text-[10px] font-mono text-slate-600 mt-0.5 truncate max-w-[120px]" title={log.entityId}>
                            {log.entityId.slice(0, 8)}…
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 align-top hidden md:table-cell">
                        <p className={cn(
                          'text-xs leading-relaxed max-w-xs',
                          theme === 'dark' ? 'text-slate-400' : 'text-slate-600',
                        )} title={log.details ?? undefined}>
                          {log.details
                            ? log.details.length > 100
                              ? log.details.slice(0, 100) + '…'
                              : log.details
                            : <span className="text-slate-600">—</span>}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        {log.userName ? (
                          <span className="text-xs font-semibold text-blue-400">{log.userName}</span>
                        ) : (
                          <span className="text-xs text-slate-600">Hệ thống</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 align-top hidden lg:table-cell">
                        {log.ipAddress ? (
                          <span className="text-xs font-mono text-slate-400">{log.ipAddress}</span>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <div title={ts.absolute} className="text-xs text-slate-500 whitespace-nowrap">
                          {ts.relative}
                        </div>
                        <div className="text-[10px] text-slate-600 mt-0.5 hidden xl:block">
                          {formatDateOnlyVi(log.timestamp)}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className={cn(
            'flex items-center justify-between px-5 py-3 border-t',
            theme === 'dark' ? 'border-slate-800' : 'border-slate-100',
          )}>
            <p className="text-xs text-slate-500">
              Hiển thị {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCount)} / {totalCount.toLocaleString('vi-VN')} bản ghi
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setPage(p => Math.max(1, p - 1)); loadLogs(page - 1); }}
                disabled={page <= 1}
                className={cn(
                  'p-1.5 rounded-lg border transition-all disabled:opacity-30',
                  theme === 'dark' ? 'border-slate-700 hover:bg-slate-800 text-slate-400' : 'border-slate-200 hover:bg-slate-100 text-slate-600',
                )}
              >
                <ChevronLeft size={15} />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let p: number;
                if (totalPages <= 7) {
                  p = i + 1;
                } else if (page <= 4) {
                  p = i + 1;
                  if (i === 6) p = totalPages;
                } else if (page >= totalPages - 3) {
                  p = i === 0 ? 1 : totalPages - 6 + i;
                } else {
                  p = i === 0 ? 1 : i === 6 ? totalPages : page - 3 + i;
                }
                return (
                  <button
                    key={p}
                    onClick={() => { setPage(p); loadLogs(p); }}
                    className={cn(
                      'w-8 h-8 text-xs rounded-lg border transition-all',
                      page === p
                        ? 'bg-blue-600 border-blue-600 text-white font-bold'
                        : theme === 'dark'
                          ? 'border-slate-700 hover:bg-slate-800 text-slate-400'
                          : 'border-slate-200 hover:bg-slate-100 text-slate-600',
                    )}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => { setPage(p => Math.min(totalPages, p + 1)); loadLogs(page + 1); }}
                disabled={page >= totalPages}
                className={cn(
                  'p-1.5 rounded-lg border transition-all disabled:opacity-30',
                  theme === 'dark' ? 'border-slate-700 hover:bg-slate-800 text-slate-400' : 'border-slate-200 hover:bg-slate-100 text-slate-600',
                )}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className={cn(
            'w-full max-w-lg rounded-2xl border shadow-2xl',
            theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
          )}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-9 h-9 rounded-xl flex items-center justify-center',
                  getActionColor(selectedLog.action).bg
                )}>
                  <Terminal size={16} className={getActionColor(selectedLog.action).text} />
                </div>
                <div>
                  <h3 className={cn('font-semibold', theme === 'dark' ? 'text-white' : 'text-slate-900')}>
                    Chi tiết hoạt động
                  </h3>
                  <p className="text-[11px] text-slate-500">#{selectedLog.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className={cn(
                  'p-1.5 rounded-lg transition-colors',
                  theme === 'dark' ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
                )}
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <span className={cn(
                  'text-sm font-bold px-3 py-1.5 rounded-lg border',
                  getActionColor(selectedLog.action).bg,
                  getActionColor(selectedLog.action).text,
                  getActionColor(selectedLog.action).border,
                )}>
                  {selectedLog.action}
                </span>
                <span className={cn(
                  'text-xs px-2 py-1 rounded-lg',
                  theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'
                )}>
                  {getActionCategory(selectedLog.action)}
                </span>
              </div>

              <div className={cn(
                'rounded-xl p-4 space-y-3',
                theme === 'dark' ? 'bg-slate-800/50' : 'bg-slate-50'
              )}>
                {[
                  { label: 'Chi tiết', value: selectedLog.details ?? '—', mono: false },
                  { label: 'Đối tượng', value: selectedLog.entityType ?? '—', mono: false },
                  { label: 'Entity ID', value: selectedLog.entityId ?? '—', mono: true },
                  { label: 'Người thực hiện', value: selectedLog.userName ?? 'Hệ thống', mono: false },
                  { label: 'Địa chỉ IP', value: selectedLog.ipAddress ?? '—', mono: true },
                  { label: 'Thời gian', value: formatDateTime(selectedLog.timestamp), mono: false },
                ].map(({ label, value, mono }) => (
                  <div key={label} className="flex gap-3">
                    <span className={cn('text-xs font-medium min-w-[110px] shrink-0 pt-0.5', theme === 'dark' ? 'text-slate-500' : 'text-slate-400')}>
                      {label}
                    </span>
                    <span className={cn(
                      'text-sm flex-1 break-all',
                      mono ? 'font-mono' : '',
                      theme === 'dark' ? 'text-slate-200' : 'text-slate-700',
                      label === 'Người thực hiện' && selectedLog.userName ? 'text-blue-400 font-semibold' : '',
                    )}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end px-5 py-4 border-t border-slate-700/50">
              <button
                onClick={() => setSelectedLog(null)}
                className={cn(
                  'px-5 py-2 rounded-lg font-medium text-sm transition-all',
                  theme === 'dark'
                    ? 'bg-slate-800 hover:bg-slate-700 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                )}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Stat card sub-component
function StatCard({ theme, label, value, color, icon }: {
  theme: Theme;
  label: string;
  value: number;
  color: 'blue' | 'emerald' | 'amber' | 'rose' | 'orange';
  icon: React.ReactNode;
}) {
  const colors = {
    blue: theme === 'dark' ? 'bg-blue-600/10 border-blue-500/20 text-blue-400' : 'bg-blue-50 border-blue-100 text-blue-600',
    emerald: theme === 'dark' ? 'bg-emerald-600/10 border-emerald-500/20 text-emerald-400' : 'bg-emerald-50 border-emerald-100 text-emerald-600',
    amber: theme === 'dark' ? 'bg-amber-600/10 border-amber-500/20 text-amber-400' : 'bg-amber-50 border-amber-100 text-amber-600',
    rose: theme === 'dark' ? 'bg-rose-600/10 border-rose-500/20 text-rose-400' : 'bg-rose-50 border-rose-100 text-rose-600',
    orange: theme === 'dark' ? 'bg-orange-600/10 border-orange-500/20 text-orange-400' : 'bg-orange-50 border-orange-100 text-orange-600',
  };
  return (
    <div className={cn('rounded-xl p-3 text-center border', colors[color])}>
      <div className="flex items-center justify-center gap-1 mb-1">{icon}</div>
      <p className="text-2xl font-bold">{value.toLocaleString('vi-VN')}</p>
      <p className="text-[10px] text-current opacity-60 uppercase tracking-wide">{label}</p>
    </div>
  );
}
