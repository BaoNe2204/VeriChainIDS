/**
 * Gói hiển thị trên Subscription + Pricing Management.
 * Tên gói (name) khớp PaymentController.GetPlanConfig: Starter | Pro | Enterprise
 */
export const DEFAULT_PRICING_PLANS = [
  {
    id: '1',
    name: 'Starter',
    price: '0',
    features: ['1 máy chủ', 'Phát hiện cơ bản', 'Cảnh báo email', 'Giữ log 7 ngày'],
    popular: false,
  },
  {
    id: '2',
    name: 'Pro',
    price: '2.500.000',
    features: ['10 máy chủ', 'AI phát hiện bất thường', 'Realtime SignalR', 'MITRE Mapping', 'Giữ log 30 ngày'],
    popular: true,
  },
  {
    id: '3',
    name: 'Enterprise',
    price: 'Custom',
    features: ['Không giới hạn máy chủ', 'AI riêng', 'SOAR', 'Tuân thủ ISO', 'Giữ log 1 năm'],
    popular: false,
  },
] as const;

export const PRICING_PLANS_STORAGE_KEY = 'cm_pricing_plans';

export function loadStoredPricingPlans(): any[] {
  try {
    const raw = localStorage.getItem(PRICING_PLANS_STORAGE_KEY);
    if (!raw) return [...DEFAULT_PRICING_PLANS];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    /* ignore */
  }
  return [...DEFAULT_PRICING_PLANS];
}
