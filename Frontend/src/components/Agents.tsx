import React, { useState, useEffect } from 'react';
import {
  Cpu, Plus, Server, Activity, Database, AlertTriangle,
  CheckCircle2, Trash2, KeyRound, Mail, Send, Download,
  Terminal, ExternalLink, AlertCircle, Copy, X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme, Agent } from '../types';
import { DownloadApi, type AgentStatus } from '../services/api';

interface AgentsProps {
  theme: Theme;
  t: any;
  agents: Agent[];
  setShowAddServerModal: (show: boolean) => void;
  canManageServers?: boolean;
  onDeleteServer?: (id: string) => Promise<void>;
  onViewServerKey?: (id: string, name: string) => void;
  onManageEmails?: (id: string, name: string) => void;
  onManageTelegram?: (id: string, name: string) => void;
}

export const Agents = ({
  theme,
  t,
  agents,
  setShowAddServerModal,
  canManageServers,
  onDeleteServer,
  onViewServerKey,
  onManageEmails,
  onManageTelegram,
}: AgentsProps) => {
  const [downloadStatus, setDownloadStatus] = useState<AgentStatus | null>(null);
  const [showBuildModal, setShowBuildModal] = useState(false);

  // Kiểm tra trạng thái Agent khi component mount (để hiện badge)
  useEffect(() => {
    DownloadApi.getAgentStatus().then(setDownloadStatus).catch(() => {});
  }, []);

  const handleDownloadAgent = async () => {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const zipUrl = `${baseUrl}/api/download/agent`;

    // Tải trực tiếp file .zip từ backend (backend serve file từ dist folder)
    window.location.href = zipUrl;
  };

  return (
    <div className="space-y-8">
      {/* Agent Download Banner */}
      {!downloadStatus && (
        <div className={cn(
          "rounded-xl border overflow-hidden",
          theme === 'dark' ? "bg-gradient-to-r from-emerald-900/20 to-slate-900 border-emerald-800" : "bg-gradient-to-r from-emerald-50 to-white border-emerald-200"
        )}>
          <div className="flex items-center justify-between p-5">
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center",
                theme === 'dark' ? "bg-emerald-600/20" : "bg-emerald-100"
              )}>
                <Terminal size={28} className="text-emerald-500" />
              </div>
              <div>
                <h3 className={cn(
                  "text-lg font-black",
                  theme === 'dark' ? "text-white" : "text-slate-900"
                )}>
                  VeriChainIDS Agent
                </h3>
                <p className={cn(
                  "text-sm mt-0.5",
                  theme === 'dark' ? "text-slate-400" : "text-slate-500"
                )}>
                  Agent giám sát server — thu thập traffic, phát hiện tấn công, auto-block IP
                </p>
              </div>
            </div>
            <button
              onClick={handleDownloadAgent}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-emerald-600/20"
            >
              <Download size={16} />
              Tải Agent
            </button>
          </div>
        </div>
      )}

      {/* Build Modal */}
      {showBuildModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className={cn(
            "w-full max-w-lg rounded-2xl border p-6 shadow-2xl",
            theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
          )}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/20">
                  <AlertCircle size={24} className="text-amber-500" />
                </div>
                <h3 className={cn("text-lg font-bold", theme === 'dark' ? 'text-white' : 'text-slate-900')}>
                  Agent chưa được build
                </h3>
              </div>
              <button
                onClick={() => setShowBuildModal(false)}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  theme === 'dark' ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
                )}
              >
                <X size={18} />
              </button>
            </div>

            <p className={cn(
              "text-sm mb-5",
              theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
            )}>
              File <code className="text-emerald-400 font-mono">VeriChainIDSAgent.zip</code> chưa tồn tại.
              Chạy script build để tạo file ZIP:
            </p>

            <div className={cn(
              "p-4 rounded-xl font-mono text-sm space-y-2 mb-5",
              theme === 'dark' ? 'bg-slate-950 text-slate-300' : 'bg-slate-950 text-slate-300'
            )}>
              <p className="text-slate-500 text-xs mb-2"># Mở CMD hoặc PowerShell (Run as Administrator)</p>
              <p className="text-emerald-400">cd "E:\Dự Án\VeriChainIDS\Agent\Agent_build_exe"</p>
              <p className="text-blue-400">build.bat</p>
            </div>

            <div className={cn(
              "p-3 rounded-lg text-xs",
              theme === 'dark' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-emerald-50 border border-emerald-200 text-emerald-600'
            )}>
              ⚡ Build tạo file ZIP tại <code className="font-mono">dist/VeriChainIDSAgent.zip</code>.
              Chứa <code className="font-mono">VeriChainIDSAgent.exe</code> + driver WinDivert64.dll/sys.
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowBuildModal(false)}
                className={cn(
                  "flex-1 py-2.5 rounded-xl border font-bold text-sm transition-all",
                  theme === 'dark' ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                )}
              >
                Đóng
              </button>
              <button
                onClick={async () => {
                  const status = await DownloadApi.getAgentStatus();
                  setDownloadStatus(status);
                  setShowBuildModal(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm transition-all"
              >
                Kiểm tra lại
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Servers List */}
      <div className={cn("border rounded-xl overflow-hidden transition-colors", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm")}>
        <div className={cn("p-6 border-b flex justify-between items-center", theme === 'dark' ? "border-slate-800" : "border-slate-100")}>
          <h3 className={cn("font-bold flex items-center gap-2", theme === 'dark' ? "text-white" : "text-slate-900")}>
            <Cpu size={18} className="text-indigo-400" />
            {t.assetHealth}
            <span className={cn(
              "ml-2 px-2 py-0.5 rounded-full text-xs font-bold",
              theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'
            )}>
              {agents.length} máy chủ
            </span>
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddServerModal(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Plus size={14} /> {t.addServer}
            </button>
          </div>
        </div>
        <div className="p-6 space-y-6">
          {agents.length === 0 ? (
            <div className="text-center py-12">
              <Server size={40} className={cn("mx-auto mb-3", theme === 'dark' ? "text-slate-700" : "text-slate-300")} />
              <p className={cn("text-sm", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>
                Chưa có máy chủ nào
              </p>
              <p className={cn("text-xs mt-1", theme === 'dark' ? "text-slate-600" : "text-slate-400")}>
                Nhấn "Thêm máy chủ" để bắt đầu
              </p>
            </div>
          ) : (
            agents.map((agent) => (
              <div key={agent.id} className="flex items-center gap-4">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center border shrink-0",
                  agent.status === 'online'
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                    : theme === 'dark'
                      ? "bg-slate-800 border-slate-700 text-slate-500"
                      : "bg-slate-100 border-slate-200 text-slate-400"
                )}>
                  <Server size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <h4 className={cn("text-sm font-bold truncate", theme === 'dark' ? "text-white" : "text-slate-900")}>
                      {agent.name}
                    </h4>
                    <span className="text-[10px] text-slate-500">{agent.lastSeen}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span className="font-mono">{agent.ip}</span>
                    <div className="flex items-center gap-1">
                      <Activity size={12} className="text-blue-400" />
                      <span>CPU: {agent.cpu}%</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Database size={12} className="text-purple-400" />
                      <span>RAM: {agent.ram}%</span>
                    </div>
                  </div>
                  <div className={cn("mt-2 w-full h-1 rounded-full overflow-hidden", theme === 'dark' ? "bg-slate-800" : "bg-slate-100")}>
                    <div
                      className={cn("h-full transition-all duration-500", agent.cpu > 80 ? "bg-rose-500" : "bg-blue-500")}
                      style={{ width: `${agent.cpu}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {onManageEmails && canManageServers && (
                    <button
                      type="button"
                      title="Quản lý email nhận thông báo"
                      onClick={() => onManageEmails(agent.id, agent.name)}
                      className={cn(
                        'p-2 rounded-lg border transition-colors',
                        theme === 'dark'
                          ? 'border-slate-700 text-purple-400 hover:bg-purple-500/10 hover:border-purple-500/30'
                          : 'border-slate-200 text-purple-600 hover:bg-purple-50 hover:border-purple-200'
                      )}
                    >
                      <Mail size={16} />
                    </button>
                  )}
                  {onManageTelegram && canManageServers && (
                    <button
                      type="button"
                      title="Quản lý Telegram nhận thông báo"
                      onClick={() => onManageTelegram(agent.id, agent.name)}
                      className={cn(
                        'p-2 rounded-lg border transition-colors',
                        theme === 'dark'
                          ? 'border-slate-700 text-sky-400 hover:bg-sky-500/10 hover:border-sky-500/30'
                          : 'border-slate-200 text-sky-600 hover:bg-sky-50 hover:border-sky-200'
                      )}
                    >
                      <Send size={16} />
                    </button>
                  )}
                  {onViewServerKey && (
                    <button
                      type="button"
                      title="Xem API Key"
                      onClick={() => onViewServerKey(agent.id, agent.name)}
                      className={cn(
                        'p-2 rounded-lg border transition-colors',
                        theme === 'dark'
                          ? 'border-slate-700 text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/30'
                          : 'border-slate-200 text-blue-600 hover:bg-blue-50 hover:border-blue-200'
                      )}
                    >
                      <KeyRound size={16} />
                    </button>
                  )}
                  {canManageServers && onDeleteServer && (
                    <button
                      type="button"
                      title="Xóa máy chủ"
                      onClick={async () => {
                        if (!window.confirm(`Xóa máy chủ "${agent.name}"? Thao tác không thể hoàn tác.`)) return;
                        await onDeleteServer(agent.id);
                      }}
                      className={cn(
                        'p-2 rounded-lg border transition-colors',
                        theme === 'dark'
                          ? 'border-slate-700 text-slate-400 hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-400'
                          : 'border-slate-200 text-slate-500 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600'
                      )}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  {agent.status === 'online' ? (
                    <CheckCircle2 size={18} className="text-emerald-500" />
                  ) : (
                    <AlertTriangle size={18} className="text-rose-500" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
