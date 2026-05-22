import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail, Phone, MapPin, Send, MessageSquare, Clock,
  CheckCircle2, RefreshCw, User, Reply, Trash2,
  Inbox, MessageCircle, BarChart3, Eye,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';
import { getToken } from '../services/api';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiGet(path: string) {
  try {
    const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    return r.json();
  } catch {
    return { success: false, data: null };
  }
}
async function apiPut(path: string) {
  try {
    const r = await fetch(`${API}${path}`, { method: 'PUT', headers: { Authorization: `Bearer ${getToken()}` } });
    return r.json();
  } catch {
    return { success: false };
  }
}
async function apiDelete(path: string) {
  try {
    const r = await fetch(`${API}${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
    return r.json();
  } catch {
    return { success: false };
  }
}
async function apiPost(path: string, body: any, auth = false) {
  const headers: any = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${getToken()}`;
  try {
    const r = await fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    return r.json();
  } catch {
    return { success: false, message: 'Không kết nối được server.' };
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ContactMsg {
  id: string; name: string; email: string; subject?: string;
  message: string; status: 'unread' | 'read' | 'replied';
  reply?: string; repliedByName?: string; repliedAt?: string;
  ipAddress?: string; createdAt: string;
}
interface Stats { total: number; unread: number; read: number; replied: number; }

// ── Contact info ──────────────────────────────────────────────────────────────
const CONTACT_INFO = [
  { icon: Mail,   label: 'Email hỗ trợ',  value: 'support@VeriChainIDS.vn',       href: 'mailto:support@VeriChainIDS.vn' },
  { icon: Phone,  label: 'Hotline 24/7',  value: '1800 6868',                   href: 'tel:18006868' },
  { icon: MapPin, label: 'Địa chỉ',       value: '123 Nguyễn Huệ, Q.1, TP.HCM', href: null },
  { icon: Clock,  label: 'Giờ làm việc',  value: 'T2–T6: 8:00–18:00',           href: null },
];

const STATUS_MAP = {
  unread:  { label: 'Chưa đọc',    cls: 'bg-red-500/15 text-red-400' },
  read:    { label: 'Đã đọc',      cls: 'bg-yellow-500/15 text-yellow-400' },
  replied: { label: 'Đã phản hồi', cls: 'bg-green-500/15 text-green-400' },
};

// ── Main ──────────────────────────────────────────────────────────────────────
export const ContactPage = ({ theme, userRole }: { theme: Theme; userRole?: string }) => {
  const dark = theme === 'dark';
  const isSuperAdmin = userRole?.toLowerCase() === 'superadmin';

  // Admin tab: 'inbox' | 'reply' | 'stats'
  const [adminTab, setAdminTab] = useState<'inbox' | 'reply' | 'stats'>('inbox');

  // Form
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState('');

  // Admin data
  const [messages, setMessages] = useState<ContactMsg[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, unread: 0, read: 0, replied: 0 });
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'unread' | 'read' | 'replied'>('all');
  const [selected, setSelected] = useState<ContactMsg | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  const card = cn('rounded-2xl border p-6', dark ? 'bg-slate-900/60 border-slate-700' : 'bg-white border-slate-200 shadow-sm');

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    try {
      const [msgRes, statRes] = await Promise.all([
        apiGet(`/api/contact?page=1&pageSize=50${filterStatus !== 'all' ? `&status=${filterStatus}` : ''}`),
        apiGet('/api/contact/stats'),
      ]);
      if (msgRes.success) setMessages(msgRes.data?.items ?? []);
      if (statRes.success) setStats(statRes.data);
    } finally { setLoading(false); }
  }, [isSuperAdmin, filterStatus]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) { setFormError('Vui lòng điền đầy đủ thông tin.'); return; }
    setSending(true); setFormError('');
    try {
      const res = await apiPost('/api/contact', form);
      if (res.success) {
        setSent(true);
        setForm({ name: '', email: '', subject: '', message: '' });
      } else {
        setFormError(res.message || 'Gửi thất bại. Vui lòng thử lại.');
      }
    } catch {
      setFormError('Không kết nối được server. Vui lòng thử lại.');
    } finally {
      setSending(false);
    }
  };

  // Open message → mark read
  const openMsg = async (msg: ContactMsg) => {
    setSelected(msg); setReplyText('');
    if (msg.status === 'unread') {
      await apiPut(`/api/contact/${msg.id}/read`);
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'read' } : m));
      setStats(prev => ({ ...prev, unread: Math.max(0, prev.unread - 1), read: prev.read + 1 }));
    }
  };

  // Send reply
  const sendReply = async () => {
    if (!replyText.trim() || !selected) return;
    setReplying(true);
    const res = await apiPost(`/api/contact/${selected.id}/reply`, { reply: replyText }, true);
    if (res.success) {
      const updated = { ...selected, status: 'replied' as const, reply: replyText, repliedAt: new Date().toISOString() };
      setMessages(prev => prev.map(m => m.id === selected.id ? updated : m));
      setSelected(updated);
      setStats(prev => ({ ...prev, replied: prev.replied + 1, read: Math.max(0, prev.read - 1) }));
      setReplyText('');
    }
    setReplying(false);
  };

  // Delete
  const deleteMsg = async (id: string) => {
    await apiDelete(`/api/contact/${id}`);
    setMessages(prev => prev.filter(m => m.id !== id));
    if (selected?.id === id) setSelected(null);
    setStats(prev => ({ ...prev, total: Math.max(0, prev.total - 1) }));
  };

  const filtered = filterStatus === 'all' ? messages : messages.filter(m => m.status === filterStatus);

  const inputCls = cn('w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30 transition-all',
    dark ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400');

  return (
    <div className="space-y-6">
      <div>
        <h1 className={cn('text-2xl font-black', dark ? 'text-white' : 'text-slate-900')}>Liên hệ & Hỗ trợ</h1>
        <p className={cn('text-sm mt-1', dark ? 'text-slate-400' : 'text-slate-500')}>Gửi tin nhắn hoặc xem thông tin liên hệ.</p>
      </div>

      {/* ── Contact info + Form ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info */}
        <div className="space-y-4">
          <div className={card}>
            <h2 className={cn('text-xs font-bold uppercase tracking-wider mb-5', dark ? 'text-slate-400' : 'text-slate-500')}>Thông tin liên hệ</h2>
            <div className="space-y-4">
              {CONTACT_INFO.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', dark ? 'bg-blue-500/10' : 'bg-blue-50')}>
                    <item.icon size={16} className="text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">{item.label}</p>
                    {item.href
                      ? <a href={item.href} className={cn('text-sm font-semibold hover:text-blue-400 transition-colors', dark ? 'text-slate-200' : 'text-slate-800')}>{item.value}</a>
                      : <p className={cn('text-sm font-semibold', dark ? 'text-slate-200' : 'text-slate-800')}>{item.value}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="lg:col-span-2">
          <div className={card}>
            <h2 className={cn('text-xs font-bold uppercase tracking-wider mb-5', dark ? 'text-slate-400' : 'text-slate-500')}>Gửi tin nhắn</h2>
            {sent ? (
              <div className="flex flex-col items-center gap-4 py-10">
                <div className={cn('w-16 h-16 rounded-full flex items-center justify-center', dark ? 'bg-green-500/10' : 'bg-green-50')}>
                  <CheckCircle2 size={36} className="text-green-400" />
                </div>
                <div className="text-center">
                  <p className={cn('text-lg font-bold', dark ? 'text-white' : 'text-slate-900')}>Gửi thành công!</p>
                  <p className="text-sm text-slate-400 mt-1">Chúng tôi sẽ phản hồi trong vòng 24 giờ.</p>
                </div>
                <button onClick={() => setSent(false)} className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all">
                  Gửi tin nhắn khác
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Họ tên *</label>
                    <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nguyễn Văn A" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Email *</label>
                    <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Chủ đề</label>
                  <input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="Hỏi về gói dịch vụ, báo lỗi..." className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Nội dung *</label>
                  <textarea rows={5} value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} placeholder="Mô tả chi tiết..." className={cn(inputCls, 'resize-none')} />
                </div>
                {formError && <p className="text-sm text-red-400">{formError}</p>}
                <button type="submit" disabled={sending} className={cn('w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all bg-blue-600 hover:bg-blue-500 text-white', sending && 'opacity-70 cursor-not-allowed')}>
                  {sending ? <><RefreshCw size={16} className="animate-spin" /> Đang gửi...</> : <><Send size={16} /> Gửi tin nhắn</>}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* ── Kiểm tra phản hồi (dành cho khách) ── */}
      {!isSuperAdmin && <CheckReplySection theme={theme} dark={dark} />}

      {/* ── SuperAdmin section ── */}
      {isSuperAdmin && (
        <div className="space-y-4">
          {/* Tab bar */}
          <div className={cn('flex items-center gap-1 p-1 rounded-xl w-fit', dark ? 'bg-slate-800' : 'bg-slate-100')}>
            {([
              { key: 'inbox', icon: Inbox,         label: 'Hộp thư đến', badge: stats.unread },
              { key: 'reply', icon: MessageCircle,  label: 'Phản hồi' },
              { key: 'stats', icon: BarChart3,       label: 'Thống kê' },
            ] as const).map(tab => (
              <button key={tab.key} onClick={() => setAdminTab(tab.key)}
                className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all relative',
                  adminTab === tab.key ? 'bg-blue-600 text-white' : dark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-800'
                )}>
                <tab.icon size={15} />
                {tab.label}
                {'badge' in tab && tab.badge ? <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">{tab.badge}</span> : null}
              </button>
            ))}
            <button onClick={fetchMessages} className={cn('p-2 rounded-lg transition-all', dark ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200')}>
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* ── Tab: Inbox ── */}
          {adminTab === 'inbox' && (
            <div className={card}>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className={cn('text-xs font-bold uppercase tracking-wider', dark ? 'text-slate-400' : 'text-slate-500')}>
                  Tin nhắn từ khách ({filtered.length})
                </h3>
                <div className="flex gap-1">
                  {(['all','unread','read','replied'] as const).map(f => (
                    <button key={f} onClick={() => setFilterStatus(f)}
                      className={cn('px-3 py-1 rounded-lg text-xs font-bold transition-all',
                        filterStatus === f ? 'bg-blue-600 text-white' : dark ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-800'
                      )}>
                      {f === 'all' ? 'Tất cả' : STATUS_MAP[f].label}
                    </button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="space-y-3">{[1,2,3].map(i => <div key={i} className={cn('h-16 rounded-xl animate-pulse', dark ? 'bg-slate-800' : 'bg-slate-100')} />)}</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Inbox size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Không có tin nhắn nào.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map(msg => (
                    <div key={msg.id}
                      onClick={() => { openMsg(msg); setAdminTab('reply'); }}
                      className={cn('p-4 rounded-xl border cursor-pointer transition-all',
                        dark ? 'border-slate-700 hover:border-blue-500/50 hover:bg-slate-800/40' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50',
                        msg.status === 'unread' && 'border-l-4 border-l-red-500'
                      )}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className={cn('text-sm font-bold', dark ? 'text-white' : 'text-slate-900')}>{msg.name}</p>
                            <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', STATUS_MAP[msg.status].cls)}>{STATUS_MAP[msg.status].label}</span>
                          </div>
                          <p className="text-xs text-slate-400 truncate">{msg.email} · {msg.subject || '(Không có chủ đề)'}</p>
                          <p className="text-xs text-slate-500 truncate mt-0.5">{msg.message}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <p className="text-[10px] text-slate-500">{new Date(msg.createdAt).toLocaleDateString('vi-VN')}</p>
                          <button onClick={e => { e.stopPropagation(); deleteMsg(msg.id); }}
                            className="text-slate-500 hover:text-red-400 transition-colors p-1">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Reply ── */}
          {adminTab === 'reply' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Message list */}
              <div className={card}>
                <h3 className={cn('text-xs font-bold uppercase tracking-wider mb-4', dark ? 'text-slate-400' : 'text-slate-500')}>Chọn tin nhắn</h3>
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {messages.map(msg => (
                    <div key={msg.id} onClick={() => openMsg(msg)}
                      className={cn('p-3 rounded-xl border cursor-pointer transition-all',
                        selected?.id === msg.id ? 'border-blue-500 bg-blue-500/10' : dark ? 'border-slate-700 hover:border-slate-600' : 'border-slate-200 hover:border-slate-300',
                        msg.status === 'unread' && 'border-l-4 border-l-red-500'
                      )}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className={cn('text-sm font-bold truncate', dark ? 'text-white' : 'text-slate-900')}>{msg.name}</p>
                          <p className="text-xs text-slate-400 truncate">{msg.subject || msg.message.slice(0, 40)}</p>
                        </div>
                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0', STATUS_MAP[msg.status].cls)}>{STATUS_MAP[msg.status].label}</span>
                      </div>
                    </div>
                  ))}
                  {messages.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Chưa có tin nhắn.</p>}
                </div>
              </div>

              {/* Detail + reply */}
              <div className={card}>
                {selected ? (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className={cn('font-bold', dark ? 'text-white' : 'text-slate-900')}>{selected.name}</p>
                        <p className="text-xs text-slate-400">{selected.email}</p>
                        {selected.ipAddress && <p className="text-[10px] text-slate-500">IP: {selected.ipAddress}</p>}
                      </div>
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', STATUS_MAP[selected.status].cls)}>{STATUS_MAP[selected.status].label}</span>
                    </div>

                    {selected.subject && <p className={cn('text-sm font-semibold', dark ? 'text-slate-300' : 'text-slate-700')}>Chủ đề: {selected.subject}</p>}

                    {/* Message bubble */}
                    <div className={cn('rounded-xl p-4 text-sm leading-relaxed', dark ? 'bg-slate-800 text-slate-300' : 'bg-slate-50 text-slate-700 border border-slate-200')}>
                      <p className="text-[10px] text-slate-400 mb-2 flex items-center gap-1"><User size={10} /> {selected.name} · {new Date(selected.createdAt).toLocaleString('vi-VN')}</p>
                      {selected.message}
                    </div>

                    {/* Existing reply */}
                    {selected.reply && (
                      <div className={cn('rounded-xl p-4 border-l-4 border-blue-500', dark ? 'bg-blue-500/10' : 'bg-blue-50')}>
                        <p className="text-[10px] font-bold text-blue-400 mb-1 flex items-center gap-1"><Reply size={10} /> Phản hồi của bạn · {selected.repliedAt ? new Date(selected.repliedAt).toLocaleString('vi-VN') : ''}</p>
                        <p className={cn('text-sm', dark ? 'text-slate-300' : 'text-slate-700')}>{selected.reply}</p>
                      </div>
                    )}

                    {/* Reply box */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                        {selected.reply ? 'Cập nhật phản hồi' : 'Viết phản hồi'}
                      </label>
                      <textarea rows={4} value={replyText} onChange={e => setReplyText(e.target.value)}
                        placeholder="Nhập nội dung phản hồi cho khách..."
                        className={cn('w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30 resize-none transition-all',
                          dark ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400')} />
                      <button onClick={sendReply} disabled={replying || !replyText.trim()}
                        className={cn('w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all bg-blue-600 hover:bg-blue-500 text-white',
                          (replying || !replyText.trim()) && 'opacity-50 cursor-not-allowed')}>
                        {replying ? <><RefreshCw size={14} className="animate-spin" /> Đang gửi...</> : <><Reply size={14} /> Gửi phản hồi</>}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-16 gap-3">
                    <MessageSquare size={32} className="text-slate-500" />
                    <p className="text-sm text-slate-400">Chọn tin nhắn từ danh sách bên trái</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Tab: Stats ── */}
          {adminTab === 'stats' && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Tổng tin nhắn',    value: stats.total,   color: 'text-blue-400',   bg: dark ? 'bg-blue-500/10' : 'bg-blue-50' },
                { label: 'Chưa đọc',         value: stats.unread,  color: 'text-red-400',    bg: dark ? 'bg-red-500/10'  : 'bg-red-50'  },
                { label: 'Đã đọc',           value: stats.read,    color: 'text-yellow-400', bg: dark ? 'bg-yellow-500/10' : 'bg-yellow-50' },
                { label: 'Đã phản hồi',      value: stats.replied, color: 'text-green-400',  bg: dark ? 'bg-green-500/10' : 'bg-green-50' },
              ].map((s, i) => (
                <div key={i} className={cn(card, 'flex flex-col items-center gap-2 py-8')}>
                  <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center', s.bg)}>
                    <BarChart3 size={22} className={s.color} />
                  </div>
                  <p className={cn('text-3xl font-black', s.color)}>{s.value}</p>
                  <p className="text-xs text-slate-400">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Check reply section ───────────────────────────────────────────────────────
const CheckReplySection = ({ theme, dark }: { theme: Theme; dark: boolean }) => {
  const [email, setEmail] = useState('');
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [error, setError] = useState('');

  const check = async () => {
    if (!email.trim()) { setError('Vui lòng nhập email.'); return; }
    setChecking(true); setError(''); setResults(null);
    try {
      const r = await fetch(`${API}/api/contact/check?email=${encodeURIComponent(email.trim())}`);
      const res = await r.json();
      if (res.success) setResults(res.data ?? []);
      else setError(res.message || 'Không tìm thấy.');
    } catch {
      setError('Không kết nối được server.');
    } finally {
      setChecking(false);
    }
  };

  const card = cn('rounded-2xl border p-6', dark ? 'bg-slate-900/60 border-slate-700' : 'bg-white border-slate-200 shadow-sm');

  return (
    <div className={card}>
      <h2 className={cn('text-xs font-bold uppercase tracking-wider mb-1', dark ? 'text-slate-400' : 'text-slate-500')}>
        Kiểm tra phản hồi
      </h2>
      <p className={cn('text-sm mb-4', dark ? 'text-slate-400' : 'text-slate-500')}>
        Nhập email bạn đã dùng để gửi tin nhắn — chúng tôi sẽ hiển thị phản hồi từ đội ngũ hỗ trợ.
      </p>

      <div className="flex gap-3">
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && check()}
          placeholder="email@example.com"
          className={cn('flex-1 px-4 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500/30 transition-all',
            dark ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400')}
        />
        <button onClick={check} disabled={checking}
          className={cn('px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all bg-blue-600 hover:bg-blue-500 text-white', checking && 'opacity-70 cursor-not-allowed')}>
          {checking ? <RefreshCw size={15} className="animate-spin" /> : <Eye size={15} />}
          Kiểm tra
        </button>
      </div>

      {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

      {results !== null && (
        <div className="mt-5 space-y-4">
          {results.length === 0 ? (
            <p className={cn('text-sm text-center py-6', dark ? 'text-slate-400' : 'text-slate-500')}>
              Không tìm thấy tin nhắn nào với email này.
            </p>
          ) : results.map((msg: any) => (
            <div key={msg.id} className={cn('rounded-xl border p-4 space-y-3', dark ? 'border-slate-700' : 'border-slate-200')}>
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className={cn('text-sm font-semibold', dark ? 'text-slate-200' : 'text-slate-800')}>
                    {msg.subject || '(Không có chủ đề)'}
                  </p>
                  <p className="text-xs text-slate-400">{new Date(msg.createdAt).toLocaleString('vi-VN')}</p>
                </div>
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold',
                  msg.status === 'replied' ? 'bg-green-500/15 text-green-400' :
                  msg.status === 'read'    ? 'bg-yellow-500/15 text-yellow-400' :
                                             'bg-slate-500/15 text-slate-400'
                )}>
                  {msg.status === 'replied' ? 'Đã phản hồi' : msg.status === 'read' ? 'Đang xử lý' : 'Chờ xử lý'}
                </span>
              </div>

              {/* Tin nhắn gốc */}
              <div className={cn('rounded-lg p-3 text-sm', dark ? 'bg-slate-800 text-slate-300' : 'bg-slate-50 text-slate-700')}>
                <p className="text-[10px] text-slate-400 mb-1">Tin nhắn của bạn:</p>
                {msg.message}
              </div>

              {/* Phản hồi từ admin */}
              {msg.reply ? (
                <div className={cn('rounded-lg p-3 border-l-4 border-blue-500 text-sm', dark ? 'bg-blue-500/10 text-slate-300' : 'bg-blue-50 text-slate-700')}>
                  <p className="text-[10px] font-bold text-blue-400 mb-1 flex items-center gap-1">
                    <Reply size={10} /> Phản hồi từ VeriChainIDS · {msg.repliedAt ? new Date(msg.repliedAt).toLocaleString('vi-VN') : ''}
                  </p>
                  {msg.reply}
                </div>
              ) : (
                <div className={cn('rounded-lg p-3 text-sm text-center', dark ? 'bg-slate-800/50 text-slate-500' : 'bg-slate-50 text-slate-400')}>
                  Đội ngũ hỗ trợ đang xử lý tin nhắn của bạn. Vui lòng chờ trong 24 giờ.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ContactPage;
