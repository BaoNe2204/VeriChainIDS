import React, { useState, useEffect, useCallback } from 'react';
import {
  TicketIcon, Plus, Search, RefreshCw, ChevronLeft, ChevronRight,
  AlertTriangle, Clock, User as UserIcon, MessageSquare, X, Check, Filter,
  Eye, ChevronDown, Send
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';
import { TicketsApi, UsersApi, type Ticket, type TicketComment, type User } from '../services/api';
import { getStoredUser } from '../services/api';
import { formatDateTime, formatRelativeLongTruoc } from '../utils/dateUtils';

const PAGE_SIZE = 15;

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'OPEN', label: 'Mở', color: 'text-blue-400' },
  { value: 'IN_PROGRESS', label: 'Đang xử lý', color: 'text-yellow-400' },
  { value: 'PENDING', label: 'Chờ', color: 'text-orange-400' },
  { value: 'RESOLVED', label: 'Đã giải quyết', color: 'text-green-400' },
  { value: 'CLOSED', label: 'Đóng', color: 'text-slate-400' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'Tất cả mức' },
  { value: 'Critical', label: 'Nghiêm trọng', color: 'text-rose-400' },
  { value: 'High', label: 'Cao', color: 'text-orange-400' },
  { value: 'Medium', label: 'Trung bình', color: 'text-yellow-400' },
  { value: 'Low', label: 'Thấp', color: 'text-blue-400' },
];

const CATEGORY_OPTIONS = [
  '', 'An ninh mạng', 'Hệ thống', 'Ứng dụng', 'Mạng', 'Phần cứng', 'Khác',
];

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  IN_PROGRESS: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  PENDING: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  RESOLVED: 'bg-green-500/10 text-green-400 border-green-500/20',
  CLOSED: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

const STATUS_DOT: Record<string, string> = {
  OPEN: 'bg-blue-400',
  IN_PROGRESS: 'bg-yellow-400',
  PENDING: 'bg-orange-400',
  RESOLVED: 'bg-green-400',
  CLOSED: 'bg-slate-400',
};

const PRIORITY_COLORS: Record<string, string> = {
  Critical: 'text-rose-400 bg-rose-500/10',
  High: 'text-orange-400 bg-orange-500/10',
  Medium: 'text-yellow-400 bg-yellow-500/10',
  Low: 'text-blue-400 bg-blue-500/10',
};

// ─── Detail Modal ──────────────────────────────────────────────────────────────

interface DetailModalProps {
  theme: Theme;
  ticket: Ticket | null;
  onClose: () => void;
  onRefresh: () => void;
}

