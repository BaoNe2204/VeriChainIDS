import React, { useEffect, useState } from 'react';
import {
  Crown, RefreshCw, ArrowUpCircle, Calendar, CheckCircle2,
  Clock, AlertTriangle, TrendingUp, Shield, Server, Zap,
  BookOpen, MessageCircle, FileText, ChevronRight, CreditCard,
  Download, Wifi, WifiOff, ShoppingCart
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';
import { SubscriptionsApi, PaymentApi, type PaymentHistoryEntry } from '../services/api';
import { formatDateOnlyVi, formatDateTime } from '../utils/dateUtils';

interface MySubscriptionProps {
  theme: Theme;
  onUpgrade: () => void;
  refreshKey?: number;
}

interface Subscription {
  id: string;
  planName: string;
  planPrice: number;
  status: string;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  maxServers: number;
  usedServers: number;
}

function statusStyle(status: string, dark: boolean) {
  const s = status?.toLowerCase();
  if (s === 'active' || s === 'paid' || s === 'success')    return { badge: dark ? 'text-green-400  bg-green-400/10  border border-green-400/20' : 'text-green-700 bg-green-100 border border-green-200', dot: 'bg-green-400' };
  if (s === 'expired' || s === 'failed' || s === 'cancelled') return { badge: dark ? 'text-rose-400   bg-rose-400/10   border border-rose-400/20'  : 'text-rose-700   bg-rose-100   border border-rose-200', dot: 'bg-rose-400' };
  if (s === 'pending')                                            return { badge: dark ? 'text-yellow-400 bg-yellow-400/10 border border-yellow-400/20': 'text-yellow-700 bg-yellow-100 border border-yellow-200', dot: 'bg-yellow-400' };
  if (s === 'trial')                                              return { badge: dark ? 'text-purple-400 bg-purple-400/10 border border-purple-400/20':'text-purple-700 bg-purple-100 border border-purple-200', dot: 'bg-purple-400' };
  return { badge: dark ? 'text-slate-400   bg-slate-400/10   border border-slate-400/20'   : 'text-slate-600   bg-slate-100   border border-slate-200', dot: 'bg-slate-400' };
}

function subStatusLabel(s: string) {
  const m: Record<string, string> = {
    active: 'Đang hoạt động', expired: 'Hết hạn',
    pending: 'Chờ xử lý', cancelled: 'Đã hủy', trial: 'Dùng thử',
  };
  return m[s?.toLowerCase()] ?? s ?? '';
}

function payLabel(s?: string | null) {
  if (!s) return '—';
  const m: Record<string, string> = {
    success: 'Thành công', paid: 'Thành công',
    pending: 'Chờ thanh toán', failed: 'Thất bại',
    cancelled: 'Đã hủy', 'n/a': 'Miễn phí',
  };
  return m[s.toLowerCase()] ?? s;
}

function sourceBadge(source: string | null | undefined, dark: boolean) {
  if (source === 'subscription') {
    return (
      <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded', dark ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-purple-50 text-purple-600 border border-purple-200')}>
        <Wifi size={9} /> Đăng ký
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded', dark ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-blue-50 text-blue-600 border border-blue-200')}>
      <CreditCard size={9} /> Thanh toán
    </span>
  );
}

