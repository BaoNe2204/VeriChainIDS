import { useEffect, useState } from 'react';
import { ServersApi, type ServerTelegramRecipient } from '../services/api';

interface Props {
  serverId: string;
  serverName: string;
  onClose: () => void;
}

const CHAT_ID_REGEX = /^-?\d{5,}$/;

export default function ServerTelegramRecipientsModal({ serverId, serverName, onClose }: Props) {
  const [recipients, setRecipients] = useState<ServerTelegramRecipient[]>([]);
  const [newChatId, setNewChatId] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadRecipients();
  }, [serverId]);

  const loadRecipients = async () => {
    try {
      const response = await ServersApi.getTelegramRecipients(serverId);
      if (response.success && response.data) {
        setRecipients(response.data);
      }
    } catch (err) {
      console.error('Failed to load telegram recipients:', err);
    }
  };

  const handleAdd = async () => {
    const chatId = newChatId.trim();
    if (!chatId) {
      setError('Vui lòng nhập Telegram Chat ID');
      return;
    }

    if (!CHAT_ID_REGEX.test(chatId)) {
      setError('Chat ID không hợp lệ. Ví dụ: 123456789 hoặc -1001234567890');
      return;
    }

    if (recipients.length >= 5) {
      setError('Mỗi server chỉ được thêm tối đa 5 Telegram chat');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await ServersApi.addTelegramRecipient(serverId, chatId, newDisplayName.trim() || undefined);
      if (response.success && response.data) {
        setRecipients([...recipients, response.data]);
        setNewChatId('');
        setNewDisplayName('');
      } else {
        setError(response.message || 'Thêm Telegram chat thất bại');
      }
    } catch (err: any) {
      setError(err.message || 'Thêm Telegram chat thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (recipientId: string) => {
    if (!confirm('Bạn có chắc muốn xóa Telegram chat này?')) return;

    try {
      const response = await ServersApi.deleteTelegramRecipient(serverId, recipientId);
      if (response.success) {
        setRecipients(recipients.filter(r => r.id !== recipientId));
      }
    } catch (err) {
      console.error('Failed to delete telegram recipient:', err);
    }
  };

  const handleToggle = async (recipientId: string) => {
    try {
      const response = await ServersApi.toggleTelegramRecipient(serverId, recipientId);
      if (response.success && response.data) {
        setRecipients(recipients.map(r => r.id === recipientId ? response.data! : r));
      }
    } catch (err) {
      console.error('Failed to toggle telegram recipient:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl border border-slate-700">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-xl font-bold text-white">Telegram Nhận Thông Báo</h2>
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

        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-300">
              Thêm Telegram Chat ({recipients.length}/5)
            </label>
            <div className="grid gap-2 md:grid-cols-[1.3fr_1fr_auto]">
              <input
                type="text"
                value={newChatId}
                onChange={(e) => setNewChatId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="Chat ID, ví dụ: -1001234567890"
                className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                disabled={loading || recipients.length >= 5}
              />
              <input
                type="text"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="Tên gợi nhớ, ví dụ: SOC Team"
                className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                disabled={loading || recipients.length >= 5}
              />
              <button
                onClick={handleAdd}
                disabled={loading || recipients.length >= 5}
                className="px-6 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                {loading ? 'Đang thêm...' : 'Thêm'}
              </button>
            </div>
            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}
            <div className="text-xs text-slate-500 space-y-1">
              <p>Các chat này sẽ nhận tin nhắn Telegram khi server có alert High hoặc Critical.</p>
              <p>Bot cần được nhắn trước và Chat ID phải đúng thì Telegram mới gửi tới được.</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">
              Danh Sách Telegram Chat
            </label>
            {recipients.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 5L11 14.5M21 5l-6.5 16-3.5-6-6-3.5L21 5z" />
                </svg>
                <p>Chưa có Telegram chat nào</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recipients.map((recipient) => (
                  <div
                    key={recipient.id}
                    className="flex items-center justify-between p-3 bg-slate-900 rounded-lg border border-slate-700 gap-3"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-2 h-2 rounded-full ${recipient.isActive ? 'bg-green-500' : 'bg-slate-600'}`} />
                      <div className="min-w-0">
                        <div className={`font-mono text-sm truncate ${recipient.isActive ? 'text-white' : 'text-slate-500'}`}>
                          {recipient.chatId}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {recipient.displayName || 'Không có tên gợi nhớ'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleToggle(recipient.id)}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                          recipient.isActive
                            ? 'bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30'
                            : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                        }`}
                      >
                        {recipient.isActive ? 'Tắt' : 'Bật'}
                      </button>
                      <button
                        onClick={() => handleDelete(recipient.id)}
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
