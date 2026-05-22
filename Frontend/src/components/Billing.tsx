import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, XCircle, CreditCard, Star, Zap, Shield, 
  Server, Users, BarChart3, Crown, ArrowRight, Gift,
  ChevronDown, ChevronUp, Download, RefreshCw, Check
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';
import { PricingPlansApi } from '../services/api';
import { parsePrice } from './PricingManagement';

interface PlanLimits {
  servers: number | 'unlimited';
  users: number | 'unlimited';
  storage: string;
  bandwidth: string;
  apiCalls: number | 'unlimited';
  dailyAlerts: number | 'unlimited';
  retention: string;
  concurrentConnections: number;
}

interface PlanCapabilities {
  realTimeMonitoring: boolean;
  threatIntelligence: boolean;
  autoResponse: boolean;
  customRules: boolean;
  whiteLabel: boolean;
  prioritySupport: boolean;
  sla: string;
  backupFrequency: string;
  teamManagement: boolean;
  auditLogs: boolean;
  apiAccess: boolean;
  sso: boolean;
  customIntegrations: boolean;
  dedicatedSupport: boolean;
  slaCredits: boolean;
}

interface Plan {
  id: string;
  name: string;
  description?: string;
  price: string;
  originalPrice?: string;
  billingPeriod: string;
  isActive: boolean;
  isPopular: boolean;
  isEnterprise: boolean;
  isTrial: boolean;
  features: string[];
  limits: PlanLimits;
  capabilities: PlanCapabilities;
}

interface BillingProps {
  theme: Theme;
  t: any;
  plans: Plan[];
  /** Khi mở tab Billing lần đầu (chưa vào Quản lý giá), tải gói từ API và đồng bộ lên App */
  setPlans?: (plans: Plan[]) => void;
  currentPlanName?: string;
  onSelectPlan?: (plan: Plan) => void;
  onNavigateToPricing?: () => void;
}

