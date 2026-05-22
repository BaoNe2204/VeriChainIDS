import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XCircle, QrCode, CheckCircle2, Plus, Copy, Trash2, AlertTriangle, RefreshCw, Smartphone } from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme, ApiKey, ServerKeyModalState } from '../types';
import { AuthApi } from '../services/api';
import { TwoFASetupModal } from './TwoFASetupModal';

interface ModalsProps {
  theme: Theme;
  t: any;
  showAddServerModal: boolean;
  setShowAddServerModal: (show: boolean) => void;
  show2FAModal: boolean;
  setShow2FAModal: (show: boolean) => void;
  showAPIKeyModal: boolean;
  setShowAPIKeyModal: (show: boolean) => void;
  apiKeys: Array<{ id: string; name: string; key: string; created: string; plainApiKey: string }>;
  generateApiKey: (serverId: string) => Promise<string | null>;
  deleteApiKey: (id: string) => void;
  is2FAEnabled: boolean;
  setIs2FAEnabled: (enabled: boolean) => void;
  /** Gọi sau khi bật/tắt 2FA thành công — refresh /me để UI đồng bộ */
  onTwoFAProfileSynced?: () => void | Promise<void>;
  selectedDetail: { type: string, data: any } | null;
  setSelectedDetail: (detail: { type: string, data: any } | null) => void;
  onAddServer: (
    name: string,
    ip: string
  ) => Promise<{ success: boolean; plainApiKey?: string; serverName?: string; serverId?: string; message?: string }>;
  onRegenerateServerKey?: (serverId: string) => Promise<boolean>;
  serverKeyToView: ServerKeyModalState | null;
  setServerKeyToView: (v: ServerKeyModalState | null) => void;
}

