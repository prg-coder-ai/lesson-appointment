
let autoRefreshTimer = null;

// 加载归档日期列表
async function loadDates() {
    // 路径统一取 ENDPOINTS（shared/apiPaths.js LOGS_*）：
    //   后端 LogController 的类级映射是 /api/v1/logs，必须带 /v1；
    //   axios 对以 / 开头的 url 会忽略 baseURL（utility_request.js:27），
    //   写成 /api/logs/* 不会自动补前缀，只会落到 nginx 的 location / → try_files → 404。
    const res = await request(ENDPOINTS.LOGS_DATES);
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
    let url = date ? ENDPOINTS.LOGS_BY_DATE(date, 1000)
                   : ENDPOINTS.LOGS_TAIL(200);
    if (keyword || level) {
        url = ENDPOINTS.LOGS_SEARCH(keyword, level, date, 500);
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