export const MySubscription = ({ theme, onUpgrade, refreshKey = 0 }: MySubscriptionProps) => {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [history, setHistory] = useState<PaymentHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const load = () => {
    setLoading(true); setHistoryLoading(true); setHistoryError(null);
    setSubscription(null); setHistory([]);
    SubscriptionsApi.get().then(r => {
      if (r.success && r.data) setSubscription(r.data as Subscription);
    }).finally(() => setLoading(false));
    PaymentApi.getHistory().then(r => {
      if (r.success && r.data) {
        setHistory(r.data as PaymentHistoryEntry[]);
      } else {
        setHistoryError(r.message || 'Không tải được lịch sử.');
      }
    }).catch(() => setHistoryError('Lỗi kết nối.')).finally(() => setHistoryLoading(false));
  };

  useEffect(() => { load(); }, [refreshKey]);

  const dark = theme === 'dark';
  const card = (extra = '') => cn('rounded-2xl border p-5', extra, dark ? 'bg-slate-900/60 border-slate-700' : 'bg-white border-slate-200 shadow-sm');

  const paidTotal = history
    .filter(o => ['paid','success','active'].includes(o.status?.toLowerCase()))
    .filter(o => o.source === 'order') // Chỉ tính payment orders, không tính subscriptions thủ công
    .reduce((s, o) => s + o.amount, 0);
  const successCount = history.filter(o => ['paid','success','active'].includes(o.status?.toLowerCase())).length;

  const handleExportCsv = () => {
    if (!history.length) return;
    const headers = ['Mã giao dịch', 'Nguồn', 'Gói', 'Số tiền', 'Tiền tệ', 'Phương thức', 'Trạng thái', 'Ngày', 'Thanh toán lúc'];
    const rows = history.map(o => [
      o.orderId, o.source === 'subscription' ? 'Đăng ký' : 'Thanh toán',
      o.planName, String(o.amount), o.currency, o.paymentMethod ?? '',
      payLabel(o.status), formatDateTime(o.createdAt),
      o.paidAt ? formatDateTime(o.paidAt) : '',
    ]);
    const BOM = '\ufeff';
    const csv = [BOM, [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n')].join('');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `lich_su_thanh_toan_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-5">
      <h2 className={cn('text-xl font-black', dark ? 'text-white' : 'text-slate-900')}>Quản lý gói cước</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* LEFT */}
        <div className="lg:col-span-2 space-y-5">

          {/* Current Plan */}
          <div className={card()}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center shrink-0', dark ? 'bg-blue-500/20' : 'bg-blue-100')}>
                  <Crown size={28} className="text-blue-400" />
                </div>
                <div>
                  {loading ? (
                    <div className="space-y-2"><div className={cn('h-5 w-32 rounded animate-pulse', dark ? 'bg-slate-700' : 'bg-slate-200')} /><div className={cn('h-4 w-24 rounded animate-pulse', dark ? 'bg-slate-700' : 'bg-slate-200')} /></div>
                  ) : subscription ? (
                    <>
                      <p className={cn('text-lg font-black', dark ? 'text-white' : 'text-slate-900')}>Gói {subscription.planName}</p>
                      <span className={cn('inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full mt-1', statusStyle(subscription.status, dark).badge)}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', statusStyle(subscription.status, dark).dot)} />
                        {subStatusLabel(subscription.status)}
                      </span>
                    </>
                  ) : (
                    <p className="text-slate-400 text-sm">Chưa có gói đăng ký</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={onUpgrade} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all">
                  <ArrowUpCircle size={15} /> Nâng cấp
                </button>
                <button onClick={onUpgrade} className={cn('flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-all', dark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700')}>
                  <RefreshCw size={15} /> Gia hạn
                </button>
              </div>
            </div>

            {!loading && subscription && (
              <div className={cn('mt-5 pt-4 border-t grid grid-cols-2 sm:grid-cols-4 gap-4', dark ? 'border-slate-700' : 'border-slate-100')}>
                {[
                  { label: 'Ngày bắt đầu', value: formatDateOnlyVi(subscription.startDate), icon: Calendar },
                  { label: 'Ngày hết hạn', value: formatDateOnlyVi(subscription.endDate), icon: Calendar },
                  {
                    label: 'Còn lại', value: `${subscription.daysRemaining} ngày`,
                    cls: subscription.daysRemaining <= 7 ? 'text-rose-400' : subscription.daysRemaining <= 30 ? 'text-yellow-400' : 'text-green-400',
                    icon: Clock
                  },
                  { label: 'Servers', value: `${subscription.usedServers}/${subscription.maxServers}`, icon: Server },
                ].map((item, i) => (
                  <div key={i}>
                    <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><item.icon size={11} /> {item.label}</p>
                    <p className={cn('text-sm font-semibold', (item as any).cls || (dark ? 'text-slate-200' : 'text-slate-700'))}>{item.value}</p>
                  </div>
                ))}
              </div>
            )}

            {!loading && subscription && subscription.daysRemaining <= 7 && subscription.daysRemaining > 0 && (
              <div className="mt-4 flex items-center gap-2 text-xs text-yellow-400 bg-yellow-400/10 rounded-xl px-4 py-2">
                <AlertTriangle size={13} /> Gói sắp hết hạn — gia hạn ngay để không bị gián đoạn.
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: TrendingUp, label: 'Tổng chi tiêu', value: `${paidTotal.toLocaleString('vi-VN')}đ`, color: 'text-blue-400',   bg: dark ? 'bg-blue-500/10'   : 'bg-blue-50'   },
              { icon: CheckCircle2, label: 'GD thành công', value: `${successCount} lần`,            color: 'text-green-400',  bg: dark ? 'bg-green-500/10'  : 'bg-green-50'  },
              { icon: CreditCard,  label: 'Tổng giao dịch', value: `${history.length} lần`,         color: 'text-purple-400', bg: dark ? 'bg-purple-500/10' : 'bg-purple-50' },
            ].map((s, i) => (
              <div key={i} className={cn('rounded-2xl border p-4 flex items-center gap-3', dark ? 'bg-slate-900/60 border-slate-700' : 'bg-white border-slate-200 shadow-sm')}>
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', s.bg)}><s.icon size={18} className={s.color} /></div>
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-400 truncate">{s.label}</p>
                  <p className={cn('text-sm font-bold truncate', dark ? 'text-white' : 'text-slate-900')}>{s.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Payment History */}
          <div className={card()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={cn('text-xs font-bold uppercase tracking-wider', dark ? 'text-slate-400' : 'text-slate-500')}>
                Lịch sử thanh toán &amp; đăng ký
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={load}
                  className={cn('p-1.5 rounded-lg border transition-all', dark ? 'border-slate-700 hover:bg-slate-800 text-slate-400' : 'border-slate-200 hover:bg-slate-100 text-slate-600')}
                  title="Làm mới"
                >
                  <RefreshCw size={14} className={historyLoading ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={handleExportCsv}
                  disabled={history.length === 0}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold transition-all"
                >
                  <Download size={13} /> Xuất CSV
                </button>
              </div>
            </div>

            {historyLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <div key={i} className={cn('h-11 rounded-xl animate-pulse', dark ? 'bg-slate-800' : 'bg-slate-100')} />)}</div>
            ) : historyError ? (
              <div className="text-center py-8">
                <p className="text-sm text-rose-400">{historyError}</p>
                <button onClick={load} className="mt-2 text-xs text-blue-400 hover:text-blue-300">Thử lại</button>
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <div className={cn('w-12 h-12 rounded-full flex items-center justify-center mx-auto', dark ? 'bg-slate-800' : 'bg-slate-100')}>
                  <FileText size={22} className="text-slate-400" />
                </div>
                <p className="text-sm text-slate-400">Chưa có lịch sử thanh toán.</p>
                <button onClick={onUpgrade} className="text-xs text-blue-400 hover:text-blue-300 font-medium">Mua gói ngay →</button>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={cn('text-[10px] uppercase tracking-wider border-b', dark ? 'text-slate-500 border-slate-700' : 'text-slate-400 border-slate-100')}>
                      <th className="pb-2 pr-3 text-left">Mã GD</th>
                      <th className="pb-2 pr-3 text-left">Nguồn</th>
                      <th className="pb-2 pr-3 text-left">Gói</th>
                      <th className="pb-2 pr-3 text-right">Số tiền</th>
                      <th className="pb-2 pr-3 text-left">Phương thức</th>
                      <th className="pb-2 pr-3 text-left">Trạng thái</th>
                      <th className="pb-2 text-left">Ngày</th>
                    </tr>
                  </thead>
                  <tbody className={cn('divide-y', dark ? 'divide-slate-700/40' : 'divide-slate-100')}>
                    {history.map(o => {
                      const s = statusStyle(o.status, dark);
                      return (
                        <tr key={o.id} className={cn('transition-colors', dark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50')}>
                          <td className="py-2.5 pr-3 font-mono text-xs text-slate-400" title={o.orderId}>
                            {o.orderId.slice(0, 12)}{o.orderId.length > 12 ? '…' : ''}
                          </td>
                          <td className="py-2.5 pr-3">{sourceBadge(o.source, dark)}</td>
                          <td className={cn('py-2.5 pr-3 font-medium', dark ? 'text-slate-200' : 'text-slate-700')}>{o.planName}</td>
                          <td className={cn('py-2.5 pr-3 text-right font-bold', dark ? 'text-white' : 'text-slate-900')}>
                            {o.amount > 0 ? `${o.amount.toLocaleString('vi-VN')}đ` : <span className="text-slate-400 font-normal">—</span>}
                          </td>
                          <td className="py-2.5 pr-3 text-xs text-slate-400">{o.paymentMethod ?? '—'}</td>
                          <td className="py-2.5 pr-3">
                            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold', s.badge)}>
                              <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
                              {payLabel(o.status)}
                            </span>
                          </td>
                          <td className="py-2.5 text-xs text-slate-500 whitespace-nowrap">
                            {formatDateOnlyVi(o.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div className="space-y-5">

          {/* Quick Actions */}
          <div className={card()}>
            <h3 className={cn('text-xs font-bold uppercase tracking-wider mb-4', dark ? 'text-slate-400' : 'text-slate-500')}>Thao tác nhanh</h3>
            <div className="space-y-1.5">
              {[
                { icon: ArrowUpCircle, label: 'Nâng cấp gói',  desc: 'Mở khóa thêm tính năng',       color: 'text-blue-400'   },
                { icon: RefreshCw,     label: 'Gia hạn gói',    desc: 'Tiếp tục sử dụng dịch vụ',     color: 'text-green-400'  },
                { icon: Shield,        label: 'So sánh gói',    desc: 'Xem chi tiết các gói dịch vụ', color: 'text-purple-400' },
                { icon: CreditCard,    label: 'Thanh toán',     desc: 'Chọn phương thức thanh toán',   color: 'text-yellow-400' },
              ].map((item, i) => (
                <button key={i} onClick={onUpgrade}
                  className={cn('w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left group', dark ? 'hover:bg-slate-800' : 'hover:bg-slate-50')}>
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', dark ? 'bg-slate-800 group-hover:bg-slate-700' : 'bg-slate-100 group-hover:bg-slate-200')}>
                    <item.icon size={15} className={item.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-semibold', dark ? 'text-slate-200' : 'text-slate-800')}>{item.label}</p>
                    <p className="text-xs text-slate-400 truncate">{item.desc}</p>
                  </div>
                  <ChevronRight size={13} className="text-slate-500 shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Tips */}
          <div className={card()}>
            <h3 className={cn('text-xs font-bold uppercase tracking-wider mb-4', dark ? 'text-slate-400' : 'text-slate-500')}>Mẹo &amp; Hỗ trợ</h3>
            <div className="space-y-4">
              {[
                { icon: Zap, color: 'text-yellow-400', bg: dark ? 'bg-yellow-400/10' : 'bg-yellow-50', title: 'Tiết kiệm 20%', desc: 'Chọn gói hàng năm để tiết kiệm 20% so với hàng tháng.' },
                { icon: BookOpen, color: 'text-blue-400',   bg: dark ? 'bg-blue-400/10'   : 'bg-blue-50',   title: 'Tài liệu API',  desc: 'Tích hợp VeriChainIDS vào hệ thống qua REST API.' },
                { icon: MessageCircle, color: 'text-green-400', bg: dark ? 'bg-green-400/10' : 'bg-green-50', title: 'Hỗ trợ 24/7', desc: 'Liên hệ qua email hoặc Telegram bất kỳ lúc nào.' },
              ].map((tip, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5', tip.bg)}><tip.icon size={14} className={tip.color} /></div>
                  <div>
                    <p className={cn('text-sm font-semibold', dark ? 'text-slate-200' : 'text-slate-800')}>{tip.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{tip.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Plan features */}
          {!loading && subscription && (
            <div className={cn('rounded-2xl border p-5', dark ? 'bg-gradient-to-br from-blue-600/10 to-purple-600/10 border-blue-500/20' : 'bg-gradient-to-br from-blue-50 to-purple-50 border-blue-200')}>
              <p className={cn('text-xs font-bold uppercase tracking-wider mb-3', dark ? 'text-blue-300' : 'text-blue-600')}>Gói hiện tại</p>
              <p className={cn('text-2xl font-black mb-1', dark ? 'text-white' : 'text-slate-900')}>{subscription.planName}</p>
              <p className="text-xs text-slate-400 mb-4">{subscription.daysRemaining} ngày còn lại</p>
              <div className="space-y-2">
                {[
                  `Tối đa ${subscription.maxServers} server`,
                  'Giám sát real-time 24/7',
                  'Cảnh báo qua Email & Telegram',
                  'Phân tích AI Engine',
                ].map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
                    <CheckCircle2 size={12} className="text-green-400 shrink-0" /> {f}
                  </div>
                ))}
              </div>
              <button onClick={onUpgrade} className="mt-4 w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all">
                Nâng cấp để có thêm →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MySubscription;
