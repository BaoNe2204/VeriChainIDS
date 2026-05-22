import React, { useState, useCallback } from 'react';
import {
  BookOpen, Code, Shield, Terminal, Copy, CheckCircle,
  AlertTriangle, ChevronDown, ChevronRight, Download, Key,
  Server, Bell, Lock, Zap, Globe, FileText, ExternalLink,
  BookMarked, Layers, Database, Activity,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';

interface ApiGuideProps {
  theme: Theme;
  t: any;
  guide: any;
}

type SectionId = 'overview' | 'auth' | 'logs' | 'alerts' | 'defense' | 'whitelist' | 'agents' | 'quickstart';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ──────────────────────────────────────────────
// Code block với copy button
// ──────────────────────────────────────────────
const CodeBlock = ({
  code,
  language = 'bash',
  theme,
}: {
  code: string;
  language?: string;
  theme: Theme;
}) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <button
        onClick={copy}
        className={cn(
          "absolute top-3 right-3 p-1.5 rounded-lg border text-xs font-bold transition-all opacity-0 group-hover:opacity-100",
          copied
            ? "bg-green-600/20 border-green-500/30 text-green-400"
            : theme === 'dark'
              ? "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
              : "bg-white border-slate-200 text-slate-500 hover:bg-slate-100"
        )}
      >
        {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
      </button>
      <pre className={cn(
        "p-4 rounded-xl text-sm font-mono overflow-x-auto leading-relaxed",
        theme === 'dark' ? "bg-slate-950 text-slate-300" : "bg-slate-900 text-slate-100"
      )}>
        <code>{code}</code>
      </pre>
    </div>
  );
};

