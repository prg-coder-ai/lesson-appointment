
let autoRefreshTimer = null;

// 加载归档日期列表
async function loadDates() {
    const res = await request('/api/logs/dates');
    const select = document.getElementById('log-date');
    (res || []).forEach(d => {
        const opt = document.createElement('option');
        opt.value = d; opt.textContent = d;
        select.appendChild(opt);
    });
}

// 查询日志
async function loadLogs() {
    const date = document.getElementById('log-date').value;
    const level = document.getElementById('log-level').value;
    const keyword = document.getElementById('log-keyword').value.trim();
    let url = date ? `/api/logs/date?date=${date}&maxLines=1000`
                   : `/api/logs/tail?lines=200`;
    if (keyword || level) {
        url = `/api/logs/search?keyword=${encodeURIComponent(keyword)}&level=${level}&date=${date}&maxResults=500`;
    }
    const lines = await request(url) || [];
    const content = document.getElementById('log-content');
    content.innerHTML = lines.map(line => {
        const cls = line.includes(' ERROR ') ? 'log-line-ERROR'
                   : line.includes(' WARN ') ? 'log-line-WARN'
                   : 'log-line-INFO';
        return `<div class="${cls}">${escapeHtml(line)}</div>`;
    }).join('');
    content.scrollTop = content.scrollHeight;
}

// 自动刷新
document.getElementById('log-autorefresh').addEventListener('change', e => {
    if (e.target.checked) {
        autoRefreshTimer = setInterval(loadLogs, 3000);
    } else if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }
});

// 初始化
loadDates();
loadLogs();