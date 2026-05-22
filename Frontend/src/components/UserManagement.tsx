import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Search, Shield, Trash2, Edit2, Lock, Unlock, Key, Mail, AlertCircle, CheckCircle, CreditCard } from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';
import { UsersApi, type User } from '../services/api';
import { ChangeSubscriptionModal } from './ChangeSubscriptionModal';
import { formatDateOnlyVi } from '../utils/dateUtils';

interface UserManagementProps {
  theme: Theme;
  t: any;
  userRole?: string;
}

type ModalType = 'add' | 'edit' | 'password' | null;

export const UserManagement = ({ theme, userRole }: UserManagementProps) => {
  const currentRole = userRole;
  const isAdmin = currentRole === 'Admin';
  const isStaff = currentRole === 'Staff';
  const isSuperAdmin = currentRole === 'SuperAdmin';
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalType, setModalType] = useState<ModalType>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [changingSubscriptionUser, setChangingSubscriptionUser] = useState<User | null>(null);
  
  // Form states
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'User',
  });

  // Load users on mount
  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await UsersApi.getAll(1, 100);
      if (response.success && response.data) {
        setUsers(response.data.items);
      } else {
        showNotification('error', response.message || 'Không thể tải danh sách người dùng');
      }
    } catch (error) {
      showNotification('error', 'Lỗi khi tải danh sách người dùng');
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleAddUser = () => {
    setFormData({
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'User',
    });
    setModalType('add');
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setFormData({
      fullName: user.fullName,
      email: user.email,
      password: '',
      confirmPassword: '',
      role: user.role,
    });
    setModalType('edit');
  };

  const handleChangePassword = (user: User) => {
    setEditingUser(user);
    setFormData({
      ...formData,
      password: '',
      confirmPassword: '',
    });
    setModalType('password');
  };

  const handleSubmitAdd = async () => {
    if (!formData.fullName || !formData.email || !formData.password) {
      showNotification('error', 'Vui lòng điền đầy đủ thông tin!');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      showNotification('error', 'Mật khẩu xác nhận không khớp!');
      return;
    }

    if (formData.password.length < 6) {
      showNotification('error', 'Mật khẩu phải có ít nhất 6 ký tự!');
      return;
    }

    try {
      const response = await UsersApi.create({
        email: formData.email,
        password: formData.password,
        fullName: formData.fullName,
        role: formData.role,
      });

      if (response.success) {
        showNotification('success', 'Thêm người dùng thành công!');
        setModalType(null);
        loadUsers(); // Reload users list
      } else {
        showNotification('error', response.message || 'Thêm người dùng thất bại!');
      }
    } catch (error) {
      showNotification('error', 'Thêm người dùng thất bại!');
    }
  };

  const handleSubmitEdit = async () => {
    if (!formData.fullName || !formData.email || !editingUser) {
      showNotification('error', 'Vui lòng điền đầy đủ thông tin!');
      return;
    }

    try {
      const response = await UsersApi.update(editingUser.id, {
        fullName: formData.fullName,
        role: formData.role,
      });

      if (response.success) {
        showNotification('success', 'Cập nhật người dùng thành công!');
        setModalType(null);
        loadUsers(); // Reload users list
      } else {
        showNotification('error', response.message || 'Cập nhật người dùng thất bại!');
      }
    } catch (error) {
      showNotification('error', 'Cập nhật người dùng thất bại!');
    }
  };

  const handleSubmitPassword = async () => {
    if (!formData.password || !formData.confirmPassword || !editingUser) {
      showNotification('error', 'Vui lòng nhập mật khẩu!');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      showNotification('error', 'Mật khẩu xác nhận không khớp!');
      return;
    }

    if (formData.password.length < 6) {
      showNotification('error', 'Mật khẩu phải có ít nhất 6 ký tự!');
      return;
    }

    try {
      const response = await UsersApi.changePassword(editingUser.id, formData.password);

      if (response.success) {
        showNotification('success', 'Đổi mật khẩu thành công!');
        setModalType(null);
      } else {
        showNotification('error', response.message || 'Đổi mật khẩu thất bại!');
      }
    } catch (error) {
      showNotification('error', 'Đổi mật khẩu thất bại!');
    }
  };

  const handleToggleStatus = async (user: User) => {
    const newStatus = user.isActive !== false; // true=lock, false=unlock
    const action = newStatus ? 'khóa' : 'mở khóa';

    if (!confirm(`Bạn có chắc muốn ${action} tài khoản "${user.fullName}"?`)) return;

    try {
      const response = await UsersApi.toggleStatus(user.id, !newStatus);

      if (response.success) {
        showNotification('success', `${action.charAt(0).toUpperCase() + action.slice(1)} tài khoản thành công!`);
        loadUsers(); // Reload users list
      } else {
        showNotification('error', response.message || `${action.charAt(0).toUpperCase() + action.slice(1)} tài khoản thất bại!`);
      }
    } catch (error) {
      showNotification('error', `${action.charAt(0).toUpperCase() + action.slice(1)} tài khoản thất bại!`);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`Bạn có chắc muốn xóa người dùng "${user.fullName}"?\n\nHành động này không thể hoàn tác!`)) return;

    try {
      const response = await UsersApi.delete(user.id);

      if (response.success) {
        showNotification('success', 'Xóa người dùng thành công!');
        loadUsers(); // Reload users list
      } else {
        showNotification('error', response.message || 'Xóa người dùng thất bại!');
      }
    } catch (error) {
      showNotification('error', 'Xóa người dùng thất bại!');
    }
  };

  const filteredUsers = users.filter(user =>
    user.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Staff chỉ thấy User
  const displayedUsers = isStaff
    ? filteredUsers.filter(u => u.role === 'User')
    : filteredUsers;

  return (
    <div className="space-y-6">
      {/* Notification */}
      {notification && (
        <div className={cn(
          "fixed top-4 right-4 z-[200] px-6 py-4 rounded-lg shadow-2xl border flex items-center gap-3 animate-in slide-in-from-top-2",
          notification.type === 'success' 
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" 
            : "bg-rose-500/10 border-rose-500/30 text-rose-500"
        )}>
          {notification.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span className="font-medium">{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className={cn("text-2xl font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>
            <Users className="inline mr-2" size={28} />
            Quản lý người dùng
          </h2>
          <p className="text-slate-400 mt-1">Quản lý tài khoản và phân quyền người dùng hệ thống</p>
        </div>
        <button 
          onClick={handleAddUser}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow-lg hover:shadow-xl"
        >
          <UserPlus size={18} /> Thêm người dùng
        </button>
      </div>

      {/* Table */}
      <div className={cn("border rounded-xl overflow-hidden transition-colors", theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm")}>
        {/* Search */}
        <div className={cn("p-4 border-b flex items-center gap-4", theme === 'dark' ? "border-slate-800" : "border-slate-200")}>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input 
              type="text" 
              placeholder="Tìm kiếm theo tên, email, role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                "w-full border rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all",
                theme === 'dark' ? "bg-slate-950 border-slate-800 text-white placeholder:text-slate-600" : "bg-slate-50 border-slate-200 text-slate-900"
              )}
            />
          </div>
          <div className="text-sm text-slate-500">
            {displayedUsers.length} / {users.length} người dùng
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className={cn("text-[11px] uppercase tracking-wider font-semibold", theme === 'dark' ? "bg-slate-950/90 text-slate-400" : "bg-slate-50 text-slate-600")}>
                <th className="px-6 py-4">Người dùng</th>
                <th className="px-6 py-4">Vai trò</th>
                <th className="px-6 py-4">Gói</th>
                <th className="px-6 py-4">Trạng thái</th>
                <th className="px-6 py-4">Ngày tạo</th>
                <th className="px-6 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className={cn("divide-y", theme === 'dark' ? "divide-slate-800/50" : "divide-slate-100")}>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-3">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                      <p>Đang tải danh sách người dùng...</p>
                    </div>
                  </td>
                </tr>
              ) : displayedUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <Users size={48} className="mx-auto mb-4 opacity-50" />
                    <p>Không tìm thấy người dùng nào</p>
                  </td>
                </tr>
              ) : (
                displayedUsers.map((user) => (
                  <tr key={user.id} className={cn("transition-all duration-200 group", theme === 'dark' ? "hover:bg-slate-800/40" : "hover:bg-slate-50")}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm",
                          user.role === 'SuperAdmin' ? "bg-purple-600/20 text-purple-500" :
                          user.role === 'Admin' ? "bg-blue-600/20 text-blue-500" :
                          user.role === 'Staff' ? "bg-amber-600/20 text-amber-500" :
                          "bg-slate-600/20 text-slate-500"
                        )}>
                          {user.fullName?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <p className={cn("text-sm font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>{user.fullName}</p>
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <Mail size={10} />
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "text-[11px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5 w-fit",
                        user.role === 'SuperAdmin' ? "bg-purple-500/10 text-purple-400 border border-purple-500/30" :
                        user.role === 'Admin' ? "bg-blue-500/10 text-blue-400 border border-blue-500/30" :
                        user.role === 'Staff' ? "bg-amber-500/10 text-amber-400 border border-amber-500/30" :
                        "bg-slate-500/10 text-slate-400 border border-slate-500/30"
                      )}>
                        {user.role === 'SuperAdmin' && <Shield size={12} />}
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "text-[11px] font-bold px-2.5 py-1 rounded-md inline-block",
                        "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                      )}>
                        {user.tenantName || 'Free'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "text-[11px] font-bold px-2.5 py-1 rounded-md inline-block",
                        user.isActive !== false
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                      )}>
                        {user.isActive !== false ? 'Hoạt động' : 'Bị khóa'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {user.lastLoginAt ? formatDateOnlyVi(user.lastLoginAt) : 'Chưa đăng nhập'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {!isStaff && (
                        <button 
                          onClick={() => setChangingSubscriptionUser(user)}
                          className={cn(
                            "p-2 rounded-lg transition-all",
                            theme === 'dark' ? "hover:bg-slate-800 text-slate-400 hover:text-emerald-400" : "hover:bg-slate-100 text-slate-600 hover:text-emerald-600"
                          )}
                          title="Thay đổi gói"
                        >
                          <CreditCard size={16} />
                        </button>
                        )}
                        <button 
                          onClick={() => handleEditUser(user)}
                          className={cn(
                            "p-2 rounded-lg transition-all",
                            theme === 'dark' ? "hover:bg-slate-800 text-slate-400 hover:text-blue-400" : "hover:bg-slate-100 text-slate-600 hover:text-blue-600"
                          )}
                          title="Chỉnh sửa"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleChangePassword(user)}
                          className={cn(
                            "p-2 rounded-lg transition-all",
                            theme === 'dark' ? "hover:bg-slate-800 text-slate-400 hover:text-amber-400" : "hover:bg-slate-100 text-slate-600 hover:text-amber-600"
                          )}
                          title="Đổi mật khẩu"
                        >
                          <Key size={16} />
                        </button>
                        <button 
                          onClick={() => handleToggleStatus(user)}
                          className={cn(
                            "p-2 rounded-lg transition-all",
                            theme === 'dark' ? "hover:bg-slate-800 text-slate-400 hover:text-orange-400" : "hover:bg-slate-100 text-slate-600 hover:text-orange-600"
                          )}
                          title="Khóa tài khoản"
                        >
                          <Lock size={16} />
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(user)}
                          className={cn(
                            "p-2 rounded-lg transition-all",
                            theme === 'dark' ? "hover:bg-rose-500/10 text-slate-400 hover:text-rose-400" : "hover:bg-rose-50 text-slate-600 hover:text-rose-600"
                          )}
                          title="Xóa người dùng"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {modalType && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className={cn(
            "w-full max-w-md rounded-2xl border p-6 shadow-2xl animate-in zoom-in-95",
            theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
          )}>
            <h3 className={cn("text-xl font-bold mb-6 flex items-center gap-2", theme === 'dark' ? "text-white" : "text-slate-900")}>
              {modalType === 'add' && <><UserPlus size={24} /> Thêm người dùng mới</>}
              {modalType === 'edit' && <><Edit2 size={24} /> Chỉnh sửa người dùng</>}
              {modalType === 'password' && <><Key size={24} /> Đổi mật khẩu</>}
            </h3>

            <div className="space-y-4">
              {(modalType === 'add' || modalType === 'edit') && (
                <>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase mb-2 block">Họ và tên *</label>
                    <input 
                      type="text"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      placeholder="Nguyễn Văn A"
                      className={cn(
                        "w-full rounded-lg px-4 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all",
                        theme === 'dark' ? "bg-slate-950 border-slate-800 text-white placeholder:text-slate-600" : "bg-slate-50 border-slate-200 text-slate-900"
                      )}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase mb-2 block">Email *</label>
                    <input 
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="user@example.com"
                      className={cn(
                        "w-full rounded-lg px-4 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all",
                        theme === 'dark' ? "bg-slate-950 border-slate-800 text-white placeholder:text-slate-600" : "bg-slate-50 border-slate-200 text-slate-900"
                      )}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase mb-2 block">Vai trò *</label>
                    <select 
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                      className={cn(
                        "w-full rounded-lg px-4 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all",
                        theme === 'dark' ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                      )}
                    >
                      {currentRole === 'SuperAdmin' && (
                        <>
                          <option value="User">User - Người dùng thường</option>
                          <option value="Staff">Staff - Nhân viên</option>
                          <option value="Admin">Admin - Quản trị viên</option>
                          <option value="SuperAdmin">Super Admin - Quản trị tối cao</option>
                        </>
                      )}
                      {currentRole === 'Admin' && (
                        <>
                          <option value="User">User - Người dùng thường</option>
                          <option value="Staff">Staff - Nhân viên</option>
                        </>
                      )}
                      {currentRole === 'Staff' && (
                        <option value="User">User - Người dùng thường</option>
                      )}
                    </select>
                  </div>
                </>
              )}

              {(modalType === 'add' || modalType === 'password') && (
                <>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase mb-2 block">
                      {modalType === 'add' ? 'Mật khẩu *' : 'Mật khẩu mới *'}
                    </label>
                    <input 
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Tối thiểu 6 ký tự"
                      className={cn(
                        "w-full rounded-lg px-4 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all",
                        theme === 'dark' ? "bg-slate-950 border-slate-800 text-white placeholder:text-slate-600" : "bg-slate-50 border-slate-200 text-slate-900"
                      )}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase mb-2 block">Xác nhận mật khẩu *</label>
                    <input 
                      type="password"
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      placeholder="Nhập lại mật khẩu"
                      className={cn(
                        "w-full rounded-lg px-4 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all",
                        theme === 'dark' ? "bg-slate-950 border-slate-800 text-white placeholder:text-slate-600" : "bg-slate-50 border-slate-200 text-slate-900"
                      )}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setModalType(null)}
                className={cn(
                  "flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors",
                  theme === 'dark' ? "bg-slate-800 text-slate-400 hover:bg-slate-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                Hủy
              </button>
              <button 
                onClick={() => {
                  if (modalType === 'add') handleSubmitAdd();
                  else if (modalType === 'edit') handleSubmitEdit();
                  else if (modalType === 'password') handleSubmitPassword();
                }}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-lg hover:shadow-xl"
              >
                {modalType === 'add' ? 'Thêm người dùng' : modalType === 'edit' ? 'Lưu thay đổi' : 'Đổi mật khẩu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Subscription Modal */}
      {changingSubscriptionUser && (
        <ChangeSubscriptionModal
          theme={theme}
          user={{
            id: changingSubscriptionUser.id,
            fullName: changingSubscriptionUser.fullName,
            email: changingSubscriptionUser.email,
            tenantId: changingSubscriptionUser.tenantId,
          }}
          onClose={() => setChangingSubscriptionUser(null)}
          onSuccess={() => {
            loadUsers();
            setChangingSubscriptionUser(null);
          }}
        />
      )}
    </div>
  );
};