export const Modals = ({
  theme,
  t,
  showAddServerModal,
  setShowAddServerModal,
  show2FAModal,
  setShow2FAModal,
  showAPIKeyModal,
  setShowAPIKeyModal,
  apiKeys,
  generateApiKey,
  deleteApiKey,
  is2FAEnabled,
  setIs2FAEnabled,
  onTwoFAProfileSynced,
  selectedDetail,
  setSelectedDetail,
  onAddServer,
  onRegenerateServerKey,
  serverKeyToView,
  setServerKeyToView,
}: ModalsProps) => {
  const agentBackendUrl =
    typeof import.meta.env.VITE_API_URL === 'string' && import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL
      : 'http://localhost:5000';
  const agentInstallCommand =
    serverKeyToView?.plainApiKey && serverKeyToView?.serverId
      ? `python agent.py --api-key "${serverKeyToView.plainApiKey}" --server-url "${agentBackendUrl}" --server-id "${serverKeyToView.serverId}"`
      : '';

  // AddServer form state
  const [serverName, setServerName] = React.useState('');
  const [serverIp, setServerIp] = React.useState('');
  const [isAdding, setIsAdding] = React.useState(false);
  const [addError, setAddError] = React.useState('');
  const [regeneratingKey, setRegeneratingKey] = React.useState(false);
  const [copiedKey, setCopiedKey] = React.useState('');

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  return (
    <AnimatePresence>
      {showAddServerModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={cn("w-full max-w-md p-6 rounded-2xl border shadow-2xl transition-colors", theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200")}
          >
            <h3 className={cn("text-xl font-bold mb-4", theme === 'dark' ? "text-white" : "text-slate-900")}>{t.addServer}</h3>
            {addError && (
              <div className="mb-3 p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-bold">
                {addError}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">{t.serverName}</label>
                <input 
                  type="text" 
                  value={serverName}
                  onChange={e => setServerName(e.target.value)}
                  className={cn("w-full rounded-lg px-4 py-2 text-sm focus:outline-none border transition-colors", theme === 'dark' ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900")} 
                  placeholder="VD: Web-Server-01" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">{t.ipAddress}</label>
                <input 
                  type="text" 
                  value={serverIp}
                  onChange={e => setServerIp(e.target.value)}
                  className={cn("w-full rounded-lg px-4 py-2 text-sm focus:outline-none border transition-colors", theme === 'dark' ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900")} 
                  placeholder="VD: 192.168.1.100" 
                />
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => { setShowAddServerModal(false); setServerName(''); setServerIp(''); setAddError(''); }}
                className={cn("flex-1 py-2 rounded-lg border transition-colors", theme === 'dark' ? "border-slate-700 text-slate-400 hover:bg-slate-800" : "border-slate-200 text-slate-500 hover:bg-slate-100")}
              >{t.cancel}</button>
              <button 
                disabled={isAdding || !serverName.trim() || !serverIp.trim()}
                onClick={async () => {
                  setAddError('');
                  setIsAdding(true);
                  try {
                    const result = await onAddServer(serverName.trim(), serverIp.trim());
                    if (result.success) {
                      if (result.plainApiKey && result.serverId) {
                        setServerKeyToView({
                          serverId: result.serverId,
                          plainApiKey: result.plainApiKey,
                          serverName: result.serverName || serverName,
                        });
                        setServerName('');
                        setServerIp('');
                        setShowAddServerModal(false);
                      } else if (result.plainApiKey) {
                        setServerKeyToView({
                          serverId: '',
                          plainApiKey: result.plainApiKey,
                          serverName: result.serverName || serverName,
                        });
                        setServerName('');
                        setServerIp('');
                        setShowAddServerModal(false);
                      } else {
                        setServerName('');
                        setServerIp('');
                        setShowAddServerModal(false);
                      }
                    } else {
                      setAddError(result.message?.trim() || 'Thêm server thất bại. Vui lòng thử lại.');
                    }
                  } catch {
                    setAddError('Lỗi kết nối server.');
                  } finally {
                    setIsAdding(false);
                  }
                }}
                className="flex-1 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50"
              >{isAdding ? 'Đang thêm...' : (t.confirm || 'Xác Nhận')}</button>
            </div>
          </motion.div>
        </div>
      )}

      {show2FAModal && (
        <TwoFASetupModal
          theme={theme}
          t={t}
          is2FAEnabled={is2FAEnabled}
          setIs2FAEnabled={setIs2FAEnabled}
          onProfileSynced={onTwoFAProfileSynced}
          onClose={() => setShow2FAModal(false)}
        />
      )}

      {showAPIKeyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={cn("w-full max-w-2xl p-6 rounded-2xl border shadow-2xl transition-colors", theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200")}
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className={cn("text-xl font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>{t.apiKeyManagement}</h3>
              <button onClick={() => setShowAPIKeyModal(false)} className="text-slate-500 hover:text-rose-500 transition-colors"><XCircle size={24} /></button>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-slate-500">API keys are automatically generated when you add a new server.</p>
                {/* Removed manual API key generation - keys are now created per-server */}
              </div>

              <div className={cn("rounded-xl border overflow-hidden", theme === 'dark' ? "border-slate-800" : "border-slate-200")}>
                <table className="w-full text-left text-sm">
                  <thead className={theme === 'dark' ? "bg-slate-950 text-slate-400" : "bg-slate-50 text-slate-500"}>
                    <tr>
                      <th className="px-4 py-3 font-bold uppercase text-[10px]">{t.keyName}</th>
                      <th className="px-4 py-3 font-bold uppercase text-[10px]">Key</th>
                      <th className="px-4 py-3 font-bold uppercase text-[10px]">{t.createdDate}</th>
                      <th className="px-4 py-3 font-bold uppercase text-[10px] text-right">{t.action}</th>
                    </tr>
                  </thead>
                  <tbody className={cn("divide-y", theme === 'dark' ? "divide-slate-800" : "divide-slate-100")}>
                    {apiKeys.map(key => (
                      <tr key={key.id} className={cn("transition-colors", theme === 'dark' ? "hover:bg-slate-800/50" : "hover:bg-slate-50")}>
                        <td className="px-4 py-3 font-medium">{key.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{key.key}</td>
                        <td className="px-4 py-3 text-slate-500">{key.created}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button className="p-1.5 rounded hover:bg-slate-700 text-slate-400 transition-colors" title={t.copyKey}>
                              <Copy size={14} />
                            </button>
                            <button 
                              onClick={() => deleteApiKey(key.id)}
                              className="p-1.5 rounded hover:bg-rose-500/20 text-rose-500 transition-colors" 
                              title={t.deleteKey}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {selectedDetail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={cn("w-full max-w-3xl my-8 p-6 rounded-2xl border shadow-2xl transition-colors", theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200")}
          >
            <div className="flex justify-between items-start gap-4 mb-6">
              <h3 className={cn("text-xl font-bold flex-1", theme === 'dark' ? "text-white" : "text-slate-900")}>
                {t.details} - {selectedDetail.data.title || selectedDetail.data.name || selectedDetail.data.message || 'Chi tiết'}
              </h3>
              <button onClick={() => setSelectedDetail(null)} className="text-slate-500 hover:text-rose-500 transition-colors shrink-0">
                <XCircle size={24} />
              </button>
            </div>
            
            {/* Scrollable content area with max height */}
            <div className="max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(selectedDetail.data).map(([key, value]) => (
                  <div key={key} className={cn(
                    "space-y-1 p-3 rounded-lg transition-colors",
                    theme === 'dark' ? "bg-slate-950/50" : "bg-slate-50"
                  )}>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{key}</p>
                    <p className={cn(
                      "text-sm font-mono break-words whitespace-pre-wrap",
                      theme === 'dark' ? "text-slate-200" : "text-slate-700"
                    )}>
                      {value === null || value === undefined ? '—' : String(value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            
            <div className={cn("mt-6 pt-4 border-t flex justify-end transition-colors", theme === 'dark' ? "border-slate-800" : "border-slate-100")}>
              <button 
                onClick={() => setSelectedDetail(null)} 
                className={cn("px-6 py-2 rounded-lg font-bold transition-colors", theme === 'dark' ? "bg-slate-800 text-white hover:bg-slate-700" : "bg-slate-100 text-slate-900 hover:bg-slate-200")}
              >
                {t.close || t.cancel || 'Đóng'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal API Key: có plain key (tạo mới / tái tạo) hoặc chỉ prefix (GET /key) */}
      {serverKeyToView && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            className={cn(
              'w-full max-w-lg p-6 rounded-2xl border-2 shadow-2xl',
              serverKeyToView.plainApiKey
                ? 'border-blue-500/30 shadow-blue-500/10'
                : 'border-amber-500/30 shadow-amber-500/10',
              theme === 'dark' ? 'bg-slate-900' : 'bg-white'
            )}
          >
            <div className="text-center mb-6">
              <div
                className={cn(
                  'w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center',
                  serverKeyToView.plainApiKey ? 'bg-blue-500/10' : 'bg-amber-500/10'
                )}
              >
                {serverKeyToView.plainApiKey ? (
                  <CheckCircle2 size={28} className="text-blue-500" />
                ) : (
                  <AlertTriangle size={28} className="text-amber-500" />
                )}
              </div>
              <h3 className={cn('text-xl font-bold mb-2', theme === 'dark' ? 'text-white' : 'text-slate-900')}>
                API Key — &quot;{serverKeyToView.serverName}&quot;
              </h3>
              {serverKeyToView.plainApiKey ? (
                <p className="text-sm text-slate-500">
                  Lưu key ngay. Chuỗi đầy đủ chỉ hiện lúc tạo server hoặc sau khi tái tạo.
                </p>
              ) : (
                <p className="text-sm text-slate-500 text-left leading-relaxed">
                  Backend chỉ lưu <strong>hash</strong> của key, không lưu chuỗi <code className="text-xs">sk_...</code> đầy đủ.
                  Bạn chỉ thấy <strong>prefix</strong> bên dưới. Để lấy key đầy đủ cho agent, bấm{' '}
                  <strong>Tái tạo API Key</strong> — key cũ sẽ ngừng hoạt động.
                </p>
              )}
            </div>

            {serverKeyToView.plainApiKey ? (
              <>
                <div
                  className={cn(
                    'rounded-xl p-4 mb-4 border',
                    theme === 'dark' ? 'bg-slate-950 border-slate-700' : 'bg-slate-50 border-slate-200'
                  )}
                >
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Agent API Key (đầy đủ)</p>
                  <div className="flex items-center gap-2">
                    <code
                      className={cn(
                        'flex-1 text-sm font-mono break-all',
                        theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'
                      )}
                    >
                      {serverKeyToView.plainApiKey}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyText(serverKeyToView.plainApiKey!, 'apiKey')}
                      className={cn(
                        'shrink-0 p-2 rounded-lg transition-colors',
                        copiedKey === 'apiKey'
                          ? 'bg-green-600 text-white'
                          : 'bg-blue-600 hover:bg-blue-500 text-white'
                      )}
                      title="Sao chép"
                    >
                      {copiedKey === 'apiKey' ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                <div
                  className={cn(
                    'rounded-xl p-4 mb-6 border',
                    theme === 'dark' ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50 border-amber-200'
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-amber-600 font-medium flex items-center gap-2">
                      <AlertTriangle size={16} className="shrink-0" />
                      Chạy agent:
                    </p>
                    <button
                      type="button"
                      onClick={() => copyText(agentInstallCommand, 'agentCommand')}
                      className={cn(
                        'shrink-0 p-2 rounded-lg transition-colors',
                        copiedKey === 'agentCommand'
                          ? 'bg-green-600 text-white'
                          : 'bg-blue-600 hover:bg-blue-500 text-white'
                      )}
                      title="Sao chép lệnh"
                    >
                      {copiedKey === 'agentCommand' ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                  <code
                    className={cn(
                      'block mt-2 text-xs font-mono break-all p-2 rounded',
                      theme === 'dark' ? 'bg-slate-950 text-slate-300' : 'bg-white border border-slate-200 text-slate-700'
                    )}
                  >
                    {agentInstallCommand}
                  </code>
                </div>
              </>
            ) : (
              <div
                className={cn(
                  'rounded-xl p-4 mb-4 border',
                  theme === 'dark' ? 'bg-slate-950 border-slate-700' : 'bg-slate-50 border-slate-200'
                )}
              >
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Prefix (nhận biết key)</p>
                <code
                  className={cn(
                    'block text-sm font-mono break-all',
                    theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
                  )}
                >
                  {serverKeyToView.keyPrefix || '—'}
                </code>
              </div>
            )}

            {!serverKeyToView.plainApiKey && onRegenerateServerKey && serverKeyToView.serverId ? (
              <button
                type="button"
                disabled={regeneratingKey}
                onClick={async () => {
                  if (
                    !window.confirm(
                      'Tái tạo sẽ vô hiệu hóa key cũ. Agent đang chạy phải dùng key mới. Tiếp tục?'
                    )
                  )
                    return;
                  setRegeneratingKey(true);
                  try {
                    await onRegenerateServerKey(serverKeyToView.serverId);
                  } finally {
                    setRegeneratingKey(false);
                  }
                }}
                className="w-full py-3 mb-3 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-500 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <RefreshCw size={18} className={regeneratingKey ? 'animate-spin' : ''} />
                {regeneratingKey ? 'Đang tái tạo...' : 'Tái tạo API Key (hiện key đầy đủ)'}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => {
                setServerKeyToView(null);
                setServerName('');
                setServerIp('');
                setShowAddServerModal(false);
              }}
              className={cn(
                'w-full py-3 rounded-xl font-bold transition-colors shadow-lg',
                serverKeyToView.plainApiKey
                  ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-600/20'
                  : theme === 'dark'
                    ? 'bg-slate-700 text-white hover:bg-slate-600'
                    : 'bg-slate-200 text-slate-900 hover:bg-slate-300'
              )}
            >
              Đóng
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