// ──────────────────────────────────────────────
// Endpoint card
// ──────────────────────────────────────────────
const EndpointCard = ({
  method,
  path,
  description,
  requestBody,
  params,
  response,
  theme,
}: {
  method: string;
  path: string;
  description: string;
  requestBody?: string;
  params?: Array<{ name: string; type: string; required: boolean; desc: string }>;
  response?: string;
  theme: Theme;
}) => {
  const [open, setOpen] = useState(false);

  const methodColors: Record<string, string> = {
    GET: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30',
    POST: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
    PUT: 'bg-amber-600/20 text-amber-400 border-amber-500/30',
    DELETE: 'bg-rose-600/20 text-rose-400 border-rose-500/30',
    PATCH: 'bg-purple-600/20 text-purple-400 border-purple-500/30',
  };

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden transition-all",
      theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
    )}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-800/30 transition-colors"
      >
        <span className={cn(
          "px-2.5 py-1 rounded-lg text-xs font-black border shrink-0",
          methodColors[method] || 'bg-slate-600/20 text-slate-400 border-slate-500/30'
        )}>
          {method}
        </span>
        <code className={cn(
          "text-sm font-mono flex-1",
          theme === 'dark' ? "text-slate-200" : "text-slate-800"
        )}>
          {path}
        </code>
        <p className={cn(
          "text-xs hidden sm:block flex-1",
          theme === 'dark' ? "text-slate-500" : "text-slate-400"
        )}>
          {description}
        </p>
        {open ? (
          <ChevronDown size={16} className={cn("shrink-0", theme === 'dark' ? "text-slate-500" : "text-slate-400")} />
        ) : (
          <ChevronRight size={16} className={cn("shrink-0", theme === 'dark' ? "text-slate-500" : "text-slate-400")} />
        )}
      </button>

      {open && (
        <div className={cn(
          "border-t px-4 pb-4 pt-3 space-y-4",
          theme === 'dark' ? "border-slate-800" : "border-slate-200"
        )}>
          {params && params.length > 0 && (
            <div>
              <h4 className={cn("text-xs font-bold uppercase tracking-wider mb-2", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>
                Query / Path Parameters
              </h4>
              <div className="space-y-1">
                {params.map((p) => (
                  <div key={p.name} className="flex items-center gap-2 text-xs">
                    <code className={cn(
                      "px-2 py-0.5 rounded font-mono",
                      theme === 'dark' ? "bg-slate-800 text-blue-400" : "bg-slate-100 text-blue-600"
                    )}>
                      {p.name}
                    </code>
                    <span className="text-slate-500">({p.type})</span>
                    {p.required && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-400 font-bold">required</span>
                    )}
                    <span className={cn("", theme === 'dark' ? "text-slate-400" : "text-slate-500")}>
                      — {p.desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {requestBody && (
            <div>
              <h4 className={cn("text-xs font-bold uppercase tracking-wider mb-2", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>
                Request Body (JSON)
              </h4>
              <CodeBlock code={requestBody} theme={theme} />
            </div>
          )}
          {response && (
            <div>
              <h4 className={cn("text-xs font-bold uppercase tracking-wider mb-2", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>
                Response
              </h4>
              <CodeBlock code={response} theme={theme} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────
// Sidebar nav item
// ──────────────────────────────────────────────
const NavItem = ({
  id,
  label,
  icon: Icon,
  active,
  onClick,
  theme,
}: {
  id: SectionId;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  active: boolean;
  onClick: (id: SectionId) => void;
  theme: Theme;
}) => (
  <button
    onClick={() => onClick(id)}
    className={cn(
      "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left",
      active
        ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
        : theme === 'dark'
          ? "text-slate-400 hover:text-white hover:bg-slate-800"
          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
    )}
  >
    <Icon size={16} />
    {label}
  </button>
);

// ──────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────
export const ApiGuide = ({ theme }: ApiGuideProps) => {
  const [activeSection, setActiveSection] = useState<SectionId>('overview');

  const navItems: Array<{ id: SectionId; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
    { id: 'overview', label: 'Tổng quan', icon: BookOpen },
    { id: 'auth', label: 'Xác thực', icon: Shield },
    { id: 'quickstart', label: 'Bắt đầu nhanh', icon: Zap },
    { id: 'logs', label: 'Logs Ingest', icon: Database },
    { id: 'alerts', label: 'Alerts', icon: Bell },
    { id: 'defense', label: 'Defense', icon: Lock },
    { id: 'whitelist', label: 'Whitelist', icon: Shield },
    { id: 'agents', label: 'Agents', icon: Server },
  ];

  const scrollToSection = (id: SectionId) => {
    setActiveSection(id);
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className={cn(
            "text-3xl font-black tracking-tight",
            theme === 'dark' ? "text-white" : "text-slate-900"
          )}>
            📘 Tài liệu API
          </h1>
          <p className={cn(
            "text-sm mt-1",
            theme === 'dark' ? "text-slate-400" : "text-slate-500"
          )}>
            VeriChainIDS SOC Platform — phiên bản 2026
          </p>
        </div>
        <a
          href={`${BASE_URL}/swagger`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all",
            theme === 'dark'
              ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
          )}
        >
          <ExternalLink size={14} />
          Swagger UI
        </a>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* Sidebar Navigation */}
        <div className={cn(
          "hidden lg:block w-56 shrink-0 rounded-xl border p-3 space-y-1 h-fit sticky top-24",
          theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
        )}>
          {navItems.map(item => (
            <NavItem
              key={item.id}
              {...item}
              active={activeSection === item.id}
              onClick={scrollToSection}
              theme={theme}
            />
          ))}
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0 space-y-16">

          {/* ── 1. OVERVIEW ─────────────────────── */}
          <section id="section-overview">
            <div className={cn(
              "flex items-center gap-3 mb-6",
            )}>
              <div className={cn(
                "p-2.5 rounded-xl",
                theme === 'dark' ? "bg-blue-600/20" : "bg-blue-100"
              )}>
                <BookMarked size={22} className="text-blue-500" />
              </div>
              <h2 className={cn(
                "text-2xl font-black",
                theme === 'dark' ? "text-white" : "text-slate-900"
              )}>
                Tổng quan API
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className={cn(
                "p-5 rounded-xl border",
                theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
              )}>
                <Globe size={20} className="text-blue-400 mb-2" />
                <h4 className={cn("font-bold text-sm mb-1", theme === 'dark' ? "text-white" : "text-slate-900")}>Base URL</h4>
                <code className={cn(
                  "text-xs font-mono text-blue-400",
                  theme === 'dark' ? "text-slate-300" : "text-slate-600"
                )}>{BASE_URL}/api</code>
              </div>
              <div className={cn(
                "p-5 rounded-xl border",
                theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
              )}>
                <Layers size={20} className="text-amber-400 mb-2" />
                <h4 className={cn("font-bold text-sm mb-1", theme === 'dark' ? "text-white" : "text-slate-900")}>Định dạng</h4>
                <p className={cn("text-xs", theme === 'dark' ? "text-slate-400" : "text-slate-500")}>JSON / REST API</p>
              </div>
              <div className={cn(
                "p-5 rounded-xl border",
                theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
              )}>
                <Zap size={20} className="text-emerald-400 mb-2" />
                <h4 className={cn("font-bold text-sm mb-1", theme === 'dark' ? "text-white" : "text-slate-900")}>Rate Limit</h4>
                <p className={cn("text-xs", theme === 'dark' ? "text-slate-400" : "text-slate-500")}>5,000 req/phút</p>
              </div>
            </div>

            <div className={cn(
              "p-4 rounded-xl border text-sm space-y-2",
              theme === 'dark' ? "bg-slate-900/50 border-slate-800 text-slate-400" : "bg-white border-slate-200 text-slate-600"
            )}>
              <p><strong className="text-emerald-400">✅ Có 2 cách xác thực:</strong></p>
              <ul className="ml-4 space-y-1">
                <li>• <strong>JWT Bearer Token</strong> — cho Dashboard (đăng nhập web)</li>
                <li>• <strong>X-API-Key</strong> — cho Agent / AI Engine / server scripts</li>
              </ul>
            </div>
          </section>

          {/* ── 2. AUTH ─────────────────────────── */}
          <section id="section-auth">
            <div className={cn("flex items-center gap-3 mb-6")}>
              <div className={cn(
                "p-2.5 rounded-xl",
                theme === 'dark' ? "bg-emerald-600/20" : "bg-emerald-100"
              )}>
                <Shield size={22} className="text-emerald-500" />
              </div>
              <h2 className={cn(
                "text-2xl font-black",
                theme === 'dark' ? "text-white" : "text-slate-900"
              )}>
                Xác thực
              </h2>
            </div>

            {/* JWT */}
            <div className={cn(
              "rounded-xl border overflow-hidden mb-4",
              theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
            )}>
              <div className={cn(
                "p-4 border-b",
                theme === 'dark' ? "border-slate-800" : "border-slate-200"
              )}>
                <h3 className={cn("font-bold text-base", theme === 'dark' ? "text-white" : "text-slate-900")}>
                  JWT Bearer Token (Dashboard)
                </h3>
                <p className={cn("text-xs mt-1", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>
                  Dùng khi gọi API từ frontend web
                </p>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <h4 className={cn("text-xs font-bold uppercase tracking-wider mb-2", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>
                    1. Đăng nhập
                  </h4>
                  <CodeBlock
                    code={`POST ${BASE_URL}/api/auth/login
Content-Type: application/json

{
  "email": "admin@cybemonitor.io",
  "password": "your-password"
}`}
                    theme={theme}
                  />
                </div>
                <div>
                  <h4 className={cn("text-xs font-bold uppercase tracking-wider mb-2", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>
                    2. Dùng token trong header
                  </h4>
                  <CodeBlock
                    code={`Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`}
                    theme={theme}
                  />
                </div>
              </div>
            </div>

            {/* API Key */}
            <div className={cn(
              "rounded-xl border overflow-hidden",
              theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
            )}>
              <div className={cn(
                "p-4 border-b",
                theme === 'dark' ? "border-slate-800" : "border-slate-200"
              )}>
                <h3 className={cn("font-bold text-base", theme === 'dark' ? "text-white" : "text-slate-900")}>
                  API Key (Agent / AI Engine)
                </h3>
                <p className={cn("text-xs mt-1", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>
                  Dùng khi Agent gửi logs, AI Engine trigger alerts
                </p>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <h4 className={cn("text-xs font-bold uppercase tracking-wider mb-2", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>
                    Cách sử dụng
                  </h4>
                  <CodeBlock
                    code={`X-API-Key: cm_sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}
                    theme={theme}
                  />
                </div>
                <div className={cn(
                  "p-3 rounded-lg text-xs",
                  theme === 'dark' ? "bg-amber-500/10 border border-amber-500/20 text-amber-400" : "bg-amber-50 border border-amber-200 text-amber-600"
                )}>
                  💡 Lấy API Key từ trang <strong>Quản lý API → API Keys</strong> sau khi thêm Server.
                </div>
              </div>
            </div>
          </section>

          {/* ── 3. QUICKSTART ────────────────────── */}
          <section id="section-quickstart">
            <div className={cn("flex items-center gap-3 mb-6")}>
              <div className={cn(
                "p-2.5 rounded-xl",
                theme === 'dark' ? "bg-amber-600/20" : "bg-amber-100"
              )}>
                <Zap size={22} className="text-amber-500" />
              </div>
              <h2 className={cn(
                "text-2xl font-black",
                theme === 'dark' ? "text-white" : "text-slate-900"
              )}>
                Bắt đầu nhanh
              </h2>
            </div>

            <div className="space-y-4">
              {[
                {
                  step: '1',
                  title: 'Tải Agent',
                  desc: 'Tải VeriChainIDSAgent.exe từ trang Tác nhân & Tài sản',
                  code: `# Tải từ trình duyệt:
${BASE_URL}/api/download/agent

# Hoặc mở trang Tác nhân → nhấn "Tải Agent"`,
                },
                {
                  step: '2',
                  title: 'Lấy API Key',
                  desc: 'Thêm Server trong Dashboard → lấy API Key',
                  code: `# API Key có dạng:
cm_sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`,
                },
                {
                  step: '3',
                  title: 'Chạy Agent',
                  desc: 'Cài đặt Python 3.8+ và chạy agent với API Key',
                  code: `# Windows:
.\\VeriChainIDSAgent.exe -k YOUR_API_KEY -u ${BASE_URL}

# Linux/Mac:
./VeriChainIDSAgent -k YOUR_API_KEY -u ${BASE_URL}

# Python trực tiếp:
cd Agent/Agent_build_exe
python main.py -k YOUR_API_KEY -u ${BASE_URL}`,
                },
                {
                  step: '4',
                  title: 'Kiểm tra kết nối',
                  desc: 'Xem server online trong Dashboard',
                  code: `# Server sẽ xuất hiện trong Tác nhân & Tài sản
# Trạng thái "Online" = kết nối thành công ✅`,
                },
              ].map(item => (
                <div key={item.step} className={cn(
                  "rounded-xl border overflow-hidden",
                  theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
                )}>
                  <div className={cn(
                    "flex items-center gap-3 p-4 border-b",
                    theme === 'dark' ? "border-slate-800" : "border-slate-200"
                  )}>
                    <span className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 font-black text-sm flex items-center justify-center shrink-0">
                      {item.step}
                    </span>
                    <div>
                      <h3 className={cn("font-bold text-sm", theme === 'dark' ? "text-white" : "text-slate-900")}>
                        {item.title}
                      </h3>
                      <p className={cn("text-xs", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>
                        {item.desc}
                      </p>
                    </div>
                  </div>
                  <div className="p-4">
                    <CodeBlock code={item.code} theme={theme} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── 4. LOGS INGEST ─────────────────── */}
          <section id="section-logs">
            <div className={cn("flex items-center gap-3 mb-6")}>
              <div className={cn(
                "p-2.5 rounded-xl",
                theme === 'dark' ? "bg-purple-600/20" : "bg-purple-100"
              )}>
                <Database size={22} className="text-purple-500" />
              </div>
              <h2 className={cn(
                "text-2xl font-black",
                theme === 'dark' ? "text-white" : "text-slate-900"
              )}>
                Logs Ingest API
              </h2>
            </div>

            <div className="space-y-3">
              <EndpointCard
                method="POST"
                path={`${BASE_URL}/api/logs/ingest`}
                description="Gửi traffic logs từ Agent lên backend"
                params={[
                  { name: 'X-API-Key', type: 'header', required: true, desc: 'API Key của server' },
                ]}
                requestBody={`{
  "logs": [
    {
      "sourceIp": "192.168.1.100",
      "destinationIp": "10.0.0.1",
      "sourcePort": 54321,
      "destinationPort": 443,
      "protocol": "TCP",
      "bytesIn": 1024,
      "bytesOut": 2048,
      "packetsIn": 10,
      "packetsOut": 8,
      "requestCount": 5,
      "rawPayload": "GET /admin HTTP/1.1"
    }
  ],
  "hostname": "web-server-01",
  "os": "Ubuntu 22.04",
  "cpuPercent": 45.5,
  "ramPercent": 62.3,
  "diskPercent": 55.0
}`}
                response={`{
  "success": true,
  "message": "Logs ingested",
  "data": {
    "logsProcessed": 1,
    "anomaliesDetected": 0,
    "alertsCreated": 0,
    "blocked": []
  }
}`}
                theme={theme}
              />
            </div>
          </section>

          {/* ── 5. ALERTS ──────────────────────── */}
          <section id="section-alerts">
            <div className={cn("flex items-center gap-3 mb-6")}>
              <div className={cn(
                "p-2.5 rounded-xl",
                theme === 'dark' ? "bg-rose-600/20" : "bg-rose-100"
              )}>
                <Bell size={22} className="text-rose-500" />
              </div>
              <h2 className={cn(
                "text-2xl font-black",
                theme === 'dark' ? "text-white" : "text-slate-900"
              )}>
                Alerts API
              </h2>
            </div>

            <div className="space-y-3">
              <EndpointCard
                method="POST"
                path={`${BASE_URL}/api/alerts/trigger`}
                description="AI Engine trigger alert khi phát hiện tấn công"
                params={[
                  { name: 'X-API-Key', type: 'header', required: true, desc: 'API Key của server' },
                ]}
                requestBody={`{
  "severity": "High",
  "alertType": "BruteForce",
  "title": "SSH Brute Force Attack Detected",
  "description": "Multiple failed SSH login attempts from 203.0.113.45",
  "sourceIp": "203.0.113.45",
  "targetAsset": "ssh-server-01",
  "mitreTechnique": "T1110",
  "mitreTactic": "Credential Access",
  "anomalyScore": 0.85,
  "recommendedAction": "Block this IP immediately using /api/defense/block-ip"
}`}
                response={`{
  "success": true,
  "message": "Alert created",
  "data": {
    "alertId": "a1b2c3d4-...",
    "alertType": "BruteForce",
    "severity": "High",
    "anomalyScore": 0.85,
    "action": "alert_created"
  }
}`}
                theme={theme}
              />

              <EndpointCard
                method="GET"
                path={`${BASE_URL}/api/alerts`}
                description="Lấy danh sách alerts (Dashboard)"
                params={[
                  { name: 'page', type: 'int', required: false, desc: 'Trang (mặc định: 1)' },
                  { name: 'pageSize', type: 'int', required: false, desc: 'Số lượng/trang (mặc định: 20)' },
                  { name: 'severity', type: 'string', required: false, desc: 'Lọc theo severity: Critical, High, Medium, Low' },
                  { name: 'status', type: 'string', required: false, desc: 'Lọc theo status: Open, Acknowledged, Investigating, Resolved, FalsePositive' },
                ]}
                theme={theme}
              />

              <EndpointCard
                method="PUT"
                path={`${BASE_URL}/api/alerts/{id}/status`}
                description="Cập nhật trạng thái alert"
                requestBody={`{
  "alertId": "a1b2c3d4-...",
  "status": "Resolved",
  "updatedBy": "user-id-or-admin"
}`}
                theme={theme}
              />
            </div>
          </section>

          {/* ── 6. DEFENSE ────────────────────── */}
          <section id="section-defense">
            <div className={cn("flex items-center gap-3 mb-6")}>
              <div className={cn(
                "p-2.5 rounded-xl",
                theme === 'dark' ? "bg-red-600/20" : "bg-red-100"
              )}>
                <Lock size={22} className="text-red-500" />
              </div>
              <h2 className={cn(
                "text-2xl font-black",
                theme === 'dark' ? "text-white" : "text-slate-900"
              )}>
                Defense API
              </h2>
            </div>

            <div className="space-y-3">
              <EndpointCard
                method="POST"
                path={`${BASE_URL}/api/defense/block-ip`}
                description="Block IP tự động hoặc thủ công"
                params={[
                  { name: 'X-API-Key', type: 'header', required: false, desc: 'Chỉ cần khi gọi từ Agent/AI Engine' },
                ]}
                requestBody={`{
  "ip": "203.0.113.45",
  "attackType": "BruteForce",
  "severity": "High",
  "reason": "Multiple failed SSH login attempts from this IP",
  "blockedBy": "AI-Engine",
  "blockDurationMinutes": 1440,
  "serverId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}`}
                response={`{
  "success": true,
  "message": "IP 203.0.113.45 has been blocked.",
  "data": {
    "ip": "203.0.113.45",
    "action": "blocked",
    "blockedAt": "2026-04-08T12:00:00Z",
    "expiresAt": "2026-04-09T12:00:00Z",
    "blockId": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
    "severity": "High"
  }
}`}
                theme={theme}
              />

              <EndpointCard
                method="POST"
                path={`${BASE_URL}/api/defense/unblock-ip`}
                description="Bỏ chặn IP"
                requestBody={`{
  "ip": "203.0.113.45",
  "serverId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "unblockedBy": "admin@cybemonitor.io"
}`}
                theme={theme}
              />

              <EndpointCard
                method="GET"
                path={`${BASE_URL}/api/defense/blocked-ips`}
                description="Lấy danh sách IP bị chặn"
                params={[
                  { name: 'page', type: 'int', required: false, desc: 'Trang' },
                  { name: 'pageSize', type: 'int', required: false, desc: 'Số lượng/trang' },
                  { name: 'activeOnly', type: 'bool', required: false, desc: 'Chỉ active (mặc định: true)' },
                ]}
                theme={theme}
              />

              <EndpointCard
                method="GET"
                path={`${BASE_URL}/api/defense/check/{ip}`}
                description="Kiểm tra IP có bị block không"
                params={[
                  { name: 'ip', type: 'path', required: true, desc: 'Địa chỉ IP cần kiểm tra' },
                ]}
                response={`{
  "success": true,
  "data": {
    "ipAddress": "203.0.113.45",
    "isBlocked": true,
    "blockedAt": "2026-04-08T12:00:00Z",
    "expiresAt": "2026-04-09T12:00:00Z",
    "reason": "Multiple failed SSH login attempts",
    "attackType": "BruteForce"
  }
}`}
                theme={theme}
              />

              <EndpointCard
                method="GET"
                path={`${BASE_URL}/api/defense/firewall-rules`}
                description="Lấy danh sách firewall rules (để Agent đồng bộ)"
                theme={theme}
              />
            </div>
          </section>

          {/* ── 7. WHITELIST ──────────────────── */}
          <section id="section-whitelist">
            <div className={cn("flex items-center gap-3 mb-6")}>
              <div className={cn(
                "p-2.5 rounded-xl",
                theme === 'dark' ? "bg-emerald-600/20" : "bg-emerald-100"
              )}>
                <Shield size={22} className="text-emerald-500" />
              </div>
              <h2 className={cn(
                "text-2xl font-black",
                theme === 'dark' ? "text-white" : "text-slate-900"
              )}>
                Whitelist API
              </h2>
            </div>

            <div className={cn(
              "p-4 rounded-xl border text-sm mb-4",
              theme === 'dark' ? "bg-slate-900/50 border-slate-800 text-slate-400" : "bg-white border-slate-200 text-slate-600"
            )}>
              IP trong Whitelist sẽ không bị tạo alert bởi AI Engine. Mỗi whitelist có thể áp dụng cho một server cụ thể hoặc toàn bộ tenant.
            </div>

            <div className="space-y-3">
              <EndpointCard
                method="GET"
                path={`${BASE_URL}/api/whitelists`}
                description="Lấy danh sách whitelist"
                params={[
                  { name: 'serverId', type: 'guid', required: false, desc: 'Lọc theo server (bao gồm tenant-wide)' },
                  { name: 'search', type: 'string', required: false, desc: 'Tìm kiếm IP hoặc mô tả' },
                ]}
                theme={theme}
              />

              <EndpointCard
                method="POST"
                path={`${BASE_URL}/api/whitelists`}
                description="Thêm IP vào whitelist"
                requestBody={`{
  "ipAddress": "10.0.0.50",
  "description": "Internal monitoring server IP",
  "serverId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}`}
                theme={theme}
              />

              <EndpointCard
                method="DELETE"
                path={`${BASE_URL}/api/whitelists/{id}`}
                description="Xóa IP khỏi whitelist"
                theme={theme}
              />

              <EndpointCard
                method="GET"
                path={`${BASE_URL}/api/whitelists/check/{ip}`}
                description="Kiểm tra IP có trong whitelist không"
                params={[
                  { name: 'serverId', type: 'guid', required: false, desc: 'Server cần kiểm tra' },
                ]}
                response={`{
  "success": true,
  "data": {
    "ip": "10.0.0.50",
    "isWhitelisted": true
  }
}`}
                theme={theme}
              />
            </div>
          </section>

          {/* ── 8. AGENTS ─────────────────────── */}
          <section id="section-agents">
            <div className={cn("flex items-center gap-3 mb-6")}>
              <div className={cn(
                "p-2.5 rounded-xl",
                theme === 'dark' ? "bg-indigo-600/20" : "bg-indigo-100"
              )}>
                <Activity size={22} className="text-indigo-500" />
              </div>
              <h2 className={cn(
                "text-2xl font-black",
                theme === 'dark' ? "text-white" : "text-slate-900"
              )}>
                Agents API
              </h2>
            </div>

            <div className="space-y-3">
              <EndpointCard
                method="POST"
                path={`${BASE_URL}/api/agents/whoami`}
                description="Agent gửi heartbeat + thông tin server"
                params={[
                  { name: 'X-API-Key', type: 'header', required: true, desc: 'API Key của server' },
                ]}
                requestBody={`{
  "serverId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "hostname": "web-server-01",
  "ipAddress": "10.0.0.100",
  "os": "Ubuntu 22.04"
}`}
                theme={theme}
              />

              <EndpointCard
                method="GET"
                path={`${BASE_URL}/api/servers`}
                description="Lấy danh sách servers (Dashboard)"
                theme={theme}
              />

              <EndpointCard
                method="POST"
                path={`${BASE_URL}/api/servers/add`}
                description="Thêm server mới (Admin)"
                requestBody={`{
  "name": "Production Server 1",
  "ipAddress": "10.0.0.100",
  "createdBy": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}`}
                theme={theme}
              />
            </div>
          </section>

        </div>
      </div>
    </div>
  );
};
