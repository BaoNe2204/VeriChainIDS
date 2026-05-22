import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  XCircle,
  QrCode,
  CheckCircle2,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { Theme } from '../types';
import { AuthApi } from '../services/api';
import QRCode from 'qrcode';

/* ─── helpers ─────────────────────────────────────────────────────────────────── */

/** Backend dùng Convert.ToBase64String → chuỗi URL-safe (-_+/). JS atob() cần chuẩn (+/=).
    Fallback: dựng URI từ secret/thủ công nếu decode lỗi. */
function decodeBase64Uri(b64: string): string | null {
  if (!b64) return null;
  // Chuẩn hóa URL-safe → standard Base64
  const std = b64.replace(/-/g, '+').replace(/_/g, '/');
  // Thêm padding nếu cần
  const padded = std.padEnd(std.length + ((4 - (std.length % 4)) % 4), '=');
  try {
    const uri = decodeURIComponent(atob(padded));
    if (uri.startsWith('otpauth://')) return uri;
  } catch {
    /* fall through */
  }
  return null;
}

/** Resolve OTP URI từ payload backend. Ưu tiên giải mã qrCodeBase64,
    nếu lỗi → dựng URI từ manualEntryKey/secret. */
function resolveOtpUri(d: {
  qrCodeBase64?: string;
  manualEntryKey?: string;
  secret?: string;
}): string | null {
  const fromB64 = d.qrCodeBase64 ? decodeBase64Uri(d.qrCodeBase64) : null;
  if (fromB64) return fromB64;

  const raw = (d.manualEntryKey ?? d.secret ?? '').replace(/\s+/g, '').toUpperCase();
  if (!raw) return null;
  return `otpauth://totp/VeriChainIDS?secret=${encodeURIComponent(raw)}&issuer=VeriChainIDS&digits=6&period=30`;
}

/* ─── component ────────────────────────────────────────────────────────────────── */

export interface TwoFASetupModalProps {
  theme: Theme;
  t: any;
  is2FAEnabled: boolean;
  setIs2FAEnabled: (v: boolean) => void;
  /** Sau verify bật/tắt 2FA — gọi để /me cập nhật user (toggle Settings/Account). */
  onProfileSynced?: () => void | Promise<void>;
  onClose: () => void;
}

