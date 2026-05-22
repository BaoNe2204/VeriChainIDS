import React, { useState, useEffect, useCallback } from 'react';
import { 
  CreditCard, Save, Plus, Trash2, Edit2, Check, X, Star, Zap, Shield, 
  Server, Users, Bell, Activity, BarChart3, Crown, ArrowRight, Settings,
  ToggleLeft, ToggleRight, Copy, TrendingUp, DollarSign, Clock,
  CheckCircle2, XCircle, Download, FileText, Receipt,
  ChevronDown, ChevronUp, RefreshCw, AlertCircle, ZapOff,
  PieChart, Layers, Package, Calculator, Tag, Gift,
  ArrowUpRight, Mail, Eye, EyeOff, Search, Filter, SortAsc
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';
import { SubscriptionsApi, PaymentApi, PricingPlansApi } from '../services/api';
import { formatDateOnlyVi } from '../utils/dateUtils';

// Helper parse price - handles "299,000" string from API
export const parsePrice = (priceStr: string | number): number => {
  if (typeof priceStr === 'number') return priceStr;
  return parseInt(priceStr.replace(/[^0-9]/g, '') || '0');
};

interface PricingManagementProps {
  theme: Theme;
  t: any;
  plans: any[];
  setPlans: (plans: any[]) => void;
}

interface Subscription {
  id: string;
  tenantId: string;
  planName: string;
  planId: string;
  planPrice: number;
  billingCycle: 'monthly' | 'yearly';
  maxServers: number;
  usedServers: number;
  maxUsers: number;
  usedUsers: number;
  status: 'active' | 'trial' | 'expired' | 'cancelled';
  startDate: string;
  endDate: string;
  daysRemaining: number;
  autoRenew: boolean;
  paymentMethod: string;
}

interface PaymentRecord {
  id: string;
  orderId: string;
  amount: number;
  status: 'completed' | 'pending' | 'failed' | 'refunded';
  method: string;
  date: string;
  invoiceUrl: string;
  planName: string;
}

interface PlanFormData {
  id: string;
  name: string;
  description: string;
  price: string;
  originalPrice: string;
  billingPeriod: string;
  isActive: boolean;
  isPopular: boolean;
  isEnterprise: boolean;
  isTrial: boolean;
  features: string[];
  limits: {
    servers: number | 'unlimited';
    users: number | 'unlimited';
    storage: string;
    bandwidth: string;
    apiCalls: number | 'unlimited';
    dailyAlerts: number | 'unlimited';
    retention: string;
    concurrentConnections: number;
  };
  capabilities: {
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
  };
  color: string;
  badge: string;
}

const STORAGE_KEY = 'cm_pricing_plans';

  // Helper to create default form data
  const getDefaultPlanForm = (): PlanFormData => ({
    id: '',
    name: '',
    description: '',
    price: '0',
    originalPrice: '',
    billingPeriod: 'monthly',
    isActive: true,
    isPopular: false,
    isEnterprise: false,
    isTrial: false,
    features: [],
    limits: {
      servers: 1,
      users: 1,
      storage: '1 GB',
      bandwidth: '100 GB',
      apiCalls: 1000,
      dailyAlerts: 100,
      retention: '7 days',
      concurrentConnections: 10,
    },
    capabilities: {
      realTimeMonitoring: true,
      threatIntelligence: false,
      autoResponse: false,
      customRules: false,
      whiteLabel: false,
      prioritySupport: false,
      sla: '99%',
      backupFrequency: 'Daily',
      teamManagement: false,
      auditLogs: true,
      apiAccess: true,
      sso: false,
      customIntegrations: false,
      dedicatedSupport: false,
      slaCredits: false,
    },
    color: 'blue',
    badge: '',
  });

export const PricingManagement = ({ theme, t, plans, setPlans }: PricingManagementProps) => {
  const [activeSection, setActiveSection] = useState<'overview' | 'plans' | 'subscriptions' | 'payments' | 'analytics'>('overview');
  const [currentSubscription, setCurrentSubscription] = useState<Subscription | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanFormData | null>(null);
  const [newFeature, setNewFeature] = useState('');

  // View states
  const [compareMode, setCompareMode] = useState(false);
  const [selectedComparePlans, setSelectedComparePlans] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'servers'>('name');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'hidden'>('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch plans from API
      const plansRes = await PricingPlansApi.getAll();
      if (plansRes.success && plansRes.data) {
        setPlans(plansRes.data as any[]);
      }
      
      // Fetch subscription
      const subRes = await SubscriptionsApi.get();
      if (subRes.success && subRes.data) {
        setCurrentSubscription(subRes.data as any);
      }
      
      // Mock payment history
      setPaymentHistory([
        { id: '1', orderId: 'ORD-20240115-ABC123', amount: 299000, status: 'completed', method: 'VNPay', date: '2024-01-15', invoiceUrl: '#', planName: 'Standard' },
        { id: '2', orderId: 'ORD-20231215-DEF456', amount: 299000, status: 'completed', method: 'VNPay', date: '2023-12-15', invoiceUrl: '#', planName: 'Standard' },
        { id: '3', orderId: 'ORD-20231115-GHI789', amount: 199000, status: 'completed', method: 'VNPay', date: '2023-11-15', invoiceUrl: '#', planName: 'Basic' },
      ]);
    } catch (e) {
      console.log('No subscription data');
    }
    setLoading(false);
  };

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // CRUD Operations - API based
  const handleAddPlan = async (planData: PlanFormData) => {
    try {
      const dto = planToDto(planData);
      const res = await PricingPlansApi.create(dto);
      if (res.success && res.data) {
        setPlans([...plans, res.data as any]);
        setIsAddModalOpen(false);
        showToast(`Đã thêm gói "${planData.name}" thành công!`, 'success');
      }
    } catch (e) {
      showToast('Lỗi khi thêm gói!', 'error');
    }
  };

  const handleUpdatePlan = async (planData: PlanFormData) => {
    try {
      const dto = planToDto(planData);
      const res = await PricingPlansApi.update(planData.id, dto);
      if (res.success && res.data) {
        setPlans(plans.map(p => p.id === planData.id ? res.data as any : p));
        setIsEditModalOpen(false);
        setEditingPlan(null);
        showToast(`Đã cập nhật gói "${planData.name}"!`, 'success');
      }
    } catch (e) {
      showToast('Lỗi khi cập nhật gói!', 'error');
    }
  };

  const handleDeletePlan = async (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    if (confirm(`Bạn có chắc muốn xóa gói "${plan?.name}"?`)) {
      try {
        const res = await PricingPlansApi.delete(planId);
        if (res.success) {
          setPlans(plans.filter(p => p.id !== planId));
          showToast(`Đã xóa gói thành công!`, 'success');
        }
      } catch (e) {
        showToast('Lỗi khi xóa gói!', 'error');
      }
    }
  };

  const handleDuplicatePlan = async (planId: string) => {
    try {
      const res = await PricingPlansApi.duplicate(planId);
      if (res.success && res.data) {
        setPlans([...plans, res.data as any]);
        showToast(`Đã tạo bản sao gói!`, 'success');
      }
    } catch (e) {
      showToast('Lỗi khi nhân bản gói!', 'error');
    }
  };

  const handleToggleActive = async (planId: string) => {
    try {
      const res = await PricingPlansApi.toggleActive(planId);
      if (res.success && res.data) {
        setPlans(plans.map(p => p.id === planId ? res.data as any : p));
      }
    } catch (e) {
      showToast('Lỗi khi thay đổi trạng thái!', 'error');
    }
  };

  const handleTogglePopular = async (planId: string) => {
    try {
      const res = await PricingPlansApi.togglePopular(planId);
      if (res.success && res.data) {
        // Refresh all plans to sync popular status
        const plansRes = await PricingPlansApi.getAll();
        if (plansRes.success && plansRes.data) {
          setPlans(plansRes.data as any[]);
        }
      }
    } catch (e) {
      showToast('Lỗi khi thay đổi trạng thái!', 'error');
    }
  };

  // Helper to convert form data to DTO
  const planToDto = (plan: PlanFormData) => ({
    name: plan.name,
    description: plan.description,
    price: parsePrice(plan.price),
    originalPrice: plan.originalPrice ? parsePrice(plan.originalPrice) : undefined,
    billingPeriod: plan.billingPeriod,
    isActive: plan.isActive,
    isPopular: plan.isPopular,
    isEnterprise: plan.isEnterprise,
    isTrial: plan.isTrial,
    features: plan.features,
    limits: {
      servers: plan.limits.servers === 'unlimited' ? 999999 : plan.limits.servers,
      users: plan.limits.users === 'unlimited' ? 999999 : plan.limits.users,
      storage: plan.limits.storage,
      bandwidth: plan.limits.bandwidth,
      apiCalls: plan.limits.apiCalls === 'unlimited' ? 999999 : plan.limits.apiCalls,
      dailyAlerts: plan.limits.dailyAlerts,
      retention: plan.limits.retention,
      concurrentConnections: plan.limits.concurrentConnections,
    },
    capabilities: plan.capabilities,
  });

  // Filter and sort plans
  const filteredPlans = plans
    .filter(p => {
      if (filterStatus === 'active') return p.isActive !== false;
      if (filterStatus === 'hidden') return p.isActive === false;
      return true;
    })
    .filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'price') return parsePrice(a.price) - parsePrice(b.price);
      if (sortBy === 'servers') return ((a.limits?.servers as number) || 0) - ((b.limits?.servers as number) || 0);
      return 0;
    });

  return (
    <div className="space-y-6 relative">
      {/* Toast Notification */}
      {toast && (
        <div className={cn(
          "fixed top-4 right-4 z-50 px-6 py-3 rounded-xl shadow-xl flex items-center gap-3 animate-slide-in",
          toast.type === 'success' 
            ? "bg-green-600 text-white" 
            : "bg-rose-600 text-white"
        )}>
          {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className={cn("text-2xl font-black tracking-tight", theme === 'dark' ? "text-white" : "text-slate-900")}>
            Quản lý giá & Subscription
          </h2>
          <p className="text-slate-400 mt-1">Quản lý gói dịch vụ, subscription, thanh toán và phân tích doanh thu</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setCompareMode(!compareMode)}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all border",
              compareMode 
                ? "bg-blue-600 text-white border-blue-600" 
                : theme === 'dark' 
                  ? "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700" 
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            )}
          >
            <Layers size={16} /> So sánh
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-600/20"
          >
            <Plus size={16} /> Thêm gói mới
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className={cn(
        "flex gap-1 p-1 rounded-xl overflow-x-auto",
        theme === 'dark' ? "bg-slate-900/50" : "bg-white border border-slate-200"
      )}>
        {[
          { id: 'overview', label: 'Tổng quan', icon: PieChart },
          { id: 'plans', label: 'Gói dịch vụ', icon: Package },
          { id: 'subscriptions', label: 'Subscriptions', icon: Server },
          { id: 'payments', label: 'Thanh toán', icon: Receipt },
          { id: 'analytics', label: 'Phân tích', icon: BarChart3 },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id as any)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm transition-all whitespace-nowrap",
              activeSection === tab.id
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                : theme === 'dark'
                  ? "text-slate-400 hover:text-white hover:bg-slate-800"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            )}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Sections */}
      {activeSection === 'overview' && (
        <OverviewSection 
          theme={theme} 
          plans={plans} 
          subscription={currentSubscription}
          onNavigate={setActiveSection}
        />
      )}

      {activeSection === 'plans' && (
        <PlansSection
          theme={theme}
          plans={filteredPlans}
          allPlansCount={plans.length}
          compareMode={compareMode}
          selectedComparePlans={selectedComparePlans}
          searchTerm={searchTerm}
          sortBy={sortBy}
          filterStatus={filterStatus}
          onSearchChange={setSearchTerm}
          onSortChange={setSortBy}
          onFilterChange={setFilterStatus}
          onOpenAdd={() => setIsAddModalOpen(true)}
          onOpenEdit={(plan) => {
            setEditingPlan({
              ...getDefaultPlanForm(),
              ...plan,
              features: plan.features || ['Feature 1'],
            });
            setIsEditModalOpen(true);
          }}
          onDelete={handleDeletePlan}
          onDuplicate={handleDuplicatePlan}
          onToggleActive={handleToggleActive}
          onTogglePopular={handleTogglePopular}
          onToggleCompare={(id) => {
            if (selectedComparePlans.includes(id)) {
              setSelectedComparePlans(selectedComparePlans.filter(p => p !== id));
            } else if (selectedComparePlans.length < 3) {
              setSelectedComparePlans([...selectedComparePlans, id]);
            }
          }}
        />
      )}

      {activeSection === 'subscriptions' && (
        <SubscriptionsSection
          theme={theme}
          subscription={currentSubscription}
          plans={plans}
          loading={loading}
          onRefresh={fetchData}
          onNavigate={setActiveSection}
        />
      )}

      {activeSection === 'payments' && (
        <PaymentsSection
          theme={theme}
          paymentHistory={paymentHistory}
          loading={loading}
        />
      )}

      {activeSection === 'analytics' && (
        <AnalyticsSection
          theme={theme}
          plans={plans}
          subscription={currentSubscription}
        />
      )}

      {/* Add Plan Modal */}
      {isAddModalOpen && (
        <PlanFormModal
          theme={theme}
          mode="add"
          initialData={getDefaultPlanForm()}
          onSave={handleAddPlan}
          onClose={() => setIsAddModalOpen(false)}
        />
      )}

      {/* Edit Plan Modal */}
      {isEditModalOpen && editingPlan && (
        <PlanFormModal
          theme={theme}
          mode="edit"
          initialData={editingPlan}
          onSave={handleUpdatePlan}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingPlan(null);
          }}
        />
      )}
    </div>
  );
};

