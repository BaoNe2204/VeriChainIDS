import React, { useState, useEffect, useCallback } from 'react';
import {
  Server as ServerIcon, Mail, MessageSquare, Plus, Trash2, ToggleLeft, ToggleRight,
  Search, RefreshCw, X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';
import { ServersApi, type Server, type ServerAlertEmail, type ServerTelegramRecipient } from '../services/api';
import { formatDateShortVi } from '../utils/dateUtils';

interface AddEmailModalProps {
  theme: Theme; serverId: string; onClose: () => void; onAdded: () => void;
}
function AddEmailModal({ theme, serverId, onClose, onAdded }: AddEmailModalProps) {
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const handle = async () => {
    if (!email.trim()) { setErr('Vui long nhap email'); return; }
    setSaving(true); setErr('');
    try {
      const res = await ServersApi.addAlertEmail(serverId, email.trim());
      if (res.success) { onAdded(); onClose(); }
      else setErr(res.message || 'Thêm thất bại');
    } catch { setErr('Loi ket noi'); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className={cn('w-full max-w-sm rounded-2xl border shadow-2xl p-5 animate-in zoom-in-95', theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200')}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={cn('text-base font-bold', theme === 'dark' ? 'text-white' : 'text-slate-900')}>Thêm email nhận cảnh báo</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"><X size={16} /></button>
        </div>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@company.com"
          onKeyDown={e => { if (e.key === 'Enter') handle(); }}
          className={cn('w-full rounded-lg px-4 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/50 mb-3',
            theme === 'dark' ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-600' : 'bg-slate-50 border-slate-200 text-slate-900')} />
        {err && <p className="text-xs text-rose-400 mb-3">{err}</p>}
        <p className="text-xs text-slate-500 mb-4">Tối đa <strong>5 email</strong> mỗi server.</p>
        <div className="flex gap-2">
          <button onClick={onClose} className={cn('flex-1 py-2 rounded-lg text-sm font-bold', theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600')}>Huy</button>
          <button onClick={handle} disabled={saving} className="flex-1 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-all">
            {saving ? '...' : 'Them'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface AddTelegramModalProps {
  theme: Theme; serverId: string; onClose: () => void; onAdded: () => void;
}
function AddTelegramModal({ theme, serverId, onClose, onAdded }: AddTelegramModalProps) {
  const [chatId, setChatId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const handle = async () => {
    if (!chatId.trim()) { setErr('Vui long nhap Chat ID'); return; }
    setSaving(true); setErr('');
    try {
      const res = await ServersApi.addTelegramRecipient(serverId, chatId.trim(), displayName.trim() || undefined);
      if (res.success) { onAdded(); onClose(); }
      else setErr(res.message || 'Thêm thất bại');
    } catch { setErr('Loi ket noi'); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className={cn('w-full max-w-sm rounded-2xl border shadow-2xl p-5 animate-in zoom-in-95', theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200')}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={cn('text-base font-bold', theme === 'dark' ? 'text-white' : 'text-slate-900')}>Thêm Telegram nhận cảnh báo</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase mb-1 block">Chat ID *</label>
            <input value={chatId} onChange={e => setChatId(e.target.value)} placeholder="123456789"
              className={cn('w-full rounded-lg px-4 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/50',
                theme === 'dark' ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-600' : 'bg-slate-50 border-slate-200 text-slate-900')} />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase mb-1 block">Tên hiển thị</label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Nhom DevOps"
              className={cn('w-full rounded-lg px-4 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/50',
                theme === 'dark' ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-600' : 'bg-slate-50 border-slate-200 text-slate-900')} />
          </div>
        </div>
        {err && <p className="text-xs text-rose-400 mt-3">{err}</p>}
        <p className="text-xs text-slate-500 mt-3 mb-4">Tối đa <strong>5 Telegram</strong> mỗi server.</p>
        <div className="flex gap-2">
          <button onClick={onClose} className={cn('flex-1 py-2 rounded-lg text-sm font-bold', theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600')}>Huy</button>
          <button onClick={handle} disabled={saving} className="flex-1 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-all">
            {saving ? '...' : 'Them'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ServerSettingsProps { theme: Theme; }

export const ServerSettings = ({ theme }: ServerSettingsProps) => {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [alertEmails, setAlertEmails] = useState<ServerAlertEmail[]>([]);
  const [telegramRecipients, setTelegramRecipients] = useState<ServerTelegramRecipient[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showAddEmail, setShowAddEmail] = useState(false);
  const [showAddTelegram, setShowAddTelegram] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadServers = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await ServersApi.getAll(1, 50);
      if (res.success && res.data) setServers(res.data.items as Server[]);
    } catch { setError('Lỗi tải danh sách server'); }
    finally { setLoading(false); }
  }, []);

  const loadServerSettings = useCallback(async (server: Server) => {
    setSettingsLoading(true);
    try {
      const [emailsRes, tgRes] = await Promise.all([
        ServersApi.getAlertEmails(server.id),
        ServersApi.getTelegramRecipients(server.id),
      ]);
      setAlertEmails(emailsRes.success ? emailsRes.data as ServerAlertEmail[] : []);
      setTelegramRecipients(tgRes.success ? tgRes.data as ServerTelegramRecipient[] : []);
    } catch { setAlertEmails([]); setTelegramRecipients([]); }
    finally { setSettingsLoading(false); }
  }, []);

  useEffect(() => { loadServers(); }, [loadServers]);

  const handleSelectServer = (server: Server) => {
    setSelectedServer(server);
    loadServerSettings(server);
  };

  const handleToggleEmail = async (email: ServerAlertEmail) => {
    if (!selectedServer) return;
    const res = await ServersApi.toggleAlertEmail(selectedServer.id, email.id);
    if (res.success && res.data) {
      setAlertEmails(es => es.map(e => e.id === email.id ? (res.data as ServerAlertEmail) : e));
    }
  };

  const handleDeleteEmail = async (email: ServerAlertEmail) => {
    if (!selectedServer) return;
    if (!confirm(`Xóa email ${email.email}?`)) return;
    const res = await ServersApi.deleteAlertEmail(selectedServer.id, email.id);
    if (res.success) setAlertEmails(es => es.filter(e => e.id !== email.id));
  };

  const handleToggleTelegram = async (tg: ServerTelegramRecipient) => {
    if (!selectedServer) return;
    const res = await ServersApi.toggleTelegramRecipient(selectedServer.id, tg.id);
    if (res.success && res.data) {
      setTelegramRecipients(ts => ts.map(t => t.id === tg.id ? (res.data as ServerTelegramRecipient) : t));
    }
  };

  const handleDeleteTelegram = async (tg: ServerTelegramRecipient) => {
    if (!selectedServer) return;
    if (!confirm(`Xóa Telegram ${tg.displayName || tg.chatId}?`)) return;
    const res = await ServersApi.deleteTelegramRecipient(selectedServer.id, tg.id);
    if (res.success) setTelegramRecipients(ts => ts.filter(t => t.id !== tg.id));
  };

  const filteredServers = search.trim()
    ? servers.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.ipAddress.includes(search))
    : servers;

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h2 className={cn('text-2xl font-bold', theme === 'dark' ? 'text-white' : 'text-slate-900')}>Cài đặt Server</h2>
          <p className="text-slate-400 text-sm mt-0.5">Cấu hình email và Telegram nhận cảnh báo theo từng server</p>
        </div>
        <button onClick={() => loadServers()}
          className={cn('p-2.5 rounded-lg border transition-all', theme === 'dark' ? 'border-slate-700 hover:bg-slate-800 text-slate-400' : 'border-slate-200 hover:bg-slate-100 text-slate-600')}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-rose-500 text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Server list */}
        <div className={cn('rounded-xl border overflow-hidden', theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm')}>
          <div className="p-3 border-b border-inherit">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tim server..."
                className={cn('w-full pl-8 pr-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/50',
                  theme === 'dark' ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-600' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400')} />
            </div>
          </div>
          <div className="divide-y divide-inherit max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-slate-500"><RefreshCw size={20} className="animate-spin mx-auto mb-2" /></div>
            ) : filteredServers.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">Không tìm thấy server.</div>
            ) : (
              filteredServers.map(server => (
                <button key={server.id} onClick={() => handleSelectServer(server)}
                  className={cn('w-full flex items-center gap-3 px-4 py-3 text-left transition-all',
                    selectedServer?.id === server.id
                      ? theme === 'dark' ? 'bg-blue-500/10' : 'bg-blue-50'
                      : theme === 'dark' ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'
                  )}>
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                    server.status === 'Online' ? 'bg-emerald-500/20' : theme === 'dark' ? 'bg-slate-800' : 'bg-slate-100')}>
                    <ServerIcon size={14} className={server.status === 'Online' ? 'text-emerald-400' : 'text-slate-400'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-semibold truncate', theme === 'dark' ? 'text-white' : 'text-slate-900')}>{server.name}</p>
                    <p className="text-[10px] font-mono text-slate-500">{server.ipAddress}</p>
                  </div>
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0',
                    server.status === 'Online' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-500'
                  )}>{server.status}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Settings panel */}
        <div className="lg:col-span-2">
          {!selectedServer ? (
            <div className={cn('rounded-xl border border-dashed flex flex-col items-center justify-center py-20 text-center',
              theme === 'dark' ? 'border-slate-700 bg-slate-900/30' : 'border-slate-200 bg-slate-50')}>
              <ServerIcon size={36} className="text-slate-600 mb-3" />
              <p className={cn('font-medium', theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>Chọn một server để cấu hình</p>
            </div>
          ) : settingsLoading ? (
            <div className={cn('rounded-xl border p-8 flex items-center justify-center',
              theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm')}>
              <RefreshCw size={24} className="animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Server header */}
              <div className={cn('rounded-xl border p-4', theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm')}>
                <div className="flex items-center gap-3">
                  <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center',
                    selectedServer.status === 'Online' ? 'bg-emerald-500/20' : theme === 'dark' ? 'bg-slate-800' : 'bg-slate-100')}>
                    <ServerIcon size={18} className={selectedServer.status === 'Online' ? 'text-emerald-400' : 'text-slate-400'} />
                  </div>
                  <div>
                    <p className={cn('text-base font-black', theme === 'dark' ? 'text-white' : 'text-slate-900')}>{selectedServer.name}</p>
                    <p className="text-xs font-mono text-slate-500">{selectedServer.ipAddress}</p>
                  </div>
                  <span className={cn('ml-auto text-xs font-bold px-2 py-0.5 rounded',
                    selectedServer.status === 'Online' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-500'
                  )}>{selectedServer.status}</span>
                </div>
              </div>

              {/* Email alerts */}
              <div className={cn('rounded-xl border overflow-hidden', theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm')}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-inherit">
                  <div className="flex items-center gap-2">
                    <Mail size={16} className="text-blue-400" />
                    <h3 className={cn('text-sm font-bold', theme === 'dark' ? 'text-white' : 'text-slate-900')}>Email nhận cảnh báo</h3>
                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                      alertEmails.length >= 5 ? 'bg-rose-500/10 text-rose-400' : theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'
                    )}>{alertEmails.length}/5</span>
                  </div>
                  <button onClick={() => setShowAddEmail(true)} disabled={alertEmails.length >= 5}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold transition-all">
                    <Plus size={13} /> Them email
                  </button>
                </div>
                <div className="divide-y divide-inherit">
                  {alertEmails.length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-slate-500">Chua co email nao.</div>
                  ) : (
                    alertEmails.map(email => (
                      <div key={email.id} className="flex items-center gap-3 px-5 py-3">
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                          email.isActive ? 'bg-blue-500/10' : theme === 'dark' ? 'bg-slate-800' : 'bg-slate-100')}>
                          <Mail size={14} className={email.isActive ? 'text-blue-400' : 'text-slate-500'} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-sm font-medium truncate', theme === 'dark' ? 'text-white' : 'text-slate-900', !email.isActive && 'opacity-50')}>{email.email}</p>
                          <p className="text-[10px] text-slate-500">Them {formatDateShortVi(email.createdAt)}</p>
                        </div>
                        <button onClick={() => handleToggleEmail(email)} title={email.isActive ? 'Tat' : 'Bat'}>
                          {email.isActive ? <ToggleRight size={22} className="text-emerald-400" /> : <ToggleLeft size={22} className="text-slate-500" />}
                        </button>
                        <button onClick={() => handleDeleteEmail(email)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Telegram alerts */}
              <div className={cn('rounded-xl border overflow-hidden', theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm')}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-inherit">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={16} className="text-blue-400" />
                    <h3 className={cn('text-sm font-bold', theme === 'dark' ? 'text-white' : 'text-slate-900')}>Telegram nhận cảnh báo</h3>
                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                      telegramRecipients.length >= 5 ? 'bg-rose-500/10 text-rose-400' : theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'
                    )}>{telegramRecipients.length}/5</span>
                  </div>
                  <button onClick={() => setShowAddTelegram(true)} disabled={telegramRecipients.length >= 5}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold transition-all">
                    <Plus size={13} /> Them Telegram
                  </button>
                </div>
                <div className="divide-y divide-inherit">
                  {telegramRecipients.length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-slate-500">Chua co Telegram nao.</div>
                  ) : (
                    telegramRecipients.map(tg => (
                      <div key={tg.id} className="flex items-center gap-3 px-5 py-3">
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                          tg.isActive ? 'bg-emerald-500/10' : theme === 'dark' ? 'bg-slate-800' : 'bg-slate-100')}>
                          <MessageSquare size={14} className={tg.isActive ? 'text-emerald-400' : 'text-slate-500'} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-sm font-medium truncate', theme === 'dark' ? 'text-white' : 'text-slate-900', !tg.isActive && 'opacity-50')}>
                            {tg.displayName || tg.chatId}
                          </p>
                          <p className="text-[10px] font-mono text-slate-500">{tg.chatId}</p>
                        </div>
                        <button onClick={() => handleToggleTelegram(tg)} title={tg.isActive ? 'Tat' : 'Bat'}>
                          {tg.isActive ? <ToggleRight size={22} className="text-emerald-400" /> : <ToggleLeft size={22} className="text-slate-500" />}
                        </button>
                        <button onClick={() => handleDeleteTelegram(tg)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showAddEmail && selectedServer && (
        <AddEmailModal theme={theme} serverId={selectedServer.id} onClose={() => setShowAddEmail(false)} onAdded={() => loadServerSettings(selectedServer)} />
      )}
      {showAddTelegram && selectedServer && (
        <AddTelegramModal theme={theme} serverId={selectedServer.id} onClose={() => setShowAddTelegram(false)} onAdded={() => loadServerSettings(selectedServer)} />
      )}
    </div>
  );
};

export default ServerSettings;
