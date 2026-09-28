export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

export function finiteNumber(value) {
  if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function displayDate(value) {
  if (value == null || value === '') return '時間未記錄';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})
    : '時間未記錄';
}

export const badge = (text, tone = '') => `<span class="status-badge ${tone ? `status-${tone.toLowerCase()}` : ''}">${text}</span>`;

export const section = (title, content, action = '') => `
  <section class="panel">
    <div class="section-head">
      <div class="section-title"><span class="accent-bar"></span>${title}</div>
      ${action}
    </div>
    ${content}
  </section>`;

export const metric = (label, value) => `
  <div class="metric">
    <span>${label}</span>
    <strong>${value}</strong>
  </div>`;
