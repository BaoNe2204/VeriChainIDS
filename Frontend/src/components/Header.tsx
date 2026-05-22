import React from 'react';
import { Menu, Search, Bell, Globe, Zap, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Theme, Notification, Language } from '../types';
import { NotificationsApi } from '../services/api';
import { formatDateTimeShortVi } from '../utils/dateUtils';

interface HeaderProps {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  showNotifications: boolean;
  setShowNotifications: (show: boolean) => void;
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  unreadCount: number;
  setUnreadCount: React.Dispatch<React.SetStateAction<number>>;
  setIsMobileMenuOpen: (show: boolean) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (show: boolean) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  searchPlaceholder: string;
  t: any;
}

export const Header = ({
  theme,
  setTheme,
  language,
  setLanguage,
  showNotifications,
  setShowNotifications,
  notifications,
  setNotifications,
  unreadCount,
  setUnreadCount,
  setIsMobileMenuOpen,
  isSidebarOpen,
  setIsSidebarOpen,
  activeTab,
  setActiveTab,
  searchPlaceholder,
  t
}: HeaderProps) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);

  const searchResults = searchQuery.length > 0 ? [
    { id: 1, title: 'Dashboard', tab: 'dashboard' },
    { id: 2, title: 'Agents', tab: 'agents' },
    { id: 3, title: 'Incidents', tab: 'incidents' },
    { id: 4, title: 'AI Engine', tab: 'ai' },
    { id: 5, title: 'Reports', tab: 'reports' },
    { id: 6, title: 'Settings', tab: 'settings' },
    { id: 7, title: 'Account', tab: 'account' },
  ].filter(item => item.title.toLowerCase().includes(searchQuery.toLowerCase())) : [];

  return (
    <header className={cn(
      "sticky top-0 z-30 backdrop-blur-md border-b px-4 lg:px-8 py-4 flex justify-between items-center transition-colors duration-300",
      theme === 'dark' ? "bg-[#020617]/80 border-slate-800" : "bg-white/80 border-slate-200"
    )}>
      <div className="flex items-center gap-4">
        <button 
          onClick={() => setIsMobileMenuOpen(true)}
          className={cn("p-2 rounded-lg lg:hidden transition-colors", theme === 'dark' ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-500")}
        >
          <Menu size={20} />
        </button>
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={cn("p-2 rounded-lg hidden lg:block transition-colors", theme === 'dark' ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-500")}
        >
          <Menu size={20} />
        </button>
        <h2 className={cn("text-lg font-semibold capitalize", theme === 'dark' ? "text-white" : "text-slate-900")}>{t[activeTab] || activeTab}</h2>
      </div>
      <div className="flex items-center gap-2 lg:gap-4">
        <div className="relative hidden xl:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input 
            type="text" 
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              setIsSearchFocused(true);
              setShowNotifications(false);
            }}
            onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
            className={cn(
              "border rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 w-64 transition-all",
              theme === 'dark' ? "bg-slate-900 border-slate-800 text-white" : "bg-slate-100 border-slate-200 text-slate-900"
            )}
          />
          
          <AnimatePresence>
            {isSearchFocused && searchResults.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className={cn(
                  "absolute top-full left-0 right-0 mt-2 rounded-xl border shadow-2xl z-[60] overflow-hidden",
                  theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                )}
              >
                <div className="p-2">
                  {searchResults.map(result => (
                    <button
                      key={result.id}
                      onClick={() => {
                        setActiveTab(result.tab);
                        setSearchQuery('');
                        setIsSearchFocused(false);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                        theme === 'dark' ? "hover:bg-slate-800 text-slate-300" : "hover:bg-slate-100 text-slate-600"
                      )}
                    >
                      {result.title}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className={cn("p-2 rounded-lg relative transition-colors", theme === 'dark' ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-200 text-slate-600")}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className={cn(
                "absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white rounded-full px-1",
                unreadCount > 99 ? "bg-rose-600" : "bg-rose-500"
              )}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {showNotifications && (
              <>
                <div
                  className="fixed inset-0 z-[55] lg:hidden"
                  onClick={() => setShowNotifications(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className={cn(
                    "fixed lg:absolute top-20 lg:top-full right-4 lg:right-0 mt-2 w-[calc(100vw-2rem)] lg:w-[22rem] max-h-[80vh] rounded-xl border shadow-2xl z-[60] overflow-hidden flex flex-col transition-colors",
                    theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                  )}
                >
                  {/* Header */}
                  <div className={cn("p-4 border-b flex justify-between items-center shrink-0", theme === 'dark' ? "border-slate-800" : "border-slate-100")}>
                    <div className="flex items-center gap-2">
                      <Bell size={16} className="text-blue-400" />
                      <h4 className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
                        {t.notifications || 'Notifications'}
                      </h4>
                      {unreadCount > 0 && (
                        <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {notifications.length > 0 && (
                        <button
                          onClick={async () => {
                            try {
                              await NotificationsApi.markAllAsRead();
                              setNotifications(n => n.map(i => ({ ...i, isRead: true })));
                              setUnreadCount(0);
                            } catch (e) { console.error('Mark all read failed:', e); }
                          }}
                          className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Notification list */}
                  <div className="flex-1 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className={cn("p-8 text-center", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>
                        <Bell size={32} className="mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No notifications yet</p>
                      </div>
                    ) : (
                      notifications.slice(0, 20).map(n => (
                        <div
                          key={n.id}
                          onClick={async () => {
                            if (!n.isRead) {
                              try {
                                await NotificationsApi.markAsRead(n.id);
                                setNotifications(prev => prev.map(i => i.id === n.id ? { ...i, isRead: true } : i));
                                setUnreadCount(prev => Math.max(0, prev - 1));
                              } catch {}
                            }
                            if (n.link) {
                              const tab = n.link.split('/')[2] || 'dashboard';
                              setActiveTab(tab);
                            }
                            setShowNotifications(false);
                          }}
                          className={cn(
                            "p-4 border-b cursor-pointer transition-colors group",
                            theme === 'dark' ? "border-slate-800/50 hover:bg-slate-800/30" : "border-slate-100 hover:bg-slate-50",
                            !n.isRead && (theme === 'dark' ? "bg-blue-500/5" : "bg-blue-50/50")
                          )}
                        >
                          {/* Type icon */}
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              "shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm",
                              n.type === 'Alert' ? "bg-rose-500/20 text-rose-400" :
                              n.type === 'Warning' ? "bg-amber-500/20 text-amber-400" :
                              n.type === 'Ticket' ? "bg-purple-500/20 text-purple-400" :
                              "bg-blue-500/20 text-blue-400"
                            )}>
                              {n.type === 'Alert' ? '🚨' :
                               n.type === 'Warning' ? '⚠️' :
                               n.type === 'Ticket' ? '🎫' : '📢'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className={cn(
                                  "text-sm font-semibold truncate",
                                  !n.isRead ? (theme === 'dark' ? "text-white" : "text-slate-900") : (theme === 'dark' ? "text-slate-400" : "text-slate-500")
                                )}>
                                  {n.title}
                                </p>
                                {!n.isRead && (
                                  <span className="shrink-0 w-2 h-2 bg-blue-500 rounded-full"></span>
                                )}
                              </div>
                              <p className={cn(
                                "text-xs mt-1 line-clamp-2",
                                theme === 'dark' ? "text-slate-400" : "text-slate-500"
                              )}>
                                {n.message}
                              </p>
                              <p className={cn(
                                "text-[10px] mt-1.5",
                                theme === 'dark' ? "text-slate-600" : "text-slate-400"
                              )}>
                                {formatDateTimeShortVi(n.createdAt)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Footer */}
                  {notifications.length > 0 && (
                    <div className={cn("p-3 border-t text-center shrink-0", theme === 'dark' ? "border-slate-800" : "border-slate-100")}>
                      <button
                        onClick={async () => {
                          try {
                            await NotificationsApi.clearRead();
                            setNotifications(prev => prev.filter(n => !n.isRead));
                          } catch {}
                        }}
                        className="text-[11px] text-slate-500 hover:text-slate-400 transition-colors"
                      >
                        Clear read notifications
                      </button>
                    </div>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
        <div className={cn("h-8 w-px mx-1 lg:mx-2", theme === 'dark' ? "bg-slate-800" : "bg-slate-200")}></div>
        <div className="flex items-center gap-2">
          <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-colors", theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-slate-100 border-slate-200")}>
            <Globe size={14} className="text-blue-500" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Global SOC</span>
          </div>
          <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-colors", theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-slate-100 border-slate-200")}>
            <Zap size={14} className="text-amber-500" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">AI Active</span>
          </div>
        </div>
      </div>
    </header>
  );
};
