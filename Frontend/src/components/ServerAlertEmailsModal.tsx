import { useState, useEffect } from 'react';
import { ServersApi, type ServerAlertEmail } from '../services/api';

interface Props {
  serverId: string;
  serverName: string;
  onClose: () => void;
}

export default function ServerAlertEmailsModal({ serverId, serverName, onClose }: Props) {
  const [emails, setEmails] = useState<ServerAlertEmail[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadEmails();
  }, [serverId]);

  const loadEmails = async () => {
    try {
      const response = await ServersApi.getAlertEmails(serverId);
      if (response.success && response.data) {
        setEmails(response.data);
      }
    } catch (err) {
      console.error('Failed to load alert emails:', err);
    }
  };

  const handleAdd = async () => {
    if (!newEmail.trim()) {
      setError('Vui lòng nhập email');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      setError('Email không hợp lệ');
      return;
    }

    if (emails.length >= 5) {
      setError('Mỗi server chỉ được thêm tối đa 5 email');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await ServersApi.addAlertEmail(serverId, newEmail);
      if (response.success && response.data) {
        setEmails([...emails, response.data]);
        setNewEmail('');
      } else {
        setError(response.message || 'Thêm email thất bại');
      }
    } catch (err: any) {
      setError(err.message || 'Thêm email thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (emailId: string) => {
    if (!confirm('Bạn có chắc muốn xóa email này?')) return;

    try {
      const response = await ServersApi.deleteAlertEmail(serverId, emailId);
      if (response.success) {
        setEmails(emails.filter(e => e.id !== emailId));
      }
    } catch (err) {
      console.error('Failed to delete email:', err);
    }
  };

  const handleToggle = async (emailId: string) => {
    try {
      const response = await ServersApi.toggleAlertEmail(serverId, emailId);
      if (response.success && response.data) {
        setEmails(emails.map(e => e.id === emailId ? response.data! : e));
      }
    } catch (err) {
      console.error('Failed to toggle email:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl border border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-xl font-bold text-white">📧 Email Nhận Thông Báo</h2>
            <p className="text-sm text-slate-400 mt-1">Server: {serverName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Add Email Form */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-300">
              Thêm Email Mới ({emails.length}/5)
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="example@gmail.com"
                className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading || emails.length >= 5}
              />
              <button
                onClick={handleAdd}
                disabled={loading || emails.length >= 5}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                {loading ? 'Đang thêm...' : 'Thêm'}
              </button>
            </div>
            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}
            <p className="text-xs text-slate-500">
              Các email này sẽ nhận thông báo khi server bị tấn công (Critical/High alerts)
            </p>
          </div>

          {/* Email List */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">
              Danh Sách Email
            </label>
            {emails.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <p>Chưa có email nào</p>
              </div>
            ) : (
              <div className="space-y-2">
                {emails.map((email) => (
                  <div
                    key={email.id}
                    className="flex items-center justify-between p-3 bg-slate-900 rounded-lg border border-slate-700"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`w-2 h-2 rounded-full ${email.isActive ? 'bg-green-500' : 'bg-slate-600'}`} />
                      <span className={`font-mono text-sm ${email.isActive ? 'text-white' : 'text-slate-500'}`}>
                        {email.email}
                      </span>
                      {!email.isActive && (
                        <span className="text-xs text-slate-500">(Đã tắt)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggle(email.id)}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                          email.isActive
                            ? 'bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30'
                            : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                        }`}
                      >
                        {email.isActive ? 'Tắt' : 'Bật'}
                      </button>
                      <button
                        onClick={() => handleDelete(email.id)}
                        className="px-3 py-1 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded text-xs font-medium transition-colors"
                      >
                        Xóa
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
