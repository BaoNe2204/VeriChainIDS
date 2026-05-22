import React, { useEffect, useState } from 'react';
import { Globe, Activity, Bell, Lock, Smartphone, Key, ChevronRight, ShieldCheck, Server } from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme, Language, User } from '../types';
import { Toggle } from './common/Toggle';
import { AuthApi } from '../services/api';

type AlertSeverity = 'Critical' | 'High' | 'Medium' | 'Low';
type AlertDigest = 'realtime' | 'hourly' | 'daily' | 'weekly';

interface SettingsProps {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  t: any;
  is2FAEnabled: boolean;
  setIs2FAEnabled: (enabled: boolean) => void;
  setShow2FAModal: (show: boolean) => void;
  user: User | null;
  setUser: (user: User | null) => void;
  setActiveTab: (tab: string) => void;
  serverCount: number;
  setShowAddServerModal: (show: boolean) => void;
}

export const Settings = ({
  theme,
  setTheme,
  language,
  setLanguage,
  t,
  is2FAEnabled,
  setIs2FAEnabled,
  setShow2FAModal,
  user,
  setUser,
  setActiveTab,
  serverCount,
  setShowAddServerModal,
}: SettingsProps) => {
  const [alertSeverityThreshold, setAlertSeverityThreshold] = useState<AlertSeverity>('Medium');
  const [alertDigest, setAlertDigest] = useState<AlertDigest>('realtime');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityMessage, setSecurityMessage] = useState('');
  const [securityError, setSecurityError] = useState('');

  // Load saved preferences from user object (backend) or localStorage fallback
  useEffect(() => {
    // Không dùng ?? : user.twoFactorEnabled === false vẫn "có giá trị" nên không fallback sang is2FAEnabled
    setTwoFactorEnabled(!!user?.twoFactorEnabled || is2FAEnabled);

    if (user) {
      // Prefer backend-saved values
      setAlertSeverityThreshold((user.alertSeverityThreshold as AlertSeverity) ?? 'Medium');
      setAlertDigest((user.alertDigestMode as AlertDigest) ?? 'realtime');
    } else {
      // Fallback to localStorage
      const savedSeverity = localStorage.getItem('alertSeverityThreshold') as AlertSeverity | null;
      const savedDigest = localStorage.getItem('alertDigest') as AlertDigest | null;
      if (savedSeverity) setAlertSeverityThreshold(savedSeverity);
      if (savedDigest) setAlertDigest(savedDigest);
    }
  }, [user, is2FAEnabled]);

  const handleSaveAlertPreferences = async () => {
    // Always persist locally for immediate UI feedback
    localStorage.setItem('alertSeverityThreshold', alertSeverityThreshold);
    localStorage.setItem('alertDigest', alertDigest);

    // Also persist to backend if user is logged in
    if (user) {
      setSaveLoading(true);
      setSaveMessage('');
      setSaveError('');
      try {
        const res = await AuthApi.updateNotificationSettings({
          emailAlertsEnabled: user.emailAlertsEnabled ?? true,
          telegramAlertsEnabled: user.telegramAlertsEnabled ?? false,
          pushNotificationsEnabled: user.pushNotificationsEnabled ?? true,
          telegramChatId: user.telegramChatId ?? null,
          alertSeverityThreshold,
          alertDigestMode: alertDigest,
        });
        if (res.success && res.data) {
          setUser(res.data as unknown as User);
          setSaveMessage('Đã lưu cấu hình cảnh báo.');
        } else {
          setSaveError(res.message || 'Không lưu được cấu hình cảnh báo.');
        }
      } catch (err: any) {
        setSaveError(err?.message || 'Lỗi khi lưu cấu hình cảnh báo.');
      } finally {
        setSaveLoading(false);
        setTimeout(() => { setSaveMessage(''); setSaveError(''); }, 3000);
      }
    } else {
      setSaveMessage('Đã lưu cấu hình cảnh báo.');
      setTimeout(() => setSaveMessage(''), 2500);
    }
  };

  const handleToggleTwoFactor = async (value: boolean) => {
    if (!user) return;

    // Khi bật 2FA → mở modal setup để scan QR code
    if (value) {
      setShow2FAModal(true);
      return;
    }

    // Khi tắt 2FA → gọi API trực tiếp
    const previous = twoFactorEnabled;
    setTwoFactorEnabled(value);
    setSecurityLoading(true);
    setSecurityMessage('');
    setSecurityError('');

    try {
      const response = await AuthApi.updateSecuritySettings({
        twoFactorEnabled: value,
        sessionTimeoutEnabled: user.sessionTimeoutEnabled ?? false,
        sessionTimeoutMinutes: user.sessionTimeoutMinutes ?? 30,
      });

      if (response.success && response.data) {
        setUser(response.data as unknown as User);
        setIs2FAEnabled(false);
        setSecurityMessage('Đã tắt xác thực 2 yếu tố.');
        setTimeout(() => setSecurityMessage(''), 2500);
      } else {
        setTwoFactorEnabled(previous);
        setSecurityError(response.message || 'Không cập nhật được xác thực 2 yếu tố.');
      }
    } catch (error: any) {
      setTwoFactorEnabled(previous);
      setSecurityError(error?.message || 'Không cập nhật được xác thực 2 yếu tố.');
    } finally {
      setSecurityLoading(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h2 className={cn("text-2xl font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>{t.settings}</h2>
        <p className="text-slate-400">Configure your platform preferences and security.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Language Settings */}
        <div className={cn("border p-6 rounded-xl space-y-6 transition-colors", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm")}>
          <div className="flex items-center gap-3 mb-2">
            <Globe className="text-blue-400" size={20} />
            <h3 className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>{t.language}</h3>
          </div>
          <p className="text-xs text-slate-500">{t.selectLanguage}</p>
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => setLanguage('en')}
              className={cn(
                "flex items-center justify-center gap-3 p-4 rounded-xl border transition-all",
                language === 'en' ? "bg-blue-600/20 border-blue-500 text-white" : (theme === 'dark' ? "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700" : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300")
              )}
            >
              <span className="text-2xl">🇺🇸</span>
              <span className="font-medium">{t.english}</span>
            </button>
            <button 
              onClick={() => setLanguage('vi')}
              className={cn(
                "flex items-center justify-center gap-3 p-4 rounded-xl border transition-all",
                language === 'vi' ? "bg-blue-600/20 border-blue-500 text-white" : (theme === 'dark' ? "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700" : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300")
              )}
            >
              <span className="text-2xl">🇻🇳</span>
              <span className="font-medium">{t.vietnamese}</span>
            </button>
          </div>
        </div>

        {/* Theme Settings */}
        <div className={cn("border p-6 rounded-xl space-y-6 transition-colors", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm")}>
          <div className="flex items-center gap-3 mb-2">
            <Activity className="text-purple-400" size={20} />
            <h3 className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>{t.theme}</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => setTheme('dark')}
              className={cn(
                "flex items-center justify-center gap-3 p-4 rounded-xl border transition-all",
                theme === 'dark' ? "bg-blue-600/20 border-blue-500 text-white" : "bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300"
              )}
            >
              <div className="w-4 h-4 rounded-full bg-[#020617] border border-slate-700"></div>
              <span className="font-medium">{t.darkMode}</span>
            </button>
            <button 
              onClick={() => setTheme('light')}
              className={cn(
                "flex items-center justify-center gap-3 p-4 rounded-xl border transition-all",
                theme === 'light' ? "bg-blue-600/20 border-blue-500 text-blue-600" : "bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300"
              )}
            >
              <div className="w-4 h-4 rounded-full bg-white border border-slate-300 shadow-sm"></div>
              <span className="font-medium">{t.lightMode}</span>
            </button>
          </div>
          <p className="text-[10px] text-slate-500 italic">VeriChainIDS is optimized for low-light SOC environments.</p>
        </div>

        {/* Alert Preferences */}
        <div className={cn("border p-6 rounded-xl space-y-4 transition-colors", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm")}>
          <div className="flex items-center gap-3 mb-2">
            <Bell className="text-amber-400" size={20} />
            <h3 className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>{t.notificationSettings}</h3>
          </div>
          <div className={cn(
            "rounded-2xl border p-4 space-y-5 transition-colors",
            theme === 'dark' ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"
          )}>
            {/* Severity Threshold */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-amber-400" />
                <p className={cn("text-sm font-semibold", theme === 'dark' ? "text-slate-100" : "text-slate-800")}>Ngưỡng mức cảnh báo</p>
              </div>
              <p className="text-xs text-slate-500">Chỉ nhận cảnh báo từ mức nghiêm trọng đã chọn trở lên.</p>
              <select
                value={alertSeverityThreshold}
                onChange={(e) => setAlertSeverityThreshold(e.target.value as AlertSeverity)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500",
                  theme === 'dark'
                    ? "bg-slate-900 border-slate-700 text-slate-100"
                    : "bg-white border-slate-300 text-slate-900"
                )}
              >
                <option value="Critical">Critical — Chỉ sự cố nghiêm trọng</option>
                <option value="High">High — Trở lên</option>
                <option value="Medium">Medium — Trở lên (mặc định)</option>
                <option value="Low">Low — Tất cả cảnh báo</option>
              </select>
            </div>

            <div className={cn("h-px", theme === 'dark' ? "bg-slate-800" : "bg-slate-200")} />

            {/* Alert Digest */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-blue-400" />
                <p className={cn("text-sm font-semibold", theme === 'dark' ? "text-slate-100" : "text-slate-800")}>Chế độ thông báo</p>
              </div>
              <p className="text-xs text-slate-500">Tổng hợp cảnh báo thay vì gửi từng cái một để tránh quá tải.</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'realtime', label: 'Realtime', desc: 'Gửi ngay khi có cảnh báo' },
                  { value: 'hourly', label: 'Mỗi giờ', desc: 'Tóm tắt trong 1 giờ' },
                  { value: 'daily', label: 'Hàng ngày', desc: 'Gửi lúc 8h sáng' },
                  { value: 'weekly', label: 'Hàng tuần', desc: 'Gửi thứ 2 hàng tuần' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAlertDigest(opt.value as AlertDigest)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-all text-xs",
                      alertDigest === opt.value
                        ? "bg-blue-600/20 border-blue-500 text-white"
                        : theme === 'dark'
                          ? "bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600"
                          : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                  >
                    <div className="font-semibold">{opt.label}</div>
                    <div className={cn("mt-0.5", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {(saveMessage || saveError) && (
              <div className={cn(
                "rounded-lg border px-3 py-2 text-sm",
                saveError
                  ? "border-red-500/30 bg-red-500/10 text-red-400"
                  : "border-green-500/30 bg-green-500/10 text-green-400"
              )}>
                {saveError || saveMessage}
              </div>
            )}
            {saveLoading && (
              <p className="text-xs text-slate-500">Đang lưu cài đặt...</p>
            )}
          </div>
        </div>

        {/* Security Settings */}
        <div className={cn("border p-6 rounded-xl space-y-4 transition-colors", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm")}>
          <div className="flex items-center gap-3 mb-2">
            <Lock className="text-emerald-400" size={20} />
            <h3 className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>{t.security}</h3>
          </div>
          <div className="space-y-4">
            <div className={cn(
              "rounded-2xl border p-4 transition-colors",
              theme === 'dark' ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"
            )}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-emerald-500" />
                    <p className={cn("text-sm font-semibold", theme === 'dark' ? "text-slate-100" : "text-slate-800")}>{t.twoFactor}</p>
                    <button
                      type="button"
                      onClick={() => setShow2FAModal(true)}
                      className={cn(
                        "text-[11px] underline underline-offset-2",
                        theme === 'dark' ? "text-emerald-400" : "text-emerald-600"
                      )}
                    >
                      Thiết lập
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Bật để tăng bảo mật khi đăng nhập vào tài khoản quản trị.</p>
                </div>
                <Toggle
                  label=""
                  enabled={twoFactorEnabled}
                  onChange={(value) => void handleToggleTwoFactor(value)}
                  theme={theme}
                />
              </div>
            </div>

            <div className={cn(
              "rounded-2xl border p-4 transition-colors",
              theme === 'dark' ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"
            )}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Key size={16} className="text-blue-500" />
                    <p className={cn("text-sm font-semibold", theme === 'dark' ? "text-slate-100" : "text-slate-800")}>Quản lý API Key</p>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    API key đang được quản lý theo từng server để cài agent và kết nối bảo mật.
                  </p>
                  <div className="flex items-center gap-2 mt-3 text-xs text-slate-500">
                    <Server size={14} />
                    <span>{serverCount === 0 ? 'Chưa có server nào' : `${serverCount} server đã cấu hình`}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveTab('agents')}
                    className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
                  >
                    Mở Agents
                  </button>
                  {serverCount === 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAddServerModal(true)}
                      className={cn(
                        "px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
                        theme === 'dark' ? "bg-slate-800 hover:bg-slate-700 text-slate-200" : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-200"
                      )}
                    >
                      Thêm server
                    </button>
                  )}
                </div>
              </div>
            </div>

            {(securityMessage || securityError) && (
              <div className={cn(
                "rounded-lg border px-3 py-2 text-sm",
                securityError
                  ? "border-red-500/30 bg-red-500/10 text-red-400"
                  : "border-green-500/30 bg-green-500/10 text-green-400"
              )}>
                {securityError || securityMessage}
              </div>
            )}
            {securityLoading && (
              <p className="text-xs text-slate-500">Đang lưu cài đặt bảo mật...</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSaveAlertPreferences}
          disabled={saveLoading}
          className={cn(
            "px-8 py-3 rounded-xl font-bold transition-all shadow-lg flex items-center gap-2",
            saveLoading
              ? "bg-blue-400 cursor-not-allowed text-white/60"
              : theme === 'dark'
                ? "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20"
                : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-100"
          )}
        >
          {saveLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Đang lưu...
            </>
          ) : (
            t.saveChanges
          )}
        </button>
      </div>
    </div>
  );
};
