import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Shield, Smartphone } from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme, Language, AuthMode } from '../types';

// ── Falling stars (reuse từ LandingPage) ─────────────────────────────────────
const AUTH_STARS = Array.from({ length: 25 }, (_, i) => ({
  id: i,
  left:  `${(i * 4.1 + Math.sin(i) * 15 + 50) % 100}%`,
  delay: `${(i * 0.7) % 14}s`,
  dur:   `${9 + (i % 7) * 1.5}s`,
  size:  6 + (i % 5) * 2.5,
  sway:  (i % 2 === 0 ? 1 : -1) * (15 + (i % 4) * 10),
  color: ['rgba(148,163,184,0.6)','rgba(99,102,241,0.55)','rgba(59,130,246,0.55)','rgba(52,211,153,0.45)','rgba(167,139,250,0.55)','rgba(255,255,255,0.45)'][i % 6],
}));

const StarSVG = ({ size, color }: { size: number; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
  </svg>
);

const AuthFallingStars = () => (
  <>
    <style>{`
      @keyframes authStarFall {
        0%   { transform: translateY(-30px) translateX(0);           opacity: 0; }
        8%   { opacity: 1; }
        88%  { opacity: 0.7; }
        100% { transform: translateY(105vh) translateX(var(--auth-sway)); opacity: 0; }
      }
      @keyframes authStarSpin {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }
    `}</style>
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {AUTH_STARS.map(s => (
        <div key={s.id} style={{
          position: 'absolute', top: '-30px', left: s.left, opacity: 0,
          animation: `authStarFall ${s.dur} ${s.delay} infinite ease-in-out`,
          ['--auth-sway' as any]: `${s.sway}px`,
        }}>
          <div style={{ animation: `authStarSpin ${s.dur} ${s.delay} infinite linear` }}>
            <StarSVG size={s.size} color={s.color} />
          </div>
        </div>
      ))}
    </div>
  </>
);

interface AuthFormProps {
  theme: Theme;
  language: Language;
  setLanguage: (lang: Language) => void;
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  setShowAuth: (show: boolean) => void;
  handleLogin: (email: string, password: string, twoFactorCode?: string) => Promise<{ success: boolean; message: string; requiresTwoFactor?: boolean }>;
  handleRegister: (companyName: string, email: string, password: string) => Promise<{ success: boolean; message: string }>;
  pending2FA: { email: string; password: string; tempToken: string } | null;
  setPending2FA: (v: { email: string; password: string; tempToken: string } | null) => void;
  handleLoginWith2FA: (code: string) => Promise<{ success: boolean; message: string }>;
  t: any;
}

export const AuthForm = ({
  theme,
  language,
  setLanguage,
  authMode,
  setAuthMode,
  setShowAuth,
  handleLogin,
  handleRegister,
  pending2FA,
  setPending2FA,
  handleLoginWith2FA,
  t
}: AuthFormProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // 2FA step
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorError, setTwoFactorError] = useState('');
  const [verifying2FA, setVerifying2FA] = useState(false);

  // Switch to OTP step when backend requires 2FA
  // Dùng ref + effect để theo dõi pending2FA thay đổi theo thời gian
  const prevPendingRef = useRef(pending2FA);
  useEffect(() => {
    if (pending2FA && pending2FA !== prevPendingRef.current) {
      prevPendingRef.current = pending2FA;
      setStep('otp');
    }
    // Khi pending2FA về null (login 2FA thành công) → effect sẽ chạy với pending2FA=null
    // → không làm gì cả vì step đang ở 'otp' nhưng isLoggedIn sẽ chuyển ra dashboard
    if (!pending2FA && prevPendingRef.current !== null) {
      prevPendingRef.current = null;
      // setStep('credentials') — không cần vì App sẽ unmount AuthForm khi isLoggedIn=true
    }
  }, [pending2FA]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (authMode === 'register') {
        if (password !== confirmPassword) {
          setError('Mật khẩu xác nhận không khớp.');
          return;
        }
        if (password.length < 6) {
          setError('Mật khẩu phải có ít nhất 6 ký tự.');
          return;
        }

        const result = await handleRegister(companyName || fullName, email, password);
        if (!result.success) {
          setError(result.message);
        }
        // Thành công: handleRegister đã set isLoggedIn=true + setUser → App tự render dashboard
      } else {
        const result = await handleLogin(email, password);
        if (!result.success) {
          setError(result.message);
        }
        // Thành công: handleLogin đã set isLoggedIn=true + setUser → App tự render dashboard
      }
    } catch (err) {
      setError('Lỗi kết nối. Vui lòng kiểm tra backend server.');
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmitOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorCode || twoFactorCode.length < 6) {
      setTwoFactorError('Vui lòng nhập mã 6 chữ số.');
      return;
    }
    setTwoFactorError('');
    setVerifying2FA(true);
    try {
      const result = await handleLoginWith2FA(twoFactorCode);
      if (!result.success) {
        setTwoFactorError(result.message);
      }
      // Thành công: handleLoginWith2FA đã clear pending2FA → App unmount AuthForm → hiển thị dashboard
    } catch {
      setTwoFactorError('Lỗi kết nối.');
    } finally {
      setVerifying2FA(false);
    }
  };

  // 2FA OTP screen
  if (step === 'otp') {
    return (
      <div className={cn("min-h-screen flex items-center justify-center p-4 transition-colors duration-300 relative overflow-hidden", theme === 'dark' ? "bg-[#020617]" : "bg-slate-50")}>
        <AuthFallingStars />
        <div className="absolute top-8 right-8 flex items-center gap-4 z-10">
          <button onClick={() => { setStep('credentials'); setTwoFactorCode(''); setTwoFactorError(''); setError(''); setPending2FA(null); }}
            className={cn("px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors", theme === 'dark' ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-white" : "bg-white border-slate-200 text-slate-600 hover:text-slate-900")}>
            ← Quay lại
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn("w-full max-w-md p-8 rounded-2xl border shadow-2xl backdrop-blur-sm relative z-10", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200")}
        >
          <div className="flex flex-col items-center mb-8">
            <div className="bg-blue-600 p-3 rounded-xl mb-4">
              <Smartphone size={32} className="text-white" />
            </div>
            <h2 className={cn("text-xl font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>Xác thực 2 bước</h2>
            <p className="text-slate-500 text-sm mt-1">
              Nhập mã từ ứng dụng Google Authenticator
            </p>
          </div>

          {twoFactorError && (
            <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-bold text-center">
              {twoFactorError}
            </div>
          )}

          <form onSubmit={onSubmitOTP} className="space-y-6">
            <div>
              <label className={cn("block text-xs font-bold uppercase mb-2 text-center", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>
                Mã xác thực
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={twoFactorCode}
                onChange={e => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                className={cn("w-full text-center text-3xl tracking-[0.6em] font-mono rounded-xl px-4 py-4 focus:outline-none border transition-colors", theme === 'dark' ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-100 border-slate-200 text-slate-900")}
                placeholder="● ● ● ● ● ●"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={verifying2FA || twoFactorCode.length < 6}
              className={cn("w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2", verifying2FA && "opacity-50 cursor-not-allowed")}
            >
              {verifying2FA ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Đang xác thực...
                </>
              ) : 'Xác thực'}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen flex items-center justify-center p-4 transition-colors duration-300 relative overflow-hidden", theme === 'dark' ? "bg-[#020617]" : "bg-slate-50")}>
      <AuthFallingStars />
      <div className="absolute top-8 right-8 flex items-center gap-4 z-10">
        <button
          onClick={() => setLanguage(language === 'en' ? 'vi' : 'en')}
          className={cn("px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors", theme === 'dark' ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-white" : "bg-white border-slate-200 text-slate-600 hover:text-slate-900")}
        >
          {language === 'en' ? 'VI' : 'EN'}
        </button>
        <button
          onClick={() => setShowAuth(false)}
          className={cn("px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors", theme === 'dark' ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-white" : "bg-white border-slate-200 text-slate-600 hover:text-slate-900")}
        >
          {language === 'en' ? 'Back' : 'Quay lại'}
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn("w-full max-w-md p-8 rounded-2xl border shadow-2xl backdrop-blur-sm relative z-10", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200")}
      >
        <div className="flex flex-col items-center mb-8">
          <div className="bg-blue-600 p-3 rounded-xl mb-4">
            <Shield className="text-white" size={32} />
          </div>
          <h1 className={cn("text-2xl font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>VeriChainIDS SOC</h1>
          <p className="text-slate-500 text-sm mt-1">
            {authMode === 'login' ? 'Đăng nhập vào hệ thống' : 'Đăng ký Workspace mới'}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-bold text-center">
              {error}
            </div>
          )}

          {authMode === 'register' && (
            <div>
              <label className={cn("block text-xs font-bold uppercase mb-2", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>
                Tên Công Ty
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className={cn("w-full rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all", theme === 'dark' ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-100 border-slate-200 text-slate-900")}
                placeholder="Công Ty TNHH ABC Việt Nam"
                required
              />
            </div>
          )}

          <div>
            <label className={cn("block text-xs font-bold uppercase mb-2", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cn("w-full rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all", theme === 'dark' ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-100 border-slate-200 text-slate-900")}
              placeholder="admin@verichainids.vn"
              required
            />
          </div>

          <div>
            <label className={cn("block text-xs font-bold uppercase mb-2", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>
              Mật khẩu
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={cn("w-full rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all", theme === 'dark' ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-100 border-slate-200 text-slate-900")}
              placeholder="••••••••"
              required
            />
          </div>

          {authMode === 'register' && (
            <div>
              <label className={cn("block text-xs font-bold uppercase mb-2", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>
                Xác nhận mật khẩu
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={cn("w-full rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all", theme === 'dark' ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-100 border-slate-200 text-slate-900")}
                placeholder="••••••••"
                required
              />
            </div>
          )}

          <div className="flex justify-end">
            <button type="button" className="text-xs text-blue-500 hover:underline">Quên mật khẩu?</button>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className={cn(
              "w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2",
              isLoading && "opacity-50 cursor-not-allowed"
            )}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Đang xử lý...
              </>
            ) : (
              authMode === 'login' ? 'ĐĂNG NHẬP' : 'ĐĂNG KÝ & MUA GÓI'
            )}
          </button>

          {authMode === 'register' && (
            <p className="text-xs text-slate-500 text-center">
              Đăng ký = Tạo Workspace mới + Mua gói Starter (miễn phí 1 server)
            </p>
          )}
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setAuthMode(authMode === 'login' ? 'register' : 'login');
              setError('');
              setEmail('');
              setPassword('');
              setConfirmPassword('');
              setCompanyName('');
            }}
            className="text-sm text-slate-500 hover:text-blue-400 transition-colors"
          >
            {authMode === 'login'
              ? 'Chưa có tài khoản? Đăng ký ngay'
              : 'Đã có tài khoản? Đăng nhập'}
          </button>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-800">
          <p className="text-xs text-slate-600 text-center">
            Demo: admin@verichainids.vn / VeriChainIDS@2026
          </p>
        </div>
      </motion.div>
    </div>
  );
};
