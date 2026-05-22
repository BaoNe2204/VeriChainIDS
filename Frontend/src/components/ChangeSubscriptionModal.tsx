import React, { useState, useEffect, useCallback } from 'react';
import { CreditCard, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';
import { UsersApi, PricingPlansApi, SubscriptionsApi } from '../services/api';

/** API /api/pricing-plans trả price dạng chuỗi định dạng số */
type PlanRow = {
  id: string;
  name: string;
  price: string | number;
  isActive?: boolean;
};

function normalizePlanName(s: string): string {
  return s.trim().toLowerCase();
}

function planPriceToNumber(price: string | number | undefined): number {
  if (typeof price === 'number' && Number.isFinite(price)) return price;
  const raw = String(price ?? '0').replace(/\s/g, '');
  // Chuỗi từ backend ToString("N0"): chỉ lấy chữ số (VN/US đều ổn cho số nguyên)
  const onlyDigits = raw.replace(/[^\d]/g, '');
  const n = parseInt(onlyDigits, 10);
  return Number.isFinite(n) ? n : 0;
}

function formatPlanPriceVi(price: string | number | undefined): string {
  const n = planPriceToNumber(price);
  if (n > 0) return n.toLocaleString('vi-VN');
  if (typeof price === 'string' && price.trim()) return price.trim();
  return '0';
}

interface ChangeSubscriptionModalProps {
  theme: Theme;
  user: { id: string; fullName: string; email: string; tenantId: string | null };
  onClose: () => void;
  onSuccess: () => void;
}

export const ChangeSubscriptionModal = ({ theme, user, onClose, onSuccess }: ChangeSubscriptionModalProps) => {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [durationMonths, setDurationMonths] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    setLoadError(null);
    try {
      const [plansRes, subRes] = await Promise.all([
        PricingPlansApi.getAll(),
        user.tenantId ? SubscriptionsApi.getForTenant(user.tenantId) : Promise.resolve({ success: false as const, message: '', data: null }),
      ]);

      if (!plansRes.success || !plansRes.data) {
        setLoadError(plansRes.message || 'Không tải được danh sách gói.');
        setPlans([]);
        return;
      }

      const raw = plansRes.data as unknown as PlanRow[];
      setPlans(raw);

      const currentName =
        subRes.success && subRes.data?.planName
          ? normalizePlanName(subRes.data.planName)
          : '';

      const byName = currentName
        ? raw.find((p) => normalizePlanName(p.name) === currentName)
        : undefined;

      if (byName) {
        setSelectedPlanId(byName.id);
        return;
      }

      if (raw.length > 0) {
        setSelectedPlanId(raw[0].id);
      }
    } catch (e) {
      console.error('Failed to load plans:', e);
      setLoadError('Lỗi khi tải danh sách gói.');
      setPlans([]);
    }
  }, [user.tenantId]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const handleSubmit = async () => {
    if (!selectedPlanId) {
      alert('Vui lòng chọn gói!');
      return;
    }

    setLoading(true);
    try {
      const response = await UsersApi.updateSubscription(user.id, {
        planId: selectedPlanId,
        durationMonths,
      });

      if (response.success) {
        alert('Cập nhật gói thành công!');
        onSuccess();
        onClose();
      } else {
        alert(response.message || 'Cập nhật gói thất bại!');
      }
    } catch {
      alert('Cập nhật gói thất bại!');
    } finally {
      setLoading(false);
    }
  };

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const priceNum = selectedPlan ? planPriceToNumber(selectedPlan.price) : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div
        className={cn(
          'w-full max-w-lg rounded-2xl border p-6 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto',
          theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        )}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className={cn('text-xl font-bold flex items-center gap-2', theme === 'dark' ? 'text-white' : 'text-slate-900')}>
            <CreditCard size={24} />
            Thay đổi gói
          </h3>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'p-2 rounded-lg transition-colors',
              theme === 'dark' ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'
            )}
          >
            <X size={20} />
          </button>
        </div>

        <div
          className={cn(
            'p-4 rounded-lg border mb-6',
            theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
          )}
        >
          <p className={cn('text-sm font-bold mb-1', theme === 'dark' ? 'text-white' : 'text-slate-900')}>{user.fullName}</p>
          <p className="text-xs text-slate-500">{user.email}</p>
        </div>

        {loadError && (
          <p className="text-sm text-rose-500 mb-4">{loadError}</p>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase mb-2 block">Chọn gói *</label>
            <select
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              className={cn(
                'w-full rounded-lg px-4 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all relative z-[110]',
                theme === 'dark' ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
              )}
            >
              {plans.length === 0 && !loadError ? (
                <option value="">Đang tải…</option>
              ) : null}
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                  {plan.isActive === false ? ' (đang ẩn)' : ''} — {formatPlanPriceVi(plan.price)}đ/tháng
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase mb-2 block">Thời hạn (tháng) *</label>
            <input
              type="number"
              min={1}
              max={12}
              value={durationMonths}
              onChange={(e) => setDurationMonths(parseInt(e.target.value, 10) || 1)}
              className={cn(
                'w-full rounded-lg px-4 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all',
                theme === 'dark' ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
              )}
            />
          </div>

          {selectedPlan && (
            <div
              className={cn(
                'p-4 rounded-lg border',
                theme === 'dark' ? 'bg-blue-500/10 border-blue-500/20' : 'bg-blue-50 border-blue-200'
              )}
            >
              <p className={cn('text-xs font-bold mb-2', theme === 'dark' ? 'text-blue-400' : 'text-blue-600')}>Thông tin gói:</p>
              <ul className={cn('text-xs space-y-1', theme === 'dark' ? 'text-slate-400' : 'text-slate-600')}>
                <li>
                  • Tên gói: <strong>{selectedPlan.name}</strong>
                </li>
                <li>
                  • Giá: <strong>{formatPlanPriceVi(selectedPlan.price)}đ/tháng</strong>
                </li>
                <li>
                  • Thời hạn: <strong>{durationMonths} tháng</strong>
                </li>
                <li>
                  • Tổng tiền:{' '}
                  <strong className="text-emerald-400">{(priceNum * durationMonths).toLocaleString('vi-VN')}đ</strong>
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className={cn(
              'flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors',
              theme === 'dark' ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !selectedPlanId || plans.length === 0}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-lg hover:shadow-xl disabled:opacity-50"
          >
            {loading ? 'Đang xử lý...' : 'Cập nhật gói'}
          </button>
        </div>
      </div>
    </div>
  );
};
