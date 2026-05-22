import React, { useEffect, useState } from 'react';
import {
  CheckCircle2, XCircle, Loader2, ArrowRight,
  RotateCcw, Receipt, Shield,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';
import { PaymentApi } from '../services/api';

export interface DemoPaymentResult {
  orderId: string;
  planName: string;
  amount: number;
}

interface PaymentResultPageProps {
  theme: Theme;
  onGoToDashboard: () => void;
  onRetry: () => void;
  demoResult?: DemoPaymentResult;
}

type ResultState = 'loading' | 'success' | 'failed';

export const PaymentResultPage = ({ theme, onGoToDashboard, onRetry, demoResult }: PaymentResultPageProps) => {
  const [state, setState]                 = useState<ResultState>('loading');
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [planName, setPlanName]           = useState('');
  const [amount, setAmount]               = useState(0);
  const [message, setMessage]             = useState('');

  const dark = theme === 'dark';

  useEffect(() => {
    if (demoResult) {
      const t = setTimeout(() => {
        setState('success');
        setTransactionId(demoResult.orderId);
        setPlanName(demoResult.planName);
        setAmount(demoResult.amount);
        setMessage('Thanh toán thành công! Gói dịch vụ đã được kích hoạt.');
      }, 1200);
      return () => clearTimeout(t);
    }

    const verify = async () => {
      try {
        const res = await PaymentApi.vnpayReturn(window.location.search);
        if (res.success) {
          const d = res.data as any;
          setState('success');
          setTransactionId(d?.transactionId || d?.orderId || null);
          setPlanName(d?.planName || '');
          setAmount(d?.amount || 0);
          setMessage(res.message || 'Thanh toán thành công!');
        } else {
          setState('failed');
          setMessage(res.message || 'Giao dịch bị hủy hoặc thất bại.');
        }
      } catch {
        setState('failed');
        setMessage('Không thể xác minh giao dịch. Vui lòng liên hệ hỗ trợ.');
      }
    };
    verify();
  }, [demoResult]);

  return (
    // Full-page wrapper — khớp màu nền với phần còn lại của app
    <div className={cn(
      'min-h-screen flex flex-col items-center justify-center px-4 py-12',
      dark ? 'bg-[#020617]' : 'bg-slate-50'
    )}>
      {/* Logo / brand strip */}
      <div className="flex items-center gap-2 mb-10">
        <div className="bg-blue-600 p-2 rounded-lg">
          <Shield size={20} className="text-white" />
        </div>
        <span className={cn('text-lg font-bold', dark ? 'text-white' : 'text-slate-900')}>
          VeriChainIDS
        </span>
      </div>

      {/* Card */}
      <div className={cn(
        'w-full max-w-md rounded-2xl border p-8 space-y-6',
        dark
          ? 'bg-slate-900 border-slate-800 shadow-2xl shadow-black/40'
          : 'bg-white border-slate-200 shadow-xl shadow-slate-200/60'
      )}>

        {/* ── Loading ── */}
        {state === 'loading' && (
          <div className="flex flex-col items-center gap-5 py-4">
            <div className={cn(
              'w-20 h-20 rounded-full flex items-center justify-center',
              dark ? 'bg-blue-500/10' : 'bg-blue-50'
            )}>
              <Loader2 size={40} className="text-blue-500 animate-spin" />
            </div>
            <div className="text-center space-y-1">
              <h2 className={cn('text-lg font-bold', dark ? 'text-white' : 'text-slate-900')}>
                Đang xử lý thanh toán...
              </h2>
              <p className={cn('text-sm', dark ? 'text-slate-400' : 'text-slate-500')}>
                Vui lòng không đóng trang này.
              </p>
            </div>
            {/* Progress bar */}
            <div className={cn('w-full h-1 rounded-full overflow-hidden', dark ? 'bg-slate-800' : 'bg-slate-100')}>
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{ animation: 'grow 1.2s ease-in-out forwards', width: '0%' }}
              />
            </div>
          </div>
        )}

        {/* ── Success ── */}
        {state === 'success' && (
          <>
            {/* Icon */}
            <div className="flex flex-col items-center gap-3 pt-2">
              <div className={cn(
                'w-20 h-20 rounded-full flex items-center justify-center',
                dark ? 'bg-emerald-500/10' : 'bg-emerald-50'
              )}>
                <CheckCircle2 size={44} className="text-emerald-500" />
              </div>
              <div className="text-center">
                <h2 className={cn('text-xl font-black', dark ? 'text-white' : 'text-slate-900')}>
                  Thanh toán thành công
                </h2>
                <p className={cn('text-sm mt-1', dark ? 'text-slate-400' : 'text-slate-500')}>
                  {message}
                </p>
              </div>
            </div>

            {/* Receipt */}
            <div className={cn(
              'rounded-xl border divide-y text-sm',
              dark ? 'border-slate-700/60 divide-slate-700/60' : 'border-slate-100 divide-slate-100'
            )}>
              {/* Header */}
              <div className={cn('flex items-center gap-2 px-4 py-3', dark ? 'bg-slate-800/50' : 'bg-slate-50')}>
                <Receipt size={14} className={dark ? 'text-slate-400' : 'text-slate-400'} />
                <span className={cn('text-xs font-bold uppercase tracking-wider', dark ? 'text-slate-400' : 'text-slate-500')}>
                  Biên lai giao dịch
                </span>
              </div>

              {/* Rows */}
              {[
                transactionId && { label: 'Mã giao dịch', value: transactionId, mono: true },
                planName      && { label: 'Gói dịch vụ',  value: planName },
                amount > 0    && { label: 'Số tiền',       value: `${amount.toLocaleString('vi-VN')} VND`, accent: true },
                { label: 'Thời gian', value: new Date().toLocaleString('vi-VN') },
                { label: 'Trạng thái', value: 'Thành công', success: true },
              ].filter(Boolean).map((row: any, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <span className={cn('text-sm', dark ? 'text-slate-400' : 'text-slate-500')}>
                    {row.label}
                  </span>
                  <span className={cn(
                    'font-semibold text-sm',
                    row.mono    ? 'font-mono text-xs' : '',
                    row.accent  ? 'text-blue-500' : '',
                    row.success ? 'text-emerald-500' : '',
                    !row.accent && !row.success ? (dark ? 'text-slate-200' : 'text-slate-800') : ''
                  )}>
                    {row.success
                      ? <span className="flex items-center gap-1"><CheckCircle2 size={13} /> {row.value}</span>
                      : row.value}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={onGoToDashboard}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center justify-center gap-2 transition-all"
            >
              Vào trang quản lý <ArrowRight size={17} />
            </button>
          </>
        )}

        {/* ── Failed ── */}
        {state === 'failed' && (
          <>
            <div className="flex flex-col items-center gap-3 pt-2">
              <div className={cn(
                'w-20 h-20 rounded-full flex items-center justify-center',
                dark ? 'bg-red-500/10' : 'bg-red-50'
              )}>
                <XCircle size={44} className="text-red-500" />
              </div>
              <div className="text-center">
                <h2 className={cn('text-xl font-black', dark ? 'text-white' : 'text-slate-900')}>
                  Giao dịch thất bại
                </h2>
                <p className={cn('text-sm mt-1', dark ? 'text-slate-400' : 'text-slate-500')}>
                  {message}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={onRetry}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center justify-center gap-2 transition-all"
              >
                <RotateCcw size={17} /> Thử lại
              </button>
              <button
                onClick={onGoToDashboard}
                className={cn(
                  'w-full py-3 rounded-xl text-sm font-medium transition-all border',
                  dark
                    ? 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
                    : 'border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300'
                )}
              >
                Về trang chủ
              </button>
            </div>
          </>
        )}
      </div>

      {/* Footer note */}
      <p className={cn('mt-8 text-xs', dark ? 'text-slate-600' : 'text-slate-400')}>
        Giao dịch được bảo mật bởi VeriChainIDS · SSL 256-bit
      </p>

      {/* CSS animation for progress bar */}
      <style>{`
        @keyframes grow { from { width: 0% } to { width: 100% } }
      `}</style>
    </div>
  );
};

export default PaymentResultPage;
