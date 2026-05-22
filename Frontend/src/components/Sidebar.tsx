import React from 'react';
import {
  Shield,
  ShieldCheck,
  LayoutDashboard,
  Server,
  ShieldAlert,
  Bot,
  FileText,
  CreditCard,
  Receipt,
  Settings,
  LogOut,
  XCircle,
  User,
  Users,
  Book,
  Terminal,
  Bell,
  Ticket,
  MessageSquare,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';

interface SidebarItemProps {
  icon: any;
  label: string;
  active?: boolean;
  onClick: () => void;
  theme: Theme;
  isOpen: boolean;
}

const SidebarItem = ({ icon: Icon, label, active, onClick, theme, isOpen }: SidebarItemProps) => (
  <button 
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group relative",
      active 
        ? (theme === 'dark' ? "bg-blue-600/20 text-blue-400 border-l-4 border-blue-500" : "bg-blue-50 text-blue-600 border-l-4 border-blue-600")
        : (theme === 'dark' ? "text-slate-400 hover:bg-slate-800 hover:text-slate-200" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"),
      !isOpen && "justify-center px-0 border-l-0"
    )}
  >
    <Icon size={20} className={cn("transition-transform group-hover:scale-110 shrink-0", active ? (theme === 'dark' ? "text-blue-400" : "text-blue-600") : "text-slate-500")} />
    {isOpen && <span className="font-medium whitespace-nowrap overflow-hidden">{label}</span>}
    {!isOpen && active && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 rounded-r-full" />}
  </button>
);

interface SidebarProps {
  theme: Theme;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (val: boolean) => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (val: boolean) => void;
  activeTab: string;
  setActiveTab: (val: string) => void;
  t: any;
  handleLogout: () => void;
  user: any;
}

export const Sidebar = ({ 
  theme, 
  isSidebarOpen, 
  setIsSidebarOpen,
  isMobileMenuOpen, 
  setIsMobileMenuOpen, 
  activeTab, 
  setActiveTab, 
  t, 
  handleLogout,
  user
}: SidebarProps) => {
  const userRole = user?.role || 'User';
  /** Backend trả SuperAdmin (PascalCase); tránh so sánh sai chữ hoa khiến menu quản trị biến mất */
  const isSuperAdmin =
    typeof userRole === 'string' && userRole.toLowerCase() === 'superadmin';
  const isStaff =
    typeof userRole === 'string' && userRole.toLowerCase() === 'staff';
  return (
    <aside className={cn(
      "transition-all duration-300 fixed inset-y-0 left-0 z-50 h-dvh overflow-y-auto overflow-x-hidden border-r lg:sticky lg:top-0 lg:h-dvh",
      theme === 'dark' ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200",
      isSidebarOpen ? "w-64" : "w-20",
      isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
    )}>
      <div className="flex min-h-full flex-col">
        <div className="shrink-0 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Shield className="text-white" size={24} />
            </div>
            {(isSidebarOpen || isMobileMenuOpen) && (
              <span className={cn("text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r", theme === 'dark' ? "from-white to-slate-400" : "from-slate-900 to-slate-600")}>
                VeriChainIDS
              </span>
            )}
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden text-slate-400">
            <XCircle size={20} />
          </button>
        </div>

        <nav className="flex-1 px-3 pb-4 space-y-1 mt-4">
          <SidebarItem icon={LayoutDashboard} label={t.dashboard} active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }} theme={theme} isOpen={isSidebarOpen || isMobileMenuOpen} />
          <SidebarItem icon={Server} label={t.agents} active={activeTab === 'agents'} onClick={() => { setActiveTab('agents'); setIsMobileMenuOpen(false); }} theme={theme} isOpen={isSidebarOpen || isMobileMenuOpen} />
          <SidebarItem icon={ShieldAlert} label={t.incidents} active={activeTab === 'incidents'} onClick={() => { setActiveTab('incidents'); setIsMobileMenuOpen(false); }} theme={theme} isOpen={isSidebarOpen || isMobileMenuOpen} />
          <SidebarItem icon={Bot} label={t.ai} active={activeTab === 'ai'} onClick={() => { setActiveTab('ai'); setIsMobileMenuOpen(false); }} theme={theme} isOpen={isSidebarOpen || isMobileMenuOpen} />
          <SidebarItem icon={Shield} label="Defense" active={activeTab === 'defense'} onClick={() => { setActiveTab('defense'); setIsMobileMenuOpen(false); }} theme={theme} isOpen={isSidebarOpen || isMobileMenuOpen} />
          <SidebarItem icon={ShieldCheck} label="Whitelist" active={activeTab === 'whitelist'} onClick={() => { setActiveTab('whitelist'); setIsMobileMenuOpen(false); }} theme={theme} isOpen={isSidebarOpen || isMobileMenuOpen} />
          <SidebarItem icon={FileText} label={t.reports} active={activeTab === 'reports'} onClick={() => { setActiveTab('reports'); setIsMobileMenuOpen(false); }} theme={theme} isOpen={isSidebarOpen || isMobileMenuOpen} />
          {!isStaff && (
            <>
              <SidebarItem icon={CreditCard} label={t.billing} active={activeTab === 'billing'} onClick={() => { setActiveTab('billing'); setIsMobileMenuOpen(false); }} theme={theme} isOpen={isSidebarOpen || isMobileMenuOpen} />
              <SidebarItem icon={Receipt} label={t.mySubscription} active={activeTab === 'my-subscription'} onClick={() => { setActiveTab('my-subscription'); setIsMobileMenuOpen(false); }} theme={theme} isOpen={isSidebarOpen || isMobileMenuOpen} />
            </>
          )}
          <SidebarItem icon={Book} label={t.apiGuide} active={activeTab === 'apiGuide'} onClick={() => { setActiveTab('apiGuide'); setIsMobileMenuOpen(false); }} theme={theme} isOpen={isSidebarOpen || isMobileMenuOpen} />
          {(isSuperAdmin || userRole === 'Admin' || isStaff) && (
            <SidebarItem icon={Ticket} label={t.tickets || 'Tickets'} active={activeTab === 'tickets'} onClick={() => { setActiveTab('tickets'); setIsMobileMenuOpen(false); }} theme={theme} isOpen={isSidebarOpen || isMobileMenuOpen} />
          )}
          <SidebarItem icon={Bell} label={t.notifications || 'Notifications'} active={activeTab === 'notifications'} onClick={() => { setActiveTab('notifications'); setIsMobileMenuOpen(false); }} theme={theme} isOpen={isSidebarOpen || isMobileMenuOpen} />
          <SidebarItem icon={MessageSquare} label={t.contact || 'Liên hệ'} active={activeTab === 'contact'} onClick={() => { setActiveTab('contact'); setIsMobileMenuOpen(false); }} theme={theme} isOpen={isSidebarOpen || isMobileMenuOpen} />
          
          {(isSuperAdmin || userRole === 'Admin') && (
            <div className="pt-4 mt-4 space-y-1 border-t border-slate-800/50">
              <p className={cn("px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest", !isSidebarOpen && !isMobileMenuOpen && "hidden")}>Management</p>
              {isSuperAdmin && (
                <>
                  <SidebarItem icon={Users} label={t.userManagement} active={activeTab === 'userManagement'} onClick={() => { setActiveTab('userManagement'); setIsMobileMenuOpen(false); }} theme={theme} isOpen={isSidebarOpen || isMobileMenuOpen} />
                  <SidebarItem icon={CreditCard} label={t.pricingManagement} active={activeTab === 'pricingManagement'} onClick={() => { setActiveTab('pricingManagement'); setIsMobileMenuOpen(false); }} theme={theme} isOpen={isSidebarOpen || isMobileMenuOpen} />
                  <SidebarItem icon={Terminal} label={t.apiManagement} active={activeTab === 'apiManagement'} onClick={() => { setActiveTab('apiManagement'); setIsMobileMenuOpen(false); }} theme={theme} isOpen={isSidebarOpen || isMobileMenuOpen} />
                  <SidebarItem icon={FileText} label={t.systemLogs} active={activeTab === 'systemLogs'} onClick={() => { setActiveTab('systemLogs'); setIsMobileMenuOpen(false); }} theme={theme} isOpen={isSidebarOpen || isMobileMenuOpen} />
                  <SidebarItem icon={Server} label={t.serverSettings || 'Server Settings'} active={activeTab === 'serverSettings'} onClick={() => { setActiveTab('serverSettings'); setIsMobileMenuOpen(false); }} theme={theme} isOpen={isSidebarOpen || isMobileMenuOpen} />
                </>
              )}
              {userRole === 'Admin' && (
                <>
                  <SidebarItem icon={Users} label={t.userManagement} active={activeTab === 'userManagement'} onClick={() => { setActiveTab('userManagement'); setIsMobileMenuOpen(false); }} theme={theme} isOpen={isSidebarOpen || isMobileMenuOpen} />
                  <SidebarItem icon={FileText} label={t.systemLogs} active={activeTab === 'systemLogs'} onClick={() => { setActiveTab('systemLogs'); setIsMobileMenuOpen(false); }} theme={theme} isOpen={isSidebarOpen || isMobileMenuOpen} />
                </>
              )}
            </div>
          )}
        </nav>

        <div className={cn("mt-auto p-4 border-t", theme === 'dark' ? "border-slate-800" : "border-slate-200")}>
          <SidebarItem icon={Settings} label={t.settings} active={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); setIsMobileMenuOpen(false); }} theme={theme} isOpen={isSidebarOpen || isMobileMenuOpen} />
          <button 
            onClick={handleLogout}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all mt-2 group",
              theme === 'dark' ? "text-rose-400 hover:bg-rose-500/10" : "text-rose-600 hover:bg-rose-50",
              !(isSidebarOpen || isMobileMenuOpen) && "justify-center px-0"
            )}
          >
            <LogOut size={20} className="group-hover:scale-110 shrink-0" />
            {(isSidebarOpen || isMobileMenuOpen) && <span className="font-medium whitespace-nowrap overflow-hidden">{t.logout}</span>}
          </button>
          <button 
            onClick={() => { setActiveTab('account'); setIsMobileMenuOpen(false); }}
            className={cn(
              "mt-4 flex items-center gap-3 px-2 py-2 rounded-lg transition-all hover:bg-slate-800/50 group",
              activeTab === 'account' && (theme === 'dark' ? "bg-blue-600/20" : "bg-blue-50")
            )}
          >
            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center border shrink-0", theme === 'dark' ? "bg-slate-800 border-slate-700" : "bg-slate-100 border-slate-200")}>
              <User size={16} className={cn(activeTab === 'account' ? "text-blue-400" : "text-slate-400")} />
            </div>
            {(isSidebarOpen || isMobileMenuOpen) && (
              <div className="overflow-hidden text-left">
                <p className={cn("text-sm font-medium truncate", theme === 'dark' ? "text-white" : "text-slate-900")}>{user?.fullName || 'VeriChainIDS User'}</p>
                <p className="text-xs text-slate-500 truncate">
                  {isSuperAdmin
                    ? 'Super Admin'
                    : isStaff
                      ? 'Nhân viên'
                      : user?.tenantName || user?.tenantId
                      ? [user?.tenantName || 'Workspace', user?.tenantId ? `${String(user.tenantId).slice(0, 8)}…` : null]
                          .filter(Boolean)
                          .join(' · ')
                      : 'Khách hàng'}
                </p>
              </div>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
};