export function TwoFASetupModal({
  theme,
  t,
  is2FAEnabled,
  setIs2FAEnabled,
  onProfileSynced,
  onClose,
}: TwoFASetupModalProps) {
  // Mỗi khi modal mở (is2FAEnabled về false) → fetch secret/URI mới
  const [setupData, setSetupData] = useState<{
    qrCodeBase64: string;
    secret: string;
    manualEntryKey: string;
  } | null>(null);
  const [otpUri, setOtpUri] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [qrGenerating, setQrGenerating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  // 1️⃣ Fetch secret + URI từ backend mỗi khi modal mở (is2FAEnabled false)
  useEffect(() => {
    if (is2FAEnabled) return;
    setLoading(true);
    setError('');
    AuthApi.setupTwoFactor()
      .then((res) => {
        const d = res.data as
          | { secret?: string; qrCodeBase64?: string; manualEntryKey?: string }
          | undefined;
        if (res.success && d) {
          const data = {
            secret:         d.secret         ?? d.manualEntryKey ?? '',
            qrCodeBase64:   d.qrCodeBase64   ?? '',
            manualEntryKey: d.manualEntryKey ?? d.secret ?? '',
          };
          setSetupData(data);
          setOtpUri(resolveOtpUri(data));
        } else {
          setError(res.message || 'Không thể tạo secret 2FA.');
          setSetupData(null);
          setOtpUri(null);
        }
      })
      .catch(() => {
        setError('Lỗi kết nối máy chủ.');
        setSetupData(null);
        setOtpUri(null);
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [is2FAEnabled]);

  // 2️⃣ Sinh QR cục bộ mỗi khi otpUri thay đổi
  useEffect(() => {
    if (!otpUri) { setQrDataUrl(null); return; }
    let cancelled = false;
    setQrGenerating(true);
    QRCode.toDataURL(otpUri, {
      width: 176,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch(()  => { if (!cancelled) setQrDataUrl(null); })
      .finally(() => { if (!cancelled) setQrGenerating(false); });
    return () => { cancelled = true; };
  }, [otpUri]);

  // 3️⃣ Reset khi đóng modal (lần mở sau lấy secret mới)
  const handleClose = () => {
    setSetupData(null);
    setOtpUri(null);
    setQrDataUrl(null);
    setCode('');
    setError('');
    setSuccess('');
    setShowSecret(false);
    onClose();
  };

  const handleEnable = async () => {
    if (!code || code.length < 6) { setError('Vui lòng nhập mã 6 chữ số.'); return; }
    setVerifying(true);
    setError('');
    try {
      const res = await AuthApi.verifyTwoFactor(code);
      if (res.success) {
        setIs2FAEnabled(true);
        try {
          await onProfileSynced?.();
        } catch {
          /* ignore */
        }
        setSuccess('Đã bật 2FA thành công!');
        setTimeout(handleClose, 1500);
      } else {
        setError(res.message || 'Mã không đúng.');
      }
    } catch {
      setError('Lỗi kết nối.');
    } finally {
      setVerifying(false);
    }
  };

  const handleDisable = async () => {
    if (!code || code.length < 6) { setError('Vui lòng nhập mã 6 chữ số để tắt 2FA.'); return; }
    setVerifying(true);
    setError('');
    try {
      const res = await AuthApi.disableTwoFactor(code);
      if (res.success) {
        setIs2FAEnabled(false);
        try {
          await onProfileSynced?.();
        } catch {
          /* ignore */
        }
        setSuccess('Đã tắt 2FA.');
        setTimeout(handleClose, 1500);
      } else {
        setError(res.message || 'Mã không đúng.');
      }
    } catch {
      setError('Lỗi kết nối.');
    } finally {
      setVerifying(false);
    }
  };

  const displaySecret = (setupData?.secret ?? '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className={cn(
          'w-full max-w-md p-6 rounded-2xl border shadow-2xl',
          theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        )}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center gap-2">
            <Smartphone size={20} className="text-blue-400" />
            <h3 className={cn('text-lg font-bold', theme === 'dark' ? 'text-white' : 'text-slate-900')}>
              {is2FAEnabled ? 'Quản lý 2FA' : t?.twoFactorSetup ?? 'Thiết lập 2FA'}
            </h3>
          </div>
          <button type="button" onClick={handleClose} className="text-slate-500 hover:text-rose-500 transition-colors">
            <XCircle size={22} />
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-bold text-center">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold text-center">
            {success}
          </div>
        )}

        {/* ── Chưa bật 2FA ── */}
        {!is2FAEnabled ? (
          <div className="space-y-5">
            {/* QR hoặc placeholder */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className={cn(
                'p-4 rounded-2xl',
                theme === 'dark' ? 'bg-slate-950' : 'bg-slate-50'
              )}>
                {loading || qrGenerating ? (
                  <div className="w-[176px] h-[176px] flex items-center justify-center">
                    <RefreshCw size={32} className="animate-spin text-slate-400" />
                  </div>
                ) : qrDataUrl ? (
                  <img src={qrDataUrl} alt="2FA QR" className="w-[176px] h-[176px] rounded-lg bg-white" />
                ) : (
                  <QrCode size={160} className={theme === 'dark' ? 'text-white' : 'text-slate-900'} />
                )}
              </div>
              <p className={cn('text-sm', theme === 'dark' ? 'text-slate-400' : 'text-slate-600')}>
                {t?.scanQr ?? 'Quét mã QR bằng Google Authenticator'}
              </p>

              {/* Mã thủ công */}
              {setupData?.secret && (
                <div className="w-full space-y-1">
                  <p className="text-xs text-slate-500 text-center">Hoặc nhập mã thủ công:</p>
                  <div className={cn(
                    'flex items-center gap-2 p-2 rounded-lg border font-mono text-sm select-all',
                    theme === 'dark'
                      ? 'bg-slate-950 border-slate-800 text-slate-300'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  )}>
                    <span className="flex-1 break-all">{displaySecret}</span>
                    <button
                      type="button"
                      onClick={() => setShowSecret(s => !s)}
                      className="shrink-0 text-slate-500 hover:text-slate-300"
                    >
                      {showSecret ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Ô nhập mã */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase">
                {t?.verifyCode ?? 'Mã xác thực'}
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                className={cn(
                  'w-full text-center text-2xl tracking-[0.5em] font-mono rounded-lg px-4 py-3',
                  'focus:outline-none border transition-colors',
                  theme === 'dark'
                    ? 'bg-slate-950 border-slate-800 text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-900'
                )}
                placeholder="● ● ● ● ● ●"
              />
            </div>

            <button
              type="button"
              onClick={handleEnable}
              disabled={verifying || code.length < 6}
              className={cn(
                'w-full py-3 rounded-lg font-bold transition-colors shadow-lg',
                'bg-emerald-600 text-white hover:bg-emerald-500',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {verifying
                ? <span className="flex items-center justify-center gap-2"><RefreshCw size={16} className="animate-spin" /> Đang xác thực...</span>
                : t?.enable2FA ?? 'Bật 2FA'
              }
            </button>
          </div>
        ) : (
          /* ── Đã bật 2FA ── */
          <div className="space-y-5 text-center">
            <div className="flex justify-center">
              <div className="bg-emerald-500/20 p-4 rounded-full">
                <CheckCircle2 size={48} className="text-emerald-500" />
              </div>
            </div>
            <div>
              <p className={cn('text-lg font-bold', theme === 'dark' ? 'text-white' : 'text-slate-900')}>
                2FA đang bật
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Tài khoản đã được bảo vệ bằng xác thực 2 bước.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase">
                Nhập mã từ app để tắt 2FA
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                className={cn(
                  'w-full text-center text-2xl tracking-[0.5em] font-mono rounded-lg px-4 py-3',
                  'focus:outline-none border transition-colors',
                  theme === 'dark'
                    ? 'bg-slate-950 border-slate-800 text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-900'
                )}
                placeholder="● ● ● ● ● ●"
              />
            </div>

            <button
              type="button"
              onClick={handleDisable}
              disabled={verifying || code.length < 6}
              className={cn(
                'w-full py-3 rounded-lg font-bold transition-colors',
                'bg-rose-600 text-white hover:bg-rose-500',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {verifying
                ? <span className="flex items-center justify-center gap-2"><RefreshCw size={16} className="animate-spin" /> Đang xác thực...</span>
                : t?.disable2FA ?? 'Tắt 2FA'
              }
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
