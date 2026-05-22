import React, { useState, useEffect, useRef } from 'react';
import { User, Shield, Lock, Camera, Eye, EyeOff, Check, X, Smartphone } from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';
import { AuthApi } from '../services/api';
import { optimizeImage } from '../utils/imageUtils';

interface AccountProps {
  theme: Theme;
  t: any;
  show2FAModal: boolean;
  setShow2FAModal: (show: boolean) => void;
  is2FAEnabled: boolean;
  setIs2FAEnabled: (v: boolean) => void;
  user: any;
  onUserUpdate: (user: any) => void;
}

export const Account = ({ theme, t, show2FAModal, setShow2FAModal, is2FAEnabled, setIs2FAEnabled, user, onUserUpdate }: AccountProps) => {
  const [userInfo, setUserInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');
  const [securitySaving, setSecuritySaving] = useState(false);
  const [securityMessage, setSecurityMessage] = useState('');
  const [securityError, setSecurityError] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchUserInfo();
  }, []);

  // Sync avatar preview from user data
  useEffect(() => {
    if (userInfo?.avatarUrl) {
      setAvatarPreview(userInfo.avatarUrl);
    }
  }, [userInfo?.avatarUrl]);

  // Sau khi App gọi getMe (bật/tắt 2FA), user.twoFactorEnabled đổi → refetch để toggle khớp DB
  const prevTwoFactorRef = useRef(user?.twoFactorEnabled);
  useEffect(() => {
    if (user?.twoFactorEnabled === prevTwoFactorRef.current) return;
    prevTwoFactorRef.current = user?.twoFactorEnabled;
    void fetchUserInfo();
  }, [user?.twoFactorEnabled]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn file ảnh.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Ảnh phải nhỏ hơn 5MB.');
      return;
    }
    setAvatarUploading(true);
    try {
      const optimized = await optimizeImage(file, { maxWidth: 256, maxHeight: 256, maxSizeKB: 100 });
      const res = await AuthApi.uploadAvatar(optimized.dataUrl);
      if (res.success) {
        const updatedUser = { ...userInfo, avatarUrl: optimized.dataUrl };
        setUserInfo(updatedUser);
        setAvatarPreview(optimized.dataUrl);
        onUserUpdate?.(updatedUser);
      } else {
        alert(res.message || 'Upload avatar thất bại.');
      }
    } catch {
      alert('Lỗi khi upload avatar.');
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarUploading(true);
    try {
      const res = await AuthApi.uploadAvatar(null);
      if (res.success) {
        const updatedUser = { ...userInfo, avatarUrl: null };
        setUserInfo(updatedUser);
        setAvatarPreview(null);
        onUserUpdate?.(updatedUser);
      }
    } finally {
      setAvatarUploading(false);
    }
  };

  const fetchUserInfo = async () => {
    try {
      const response = await AuthApi.getMe();
      if (response.success) {
        setUserInfo(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch user info:', error);
    }
  };

  const handleSaveProfile = async () => {
    if (!userInfo?.id) return;
    
    setSaveLoading(true);
    setSaveSuccess('');
    
    try {
      const response = await AuthApi.updateProfile(userInfo.id, {
        fullName: userInfo.fullName
      });

      if (response.success) {
        setSaveSuccess('Lưu thông tin thành công!');
        setTimeout(() => setSaveSuccess(''), 3000);
      }
    } catch (error: any) {
      console.error('Failed to save profile:', error);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Mật khẩu mới không khớp!');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setPasswordError('Mật khẩu mới phải có ít nhất 6 ký tự!');
      return;
    }

    setLoading(true);
    try {
      const response = await AuthApi.changePassword(
        passwordForm.currentPassword,
        passwordForm.newPassword
      );

      if (response.success) {
        setPasswordSuccess('Đổi mật khẩu thành công!');
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setTimeout(() => {
          setShowChangePassword(false);
          setPasswordSuccess('');
        }, 2000);
      } else {
        setPasswordError(response.message || 'Đổi mật khẩu thất bại!');
      }
    } catch (error: any) {
      setPasswordError(error.response?.data?.message || 'Đổi mật khẩu thất bại!');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSecurity = async (
    field: 'twoFactorEnabled' | 'sessionTimeoutEnabled',
    value: boolean
  ) => {
    if (!userInfo) return;

    // 2FA: open setup modal instead of directly updating
    if (field === 'twoFactorEnabled') {
      setShow2FAModal(true);
      return;
    }

    // Session timeout: update directly
    const updatedUser = { ...userInfo, [field]: value };
    setUserInfo(updatedUser);
    setSecuritySaving(true);
    setSecurityMessage('');
    setSecurityError('');

    try {
      const response = await AuthApi.updateSecuritySettings({
        twoFactorEnabled: updatedUser.twoFactorEnabled ?? false,
        sessionTimeoutEnabled: updatedUser.sessionTimeoutEnabled ?? false,
        sessionTimeoutMinutes: updatedUser.sessionTimeoutMinutes ?? 30,
      });

      if (response.success && response.data) {
        setUserInfo(response.data);
        onUserUpdate?.(response.data);
        setSecurityMessage('Đã cập nhật cài đặt bảo mật.');
        setTimeout(() => setSecurityMessage(''), 2500);
      } else {
        setUserInfo(userInfo);
        setSecurityError(response.message || 'Cập nhật cài đặt bảo mật thất bại.');
      }
    } catch (error: any) {
      setUserInfo(userInfo);
      setSecurityError(error?.message || 'Cập nhật cài đặt bảo mật thất bại.');
    } finally {
      setSecuritySaving(false);
    }
  };

  const passwordStrength = (password: string) => {
    if (!password) return { strength: 0, label: '', color: '' };
    let strength = 0;
    if (password.length >= 6) strength++;
    if (password.length >= 10) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;

    if (strength <= 2) return { strength, label: 'Yếu', color: 'bg-red-500' };
    if (strength <= 3) return { strength, label: 'Trung bình', color: 'bg-yellow-500' };
    return { strength, label: 'Mạnh', color: 'bg-green-500' };
  };

  const strength = passwordStrength(passwordForm.newPassword);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row gap-8">
        {/* Profile Card */}
        <div className={cn(
          "w-full md:w-80 border rounded-2xl p-6 transition-colors",
          theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"
        )}>
          <div className="flex flex-col items-center text-center">
            <div className="relative group">
              {/* Avatar circle */}
              <div className={cn(
                "w-32 h-32 rounded-full flex items-center justify-center border-4 overflow-hidden",
                theme === 'dark' ? "bg-slate-800 border-slate-700" : "bg-slate-100 border-white shadow-lg"
              )}>
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User size={64} className="text-slate-400" />
                )}
                {avatarUploading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-full">
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              {/* Camera button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute bottom-0 right-0 bg-blue-600 p-2 rounded-full text-white shadow-lg hover:bg-blue-500 transition-colors disabled:opacity-50"
                title="Đổi avatar"
              >
                <Camera size={16} />
              </button>
              {/* Remove button */}
              {avatarPreview && !avatarUploading && (
                <button
                  onClick={handleRemoveAvatar}
                  className="absolute -top-1 -left-1 bg-rose-600 p-1.5 rounded-full text-white shadow-lg hover:bg-rose-500 transition-colors"
                  title="Xóa avatar"
                >
                  <X size={12} />
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            <p className="text-xs text-slate-500 mt-2">JPG/PNG/WebP, tối đa 5MB</p>
            <h3 className={cn("mt-4 text-xl font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>{userInfo?.fullName || 'Loading...'}</h3>
            <p className="text-slate-500 text-sm">{userInfo?.email || ''}</p>
            
            <div className="mt-6 w-full space-y-2">
              <div className={cn("flex items-center justify-between p-3 rounded-xl", theme === 'dark' ? "bg-slate-800/50" : "bg-slate-50")}>
                <span className="text-xs text-slate-500">Status</span>
                <span className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  Active
                </span>
              </div>
              <div className={cn("flex items-center justify-between p-3 rounded-xl", theme === 'dark' ? "bg-slate-800/50" : "bg-slate-50")}>
                <span className="text-xs text-slate-500">Role</span>
                <span className={cn("text-xs font-bold", theme === 'dark' ? "text-blue-400" : "text-blue-600")}>{userInfo?.role || 'User'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Account Details */}
        <div className="flex-1 space-y-6">
          <div className={cn(
            "border rounded-2xl p-6 transition-colors",
            theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"
          )}>
            <h4 className={cn("text-lg font-bold mb-6", theme === 'dark' ? "text-white" : "text-slate-900")}>Personal Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Full Name</label>
                <input 
                  type="text" 
                  value={userInfo?.fullName || ''}
                  onChange={(e) => setUserInfo({...userInfo, fullName: e.target.value})}
                  className={cn(
                    "w-full px-4 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all",
                    theme === 'dark' ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                  )}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Email Address</label>
                <input 
                  type="email" 
                  value={userInfo?.email || ''}
                  disabled
                  className={cn(
                    "w-full px-4 py-2 rounded-lg border focus:outline-none transition-all opacity-60 cursor-not-allowed",
                    theme === 'dark' ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                  )}
                />
              </div>
            </div>
            {saveSuccess && (
              <div className="mt-4 bg-green-500/10 border border-green-500/50 rounded-lg p-3 flex items-center gap-2">
                <Check className="text-green-500" size={16} />
                <p className="text-sm text-green-500">{saveSuccess}</p>
              </div>
            )}
            <div className="mt-8 flex justify-end gap-3">
              <button 
                onClick={() => setShowChangePassword(!showChangePassword)}
                className={cn(
                  "px-6 py-2 rounded-lg font-bold transition-colors flex items-center gap-2",
                  theme === 'dark' ? "bg-slate-800 hover:bg-slate-700 text-white" : "bg-slate-200 hover:bg-slate-300 text-slate-900"
                )}
              >
                <Lock size={16} />
                Đổi mật khẩu
              </button>
              <button 
                onClick={handleSaveProfile}
                disabled={saveLoading}
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saveLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Đang lưu...
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Lưu thay đổi
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Change Password Section */}
          {showChangePassword && (
            <div className={cn(
              "border rounded-2xl p-6 transition-all animate-in slide-in-from-top-4 duration-300",
              theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"
            )}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Lock className="text-blue-500" size={20} />
                  <h4 className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>Đổi mật khẩu</h4>
                </div>
                <button 
                  onClick={() => setShowChangePassword(false)}
                  className="text-slate-500 hover:text-slate-700 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-4">
                {/* Current Password */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Mật khẩu hiện tại</label>
                  <div className="relative">
                    <input 
                      type={showCurrentPassword ? "text" : "password"}
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({...passwordForm, currentPassword: e.target.value})}
                      required
                      className={cn(
                        "w-full px-4 py-2 pr-10 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all",
                        theme === 'dark' ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                      )}
                      placeholder="Nhập mật khẩu hiện tại"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                    >
                      {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* New Password */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Mật khẩu mới</label>
                  <div className="relative">
                    <input 
                      type={showNewPassword ? "text" : "password"}
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                      required
                      minLength={6}
                      className={cn(
                        "w-full px-4 py-2 pr-10 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all",
                        theme === 'dark' ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                      )}
                      placeholder="Nhập mật khẩu mới (tối thiểu 6 ký tự)"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                    >
                      {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  
                  {/* Password Strength Indicator */}
                  {passwordForm.newPassword && (
                    <div className="space-y-1">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div
                            key={level}
                            className={cn(
                              "h-1 flex-1 rounded-full transition-all",
                              level <= strength.strength ? strength.color : theme === 'dark' ? 'bg-slate-700' : 'bg-slate-200'
                            )}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-slate-500">Độ mạnh: <span className={cn("font-bold", strength.strength <= 2 ? 'text-red-500' : strength.strength <= 3 ? 'text-yellow-500' : 'text-green-500')}>{strength.label}</span></p>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Xác nhận mật khẩu mới</label>
                  <div className="relative">
                    <input 
                      type={showConfirmPassword ? "text" : "password"}
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                      required
                      className={cn(
                        "w-full px-4 py-2 pr-10 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all",
                        theme === 'dark' ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900",
                        passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword && "border-red-500"
                      )}
                      placeholder="Nhập lại mật khẩu mới"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <X size={12} />
                      Mật khẩu không khớp
                    </p>
                  )}
                  {passwordForm.confirmPassword && passwordForm.newPassword === passwordForm.confirmPassword && (
                    <p className="text-xs text-green-500 flex items-center gap-1">
                      <Check size={12} />
                      Mật khẩu khớp
                    </p>
                  )}
                </div>

                {/* Error/Success Messages */}
                {passwordError && (
                  <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-center gap-2">
                    <X className="text-red-500" size={16} />
                    <p className="text-sm text-red-500">{passwordError}</p>
                  </div>
                )}
                
                {passwordSuccess && (
                  <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-3 flex items-center gap-2">
                    <Check className="text-green-500" size={16} />
                    <p className="text-sm text-green-500">{passwordSuccess}</p>
                  </div>
                )}

                {/* Submit Button */}
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowChangePassword(false);
                      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                      setPasswordError('');
                      setPasswordSuccess('');
                    }}
                    className={cn(
                      "px-6 py-2 rounded-lg font-bold transition-colors",
                      theme === 'dark' ? "bg-slate-800 hover:bg-slate-700 text-white" : "bg-slate-200 hover:bg-slate-300 text-slate-900"
                    )}
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={loading || passwordForm.newPassword !== passwordForm.confirmPassword}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Đang xử lý...
                      </>
                    ) : (
                      <>
                        <Check size={16} />
                        Đổi mật khẩu
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Security & Preferences */}
          <div className={cn(
            "border rounded-2xl p-6 transition-colors",
            theme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"
          )}>
            <div className="flex items-center gap-3 mb-6">
              <Shield className="text-blue-500" size={20} />
              <h4 className={cn("font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>Security</h4>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className={cn("text-sm font-medium", theme === 'dark' ? "text-slate-200" : "text-slate-700")}>Two-Factor Auth</p>
                  <p className="text-xs text-slate-500">Secure your account with 2FA</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleToggleSecurity('twoFactorEnabled', !(userInfo?.twoFactorEnabled ?? false))}
                  disabled={securitySaving}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-60",
                    (!!userInfo?.twoFactorEnabled || is2FAEnabled)
                      ? "bg-blue-600"
                      : (theme === 'dark' ? "bg-slate-700" : "bg-slate-200")
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      (!!userInfo?.twoFactorEnabled || is2FAEnabled) ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className={cn("text-sm font-medium", theme === 'dark' ? "text-slate-200" : "text-slate-700")}>Session Timeout</p>
                  <p className="text-xs text-slate-500">Auto logout after 30 mins</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleToggleSecurity('sessionTimeoutEnabled', !(userInfo?.sessionTimeoutEnabled ?? false))}
                  disabled={securitySaving}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-60",
                    userInfo?.sessionTimeoutEnabled ?? false
                      ? "bg-blue-600"
                      : (theme === 'dark' ? "bg-slate-700" : "bg-slate-200")
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      userInfo?.sessionTimeoutEnabled ?? false ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
              {(securityMessage || securityError) && (
                <div className={cn(
                  "rounded-lg border px-3 py-2 text-sm",
                  securityError
                    ? "border-red-500/30 bg-red-500/10 text-red-400"
                    : "border-green-500/30 bg-green-500/10 text-green-400"
                )}>
                  {securityError || securityMessage}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