// ==================== PLAN FORM MODAL ====================
const PlanFormModal = ({ theme, mode, initialData, onSave, onClose }: {
  theme: Theme;
  mode: 'add' | 'edit';
  initialData: PlanFormData;
  onSave: (data: PlanFormData) => void;
  onClose: () => void;
}) => {
  const [formData, setFormData] = useState<PlanFormData>(initialData);
  const [activeTab, setActiveTab] = useState<'basic' | 'limits' | 'capabilities' | 'features'>('basic');
  const [newFeature, setNewFeature] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Vui lòng nhập tên gói!');
      return;
    }
    if (!formData.price || formData.price === '0') {
      alert('Vui lòng nhập giá gói!');
      return;
    }
    onSave(formData);
  };

  const addFeature = () => {
    if (newFeature.trim()) {
      setFormData({ ...formData, features: [...formData.features, newFeature.trim()] });
      setNewFeature('');
    }
  };

  const removeFeature = (index: number) => {
    setFormData({ ...formData, features: formData.features.filter((_, i) => i !== index) });
  };

  const updateLimit = (key: string, value: any) => {
    setFormData({
      ...formData,
      limits: { ...formData.limits, [key]: value }
    });
  };

  const updateCapability = (key: string, value: any) => {
    setFormData({
      ...formData,
      capabilities: { ...formData.capabilities, [key]: value }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className={cn(
        "rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col",
        theme === 'dark' ? "bg-slate-900 border border-slate-800" : "bg-white"
      )}>
        {/* Header */}
        <div className="p-6 border-b border-slate-700 flex justify-between items-center">
          <div>
            <h3 className={cn("text-xl font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
              {mode === 'add' ? 'Thêm gói mới' : 'Chỉnh sửa gói'}
            </h3>
            <p className="text-sm text-slate-400 mt-1">{formData.name || 'Nhập thông tin gói'}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-700">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className={cn(
          "flex gap-1 p-2 border-b border-slate-700",
          theme === 'dark' ? "bg-slate-800/50" : "bg-slate-50"
        )}>
          {[
            { id: 'basic', label: 'Cơ bản', icon: CreditCard },
            { id: 'limits', label: 'Giới hạn', icon: Settings },
            { id: 'capabilities', label: 'Tính năng', icon: Zap },
            { id: 'features', label: 'Danh sách', icon: List },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all",
                activeTab === tab.id
                  ? "bg-blue-600 text-white"
                  : theme === 'dark' ? "text-slate-400 hover:bg-slate-700" : "text-slate-600 hover:bg-slate-200"
              )}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-6">
          {/* Basic Tab */}
          {activeTab === 'basic' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Name */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Tên gói *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="VD: Standard, Premium..."
                    className={cn(
                      "w-full rounded-xl px-4 py-3",
                      theme === 'dark' ? "bg-slate-800 text-white placeholder-slate-500" : "bg-slate-50 text-slate-900"
                    )}
                    required
                  />
                </div>

                {/* Price */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Giá (VND) *</label>
                  <input
                    type="text"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value.replace(/[^0-9]/g, '') })}
                    placeholder="299000"
                    className={cn(
                      "w-full rounded-xl px-4 py-3 font-mono",
                      theme === 'dark' ? "bg-slate-800 text-white placeholder-slate-500" : "bg-slate-50 text-slate-900"
                    )}
                    required
                  />
                </div>

                {/* Original Price */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Giá gốc (giảm giá)</label>
                  <input
                    type="text"
                    value={formData.originalPrice}
                    onChange={(e) => setFormData({ ...formData, originalPrice: e.target.value.replace(/[^0-9]/g, '') })}
                    placeholder="399000"
                    className={cn(
                      "w-full rounded-xl px-4 py-3 font-mono",
                      theme === 'dark' ? "bg-slate-800 text-white placeholder-slate-500" : "bg-slate-50 text-slate-900"
                    )}
                  />
                </div>

                {/* Billing Period */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Chu kỳ thanh toán</label>
                  <select
                    value={formData.billingPeriod}
                    onChange={(e) => setFormData({ ...formData, billingPeriod: e.target.value })}
                    className={cn(
                      "w-full rounded-xl px-4 py-3",
                      theme === 'dark' ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
                    )}
                  >
                    <option value="monthly">Hàng tháng</option>
                    <option value="yearly">Hàng năm</option>
                    <option value="quarterly">Hàng quý</option>
                  </select>
                </div>

                {/* Description */}
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Mô tả</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Mô tả ngắn về gói dịch vụ..."
                    rows={3}
                    className={cn(
                      "w-full rounded-xl px-4 py-3 resize-none",
                      theme === 'dark' ? "bg-slate-800 text-white placeholder-slate-500" : "bg-slate-50 text-slate-900"
                    )}
                  />
                </div>

                {/* Badges */}
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase mb-3 block">Trạng thái</label>
                  <div className="flex flex-wrap gap-4">
                    {[
                      { key: 'isActive', label: 'Hoạt động', icon: CheckCircle2, color: 'green' },
                      { key: 'isPopular', label: 'Phổ biến', icon: Star, color: 'amber' },
                      { key: 'isEnterprise', label: 'Enterprise', icon: Crown, color: 'purple' },
                      { key: 'isTrial', label: 'Trial', icon: Gift, color: 'blue' },
                    ].map(item => (
                      <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData[item.key as keyof PlanFormData] as boolean}
                          onChange={(e) => setFormData({ ...formData, [item.key]: e.target.checked })}
                          className="rounded"
                        />
                        <span className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium",
                          formData[item.key as keyof PlanFormData]
                            ? item.color === 'green' ? "bg-green-600/20 text-green-400" :
                              item.color === 'amber' ? "bg-amber-600/20 text-amber-400" :
                              item.color === 'purple' ? "bg-purple-600/20 text-purple-400" :
                              "bg-blue-600/20 text-blue-400"
                            : theme === 'dark' ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500"
                        )}>
                          <item.icon size={14} />
                          {item.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Limits Tab */}
          {activeTab === 'limits' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Servers */}
                <div className={cn(
                  "p-4 rounded-xl border",
                  theme === 'dark' ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200"
                )}>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">
                    <Server size={14} className="inline mr-1" /> Servers
                  </label>
                  <input
                    type="number"
                    value={formData.limits.servers === 'unlimited' ? '' : formData.limits.servers}
                    onChange={(e) => updateLimit('servers', parseInt(e.target.value) || 'unlimited')}
                    placeholder="1"
                    className={cn(
                      "w-full rounded-lg px-3 py-2 text-lg font-bold",
                      theme === 'dark' ? "bg-slate-900 text-white" : "bg-white text-slate-900"
                    )}
                  />
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.limits.servers === 'unlimited'}
                      onChange={(e) => updateLimit('servers', e.target.checked ? 'unlimited' : 1)}
                      className="rounded"
                    />
                    <span className="text-xs text-slate-400">Unlimited</span>
                  </label>
                </div>

                {/* Users */}
                <div className={cn(
                  "p-4 rounded-xl border",
                  theme === 'dark' ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200"
                )}>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">
                    <Users size={14} className="inline mr-1" /> Users
                  </label>
                  <input
                    type="number"
                    value={formData.limits.users === 'unlimited' ? '' : formData.limits.users}
                    onChange={(e) => updateLimit('users', parseInt(e.target.value) || 'unlimited')}
                    placeholder="1"
                    className={cn(
                      "w-full rounded-lg px-3 py-2 text-lg font-bold",
                      theme === 'dark' ? "bg-slate-900 text-white" : "bg-white text-slate-900"
                    )}
                  />
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.limits.users === 'unlimited'}
                      onChange={(e) => updateLimit('users', e.target.checked ? 'unlimited' : 1)}
                      className="rounded"
                    />
                    <span className="text-xs text-slate-400">Unlimited</span>
                  </label>
                </div>

                {/* API Calls */}
                <div className={cn(
                  "p-4 rounded-xl border",
                  theme === 'dark' ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200"
                )}>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">
                    <Activity size={14} className="inline mr-1" /> API Calls/tháng
                  </label>
                  <input
                    type="number"
                    value={formData.limits.apiCalls === 'unlimited' ? '' : formData.limits.apiCalls}
                    onChange={(e) => updateLimit('apiCalls', parseInt(e.target.value) || 'unlimited')}
                    placeholder="1000"
                    className={cn(
                      "w-full rounded-lg px-3 py-2 text-lg font-bold",
                      theme === 'dark' ? "bg-slate-900 text-white" : "bg-white text-slate-900"
                    )}
                  />
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.limits.apiCalls === 'unlimited'}
                      onChange={(e) => updateLimit('apiCalls', e.target.checked ? 'unlimited' : 1000)}
                      className="rounded"
                    />
                    <span className="text-xs text-slate-400">Unlimited</span>
                  </label>
                </div>

                {/* Storage */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">
                    <BarChart3 size={14} className="inline mr-1" /> Storage
                  </label>
                  <input
                    type="text"
                    value={formData.limits.storage}
                    onChange={(e) => updateLimit('storage', e.target.value)}
                    placeholder="10 GB"
                    className={cn(
                      "w-full rounded-lg px-3 py-2",
                      theme === 'dark' ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
                    )}
                  />
                </div>

                {/* Bandwidth */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">
                    <TrendingUp size={14} className="inline mr-1" /> Bandwidth
                  </label>
                  <input
                    type="text"
                    value={formData.limits.bandwidth}
                    onChange={(e) => updateLimit('bandwidth', e.target.value)}
                    placeholder="100 GB"
                    className={cn(
                      "w-full rounded-lg px-3 py-2",
                      theme === 'dark' ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
                    )}
                  />
                </div>

                {/* Retention */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">
                    <Clock size={14} className="inline mr-1" /> Retention
                  </label>
                  <input
                    type="text"
                    value={formData.limits.retention}
                    onChange={(e) => updateLimit('retention', e.target.value)}
                    placeholder="30 days"
                    className={cn(
                      "w-full rounded-lg px-3 py-2",
                      theme === 'dark' ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
                    )}
                  />
                </div>

                {/* Daily Alerts */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">
                    <Bell size={14} className="inline mr-1" /> Daily Alerts
                  </label>
                  <input
                    type="number"
                    value={formData.limits.dailyAlerts === 'unlimited' ? '' : formData.limits.dailyAlerts}
                    onChange={(e) => updateLimit('dailyAlerts', parseInt(e.target.value) || 'unlimited')}
                    placeholder="100"
                    className={cn(
                      "w-full rounded-lg px-3 py-2",
                      theme === 'dark' ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
                    )}
                  />
                </div>

                {/* Concurrent Connections */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">
                    <Zap size={14} className="inline mr-1" /> Concurrent Connections
                  </label>
                  <input
                    type="number"
                    value={formData.limits.concurrentConnections}
                    onChange={(e) => updateLimit('concurrentConnections', parseInt(e.target.value) || 0)}
                    placeholder="10"
                    className={cn(
                      "w-full rounded-lg px-3 py-2",
                      theme === 'dark' ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
                    )}
                  />
                </div>

                {/* SLA */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">
                    <Shield size={14} className="inline mr-1" /> SLA
                  </label>
                  <select
                    value={formData.capabilities.sla}
                    onChange={(e) => updateCapability('sla', e.target.value)}
                    className={cn(
                      "w-full rounded-lg px-3 py-2",
                      theme === 'dark' ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-900"
                    )}
                  >
                    <option value="99%">99%</option>
                    <option value="99.5%">99.5%</option>
                    <option value="99.9%">99.9%</option>
                    <option value="99.99%">99.99%</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Capabilities Tab */}
          {activeTab === 'capabilities' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: 'realTimeMonitoring', label: 'Real-time Monitoring', desc: 'Giám sát server 24/7' },
                  { key: 'threatIntelligence', label: 'Threat Intelligence', desc: 'Phát hiện mối đe dọa AI' },
                  { key: 'autoResponse', label: 'Auto Response', desc: 'Phản hồi tự động' },
                  { key: 'customRules', label: 'Custom Rules', desc: 'Quy tắc tùy chỉnh' },
                  { key: 'whiteLabel', label: 'White Label', desc: 'Thương hiệu riêng' },
                  { key: 'prioritySupport', label: 'Priority Support', desc: 'Hỗ trợ ưu tiên' },
                  { key: 'teamManagement', label: 'Team Management', desc: 'Quản lý team' },
                  { key: 'auditLogs', label: 'Audit Logs', desc: 'Nhật ký kiểm tra' },
                  { key: 'apiAccess', label: 'API Access', desc: 'Truy cập API' },
                  { key: 'sso', label: 'SSO', desc: 'Single Sign-On' },
                  { key: 'customIntegrations', label: 'Custom Integrations', desc: 'Tích hợp tùy chỉnh' },
                  { key: 'dedicatedSupport', label: 'Dedicated Support', desc: 'Hỗ trợ riêng' },
                  { key: 'slaCredits', label: 'SLA Credits', desc: 'Hoàn tiền SLA' },
                ].map(item => (
                  <div key={item.key} className={cn(
                    "p-4 rounded-xl border flex items-center justify-between",
                    formData.capabilities[item.key as keyof typeof formData.capabilities]
                      ? theme === 'dark' ? "bg-green-600/10 border-green-600/30" : "bg-green-50 border-green-200"
                      : theme === 'dark' ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200"
                  )}>
                    <div>
                      <p className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
                        {item.label}
                      </p>
                      <p className="text-xs text-slate-400">{item.desc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateCapability(item.key, !formData.capabilities[item.key as keyof typeof formData.capabilities])}
                      className={cn(
                        "p-2 rounded-lg transition-all",
                        formData.capabilities[item.key as keyof typeof formData.capabilities]
                          ? "bg-green-600 text-white"
                          : theme === 'dark' ? "bg-slate-700 text-slate-400" : "bg-slate-200 text-slate-500"
                      )}
                    >
                      {formData.capabilities[item.key as keyof typeof formData.capabilities] ? (
                        <CheckCircle2 size={20} />
                      ) : (
                        <XCircle size={20} />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Features Tab */}
          {activeTab === 'features' && (
            <div className="space-y-6">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Thêm feature</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newFeature}
                    onChange={(e) => setNewFeature(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addFeature())}
                    placeholder="VD: Unlimited servers..."
                    className={cn(
                      "flex-1 rounded-xl px-4 py-3",
                      theme === 'dark' ? "bg-slate-800 text-white placeholder-slate-500" : "bg-slate-50 text-slate-900"
                    )}
                  />
                  <button
                    type="button"
                    onClick={addFeature}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase">Danh sách features ({formData.features.length})</label>
                {formData.features.length === 0 ? (
                  <div className={cn(
                    "p-8 rounded-xl text-center border border-dashed",
                    theme === 'dark' ? "border-slate-700 text-slate-500" : "border-slate-200 text-slate-400"
                  )}>
                    <ZapOff size={32} className="mx-auto mb-2 opacity-50" />
                    <p>Chưa có feature nào</p>
                    <p className="text-xs mt-1">Thêm feature ở trên</p>
                  </div>
                ) : (
                  formData.features.map((feature, index) => (
                    <div key={index} className={cn(
                      "p-4 rounded-xl flex items-center justify-between",
                      theme === 'dark' ? "bg-slate-800/50" : "bg-slate-50"
                    )}>
                      <div className="flex items-center gap-3">
                        <CheckCircle2 size={18} className="text-green-400" />
                        <span className={cn(theme === 'dark' ? "text-white" : "text-slate-900")}>
                          {feature}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFeature(index)}
                        className="p-2 rounded-lg hover:bg-rose-500/20 text-rose-500"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "px-6 py-3 rounded-xl font-bold",
              theme === 'dark' ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            )}
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2"
          >
            <Check size={18} />
            {mode === 'add' ? 'Thêm gói' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Simple List icon
const List = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

// ==================== OVERVIEW SECTION ====================
const OverviewSection = ({ theme, plans, subscription, onNavigate }: {
  theme: Theme;
  plans: any[];
  subscription: Subscription | null;
  onNavigate: (section: any) => void;
}) => {
  const stats = [
    { label: 'Tổng gói', value: plans.length, icon: Package, color: 'blue' },
    { label: 'Đang dùng', value: subscription ? 1 : 0, icon: CheckCircle2, color: 'green' },
    { label: 'Ngày còn lại', value: subscription?.daysRemaining || 0, icon: Clock, color: 'amber' },
    { 
      label: 'Giá trung bình', 
      value: plans.length > 0 
        ? Math.round(plans.reduce((s, p) => s + parsePrice(p.price), 0) / plans.length).toLocaleString() 
        : 0, 
      icon: TrendingUp, 
      color: 'purple',
      suffix: 'VND' 
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <button
            key={i}
            onClick={() => onNavigate(i === 0 ? 'plans' : i === 1 ? 'subscriptions' : 'analytics')}
            className={cn(
              "p-6 rounded-2xl border text-left transition-all hover:scale-[1.02] hover:shadow-lg",
              theme === 'dark' 
                ? "bg-slate-900/50 border-slate-800 hover:border-slate-700" 
                : "bg-white border-slate-200 hover:border-blue-300"
            )}
          >
            <div className="flex items-center justify-between mb-4">
              <div className={cn(
                "p-3 rounded-xl",
                stat.color === 'blue' ? "bg-blue-600/20 text-blue-400" :
                stat.color === 'green' ? "bg-green-600/20 text-green-400" :
                stat.color === 'amber' ? "bg-amber-600/20 text-amber-400" :
                "bg-purple-600/20 text-purple-400"
              )}>
                <stat.icon size={24} />
              </div>
              {stat.color === 'green' && <ArrowUpRight size={20} className="text-green-400" />}
            </div>
            <p className={cn("text-3xl font-black mb-1", theme === 'dark' ? "text-white" : "text-slate-900")}>
              {stat.value}{stat.suffix && <span className="text-sm font-normal text-slate-400 ml-1">{stat.suffix}</span>}
            </p>
            <p className="text-sm text-slate-400">{stat.label}</p>
          </button>
        ))}
      </div>

      {/* Current Plan Card */}
      {subscription && (
        <div className={cn(
          "p-6 rounded-2xl border",
          theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
        )}>
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className={cn("text-lg font-bold mb-1", theme === 'dark' ? "text-white" : "text-slate-900")}>
                Subscription hiện tại
              </h3>
              <p className="text-sm text-slate-400">Thông tin gói đang sử dụng</p>
            </div>
            <span className={cn(
              "px-3 py-1 rounded-full text-xs font-bold",
              subscription.status === 'active' ? "bg-green-600/20 text-green-400" :
              subscription.status === 'trial' ? "bg-amber-600/20 text-amber-400" :
              "bg-slate-600/20 text-slate-400"
            )}>
              {subscription.status.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className={cn("p-4 rounded-xl", theme === 'dark' ? "bg-slate-800/50" : "bg-slate-50")}>
              <p className="text-xs text-slate-400 mb-1">Gói</p>
              <p className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>{subscription.planName}</p>
            </div>
            <div className={cn("p-4 rounded-xl", theme === 'dark' ? "bg-slate-800/50" : "bg-slate-50")}>
              <p className="text-xs text-slate-400 mb-1">Chu kỳ</p>
              <p className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
                {subscription.billingCycle === 'monthly' ? 'Hàng tháng' : 'Hàng năm'}
              </p>
            </div>
            <div className={cn("p-4 rounded-xl", theme === 'dark' ? "bg-slate-800/50" : "bg-slate-50")}>
              <p className="text-xs text-slate-400 mb-1">Server</p>
              <p className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
                {subscription.usedServers}/{subscription.maxServers}
              </p>
            </div>
            <div className={cn("p-4 rounded-xl", theme === 'dark' ? "bg-slate-800/50" : "bg-slate-50")}>
              <p className="text-xs text-slate-400 mb-1">Ngày còn lại</p>
              <p className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>{subscription.daysRemaining}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button 
              onClick={() => onNavigate('subscriptions')}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold"
            >
              Quản lý Subscription
            </button>
            <button 
              onClick={() => onNavigate('plans')}
              className={cn(
                "px-6 py-3 rounded-xl font-bold border",
                theme === 'dark' ? "border-slate-700 hover:bg-slate-800" : "border-slate-200 hover:bg-slate-50"
              )}>
              Xem gói khác
            </button>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { icon: Package, label: 'Gói dịch vụ', desc: 'Quản lý plans', section: 'plans', color: 'blue' },
          { icon: Receipt, label: 'Thanh toán', desc: 'Lịch sử giao dịch', section: 'payments', color: 'green' },
          { icon: Calculator, label: 'Tính giá', desc: 'Ước tính chi phí', section: 'analytics', color: 'purple' },
          { icon: Tag, label: 'Mã giảm giá', desc: 'Quản lý coupons', section: 'overview', color: 'amber' },
        ].map((action, i) => (
          <button
            key={i}
            onClick={() => onNavigate(action.section as any)}
            className={cn(
              "p-5 rounded-2xl border text-left transition-all hover:scale-[1.02]",
              theme === 'dark' ? "bg-slate-900/50 border-slate-800 hover:border-slate-700" : "bg-white border-slate-200 hover:border-blue-300"
            )}
          >
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center mb-3",
              action.color === 'blue' ? "bg-blue-600/20 text-blue-400" :
              action.color === 'green' ? "bg-green-600/20 text-green-400" :
              action.color === 'purple' ? "bg-purple-600/20 text-purple-400" :
              "bg-amber-600/20 text-amber-400"
            )}>
              <action.icon size={20} />
            </div>
            <p className={cn("font-bold mb-0.5", theme === 'dark' ? "text-white" : "text-slate-900")}>{action.label}</p>
            <p className="text-xs text-slate-400">{action.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
};

// ==================== PLANS SECTION ====================
const PlansSection = ({ 
  theme, 
  plans, 
  allPlansCount,
  compareMode, 
  selectedComparePlans,
  searchTerm,
  sortBy,
  filterStatus,
  onSearchChange,
  onSortChange,
  onFilterChange,
  onOpenAdd,
  onOpenEdit,
  onDelete,
  onDuplicate,
  onToggleActive,
  onTogglePopular,
  onToggleCompare 
}: {
  theme: Theme;
  plans: any[];
  allPlansCount: number;
  compareMode: boolean;
  selectedComparePlans: string[];
  searchTerm: string;
  sortBy: 'name' | 'price' | 'servers';
  filterStatus: 'all' | 'active' | 'hidden';
  onSearchChange: (v: string) => void;
  onSortChange: (v: any) => void;
  onFilterChange: (v: any) => void;
  onOpenAdd: () => void;
  onOpenEdit: (plan: any) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onToggleActive: (id: string) => void;
  onTogglePopular: (id: string) => void;
  onToggleCompare: (id: string) => void;
}) => {
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'grid' | 'list' | 'matrix'>('grid');

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl",
            theme === 'dark' ? "bg-slate-800" : "bg-slate-100"
          )}>
            <Search size={16} className="text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Tìm kiếm gói..."
              className={cn(
                "bg-transparent outline-none text-sm w-40",
                theme === 'dark' ? "text-white placeholder-slate-500" : "text-slate-900"
              )}
            />
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            className={cn(
              "px-4 py-2 rounded-xl text-sm",
              theme === 'dark' ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"
            )}
          >
            <option value="name">Sắp xếp: Tên</option>
            <option value="price">Sắp xếp: Giá</option>
            <option value="servers">Sắp xếp: Servers</option>
          </select>

          {/* Filter */}
          <select
            value={filterStatus}
            onChange={(e) => onFilterChange(e.target.value)}
            className={cn(
              "px-4 py-2 rounded-xl text-sm",
              theme === 'dark' ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"
            )}
          >
            <option value="all">Tất cả ({allPlansCount})</option>
            <option value="active">Hoạt động ({plans.filter(p => p.isActive !== false).length})</option>
            <option value="hidden">Đã ẩn ({plans.filter(p => p.isActive === false).length})</option>
          </select>

          {/* View Toggle */}
          <div className={cn(
            "flex rounded-xl p-1",
            theme === 'dark' ? "bg-slate-800" : "bg-slate-100"
          )}>
            {[
              { id: 'grid', icon: Package },
              { id: 'list', icon: List },
              { id: 'matrix', icon: Layers },
            ].map(view => (
              <button
                key={view.id}
                onClick={() => setActiveView(view.id as any)}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  activeView === view.id
                    ? "bg-blue-600 text-white"
                    : theme === 'dark' ? "text-slate-400" : "text-slate-600"
                )}
              >
                <view.icon size={16} />
              </button>
            ))}
          </div>
        </div>

        <p className="text-sm text-slate-400">
          Hiển thị {plans.length} / {allPlansCount} gói
        </p>
      </div>

      {/* Grid View */}
      {activeView === 'grid' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                "rounded-2xl border overflow-hidden transition-all",
                plan.isPopular 
                  ? "border-blue-500 shadow-xl shadow-blue-500/20" 
                  : plan.isActive === false 
                    ? "opacity-60 border-slate-700"
                    : theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
              )}
            >
              {/* Badge */}
              {plan.isPopular && (
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white text-center py-2 text-xs font-bold flex items-center justify-center gap-2">
                  <Star size={12} className="fill-current" /> PHỔ BIẾN NHẤT
                </div>
              )}
              {plan.isActive === false && (
                <div className="bg-slate-700 text-slate-300 text-center py-2 text-xs font-bold">ĐÃ ẨN</div>
              )}

              <div className="p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center",
                      plan.isEnterprise ? "bg-purple-600/20" : plan.isPopular ? "bg-blue-600/20" : theme === 'dark' ? "bg-slate-800" : "bg-slate-100"
                    )}>
                      <CreditCard
                        size={24}
                        className={plan.isEnterprise ? "text-purple-400" : plan.isPopular ? "text-blue-400" : "text-slate-400"}
                      />
                    </div>
                    <div>
                      <h3 className={cn("text-lg font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
                        {plan.name}
                      </h3>
                      <p className="text-xs text-slate-400">{plan.billingPeriod || 'monthly'}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  {compareMode ? (
                    <button
                      onClick={() => onToggleCompare(plan.id)}
                      className={cn(
                        "p-2 rounded-lg transition-all",
                        selectedComparePlans.includes(plan.id)
                          ? "bg-blue-600 text-white"
                          : theme === 'dark' ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-600"
                      )}
                    >
                      {selectedComparePlans.includes(plan.id) ? <Check size={16} /> : <Plus size={16} />}
                    </button>
                  ) : (
                    <div className="flex gap-1">
                      <button onClick={() => onOpenEdit(plan)} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => onDuplicate(plan.id)} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400">
                        <Copy size={16} />
                      </button>
                      <button onClick={() => onDelete(plan.id)} className="p-2 rounded-lg hover:bg-rose-500/20 text-rose-500">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Pricing */}
                <div className="mb-4">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("text-4xl font-black", theme === 'dark' ? "text-white" : "text-slate-900")}>
                      {parsePrice(plan.price).toLocaleString()}
                    </span>
                    <span className="text-slate-400">VND</span>
                  </div>
                  {plan.originalPrice && (
                    <p className="text-sm text-slate-400 line-through">{parsePrice(plan.originalPrice).toLocaleString()} VND</p>
                  )}
                </div>

                {/* Quick Limits */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className={cn("p-3 rounded-lg", theme === 'dark' ? "bg-slate-800/50" : "bg-slate-50")}>
                    <p className="text-xs text-slate-400">Servers</p>
                    <p className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
                      {plan.limits?.servers || '1'}
                    </p>
                  </div>
                  <div className={cn("p-3 rounded-lg", theme === 'dark' ? "bg-slate-800/50" : "bg-slate-50")}>
                    <p className="text-xs text-slate-400">Users</p>
                    <p className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
                      {plan.limits?.users || '1'}
                    </p>
                  </div>
                  <div className={cn("p-3 rounded-lg", theme === 'dark' ? "bg-slate-800/50" : "bg-slate-50")}>
                    <p className="text-xs text-slate-400">Storage</p>
                    <p className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
                      {plan.limits?.storage || '1 GB'}
                    </p>
                  </div>
                  <div className={cn("p-3 rounded-lg", theme === 'dark' ? "bg-slate-800/50" : "bg-slate-50")}>
                    <p className="text-xs text-slate-400">API Calls</p>
                    <p className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
                      {plan.limits?.apiCalls || '1K'}
                    </p>
                  </div>
                </div>

                {/* Expand */}
                <button
                  onClick={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
                  className={cn(
                    "w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2",
                    theme === 'dark' ? "bg-slate-800 hover:bg-slate-700" : "bg-slate-100 hover:bg-slate-200"
                  )}
                >
                  {expandedPlan === plan.id ? <><ChevronUp size={16} /> Thu gọn</> : <><ChevronDown size={16} /> Chi tiết</>}
                </button>

                {/* Expanded */}
                {expandedPlan === plan.id && (
                  <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-3">
                    {/* Capabilities */}
                    {plan.capabilities && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-slate-400 uppercase">Capabilities</p>
                        {Object.entries(plan.capabilities).filter(([_, v]) => v === true).slice(0, 5).map(([key, _]) => (
                          <div key={key} className="flex items-center gap-2 text-sm">
                            <CheckCircle2 size={14} className="text-green-400" />
                            <span className="text-slate-300">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Features */}
                    {plan.features && plan.features.length > 0 && (
                      <div className="space-y-2 pt-3 border-t border-slate-700/50">
                        <p className="text-xs font-bold text-slate-400 uppercase">Features</p>
                        {plan.features.slice(0, 3).map((f: string, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <CheckCircle2 size={14} className="text-green-400" />
                            <span className="text-slate-300">{f}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Toggle Buttons */}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => onTogglePopular(plan.id)}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1",
                      plan.isPopular
                        ? "bg-amber-600/20 text-amber-400"
                        : theme === 'dark' ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500"
                    )}
                  >
                    <Star size={12} className={plan.isPopular ? "fill-current" : ""} />
                    {plan.isPopular ? 'Đang nổi bật' : 'Nổi bật'}
                  </button>
                  <button
                    onClick={() => onToggleActive(plan.id)}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1",
                      plan.isActive === false
                        ? "bg-green-600/20 text-green-400"
                        : theme === 'dark' ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {plan.isActive === false ? <CheckCircle2 size={12} /> : <EyeOff size={12} />}
                    {plan.isActive === false ? 'Kích hoạt' : 'Ẩn'}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Add Card */}
          <button
            onClick={onOpenAdd}
            className={cn(
              "min-h-[350px] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 transition-all hover:border-blue-500 hover:bg-blue-500/5",
              theme === 'dark' ? "border-slate-700" : "border-slate-300"
            )}
          >
            <div className={cn("w-16 h-16 rounded-full flex items-center justify-center", theme === 'dark' ? "bg-slate-800" : "bg-slate-100")}>
              <Plus size={28} className="text-blue-500" />
            </div>
            <span className="font-bold text-slate-400">Thêm gói mới</span>
          </button>
        </div>
      )}

      {/* List View */}
      {activeView === 'list' && (
        <div className={cn(
          "rounded-2xl border overflow-hidden",
          theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
        )}>
          <table className="w-full">
            <thead>
              <tr className={cn(
                "text-xs uppercase",
                theme === 'dark' ? "bg-slate-800/50 text-slate-400" : "bg-slate-50 text-slate-500"
              )}>
                <th className="text-left p-4">Gói</th>
                <th className="text-right p-4">Giá/tháng</th>
                <th className="text-right p-4">Servers</th>
                <th className="text-right p-4">Users</th>
                <th className="text-right p-4">Storage</th>
                <th className="text-center p-4">Trạng thái</th>
                <th className="text-right p-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {plans.map(plan => (
                <tr key={plan.id} className={cn(
                  "transition-colors hover:bg-slate-800/20",
                  plan.isActive === false && "opacity-60"
                )}>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        plan.isPopular ? "bg-blue-600/20" : theme === 'dark' ? "bg-slate-800" : "bg-slate-100"
                      )}>
                        <CreditCard size={16} className={plan.isPopular ? "text-blue-400" : "text-slate-400"} />
                      </div>
                      <div>
                        <p className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>{plan.name}</p>
                        {plan.isPopular && <span className="text-xs text-blue-400">Popular</span>}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-right font-mono">
                    {parsePrice(plan.price).toLocaleString()} VND
                  </td>
                  <td className="p-4 text-right">{plan.limits?.servers || '1'}</td>
                  <td className="p-4 text-right">{plan.limits?.users || '1'}</td>
                  <td className="p-4 text-right">{plan.limits?.storage || '1 GB'}</td>
                  <td className="p-4 text-center">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-xs font-bold",
                      plan.isPopular ? "bg-amber-600/20 text-amber-400" :
                      plan.isActive === false ? "bg-slate-600/20 text-slate-400" :
                      "bg-green-600/20 text-green-400"
                    )}>
                      {plan.isPopular ? 'Nổi bật' : plan.isActive === false ? 'Ẩn' : 'Hoạt động'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => onOpenEdit(plan)} className="p-2 rounded hover:bg-slate-700 text-slate-400">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => onDuplicate(plan.id)} className="p-2 rounded hover:bg-slate-700 text-slate-400">
                        <Copy size={14} />
                      </button>
                      <button onClick={() => onDelete(plan.id)} className="p-2 rounded hover:bg-rose-500/20 text-rose-500">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {plans.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Package size={48} className="mx-auto mb-4 opacity-50" />
              <p>Không có gói nào phù hợp</p>
            </div>
          )}
        </div>
      )}

      {/* Matrix View */}
      {activeView === 'matrix' && (
        <div className={cn(
          "rounded-2xl border overflow-hidden",
          theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
        )}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={theme === 'dark' ? "bg-slate-800/50" : "bg-slate-50"}>
                  <th className="text-left p-4 w-1/4">
                    <span className="text-xs font-bold text-slate-400 uppercase">Features</span>
                  </th>
                  {plans.slice(0, 4).map(plan => (
                    <th key={plan.id} className="p-4 text-center min-w-[150px]">
                      <p className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>{plan.name}</p>
                      <p className="text-xl font-black text-blue-400">{parsePrice(plan.price).toLocaleString()}đ</p>
                      {plan.isPopular && <Star size={14} className="mx-auto text-amber-400 fill-current mt-1" />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {/* Limits */}
                <tr className={cn(theme === 'dark' ? "bg-slate-800/30" : "bg-slate-50/50")}>
                  <td colSpan={plans.slice(0, 4).length + 1} className="p-3">
                    <span className="text-xs font-bold text-slate-400 uppercase">Limits</span>
                  </td>
                </tr>
                {['servers', 'users', 'storage', 'apiCalls'].map(feature => (
                  <tr key={feature}>
                    <td className="p-4 text-slate-300 capitalize">{feature}</td>
                    {plans.slice(0, 4).map(plan => (
                      <td key={plan.id} className="p-4 text-center font-medium">
                        {plan.limits?.[feature as keyof typeof plan.limits] || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
                {/* Capabilities */}
                <tr className={cn(theme === 'dark' ? "bg-slate-800/30" : "bg-slate-50/50")}>
                  <td colSpan={plans.slice(0, 4).length + 1} className="p-3">
                    <span className="text-xs font-bold text-slate-400 uppercase">Capabilities</span>
                  </td>
                </tr>
                {['realTimeMonitoring', 'threatIntelligence', 'autoResponse'].map(feature => (
                  <tr key={feature}>
                    <td className="p-4 text-slate-300">{feature.replace(/([A-Z])/g, ' $1').trim()}</td>
                    {plans.slice(0, 4).map((plan, i) => (
                      <td key={plan.id} className="p-4 text-center">
                        {plan.capabilities?.[feature as keyof typeof plan.capabilities] ? (
                          <CheckCircle2 size={20} className="mx-auto text-green-400" />
                        ) : (
                          <XCircle size={20} className="mx-auto text-slate-600" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== SUBSCRIPTIONS SECTION ====================
const SubscriptionsSection = ({ theme, subscription, plans, loading, onRefresh, onNavigate }: {
  theme: Theme;
  subscription: Subscription | null;
  plans: any[];
  loading: boolean;
  onRefresh: () => void;
  onNavigate: (section: any) => void;
}) => (
  <div className="space-y-6">
    <div className={cn(
      "p-6 rounded-2xl border",
      theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
    )}>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className={cn("text-lg font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
            Subscription hiện tại
          </h3>
          <p className="text-sm text-slate-400">Thông tin gói đang sử dụng</p>
        </div>
        <button onClick={onRefresh} className={cn("p-2 rounded-lg", theme === 'dark' ? "hover:bg-slate-800" : "hover:bg-slate-100")}>
          <RefreshCw size={18} className={loading ? "animate-spin text-blue-400" : "text-slate-400"} />
        </button>
      </div>

      {subscription ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className={cn("p-4 rounded-xl", theme === 'dark' ? "bg-slate-800/50" : "bg-slate-50")}>
              <p className="text-xs text-slate-400 uppercase mb-1">Gói</p>
              <p className={cn("text-xl font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>{subscription.planName}</p>
              <span className={cn("mt-2 px-2 py-1 rounded-full text-xs font-bold inline-block",
                subscription.status === 'active' ? "bg-green-600/20 text-green-400" : "bg-amber-600/20 text-amber-400")}>
                {subscription.status.toUpperCase()}
              </span>
            </div>
            <div className={cn("p-4 rounded-xl", theme === 'dark' ? "bg-slate-800/50" : "bg-slate-50")}>
              <p className="text-xs text-slate-400 uppercase mb-1">Ngày còn lại</p>
              <p className={cn("text-xl font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>{subscription.daysRemaining}</p>
            </div>
            <div className={cn("p-4 rounded-xl", theme === 'dark' ? "bg-slate-800/50" : "bg-slate-50")}>
              <p className="text-xs text-slate-400 uppercase mb-1">Giá</p>
              <p className={cn("text-xl font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>{subscription.planPrice.toLocaleString()}đ</p>
            </div>
            <div className={cn("p-4 rounded-xl", theme === 'dark' ? "bg-slate-800/50" : "bg-slate-50")}>
              <p className="text-xs text-slate-400 uppercase mb-1">Chu kỳ</p>
              <p className={cn("text-xl font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
                {subscription.billingCycle === 'monthly' ? 'Hàng tháng' : 'Hàng năm'}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => onNavigate('plans')} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold">
              Nâng cấp / Đổi gói
            </button>
            <button className={cn("px-6 py-3 rounded-xl font-bold border", theme === 'dark' ? "border-slate-700" : "border-slate-200")}>
              Gia hạn
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <Server size={64} className="mx-auto mb-4 text-slate-600" />
          <h4 className={cn("text-lg font-bold mb-2", theme === 'dark' ? "text-white" : "text-slate-900")}>
            Chưa có subscription
          </h4>
          <p className="text-slate-400 mb-6">Chọn một gói để bắt đầu</p>
          <button onClick={() => onNavigate('plans')} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold">
            Xem các gói
          </button>
        </div>
      )}
    </div>
  </div>
);

// ==================== PAYMENTS SECTION ====================
const PaymentsSection = ({ theme, paymentHistory, loading }: {
  theme: Theme;
  paymentHistory: PaymentRecord[];
  loading: boolean;
}) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {[
        { label: 'Tổng thanh toán', value: paymentHistory.reduce((s, p) => s + (p.status === 'completed' ? p.amount : 0), 0).toLocaleString() + 'đ', icon: DollarSign, color: 'green' },
        { label: 'Tháng này', value: '299.000đ', icon: CreditCard, color: 'blue' },
        { label: 'Thành công', value: paymentHistory.filter(p => p.status === 'completed').length.toString(), icon: CheckCircle2, color: 'green' },
        { label: 'Đang chờ', value: paymentHistory.filter(p => p.status === 'pending').length.toString(), icon: Clock, color: 'amber' },
      ].map((stat, i) => (
        <div key={i} className={cn(
          "p-5 rounded-xl border",
          theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
        )}>
          <div className="flex items-center gap-2 mb-3">
            <div className={cn("p-2 rounded-lg", stat.color === 'blue' ? "bg-blue-600/20 text-blue-400" : stat.color === 'green' ? "bg-green-600/20 text-green-400" : "bg-amber-600/20 text-amber-400")}>
              <stat.icon size={18} />
            </div>
            <span className="text-sm text-slate-400">{stat.label}</span>
          </div>
          <p className={cn("text-2xl font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>{stat.value}</p>
        </div>
      ))}
    </div>

    <div className={cn("rounded-2xl border overflow-hidden", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200")}>
      <div className="p-4 border-b border-slate-800 flex justify-between items-center">
        <h3 className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>Lịch sử thanh toán</h3>
        <button className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300">
          <Download size={16} /> Xuất hóa đơn
        </button>
      </div>
      <table className="w-full">
        <thead>
          <tr className={cn("text-xs uppercase", theme === 'dark' ? "bg-slate-800/50 text-slate-400" : "bg-slate-50 text-slate-500")}>
            <th className="text-left p-4">Mã đơn</th>
            <th className="text-left p-4">Ngày</th>
            <th className="text-left p-4">Gói</th>
            <th className="text-right p-4">Số tiền</th>
            <th className="text-center p-4">Trạng thái</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {paymentHistory.map(payment => (
            <tr key={payment.id} className="hover:bg-slate-800/20">
              <td className="p-4 font-mono text-sm">{payment.orderId}</td>
              <td className="p-4 text-slate-300">{formatDateOnlyVi(payment.date)}</td>
              <td className="p-4 font-medium">{payment.planName}</td>
              <td className="p-4 text-right font-mono font-bold">{payment.amount.toLocaleString()}đ</td>
              <td className="p-4 text-center">
                <span className={cn("px-3 py-1 rounded-full text-xs font-bold",
                  payment.status === 'completed' ? "bg-green-600/20 text-green-400" :
                  payment.status === 'pending' ? "bg-amber-600/20 text-amber-400" :
                  "bg-rose-600/20 text-rose-400")}>
                  {payment.status === 'completed' ? 'Thành công' : payment.status === 'pending' ? 'Đang xử lý' : 'Thất bại'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ==================== ANALYTICS SECTION ====================
const AnalyticsSection = ({ theme, plans, subscription }: {
  theme: Theme;
  plans: any[];
  subscription: Subscription | null;
}) => {
  const totalRevenue = plans.reduce((sum, plan) => sum + parsePrice(plan.price), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Tổng giá trị', value: totalRevenue.toLocaleString() + 'đ', icon: Package, color: 'blue' },
          { label: 'Giá TB', value: plans.length > 0 ? Math.round(totalRevenue / plans.length).toLocaleString() + 'đ' : '0đ', icon: TrendingUp, color: 'green' },
          { label: 'Phổ biến', value: plans.find(p => p.isPopular)?.name || 'N/A', icon: Star, color: 'amber', isText: true },
          { label: 'Enterprise', value: plans.some(p => p.isEnterprise) ? 'Có' : 'Không', icon: Crown, color: 'purple', isText: true },
        ].map((stat, i) => (
          <div key={i} className={cn(
            "p-6 rounded-2xl border",
            theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"
          )}>
            <div className={cn("p-3 rounded-xl w-fit mb-3",
              stat.color === 'blue' ? "bg-blue-600/20 text-blue-400" :
              stat.color === 'green' ? "bg-green-600/20 text-green-400" :
              stat.color === 'amber' ? "bg-amber-600/20 text-amber-400" :
              "bg-purple-600/20 text-purple-400")}>
              <stat.icon size={22} />
            </div>
            <p className={cn("text-2xl font-black mb-1", theme === 'dark' ? "text-white" : "text-slate-900")}>{stat.value}</p>
            <p className="text-sm text-slate-400">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className={cn("p-6 rounded-2xl border", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200")}>
        <h3 className={cn("text-lg font-bold mb-6", theme === 'dark' ? "text-white" : "text-slate-900")}>So sánh giá</h3>
        <div className="flex items-end justify-around h-48 gap-4">
          {plans.map((plan) => {
            const price = parsePrice(plan.price);
            const maxPrice = Math.max(...plans.map(p => parsePrice(p.price)), 1);
            const height = (price / maxPrice) * 100;
            return (
              <div key={plan.id} className="flex-1 flex flex-col items-center gap-2">
                <div className={cn(
                  "w-full rounded-t-xl flex items-end justify-center pb-2",
                  plan.isPopular ? "bg-gradient-to-t from-blue-600 to-blue-500" :
                  plan.isEnterprise ? "bg-gradient-to-t from-purple-600 to-purple-500" :
                  "bg-gradient-to-t from-slate-600 to-slate-500"
                )} style={{ height: `${Math.max(height, 10)}%` }}>
                  <span className="text-white font-bold text-sm">{parsePrice(plan.price).toLocaleString()}</span>
                </div>
                <p className={cn("text-sm font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>{plan.name}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className={cn("p-6 rounded-2xl border", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200")}>
        <h3 className={cn("text-lg font-bold mb-4", theme === 'dark' ? "text-white" : "text-slate-900")}>Bảng giá chi tiết</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={cn("text-xs uppercase", theme === 'dark' ? "bg-slate-800/50 text-slate-400" : "bg-slate-50 text-slate-500")}>
                <th className="text-left p-4">Gói</th>
                <th className="text-right p-4">Giá</th>
                <th className="text-right p-4">Servers</th>
                <th className="text-right p-4">Users</th>
                <th className="text-right p-4">Storage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {plans.map(plan => (
                <tr key={plan.id} className="hover:bg-slate-800/20">
                  <td className="p-4 font-bold flex items-center gap-2">
                    {plan.isPopular && <Star size={12} className="text-amber-400 fill-current" />}
                    {plan.name}
                  </td>
                  <td className="p-4 text-right font-mono">{parsePrice(plan.price).toLocaleString()}đ</td>
                  <td className="p-4 text-right">{plan.limits?.servers || '-'}</td>
                  <td className="p-4 text-right">{plan.limits?.users || '-'}</td>
                  <td className="p-4 text-right">{plan.limits?.storage || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
