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
