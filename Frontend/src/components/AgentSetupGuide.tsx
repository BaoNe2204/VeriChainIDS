import React, { useState } from 'react';
import { Download, Server, Key, CheckCircle, Terminal, Copy, AlertCircle, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';

interface AgentSetupGuideProps {
  theme: Theme;
  t: any;
}

const CodeBlock = ({ code, theme }: { code: string; theme: Theme }) => {
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

export const AgentSetupGuide = ({ theme, t }: AgentSetupGuideProps) => {
  const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  const steps = [
    {
      number: '1',
      title: 'Tải Agent',
      icon: Download,
      color: 'blue',
      description: 'Tải file VeriChainIDSAgent.exe từ trang Tác nhân & Tài sản',
      content: (
        <div className="space-y-3">
          <p className={cn("text-sm", theme === 'dark' ? "text-slate-400" : "text-slate-600")}>
            Có 2 cách để tải agent:
          </p>
          <div className="space-y-2">
            <div className={cn(
              "p-3 rounded-lg border",
              theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-slate-50 border-slate-200"
            )}>
              <p className={cn("text-sm font-bold mb-1", theme === 'dark' ? "text-white" : "text-slate-900")}>
                Cách 1: Từ Dashboard
              </p>
              <p className={cn("text-xs", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>
                Vào trang <strong>Tác nhân & Tài sản</strong> → Nhấn nút <strong className="text-emerald-400">Tải Agent</strong>
              </p>
            </div>
            <div className={cn(
              "p-3 rounded-lg border",
              theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-slate-50 border-slate-200"
            )}>
              <p className={cn("text-sm font-bold mb-1", theme === 'dark' ? "text-white" : "text-slate-900")}>
                Cách 2: Download trực tiếp
              </p>
              <CodeBlock code={`${BASE_URL}/api/download/agent`} theme={theme} />
            </div>
          </div>
        </div>
      ),
    },
    {
      number: '2',
      title: 'Thêm Server & Lấy API Key',
      icon: Key,
      color: 'emerald',
      description: 'Tạo server mới trong Dashboard để lấy API Key',
      content: (
        <div className="space-y-3">
          <ol className={cn("space-y-2 text-sm", theme === 'dark' ? "text-slate-400" : "text-slate-600")}>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 font-bold shrink-0">1.</span>
              <span>Vào trang <strong>Tác nhân & Tài sản</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 font-bold shrink-0">2.</span>
              <span>Nhấn nút <strong className="text-blue-400">+ Thêm máy chủ</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 font-bold shrink-0">3.</span>
              <span>Nhập tên server (ví dụ: <code className="text-purple-400">web-server-01</code>)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 font-bold shrink-0">4.</span>
              <span>Copy API Key được tạo ra (có dạng: <code className="text-emerald-400">cm_sk_live_xxx...</code>)</span>
            </li>
          </ol>
          <div className={cn(
            "p-3 rounded-lg border flex items-start gap-2",
            theme === 'dark' ? "bg-amber-500/10 border-amber-500/20" : "bg-amber-50 border-amber-200"
          )}>
            <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <p className={cn("text-xs", theme === 'dark' ? "text-amber-400" : "text-amber-600")}>
              <strong>Lưu ý:</strong> API Key chỉ hiển thị 1 lần duy nhất khi tạo. Hãy copy và lưu lại ngay!
            </p>
          </div>
        </div>
      ),
    },
    {
      number: '3',
      title: 'Cài đặt & Chạy Agent',
      icon: Terminal,
      color: 'purple',
      description: 'Chạy agent trên server cần giám sát',
      content: (
        <div className="space-y-4">
          <div>
            <h4 className={cn("text-sm font-bold mb-2", theme === 'dark' ? "text-white" : "text-slate-900")}>
              Windows
            </h4>
            <CodeBlock
              code={`# Chạy file exe với API Key
.\\VeriChainIDSAgent.exe -k YOUR_API_KEY -u ${BASE_URL}

# Ví dụ:
.\\VeriChainIDSAgent.exe -k cm_sk_live_abc123... -u ${BASE_URL}`}
              theme={theme}
            />
          </div>

          <div>
            <h4 className={cn("text-sm font-bold mb-2", theme === 'dark' ? "text-white" : "text-slate-900")}>
              Linux / macOS
            </h4>
            <CodeBlock
              code={`# Cấp quyền thực thi
chmod +x VeriChainIDSAgent

# Chạy agent
./VeriChainIDSAgent -k YOUR_API_KEY -u ${BASE_URL}`}
              theme={theme}
            />
          </div>

          <div>
            <h4 className={cn("text-sm font-bold mb-2", theme === 'dark' ? "text-white" : "text-slate-900")}>
              Chạy từ source code Python
            </h4>
            <CodeBlock
              code={`# Cài đặt dependencies
cd Agent
pip install -r requirements.txt

# Chạy agent
python agent.py -k YOUR_API_KEY -u ${BASE_URL}`}
              theme={theme}
            />
          </div>

          <div className={cn(
            "p-3 rounded-lg border",
            theme === 'dark' ? "bg-blue-500/10 border-blue-500/20" : "bg-blue-50 border-blue-200"
          )}>
            <p className={cn("text-xs font-bold mb-1", theme === 'dark' ? "text-blue-400" : "text-blue-600")}>
              💡 Tham số dòng lệnh:
            </p>
            <ul className={cn("text-xs space-y-1 ml-4", theme === 'dark' ? "text-slate-400" : "text-slate-600")}>
              <li><code className="text-purple-400">-k, --api-key</code> - API Key của server (bắt buộc)</li>
              <li><code className="text-purple-400">-u, --backend-url</code> - URL backend (mặc định: http://localhost:5000)</li>
              <li><code className="text-purple-400">-i, --interval</code> - Giây giữa mỗi lần gửi logs (mặc định: 5)</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      number: '4',
      title: 'Kiểm tra kết nối',
      icon: CheckCircle,
      color: 'green',
      description: 'Xác nhận agent đã kết nối thành công',
      content: (
        <div className="space-y-3">
          <p className={cn("text-sm", theme === 'dark' ? "text-slate-400" : "text-slate-600")}>
            Sau khi chạy agent, kiểm tra các dấu hiệu sau:
          </p>
          <div className="space-y-2">
            <div className={cn(
              "p-3 rounded-lg border flex items-start gap-2",
              theme === 'dark' ? "bg-emerald-500/10 border-emerald-500/20" : "bg-emerald-50 border-emerald-200"
            )}>
              <CheckCircle size={16} className="text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className={cn("text-sm font-bold", theme === 'dark' ? "text-emerald-400" : "text-emerald-600")}>
                  Dashboard
                </p>
                <p className={cn("text-xs mt-1", theme === 'dark' ? "text-slate-400" : "text-slate-600")}>
                  Server xuất hiện trong <strong>Tác nhân & Tài sản</strong> với trạng thái <strong className="text-emerald-400">Online</strong>
                </p>
              </div>
            </div>
            <div className={cn(
              "p-3 rounded-lg border flex items-start gap-2",
              theme === 'dark' ? "bg-emerald-500/10 border-emerald-500/20" : "bg-emerald-50 border-emerald-200"
            )}>
              <CheckCircle size={16} className="text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className={cn("text-sm font-bold", theme === 'dark' ? "text-emerald-400" : "text-emerald-600")}>
                  Agent Console
                </p>
                <p className={cn("text-xs mt-1", theme === 'dark' ? "text-slate-400" : "text-slate-600")}>
                  Thấy logs: <code className="text-blue-400">[INFO] Sent X logs | attacks=0 | CPU X% | RAM X%</code>
                </p>
              </div>
            </div>
            <div className={cn(
              "p-3 rounded-lg border flex items-start gap-2",
              theme === 'dark' ? "bg-emerald-500/10 border-emerald-500/20" : "bg-emerald-50 border-emerald-200"
            )}>
              <CheckCircle size={16} className="text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className={cn("text-sm font-bold", theme === 'dark' ? "text-emerald-400" : "text-emerald-600")}>
                  Metrics
                </p>
                <p className={cn("text-xs mt-1", theme === 'dark' ? "text-slate-400" : "text-slate-600")}>
                  CPU, RAM, Disk usage được cập nhật real-time trong Dashboard
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  const colorMap: Record<string, string> = {
    blue: theme === 'dark' ? 'bg-blue-600/20' : 'bg-blue-100',
    emerald: theme === 'dark' ? 'bg-emerald-600/20' : 'bg-emerald-100',
    purple: theme === 'dark' ? 'bg-purple-600/20' : 'bg-purple-100',
    green: theme === 'dark' ? 'bg-green-600/20' : 'bg-green-100',
  };

  const iconColorMap: Record<string, string> = {
    blue: 'text-blue-500',
    emerald: 'text-emerald-500',
    purple: 'text-purple-500',
    green: 'text-green-500',
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className={cn(
        "border rounded-xl p-6",
        theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
      )}>
        <div className="flex items-start justify-between">
          <div>
            <h1 className={cn(
              "text-3xl font-black tracking-tight",
              theme === 'dark' ? "text-white" : "text-slate-900"
            )}>
              🚀 Hướng dẫn cài đặt Agent
            </h1>
            <p className={cn(
              "text-sm mt-2",
              theme === 'dark' ? "text-slate-400" : "text-slate-500"
            )}>
              VeriChainIDS Agent giám sát traffic mạng và gửi logs về backend để AI Engine phân tích
            </p>
          </div>
          <a
            href={`${BASE_URL}/api/download/agent`}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
              "bg-emerald-600 hover:bg-emerald-500 text-white"
            )}
          >
            <Download size={14} />
            Tải Agent
          </a>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-6">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <div
              key={step.number}
              className={cn(
                "border rounded-xl overflow-hidden",
                theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
              )}
            >
              <div className={cn(
                "flex items-center gap-4 p-5 border-b",
                theme === 'dark' ? "border-slate-800" : "border-slate-200"
              )}>
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                  colorMap[step.color]
                )}>
                  <Icon size={24} className={iconColorMap[step.color]} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs font-black",
                      theme === 'dark' ? "bg-blue-600/20 text-blue-400" : "bg-blue-100 text-blue-600"
                    )}>
                      {step.number}
                    </span>
                    <h2 className={cn(
                      "text-xl font-black",
                      theme === 'dark' ? "text-white" : "text-slate-900"
                    )}>
                      {step.title}
                    </h2>
                  </div>
                  <p className={cn(
                    "text-sm mt-1",
                    theme === 'dark' ? "text-slate-500" : "text-slate-400"
                  )}>
                    {step.description}
                  </p>
                </div>
              </div>
              <div className="p-5">
                {step.content}
              </div>
            </div>
          );
        })}
      </div>

      {/* Troubleshooting */}
      <div className={cn(
        "border rounded-xl p-6",
        theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
      )}>
        <h3 className={cn(
          "text-lg font-black mb-4",
          theme === 'dark' ? "text-white" : "text-slate-900"
        )}>
          ❓ Gặp vấn đề?
        </h3>
        <div className="space-y-3">
          <div className={cn(
            "p-3 rounded-lg border",
            theme === 'dark' ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200"
          )}>
            <p className={cn("text-sm font-bold mb-1", theme === 'dark' ? "text-white" : "text-slate-900")}>
              Agent không kết nối được
            </p>
            <ul className={cn("text-xs space-y-1 ml-4", theme === 'dark' ? "text-slate-400" : "text-slate-600")}>
              <li>• Kiểm tra API Key có đúng không</li>
              <li>• Kiểm tra backend URL có đúng không (http://localhost:5000 hoặc IP server)</li>
              <li>• Kiểm tra firewall có block port 5000 không</li>
              <li>• Xem logs trong agent console để biết lỗi cụ thể</li>
            </ul>
          </div>
          <div className={cn(
            "p-3 rounded-lg border",
            theme === 'dark' ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200"
          )}>
            <p className={cn("text-sm font-bold mb-1", theme === 'dark' ? "text-white" : "text-slate-900")}>
              Agent chạy nhưng không gửi logs
            </p>
            <ul className={cn("text-xs space-y-1 ml-4", theme === 'dark' ? "text-slate-400" : "text-slate-600")}>
              <li>• Kiểm tra server có traffic mạng không (agent chỉ gửi khi có traffic)</li>
              <li>• Xem logs trong agent console: <code className="text-purple-400">[INFO] Sent X logs</code></li>
              <li>• Kiểm tra backend có nhận được request không (xem backend logs)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