function TicketDetailModal({ theme, ticket, onClose, onRefresh }: DetailModalProps) {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const currentUser = getStoredUser();

  const handleStatusChange = async (newStatus: string) => {
    if (!ticket || !currentUser) return;
    setSubmitting(true);
    try {
      await TicketsApi.updateStatus(ticket.id, newStatus, currentUser.id);
      onRefresh(); onClose();
    } catch { alert('Lỗi cập nhật trạng thái'); }
    finally { setSubmitting(false); }
  };

  const handleAddComment = async () => {
    if (!ticket || !comment.trim() || !currentUser) return;
    setSubmitting(true);
    try {
      await TicketsApi.addComment(ticket.id, currentUser.id, comment.trim());
      setComment('');
      onRefresh();
    } catch { alert('Lỗi thêm bình luận'); }
    finally { setSubmitting(false); }
  };

  if (!ticket) return null;
  const is = (s: string) => ticket.status === s;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className={cn(
        'w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95',
        theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      )}>
        {/* Header */}
        <div className={cn('flex items-start justify-between p-5 border-b shrink-0', theme === 'dark' ? 'border-slate-800' : 'border-slate-100')}>
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border', STATUS_COLORS[ticket.status])}>
                <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_DOT[ticket.status])} />
                {ticket.status.replace('_', ' ')}
              </span>
              <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', PRIORITY_COLORS[ticket.priority])}>
                {ticket.priority}
              </span>
            </div>
            <h3 className={cn('text-lg font-black truncate', theme === 'dark' ? 'text-white' : 'text-slate-900')}>{ticket.title}</h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{ticket.ticketNumber}</p>
          </div>
          <button onClick={onClose} className={cn('p-2 rounded-lg hover:bg-slate-800 text-slate-400 shrink-0', theme === 'dark' ? '' : 'hover:bg-slate-100')}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Meta */}
          <div className={cn('grid grid-cols-2 gap-3 text-xs rounded-xl p-3', theme === 'dark' ? 'bg-slate-800/50' : 'bg-slate-50')}>
            {[
              { label: 'Người tạo', value: ticket.createdByName ?? '—' },
              { label: 'Người xử lý', value: ticket.assignedToName ?? 'Chưa phân công' },
              { label: 'Danh mục', value: ticket.category ?? '—' },
              { label: 'Hạn xử lý', value: ticket.dueDate ? formatDateTime(ticket.dueDate) : '—' },
              { label: 'Tạo lúc', value: formatDateTime(ticket.createdAt) },
              { label: 'Cập nhật', value: formatDateTime(ticket.updatedAt) },
            ].map((m, i) => (
              <div key={i}>
                <p className="text-slate-500 mb-0.5">{m.label}</p>
                <p className={cn('font-medium', theme === 'dark' ? 'text-slate-200' : 'text-slate-700')}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Description */}
          {ticket.description && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase mb-1.5">Mô tả</p>
              <p className={cn('text-sm leading-relaxed rounded-xl p-3', theme === 'dark' ? 'bg-slate-800/50 text-slate-300' : 'bg-slate-50 text-slate-700')}>
                {ticket.description}
              </p>
            </div>
          )}

          {/* Comments */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">
              Bình luận ({ticket.comments?.length ?? 0})
            </p>
            <div className="space-y-2">
              {(!ticket.comments || ticket.comments.length === 0) ? (
                <p className="text-xs text-slate-500 text-center py-4">Chưa có bình luận nào.</p>
              ) : (
                ticket.comments.map(c => (
                  <div key={c.id} className={cn(
                    'rounded-xl p-3 text-sm',
                    c.isInternal
                      ? theme === 'dark' ? 'bg-amber-500/5 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'
                      : theme === 'dark' ? 'bg-slate-800/50' : 'bg-slate-50'
                  )}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn('text-xs font-bold', theme === 'dark' ? 'text-blue-400' : 'text-blue-600')}>{c.userName}</span>
                      <div className="flex items-center gap-2">
                        {c.isInternal && <span className="text-[10px] text-amber-400 font-bold">NỘI BỘ</span>}
                        <span className="text-xs text-slate-500">{formatRelativeLongTruoc(c.createdAt)}</span>
                      </div>
                    </div>
                    <p className={cn('leading-relaxed', theme === 'dark' ? 'text-slate-300' : 'text-slate-700')}>{c.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer: status actions + comment */}
        <div className={cn('p-4 border-t space-y-3 shrink-0', theme === 'dark' ? 'border-slate-800' : 'border-slate-100')}>
          {/* Status change */}
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.filter(s => s.value && s.value !== ticket.status).map(s => (
              <button key={s.value} onClick={() => handleStatusChange(s.value!)} disabled={submitting}
                className={cn('px-3 py-1.5 text-xs font-bold rounded-lg border transition-all hover:opacity-80 disabled:opacity-40',
                  theme === 'dark' ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                )}>
                {s.label}
              </button>
            ))}
          </div>
          {/* Comment input */}
          <div className="flex gap-2">
            <input
              type="text" value={comment} onChange={e => setComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddComment(); }}
              placeholder="Viết bình luận…"
              className={cn('flex-1 rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/50',
                theme === 'dark' ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-600' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
              )}
            />
            <button onClick={handleAddComment} disabled={!comment.trim() || submitting}
              className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition-all">
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Create Ticket Modal ───────────────────────────────────────────────────────

interface CreateTicketModalProps {
  theme: Theme;
  currentUser: any;
  tenantId?: string;  // Optional - SuperAdmin không có, Admin/User có
  onClose: () => void;
  onSuccess: () => void;
}

function CreateTicketModal({ theme, currentUser, tenantId, onClose, onSuccess }: CreateTicketModalProps) {
  const [form, setForm] = useState({ title: '', description: '', priority: 'Medium', category: '', selectedTenantId: tenantId || '' });
  const [submitting, setSubmitting] = useState(false);
  const [tenants, setTenants] = useState<any[]>([]);
  const isSuperAdmin = currentUser?.role === 'SuperAdmin';

  // SuperAdmin: Load danh sách tenants để chọn
  useEffect(() => {
    if (isSuperAdmin) {
      // TODO: Gọi API lấy danh sách tenants
      // Tạm thời để trống, SuperAdmin phải nhập tenantId thủ công
    }
  }, [isSuperAdmin]);

  const handleSubmit = async () => {
    if (!form.title.trim()) { alert('Vui lòng nhập tiêu đề'); return; }
    
    setSubmitting(true);
    try {
      const payload: any = { 
        title: form.title, 
        description: form.description, 
        priority: form.priority, 
        category: form.category || undefined, 
        createdBy: currentUser.id 
      };
      
      // Thêm tenantId nếu có (Admin/User từ JWT, SuperAdmin từ form - optional)
      if (form.selectedTenantId && form.selectedTenantId.trim()) {
        payload.tenantId = form.selectedTenantId;
      }
      
      const res = await TicketsApi.create(payload);
      if (res.success) { onSuccess(); onClose(); }
      else alert(res.message || 'Tạo ticket thất bại');
    } catch { alert('Lỗi tạo ticket'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className={cn('w-full max-w-lg rounded-2xl border shadow-2xl p-6 animate-in zoom-in-95', theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200')}>
        <div className="flex items-center justify-between mb-5">
          <h3 className={cn('text-lg font-bold', theme === 'dark' ? 'text-white' : 'text-slate-900')}>Tạo Ticket mới</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          {/* SuperAdmin: Nhập Tenant ID */}
          {isSuperAdmin && (
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase mb-1.5 block">Tenant ID (Optional)</label>
              <input 
                value={form.selectedTenantId} 
                onChange={e => setForm({ ...form, selectedTenantId: e.target.value })} 
                placeholder="Nhập Tenant ID (GUID) hoặc để trống"
                className={cn('w-full rounded-lg px-4 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/50',
                  theme === 'dark' ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900')} 
              />
              <p className="text-xs text-slate-500 mt-1">Để trống để tạo ticket cho chính bạn</p>
            </div>
          )}
          
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase mb-1.5 block">Tiêu đề *</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Mô tả ngắn gọn vấn đề"
              className={cn('w-full rounded-lg px-4 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/50',
                theme === 'dark' ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900')} />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase mb-1.5 block">Mô tả chi tiết</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} placeholder="Mô tả chi tiết vấn đề…"
              className={cn('w-full rounded-lg px-4 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none',
                theme === 'dark' ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase mb-1.5 block">Mức ưu tiên</label>
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                className={cn('w-full rounded-lg px-3 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/50',
                  theme === 'dark' ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900')}>
                {PRIORITY_OPTIONS.filter(p => p.value).map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase mb-1.5 block">Danh mục</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                className={cn('w-full rounded-lg px-3 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/50',
                  theme === 'dark' ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900')}>
                <option value="">—</option>
                {CATEGORY_OPTIONS.filter(c => c).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className={cn('flex-1 py-2.5 rounded-lg text-sm font-bold', theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600')}>Hủy</button>
          <button onClick={handleSubmit} disabled={submitting} className="flex-1 py-2.5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-all">
            {submitting ? 'Đang tạo…' : 'Tạo Ticket'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

interface TicketManagementProps {
  theme: Theme;
  userRole?: string;
}

export const TicketManagement = ({ theme, userRole }: TicketManagementProps) => {
  const isStaff = userRole === 'Staff';
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null);

  const currentUser = getStoredUser();

  const load = useCallback(async (pageNum = 1) => {
    setLoading(true); setError(null);
    try {
      const res = await TicketsApi.getAll(pageNum, PAGE_SIZE, {
        status: filterStatus || undefined,
        priority: filterPriority || undefined,
        category: filterCategory || undefined,
      });
      if (res.success && res.data) {
        setTickets(res.data.items as Ticket[]);
        setPage(res.data.page);
        setTotalPages(res.data.totalPages);
        setTotalCount(res.data.totalCount);
      } else {
        setError(res.message || 'Không tải được tickets');
      }
    } catch { setError('Lỗi kết nối'); }
    finally { setLoading(false); }
  }, [filterStatus, filterPriority, filterCategory]);

  useEffect(() => { load(1); }, [load]);

  const displayTickets = search.trim()
    ? tickets.filter(t => t.title.toLowerCase().includes(search.toLowerCase()) || t.ticketNumber.toLowerCase().includes(search.toLowerCase()))
    : tickets;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h2 className={cn('text-2xl font-bold', theme === 'dark' ? 'text-white' : 'text-slate-900')}>Quản lý Ticket</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            {totalCount > 0 ? `${totalCount} ticket — trang ${page}/${totalPages}` : 'Theo dõi và xử lý sự cố'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => load(page)} className={cn('p-2.5 rounded-lg border transition-all', theme === 'dark' ? 'border-slate-700 hover:bg-slate-800 text-slate-400' : 'border-slate-200 hover:bg-slate-100 text-slate-600')}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all shadow">
            <Plus size={16} /> Tạo Ticket
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className={cn('rounded-xl border p-4 flex flex-wrap gap-3 items-center', theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm')}>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm ticket…"
            className={cn('w-full pl-9 pr-4 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/50',
              theme === 'dark' ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-600' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400')} />
        </div>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          className={cn('px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/50',
            theme === 'dark' ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900')}>
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={filterPriority} onChange={e => { setFilterPriority(e.target.value); setPage(1); }}
          className={cn('px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/50',
            theme === 'dark' ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900')}>
          {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1); }}
          className={cn('px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/50',
            theme === 'dark' ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900')}>
            <option value="">Tất cả danh mục</option>
            {CATEGORY_OPTIONS.filter(c => c).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Error */}
      {error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-rose-500 text-sm">{error}</div>}

      {/* Table */}
      <div className={cn('rounded-xl border overflow-hidden', theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm')}>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className={cn('text-[10px] uppercase tracking-wider', theme === 'dark' ? 'bg-slate-950/80 text-slate-500' : 'bg-slate-50 text-slate-400')}>
                <th className="px-5 py-3.5 font-medium">Ticket</th>
                <th className="px-5 py-3.5 font-medium hidden sm:table-cell">Trạng thái</th>
                <th className="px-5 py-3.5 font-medium hidden md:table-cell">Mức</th>
                <th className="px-5 py-3.5 font-medium hidden lg:table-cell">Danh mục</th>
                <th className="px-5 py-3.5 font-medium">Người xử lý</th>
                <th className="px-5 py-3.5 font-medium hidden xl:table-cell">Tạo lúc</th>
                <th className="px-5 py-3.5 font-medium text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className={cn('divide-y', theme === 'dark' ? 'divide-slate-800' : 'divide-slate-100')}>
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-14 text-center text-slate-500"><RefreshCw size={20} className="animate-spin mx-auto mb-2" />Đang tải…</td></tr>
              ) : displayTickets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center">
                    <TicketIcon size={28} className="mx-auto mb-2 text-slate-600" />
                    <p className={cn('font-medium', theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                      {search || filterStatus || filterPriority || filterCategory ? 'Không có kết quả phù hợp' : 'Chưa có ticket nào'}
                    </p>
                  </td>
                </tr>
              ) : (
                displayTickets.map(t => (
                  <tr key={t.id} className={cn('transition-colors cursor-pointer', theme === 'dark' ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50')}
                    onClick={() => setDetailTicket(t)}>
                    <td className="px-5 py-3.5">
                      <p className={cn('text-sm font-semibold mb-0.5 truncate max-w-[200px]', theme === 'dark' ? 'text-white' : 'text-slate-900')}>{t.title}</p>
                      <p className="text-[10px] font-mono text-slate-500">{t.ticketNumber}</p>
                    </td>
                    <td className="px-5 py-3.5 hidden sm:table-cell">
                      <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border', STATUS_COLORS[t.status])}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_DOT[t.status])} />
                        {t.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded', PRIORITY_COLORS[t.priority])}>{t.priority}</span>
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell text-xs text-slate-500">{t.category ?? '—'}</td>
                    <td className="px-5 py-3.5">
                      {t.assignedToName
                        ? <span className="text-xs font-semibold text-blue-400">{t.assignedToName}</span>
                        : <span className="text-xs text-slate-600">Chưa phân</span>}
                    </td>
                    <td className="px-5 py-3.5 hidden xl:table-cell text-xs text-slate-500 whitespace-nowrap">{formatRelativeLongTruoc(t.createdAt)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <button onClick={e => { e.stopPropagation(); setDetailTicket(t); }}
                        className={cn('p-1.5 rounded-lg border text-xs font-medium transition-all',
                          theme === 'dark' ? 'border-slate-700 hover:bg-slate-800 text-slate-400' : 'border-slate-200 hover:bg-slate-100 text-slate-600')}>
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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

      {/* Modals */}
      {showCreate && currentUser && (
        <CreateTicketModal theme={theme} currentUser={currentUser} tenantId={currentUser.tenantId || ''} onClose={() => setShowCreate(false)} onSuccess={() => load(1)} />
      )}
      {detailTicket && (
        <TicketDetailModal theme={theme} ticket={detailTicket} onClose={() => setDetailTicket(null)} onRefresh={() => load(page)} />
      )}
    </div>
  );
};

export default TicketManagement;
