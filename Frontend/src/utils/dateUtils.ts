/**
 * API (.NET System.Text.Json) thường trả DateTime UTC dạng "yyyy-MM-ddTHH:mm:ss(.fff)"
 * không có hậu tố Z; trình duyệt coi đó là giờ địa phương → lệch ~7h so với VN (UTC+7).
 * Luôn parse chuỗi không có offset như UTC, rồi hiển thị theo Asia/Ho_Chi_Minh.
 */
const VN_TZ = 'Asia/Ho_Chi_Minh';

export function parseApiDateUtc(input: string | null | undefined): Date {
  if (input == null || input === '') return new Date(NaN);
  const s = String(input).trim();
  if (!s) return new Date(NaN);
  if (/Z$/i.test(s)) return new Date(s);
  if (/[+-]\d{2}:\d{2}$/.test(s) || /[+-]\d{4}$/.test(s)) return new Date(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00.000Z`);
  const withT = s.includes('T') ? s : s.replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T');
  if (/^\d{4}-\d{2}-\d{2}T/.test(withT)) return new Date(`${withT}Z`);
  return new Date(s);
}

export function formatDateTime(isoFromApi: string | null | undefined): string {
  const d = parseApiDateUtc(isoFromApi);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    timeZone: VN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateOnlyVi(isoFromApi: string | null | undefined): string {
  const d = parseApiDateUtc(isoFromApi);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('vi-VN', {
    timeZone: VN_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Ngày tháng ngắn (vd. cài đặt server) */
export function formatDateShortVi(isoFromApi: string | null | undefined): string {
  const d = parseApiDateUtc(isoFromApi);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('vi-VN', {
    timeZone: VN_TZ,
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

/** Giống thông báo dropdown: giờ + ngày ngắn */
export function formatDateTimeShortVi(isoFromApi: string | null | undefined): string {
  const d = parseApiDateUtc(isoFromApi);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    timeZone: VN_TZ,
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

/** s/p/h/d trước — Defense, Whitelist, Dashboard, Incidents */
export function formatRelativeCompactTruoc(isoFromApi: string | null | undefined): string {
  if (isoFromApi == null || isoFromApi === '') return 'N/A';
  const t = parseApiDateUtc(isoFromApi).getTime();
  if (Number.isNaN(t)) return 'N/A';
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 60) return `${sec}s trước`;
  if (sec < 3600) return `${Math.floor(sec / 60)}p trước`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h trước`;
  return `${Math.floor(sec / 86400)}d trước`;
}

/** Thời gian còn lại đến mốc UTC từ API */
export function formatTimeUntilVi(isoFromApi: string | null | undefined): string {
  if (isoFromApi == null || isoFromApi === '') return 'Vĩnh viễn';
  const t = parseApiDateUtc(isoFromApi).getTime();
  if (Number.isNaN(t)) return 'Vĩnh viễn';
  const sec = Math.floor((t - Date.now()) / 1000);
  if (sec <= 0) return 'Đã hết hạn';
  if (sec < 3600) return `Còn ${Math.floor(sec / 60)}p`;
  if (sec < 86400) return `Còn ${Math.floor(sec / 3600)}h`;
  return `Còn ${Math.floor(sec / 86400)}d`;
}

/** Ticket / System logs: "Vừa xong", "X phút trước" */
export function formatRelativeLongTruoc(isoFromApi: string | null | undefined): string {
  const t = parseApiDateUtc(isoFromApi).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  if (diff < 60000) return 'Vừa xong';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} phút trước`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ trước`;
  return `${Math.floor(diff / 86400000)} ngày trước`;
}

/** Notification center list (không thêm "trước" sau đơn vị) */
export function formatRelativeNotification(isoFromApi: string | null | undefined): string {
  const t = parseApiDateUtc(isoFromApi).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  if (diff < 60000) return 'Vừa xong';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} phút`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ`;
  return `${Math.floor(diff / 86400000)} ngày`;
}

export function formatTimestampRelativeAbsolute(ts: string): { relative: string; absolute: string } {
  const d = parseApiDateUtc(ts);
  if (Number.isNaN(d.getTime())) {
    return { relative: '—', absolute: '—' };
  }
  const now = Date.now();
  const diff = now - d.getTime();
  let relative: string;
  if (diff < 60000) relative = 'Vừa xong';
  else if (diff < 3600000) relative = `${Math.floor(diff / 60000)} phút trước`;
  else if (diff < 86400000) relative = `${Math.floor(diff / 3600000)} giờ trước`;
  else relative = `${Math.floor(diff / 86400000)} ngày trước`;
  const absolute = d.toLocaleString('vi-VN', { timeZone: VN_TZ });
  return { relative, absolute };
}

export function getApiTimeMs(isoFromApi: string | null | undefined): number {
  return parseApiDateUtc(isoFromApi).getTime();
}
