/* ============================================================================
 * platform-promo-stats.js —— 平台管理员「平台推广统计」（2026-10-13 双码）
 * 接口：GET /api/v1/promo/achievement/platform（见 PromoController.platformAchievement）
 *
 * 业务语义
 *   全平台推广漏斗的总览面：合计卡（推广人数/点击/注册/新租户/加入用户/审批/
 *   缴费/奖励）+ 推广者排行 Top20 + 最近转化 10 条。
 *   与租户管理员的「租户推广统计」互补：那面看单个租户的加入漏斗，
 *   本面看全平台——两类推广码（平台码开租户 / 租户码拉用户）的业绩都汇在这里。
 *
 *   ⚠️ 必须整体包在 IIFE 里：platform_admin.html 是多文件页面
 *   （platform-admin-*.js 同页加载），顶层标识符会互相覆盖（JS 静默覆盖），
 *   只把入口挂 window。
 * ========================================================================== */
(function () {
    'use strict';

    /* 端点常量：统一取共享事实源 shared/apiPaths.js（经桥接挂到 window.ApiPaths） */
    var EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};

    var STAGE_TEXT = {
        registered: '已注册',
        approved: '已审批',
        paid: '已缴费',
        expired: '已过期'
    };

    function escPlatformPromo(text) {
        if (text == null) return '';
        return String(text)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function notifyPlatformPromo(msg) {
        if (typeof window.showApiError === 'function') window.showApiError(msg);
        else if (typeof window.alert === 'function') window.alert(msg);
    }

    function statsItemHtml(label, value, variant) {
        return '<div class="stats-item' + (variant ? ' ' + variant : '') + '">' +
                '<div class="stats-label">' + label + '</div>' +
                '<div class="stats-value">' + value + '</div>' +
                '</div>';
    }

    function num(v) {
        return v == null ? 0 : v;
    }

    async function renderPlatformPromoStatsPage() {
        var container = document.getElementById('dynamic-content-center');
        if (!container) return;

        container.innerHTML =
                '<div class="card">' +
                '  <div class="card-header">' +
                '    <div class="card-title"><i class="fa fa-chart-pie"></i> 平台推广统计</div>' +
                '  </div>' +
                '  <div class="card-body" id="platform-promo-stats-body">正在加载…</div>' +
                '</div>';

        try {
            var data = await window.request({ url: EP.PROMO_PLATFORM_STATS, method: 'GET' });
            renderPlatformPromoStats(data);
        } catch (e) {
            var body = document.getElementById('platform-promo-stats-body');
            if (body) {
                body.innerHTML = '<div style="color:#c05656;padding:12px;">加载失败：' +
                        escPlatformPromo((e && e.message) || e) + '</div>';
            }
        }
    }

    function renderPlatformPromoStats(data) {
        var body = document.getElementById('platform-promo-stats-body');
        if (!body) return;
        var t = (data && data.totals) || {};

        body.innerHTML =
                '<div style="font-size:13px;color:#5a6472;line-height:1.9;margin-bottom:12px;">' +
                    '全平台推广漏斗：平台推广码（自助开新租户）与租户推广码（加入指定租户）的业绩汇总。' +
                    '点击只计数不落明细，故「总注册」及之后为真实转化。' +
                '</div>' +
                '<div class="stats-panel">' +
                    statsItemHtml('推广人数', num(t.promoters)) +
                    statsItemHtml('总点击', num(t.clicks)) +
                    statsItemHtml('总注册', num(t.registered), 'success') +
                    statsItemHtml('促成新租户', num(t.tenantsCreated), 'success') +
                    statsItemHtml('加入用户', num(t.usersJoined), 'success') +
                    statsItemHtml('已审批', num(t.approved)) +
                    statsItemHtml('已缴费', num(t.paid), 'success') +
                    statsItemHtml('累计奖励(元)', num(t.rewardAmount), 'warning') +
                '</div>' +
                '<h3 style="font-size:14px;margin:18px 0 10px;">推广者排行（Top 20，按注册人数）</h3>' +
                '<div class="table-container">' +
                    '<table class="data-table">' +
                        '<thead><tr>' +
                            '<th>排名</th><th>推广人</th><th>账号</th><th>所属租户</th>' +
                            '<th>点击</th><th>注册</th><th>审批</th><th>缴费</th><th>奖励(元)</th>' +
                        '</tr></thead>' +
                        '<tbody id="platform-promo-ranking-body"></tbody>' +
                    '</table>' +
                '</div>' +
                '<h3 style="font-size:14px;margin:18px 0 10px;">最近转化（10 条）</h3>' +
                '<div class="table-container">' +
                    '<table class="data-table">' +
                        '<thead><tr>' +
                            '<th>注册时间</th><th>推广人</th><th>被邀请者</th>' +
                            '<th>路径</th><th>租户</th><th>阶段</th><th>来源</th>' +
                        '</tr></thead>' +
                        '<tbody id="platform-promo-recent-body"></tbody>' +
                    '</table>' +
                '</div>';

        renderRankingRows((data && data.ranking) || []);
        renderRecentRows((data && data.recent) || []);
    }

    function renderRankingRows(ranking) {
        var tbody = document.getElementById('platform-promo-ranking-body');
        if (!tbody) return;
        if (!ranking.length) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#888;">暂无推广业绩</td></tr>';
            return;
        }
        tbody.innerHTML = ranking.map(function (r) {
            return '<tr>' +
                    '<td>' + num(r.rank) + '</td>' +
                    '<td>' + escPlatformPromo(r.promoterName || '-') + '</td>' +
                    '<td>' + escPlatformPromo(r.promoterAccount || '-') + '</td>' +
                    '<td>' + escPlatformPromo(r.tenantName || '-') + '</td>' +
                    '<td>' + num(r.totalClicks) + '</td>' +
                    '<td>' + num(r.totalRegistered) + '</td>' +
                    '<td>' + num(r.totalApproved) + '</td>' +
                    '<td>' + num(r.totalPaid) + '</td>' +
                    '<td>' + num(r.totalRewardAmount) + '</td>' +
                    '</tr>';
        }).join('');
    }

    function renderRecentRows(recent) {
        var tbody = document.getElementById('platform-promo-recent-body');
        if (!tbody) return;
        if (!recent.length) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;">暂无转化记录</td></tr>';
            return;
        }
        tbody.innerHTML = recent.map(function (r) {
            return '<tr>' +
                    '<td>' + escPlatformPromo(r.registeredAt || '-') + '</td>' +
                    '<td>' + escPlatformPromo(r.promoterName || '-') + '</td>' +
                    '<td>' + escPlatformPromo(r.inviteeName || '-') + '</td>' +
                    '<td>' + (r.pathType === 1 ? '自助建租户' : '加入租户') + '</td>' +
                    '<td>' + escPlatformPromo(r.tenantCode || '-') + '</td>' +
                    '<td>' + escPlatformPromo(STAGE_TEXT[r.stage] || r.stage || '-') + '</td>' +
                    '<td>' + escPlatformPromo(r.source || '-') + '</td>' +
                    '</tr>';
        }).join('');
    }

    window.renderPlatformPromoStatsPage = renderPlatformPromoStatsPage;
})();
