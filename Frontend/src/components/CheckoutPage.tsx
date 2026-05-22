import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, ShieldCheck, CreditCard, Loader2,
  CheckCircle2, QrCode, Copy, Check, RefreshCw,
  Smartphone, Clock, AlertCircle,
} from 'lucide-react';
import { PaymentApi } from '../services/api';

import { cn } from '../lib/utils';
import { Theme } from '../types';
const VIETQR_BANK = {
  bankId:      'MB',
  accountNo:   '0123456789',
  accountName: 'CONG TY VERICHAINIDS',
  template:    'compact2',
};

function buildVietQRUrl(amount: number, description: string): string {
  const { bankId, accountNo, accountName, template } = VIETQR_BANK;
  const desc = encodeURIComponent(description.slice(0, 25));
  return `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.png?amount=${amount}&addInfo=${desc}&accountName=${encodeURIComponent(accountName)}`;
}

// ─── VNPay sandbox demo config ───────────────────────────────────────────────
const VNPAY_DEMO = {
  // Thẻ ATM nội địa test (NCB sandbox)
  atm: {
    bank:   'NCB',
    cardNo: '9704198526191432198',
    name:   'NGUYEN VAN A',
    issued: '07/15',
    otp:    '123456',
  },
  // Thẻ quốc tế test
  visa: {
    cardNo: '4456530000001005',
    name:   'NGUYEN VAN A',
    expiry: '01/25',
    cvv:    '123',
    otp:    '123456',
  },
};

type VnpayTab = 'atm' | 'visa';