export const Billing = ({ theme, t, plans, setPlans, currentPlanName, onSelectPlan, onNavigateToPricing }: BillingProps) => {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [plansLoading, setPlansLoading] = useState(false);

  useEffect(() => {
    if (!setPlans || plans.length > 0) return;
    let cancelled = false;
    setPlansLoading(true);
    (async () => {
      try {
        const res = await PricingPlansApi.getAll();
        if (!cancelled && res.success && res.data?.length) {
          setPlans(res.data as Plan[]);
        }
      } finally {
        if (!cancelled) setPlansLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plans.length, setPlans]);

  const handleSelectPlan = async (plan: Plan) => {
    if (loading) return;
    
    setSelectedPlan(plan.id);
    setLoading(true);

    try {
      if (onSelectPlan) {
        // Truyền plan với billingPeriod đã được override theo lựa chọn của user
        onSelectPlan({ ...plan, billingPeriod: billingCycle });
      } else {
        alert(`Đang chuyển đến trang thanh toán cho gói "${plan.name}"...`);
      }
    } catch (error) {
      console.error('Payment error:', error);
      alert('Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setLoading(false);
      setSelectedPlan(null);
    }
  };

  // Filter active plans only
  const activePlans = plans.filter(p => p.isActive !== false);

  if (plansLoading && activePlans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] gap-4">
        <RefreshCw className={cn('h-10 w-10 animate-spin', theme === 'dark' ? 'text-blue-400' : 'text-blue-600')} />
        <p className={cn('text-sm font-medium', theme === 'dark' ? 'text-slate-300' : 'text-slate-600')}>
          Đang tải danh sách gói dịch vụ…
        </p>
      </div>
    );
  }

  if (!plansLoading && activePlans.length === 0) {
    return (
      <div className={cn('rounded-2xl border p-8 text-center', theme === 'dark' ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-slate-50')}>
        <p className={cn('text-sm', theme === 'dark' ? 'text-slate-400' : 'text-slate-600')}>
          Chưa có gói dịch vụ nào hoặc không tải được dữ liệu. Vui lòng thử lại sau hoặc kiểm tra kết nối API.
        </p>
      </div>
    );
  }

  // Yearly discount calculation
  const getYearlyPrice = (monthlyPrice: string) => {
    const price = parsePrice(monthlyPrice);
    const yearlyPrice = price * 12 * 0.8; // 20% discount
    return yearlyPrice.toLocaleString();
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <h2 className={cn("text-3xl font-black tracking-tight", theme === 'dark' ? "text-white" : "text-slate-900")}>
          Chọn gói dịch vụ
        </h2>
        <p className="text-slate-400 max-w-xl mx-auto">
          Giải pháp SOC (Security Operations Center) cho doanh nghiệp mọi quy mô
        </p>
        
        {/* Billing Cycle Toggle */}
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={cn(
              "px-6 py-2 rounded-xl font-bold text-sm transition-all",
              billingCycle === 'monthly'
                ? "bg-blue-600 text-white"
                : theme === 'dark' ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-600"
            )}
          >
            Hàng tháng
          </button>
          <button
            onClick={() => setBillingCycle('yearly')}
            className={cn(
              "relative px-6 py-2 rounded-xl font-bold text-sm transition-all",
              billingCycle === 'yearly'
                ? "bg-blue-600 text-white"
                : theme === 'dark' ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-600"
            )}
          >
            Hàng năm
            <span className="absolute -top-2 -right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              -20%
            </span>
          </button>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {activePlans.map((plan) => {
          const displayPrice = billingCycle === 'yearly' ? getYearlyPrice(plan.price) : plan.price;
          const isCurrentPlan = currentPlanName === plan.name;
          const isSelected = selectedPlan === plan.id;

          return (
            <div
              key={plan.id}
              className={cn(
                "relative rounded-2xl border overflow-hidden transition-all duration-300",
                plan.isPopular
                  ? "border-blue-500 shadow-xl shadow-blue-500/20 lg:scale-105 z-10"
                  : isCurrentPlan
                    ? "border-green-500 shadow-lg shadow-green-500/20"
                    : theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200",
                isSelected && "ring-2 ring-blue-500 ring-offset-2"
              )}
            >
              {/* Popular Badge */}
              {plan.isPopular && (
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white text-center py-2 text-xs font-bold flex items-center justify-center gap-2">
                  <Star size={12} className="fill-current" /> PHỔ BIẾN NHẤT
                </div>
              )}

              {/* Current Plan Badge */}
              {isCurrentPlan && (
                <div className="bg-green-600 text-white text-center py-2 text-xs font-bold flex items-center justify-center gap-2">
                  <CheckCircle2 size={12} /> GÓI HIỆN TẠI
                </div>
              )}

              {/* Trial Badge */}
              {plan.isTrial && !isCurrentPlan && (
                <div className="bg-amber-600 text-white text-center py-2 text-xs font-bold">
                  DÙNG THỬ
                </div>
              )}

              <div className="p-6">
                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    plan.isEnterprise ? "bg-purple-600/20" : plan.isPopular ? "bg-blue-600/20" : theme === 'dark' ? "bg-slate-800" : "bg-slate-100"
                  )}>
                    {plan.isEnterprise ? (
                      <Crown size={24} className="text-purple-400" />
                    ) : plan.isPopular ? (
                      <Zap size={24} className="text-blue-400" />
                    ) : (
                      <CreditCard size={24} className="text-slate-400" />
                    )}
                  </div>
                  <div>
                    <h3 className={cn("text-lg font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
                      {plan.name}
                    </h3>
                    <p className="text-xs text-slate-400 capitalize">{plan.billingPeriod}</p>
                  </div>
                </div>

                {/* Pricing */}
                <div className="mb-6">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("text-3xl font-black", theme === 'dark' ? "text-white" : "text-slate-900")}>
                      {parsePrice(displayPrice).toLocaleString()}
                    </span>
                    <span className="text-slate-400 text-sm">VND</span>
                  </div>
                  {billingCycle === 'yearly' && (
                    <p className="text-xs text-slate-400 mt-1">
                      {parsePrice(plan.price).toLocaleString()}đ x 12 tháng = {parsePrice(displayPrice).toLocaleString()}đ
                    </p>
                  )}
                  {plan.originalPrice && parsePrice(plan.originalPrice) > parsePrice(plan.price) && (
                    <p className="text-sm text-slate-400 line-through mt-1">
                      {parsePrice(plan.originalPrice).toLocaleString()}đ
                    </p>
                  )}
                </div>

                {/* Quick Limits */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className={cn("p-3 rounded-lg", theme === 'dark' ? "bg-slate-800/50" : "bg-slate-50")}>
                    <div className="flex items-center gap-1 mb-1">
                      <Server size={12} className="text-slate-500" />
                      <p className="text-[10px] text-slate-400 uppercase">Servers</p>
                    </div>
                    <p className={cn("font-bold text-sm", theme === 'dark' ? "text-white" : "text-slate-900")}>
                      {plan.limits?.servers || '1'}
                    </p>
                  </div>
                  <div className={cn("p-3 rounded-lg", theme === 'dark' ? "bg-slate-800/50" : "bg-slate-50")}>
                    <div className="flex items-center gap-1 mb-1">
                      <Users size={12} className="text-slate-500" />
                      <p className="text-[10px] text-slate-400 uppercase">Users</p>
                    </div>
                    <p className={cn("font-bold text-sm", theme === 'dark' ? "text-white" : "text-slate-900")}>
                      {plan.limits?.users || '1'}
                    </p>
                  </div>
                  <div className={cn("p-3 rounded-lg", theme === 'dark' ? "bg-slate-800/50" : "bg-slate-50")}>
                    <div className="flex items-center gap-1 mb-1">
                      <BarChart3 size={12} className="text-slate-500" />
                      <p className="text-[10px] text-slate-400 uppercase">Storage</p>
                    </div>
                    <p className={cn("font-bold text-sm", theme === 'dark' ? "text-white" : "text-slate-900")}>
                      {plan.limits?.storage || '1 GB'}
                    </p>
                  </div>
                  <div className={cn("p-3 rounded-lg", theme === 'dark' ? "bg-slate-800/50" : "bg-slate-50")}>
                    <div className="flex items-center gap-1 mb-1">
                      <Shield size={12} className="text-slate-500" />
                      <p className="text-[10px] text-slate-400 uppercase">SLA</p>
                    </div>
                    <p className={cn("font-bold text-sm", theme === 'dark' ? "text-white" : "text-slate-900")}>
                      {plan.capabilities?.sla || '99%'}
                    </p>
                  </div>
                </div>

                {/* Expand Details */}
                <button
                  onClick={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
                  className={cn(
                    "w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-all",
                    theme === 'dark' ? "bg-slate-800 hover:bg-slate-700 text-slate-400" : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                  )}
                >
                  {expandedPlan === plan.id ? (
                    <><ChevronUp size={14} /> Thu gọn</>
                  ) : (
                    <><ChevronDown size={14} /> Xem chi tiết</>
                  )}
                </button>

                {expandedPlan === plan.id && (
                  <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-2">
                    {/* Capabilities */}
                    {plan.capabilities && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Tính năng</p>
                        {[
                          { key: 'realTimeMonitoring', label: 'Real-time Monitoring' },
                          { key: 'threatIntelligence', label: 'Threat Intelligence' },
                          { key: 'autoResponse', label: 'Auto Response' },
                          { key: 'customRules', label: 'Custom Rules' },
                          { key: 'whiteLabel', label: 'White Label' },
                          { key: 'prioritySupport', label: 'Priority Support' },
                          { key: 'apiAccess', label: 'API Access' },
                          { key: 'sso', label: 'SSO' },
                        ].map(item => (
                          <div key={item.key} className="flex items-center gap-2 text-xs">
                            {plan.capabilities[item.key as keyof PlanCapabilities] ? (
                              <CheckCircle2 size={12} className="text-green-400" />
                            ) : (
                              <XCircle size={12} className="text-slate-600" />
                            )}
                            <span className={cn(
                              plan.capabilities[item.key as keyof PlanCapabilities] ? "text-slate-300" : "text-slate-500"
                            )}>
                              {item.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* CTA Button */}
                <button
                  onClick={() => handleSelectPlan(plan)}
                  disabled={loading || isCurrentPlan}
                  className={cn(
                    "w-full mt-4 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
                    isCurrentPlan
                      ? "bg-green-600/20 text-green-400 cursor-default"
                      : plan.isPopular
                        ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30"
                        : "bg-slate-800 hover:bg-slate-700 text-white",
                    loading && isSelected && "opacity-50 cursor-wait"
                  )}
                >
                  {loading && isSelected ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : isCurrentPlan ? (
                    <>
                      <Check size={16} /> Đang sử dụng
                    </>
                  ) : (
                    <>
                      {plan.isEnterprise ? 'Liên hệ' : 'Chọn gói này'}
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Compare All Plans Link */}
      {onNavigateToPricing && (
        <div className="text-center">
          <button
            onClick={onNavigateToPricing}
            className="text-blue-400 hover:text-blue-300 text-sm font-medium underline"
          >
            Xem so sánh chi tiết tất cả các gói
          </button>
        </div>
      )}

      {/* Trust Badges */}
      <div className={cn(
        "mt-12 border rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6",
        theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"
      )}>
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center",
            theme === 'dark' ? "bg-slate-800" : "bg-slate-100"
          )}>
            <Shield size={24} className="text-green-400" />
          </div>
          <div>
            <h4 className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
              Thanh toán an toàn & bảo mật
            </h4>
            <p className="text-xs text-slate-400">Mã hóa 256-bit, hỗ trợ VNPay, chuyển khoản</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <CheckCircle2 size={16} className="text-green-400" />
            Kích hoạt tức thì
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <CheckCircle2 size={16} className="text-green-400" />
            Hủy bất kỳ lúc
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <CheckCircle2 size={16} className="text-green-400" />
            Hoàn tiền 30 ngày
          </div>
        </div>
      </div>
    </div>
  );
};

export default Billing;