function genOrderCode(): string {
  return `CM${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

interface Plan {
  id: string;
  name: string;
  price: string;
  billingPeriod: string;
  description?: string;
}

interface CheckoutPageProps {
  theme: Theme;
  plan: Plan;
  onBack: () => void;
  /** Gọi khi demo thanh toán thành công — truyền orderId để hiển thị ở result page */
  onPaymentSuccess: (orderId: string, planName: string, amount: number) => void;
}

type PaymentMethod = 'vietqr' | 'vnpay';

export const CheckoutPage = ({ theme, plan, onBack, onPaymentSuccess }: CheckoutPageProps) => {
  const [method, setMethod]     = useState<PaymentMethod>('vietqr');
  const [vnpayTab, setVnpayTab] = useState<VnpayTab>('atm');
  const [loading, setLoading]   = useState(false);
  const [copied, setCopied]     = useState<string | null>(null);
  const [orderCode]             = useState(genOrderCode);
  const [qrLoaded, setQrLoaded] = useState(false);
  const [qrError, setQrError]   = useState(false);
  const [seconds, setSeconds]   = useState(15 * 60);

  const price = typeof plan.price === 'string'
    ? parseInt(plan.price.replace(/\D/g, ''), 10) || 0
    : Number(plan.price) || 0;

  // Nếu chọn hàng năm thì tính giá x12 x0.8 (giảm 20%)
  const finalPrice = plan.billingPeriod === 'yearly' ? Math.round(price * 12 * 0.8) : price;

  const transferContent = `${orderCode} GOI ${plan.name.toUpperCase()}`;
  const qrUrl = buildVietQRUrl(finalPrice, transferContent);

  // Countdown 15 phút
  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds((s: number) => s - 1), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  // Demo: gọi API lưu vào DB rồi chuyển sang trang kết quả thành công
  const handleDemoSuccess = async () => {
    setLoading(true);
    try {
      const paymentMethod = method === 'vietqr' ? 'VietQR' : 'VNPay Demo';
      const res = await PaymentApi.demoConfirm(orderCode, plan.name, finalPrice, paymentMethod, plan.billingPeriod);

      if (res.success && res.data) {
        onPaymentSuccess(res.data.orderId || orderCode, plan.name, finalPrice);
      } else {
        console.error('[Payment] demo-confirm failed:', res.message, res);
        const errMsg = res.message || 'Lỗi không xác định';

        // Phân biệt các loại lỗi dựa trên message từ backend
        if (errMsg.includes('tạm thời') || errMsg.includes('2FA') || errMsg.includes('token')) {
          alert('Lỗi xác thực 2FA: Token không hợp lệ. Vui lòng đăng nhập lại và xác thực 2FA.');
        } else if (errMsg.includes('tenant') || errMsg.includes('Tenant') || errMsg.includes('xác định')) {
          alert('Lỗi tenant: Không xác định được workspace. Vui lòng đăng xuất và đăng nhập lại.');
        } else if (errMsg.includes('404') || errMsg.includes('not found') || errMsg.includes('endpoint')) {
          alert('Backend chưa cập nhật endpoint mới.\nVui lòng restart backend (Ctrl+C rồi dotnet run).');
        } else if (errMsg.includes('Unauthorized') || errMsg.includes('401')) {
          alert(`Lỗi xác thực: ${errMsg}\n\nVui lòng đăng xuất và đăng nhập lại.`);
        } else {
          // Hiển thị message thực từ backend thay vì ghi đè
          alert(`Lỗi lưu giao dịch: ${errMsg}`);
        }
        setLoading(false);
      }
    } catch (err: any) {
      console.error('[Payment] Network error:', err);
      alert('Không kết nối được backend tại localhost:5000.\nKiểm tra backend đang chạy chưa.');
      setLoading(false);
    }
  };

  const card = cn(
    'rounded-2xl border p-6',
    theme === 'dark' ? 'bg-slate-900/60 border-slate-700' : 'bg-white border-slate-200 shadow-sm'
  );

  const tabBtn = (active: boolean) => cn(
    'flex-1 py-2 text-xs font-bold rounded-lg transition-all',
    active
      ? 'bg-blue-600 text-white'
      : theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-800'
  );

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      {/* Back */}
      <button onClick={onBack} className={cn(
        'flex items-center gap-2 text-sm font-medium transition-colors',
        theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
      )}>
        <ArrowLeft size={16} /> Quay lại
      </button>

      <h1 className={cn('text-2xl font-black', theme === 'dark' ? 'text-white' : 'text-slate-900')}>
        Xác nhận đơn hàng
      </h1>

      {/* Order Summary */}
      <div className={card}>
        <p className={cn('text-xs font-bold uppercase tracking-wider mb-4', theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
          Chi tiết đơn hàng
        </p>
        <div className="flex items-center justify-between">
          <div>
            <p className={cn('text-lg font-bold', theme === 'dark' ? 'text-white' : 'text-slate-900')}>
              Gói {plan.name}
            </p>
            {plan.description && <p className="text-sm text-slate-400 mt-0.5">{plan.description}</p>}
          </div>
          <span className={cn('px-3 py-1 rounded-full text-xs font-bold',
            theme === 'dark' ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-700')}>
            {plan.billingPeriod === 'yearly' ? 'Hàng năm' : 'Hàng tháng'}
          </span>
        </div>
        <div className={cn('border-t mt-4 pt-4 flex justify-between items-center', theme === 'dark' ? 'border-slate-700' : 'border-slate-100')}>
          <span className={cn('font-bold', theme === 'dark' ? 'text-slate-200' : 'text-slate-700')}>Tổng thanh toán</span>
          <span className="text-2xl font-black text-blue-500">
            {finalPrice.toLocaleString('vi-VN')}
            <span className="text-sm font-normal text-slate-400 ml-1">VND</span>
          </span>
        </div>
      </div>

      {/* Method Selector */}
      <div className={card}>
        <p className={cn('text-xs font-bold uppercase tracking-wider mb-4', theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
          Phương thức thanh toán
        </p>
        <div className="space-y-3">
          {/* VietQR */}
          <label className={cn(
            'flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all',
            method === 'vietqr' ? 'border-red-500 bg-red-500/10' : theme === 'dark' ? 'border-slate-700 hover:border-slate-600' : 'border-slate-200 hover:border-slate-300'
          )}>
            <input type="radio" name="method" value="vietqr" checked={method === 'vietqr'}
              onChange={() => setMethod('vietqr')} className="accent-red-500 w-4 h-4 shrink-0" />
            <div className="flex items-center gap-3 flex-1">
              <div className="w-12 h-8 bg-gradient-to-r from-red-500 to-red-700 rounded-md flex items-center justify-center shrink-0">
                <QrCode size={16} className="text-white" />
              </div>
              <div>
                <p className={cn('font-semibold text-sm', theme === 'dark' ? 'text-white' : 'text-slate-900')}>
                  VietQR — Chuyển khoản ngân hàng
                </p>
                <p className="text-xs text-slate-400">Mọi ngân hàng đều quét được · Miễn phí</p>
              </div>
            </div>
            {method === 'vietqr' && <CheckCircle2 size={18} className="text-red-500 shrink-0" />}
          </label>

          {/* VNPay */}
          <label className={cn(
            'flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all',
            method === 'vnpay' ? 'border-blue-500 bg-blue-500/10' : theme === 'dark' ? 'border-slate-700 hover:border-slate-600' : 'border-slate-200 hover:border-slate-300'
          )}>
            <input type="radio" name="method" value="vnpay" checked={method === 'vnpay'}
              onChange={() => setMethod('vnpay')} className="accent-blue-500 w-4 h-4 shrink-0" />
            <div className="flex items-center gap-3 flex-1">
              <div className="w-12 h-8 bg-gradient-to-r from-blue-600 to-blue-800 rounded-md flex items-center justify-center shrink-0">
                <span className="text-white text-[10px] font-black">VNPay</span>
              </div>
              <div>
                <p className={cn('font-semibold text-sm', theme === 'dark' ? 'text-white' : 'text-slate-900')}>VNPay</p>
                <p className="text-xs text-slate-400">Thẻ ATM nội địa / Thẻ quốc tế Visa/Master</p>
              </div>
            </div>
            {method === 'vnpay' && <CheckCircle2 size={18} className="text-blue-500 shrink-0" />}
          </label>
        </div>
      </div>

      {/* ── VietQR Panel ─────────────────────────────────────────────────── */}
      {method === 'vietqr' && (
        <div className={card}>
          <div className="flex items-center justify-between mb-4">
            <p className={cn('text-xs font-bold uppercase tracking-wider', theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
              Quét mã QR để thanh toán
            </p>
            <div className={cn(
              'flex items-center gap-1.5 text-xs font-mono font-bold px-3 py-1 rounded-full',
              seconds > 60
                ? theme === 'dark' ? 'bg-green-500/15 text-green-400' : 'bg-green-100 text-green-700'
                : 'bg-red-500/15 text-red-400 animate-pulse'
            )}>
              <Clock size={12} />
              {seconds > 0 ? formatTime(seconds) : 'Hết hạn'}
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-6 items-center">
            {/* QR */}
            <div className="relative rounded-2xl p-3 bg-white shrink-0">
              {!qrLoaded && !qrError && (
                <div className="w-52 h-52 flex items-center justify-center">
                  <RefreshCw size={28} className="text-slate-400 animate-spin" />
                </div>
              )}
              {qrError && (
                <div className="w-52 h-52 flex flex-col items-center justify-center gap-2">
                  <AlertCircle size={28} className="text-red-400" />
                  <p className="text-xs text-slate-500 text-center">Không tải được QR.<br />Dùng thông tin bên dưới.</p>
                </div>
              )}
              <img src={qrUrl} alt="VietQR"
                className={cn('w-52 h-52 object-contain rounded-xl', (!qrLoaded || qrError) && 'hidden')}
                onLoad={() => setQrLoaded(true)}
                onError={() => { setQrError(true); setQrLoaded(false); }}
              />
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] font-black px-3 py-0.5 rounded-full whitespace-nowrap">
                VietQR
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 space-y-3 w-full">
              <InfoRow label="Ngân hàng" value="MB Bank" theme={theme} />
              <InfoRow label="Số tài khoản" value={VIETQR_BANK.accountNo} theme={theme}
                onCopy={() => copyText(VIETQR_BANK.accountNo, 'acc')} copied={copied === 'acc'} />
              <InfoRow label="Chủ tài khoản" value={VIETQR_BANK.accountName} theme={theme} />
              <InfoRow label="Số tiền" value={`${finalPrice.toLocaleString('vi-VN')} VND`} theme={theme}
                onCopy={() => copyText(String(finalPrice), 'amt')} copied={copied === 'amt'} highlight />
              <InfoRow label="Nội dung CK" value={transferContent} theme={theme}
                onCopy={() => copyText(transferContent, 'desc')} copied={copied === 'desc'} highlight />
            </div>
          </div>

          {/* Steps */}
          <div className={cn('mt-5 rounded-xl p-4 space-y-2', theme === 'dark' ? 'bg-slate-800/60' : 'bg-slate-50')}>
            <p className={cn('text-xs font-bold mb-2', theme === 'dark' ? 'text-slate-300' : 'text-slate-600')}>Hướng dẫn</p>
            {['Mở app ngân hàng → chọn Quét QR', 'Quét mã hoặc nhập thủ công thông tin trên', 'Kiểm tra số tiền & nội dung chuyển khoản', 'Xác nhận — hệ thống tự kích hoạt gói'].map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-slate-400">
                <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5',
                  theme === 'dark' ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-600')}>{i + 1}</span>
                {s}
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2 mt-3 text-xs text-yellow-400 bg-yellow-400/10 rounded-xl px-4 py-3">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>Nhập <strong>đúng nội dung chuyển khoản</strong> để hệ thống tự xác nhận.</span>
          </div>

          {/* Demo confirm button */}
          <button
            onClick={handleDemoSuccess}
            disabled={loading}
            className={cn(
              'w-full mt-4 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all',
              'bg-red-600 hover:bg-red-500 text-white',
              loading && 'opacity-70 cursor-not-allowed'
            )}
          >
            {loading
              ? <><Loader2 size={18} className="animate-spin" /> Đang xử lý...</>
              : <><Smartphone size={18} /> Tôi đã chuyển khoản xong</>}
          </button>
        </div>
      )}

      {/* ── VNPay Panel ──────────────────────────────────────────────────── */}
      {method === 'vnpay' && (
        <div className={card}>
          <p className={cn('text-xs font-bold uppercase tracking-wider mb-4', theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
            Thông tin thẻ test (Sandbox)
          </p>

          {/* Demo badge */}
          <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400">
            <AlertCircle size={13} className="shrink-0" />
            Đây là môi trường demo — dùng thông tin thẻ test bên dưới để thanh toán thử.
          </div>

          {/* Tab ATM / Visa */}
          <div className={cn('flex gap-1 p-1 rounded-xl mb-4', theme === 'dark' ? 'bg-slate-800' : 'bg-slate-100')}>
            <button className={tabBtn(vnpayTab === 'atm')} onClick={() => setVnpayTab('atm')}>
              🏦 Thẻ ATM nội địa
            </button>
            <button className={tabBtn(vnpayTab === 'visa')} onClick={() => setVnpayTab('visa')}>
              💳 Thẻ Visa/Master
            </button>
          </div>

          {/* ATM Info */}
          {vnpayTab === 'atm' && (
            <div className="space-y-3">
              <InfoRow label="Ngân hàng" value={VNPAY_DEMO.atm.bank} theme={theme} />
              <InfoRow label="Số thẻ" value={VNPAY_DEMO.atm.cardNo} theme={theme}
                onCopy={() => copyText(VNPAY_DEMO.atm.cardNo, 'atm-card')} copied={copied === 'atm-card'} highlight />
              <InfoRow label="Tên chủ thẻ" value={VNPAY_DEMO.atm.name} theme={theme}
                onCopy={() => copyText(VNPAY_DEMO.atm.name, 'atm-name')} copied={copied === 'atm-name'} />
              <InfoRow label="Ngày phát hành" value={VNPAY_DEMO.atm.issued} theme={theme}
                onCopy={() => copyText(VNPAY_DEMO.atm.issued, 'atm-issued')} copied={copied === 'atm-issued'} />
              <InfoRow label="OTP" value={VNPAY_DEMO.atm.otp} theme={theme}
                onCopy={() => copyText(VNPAY_DEMO.atm.otp, 'atm-otp')} copied={copied === 'atm-otp'} highlight />
            </div>
          )}

          {/* Visa Info */}
          {vnpayTab === 'visa' && (
            <div className="space-y-3">
              <InfoRow label="Số thẻ" value={VNPAY_DEMO.visa.cardNo} theme={theme}
                onCopy={() => copyText(VNPAY_DEMO.visa.cardNo, 'visa-card')} copied={copied === 'visa-card'} highlight />
              <InfoRow label="Tên chủ thẻ" value={VNPAY_DEMO.visa.name} theme={theme}
                onCopy={() => copyText(VNPAY_DEMO.visa.name, 'visa-name')} copied={copied === 'visa-name'} />
              <InfoRow label="Ngày hết hạn" value={VNPAY_DEMO.visa.expiry} theme={theme}
                onCopy={() => copyText(VNPAY_DEMO.visa.expiry, 'visa-exp')} copied={copied === 'visa-exp'} />
              <InfoRow label="CVV" value={VNPAY_DEMO.visa.cvv} theme={theme}
                onCopy={() => copyText(VNPAY_DEMO.visa.cvv, 'visa-cvv')} copied={copied === 'visa-cvv'} highlight />
              <InfoRow label="OTP" value={VNPAY_DEMO.visa.otp} theme={theme}
                onCopy={() => copyText(VNPAY_DEMO.visa.otp, 'visa-otp')} copied={copied === 'visa-otp'} highlight />
            </div>
          )}

          {/* Steps */}
          <div className={cn('mt-4 rounded-xl p-4 space-y-2', theme === 'dark' ? 'bg-slate-800/60' : 'bg-slate-50')}>
            <p className={cn('text-xs font-bold mb-2', theme === 'dark' ? 'text-slate-300' : 'text-slate-600')}>Hướng dẫn</p>
            {[
              'Bấm "Thanh toán VNPay" bên dưới',
              'Chọn phương thức: ATM hoặc Visa/Master',
              'Nhập thông tin thẻ test ở trên',
              'Nhập OTP: 123456 → Xác nhận',
            ].map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-slate-400">
                <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5',
                  theme === 'dark' ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600')}>{i + 1}</span>
                {s}
              </div>
            ))}
          </div>

          {/* Demo confirm button */}
          <button
            onClick={handleDemoSuccess}
            disabled={loading}
            className={cn(
              'w-full mt-4 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all',
              'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30',
              loading && 'opacity-70 cursor-not-allowed'
            )}
          >
            {loading
              ? <><Loader2 size={18} className="animate-spin" /> Đang xử lý...</>
              : <><CreditCard size={18} /> Thanh toán VNPay (Demo)</>}
          </button>
        </div>
      )}

      {/* Security note */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <ShieldCheck size={14} className="text-green-400 shrink-0" />
        Giao dịch an toàn · Mã hóa SSL 256-bit · Không lưu thông tin thẻ
      </div>
    </div>
  );
};

// ── InfoRow helper ────────────────────────────────────────────────────────────
interface InfoRowProps {
  label: string;
  value: string;
  theme: Theme;
  onCopy?: () => void;
  copied?: boolean;
  highlight?: boolean;
}

const InfoRow = ({ label, value, theme, onCopy, copied, highlight }: InfoRowProps) => (
  <div className={cn(
    'flex items-center justify-between gap-2 rounded-xl px-3 py-2.5',
    highlight
      ? theme === 'dark' ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-100'
      : theme === 'dark' ? 'bg-slate-800/60' : 'bg-slate-50'
  )}>
    <div className="min-w-0">
      <p className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={cn('text-sm font-bold truncate',
        highlight ? 'text-blue-400' : theme === 'dark' ? 'text-slate-100' : 'text-slate-800'
      )}>{value}</p>
    </div>
    {onCopy && (
      <button onClick={onCopy}
        className={cn('shrink-0 p-1.5 rounded-lg transition-all',
          copied ? 'text-green-400 bg-green-400/10'
            : theme === 'dark' ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
        )}
        title="Sao chép"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    )}
  </div>
);

export default CheckoutPage;
