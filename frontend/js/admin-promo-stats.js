/* ============================================================================
 * admin-promo-stats.js —— 管理员「租户推广统计」（2026-10-13 双码）
 * 接口：GET /api/v1/promo/achievement/tenant（见 PromoController.tenantAchievement）
 *
 * 业务语义
 *   统计本租户「租户推广码」（path_type=2，目标=本租户）带来的加入漏斗：
 *   租户内每个已登录用户都能在「我的推广」生成租户码，新用户用码加入本租户
 *   （待审批 → 审批 → 缴费）。管理员在此看全租户的汇总与每个推广人的明细。
 *
 *   口径注意：点击只计数、不落明细（二期决策），故本统计只呈现注册之后的
 *   真实转化（加入/待审批/已审批/已缴费），不含点击。
 *   阶段口径：joined=全部；pending=registered；approved=approved∪paid；paid=paid。
 *
 *   ⚠️ 必须整体包在 IIFE 里：本页面是多文件页面（admin-*.js 同页加载），
 *   顶层标识符会互相覆盖（JS 静默覆盖，两类守卫都拦不住），只把入口挂 window。
 * ========================================================================== */
(function () {
    'use strict';

    /* 端点常量：统一取共享事实源 shared/apiPaths.js（经桥接挂到 window.ApiPaths） */
    var EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};

    var ROLE_TEXT = {
        admin: '租户管理员',
        teacher: '教师',
        student: '学生',
        platform_admin: '平台管理员'
    };

    function escPromoStat(text) {
        if (text == null) return '';
        return String(text)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function roleText(role) {
        return ROLE_TEXT[role] || role || '-';
    }

    function notifyPromoStat(msg) {
        if (typeof window.showApiError === 'function') window.showApiError(msg);
        else if (typeof window.alert === 'function') window.alert(msg);
    }

    function statsItemHtml(label, value, variant) {
        return '<div class="stats-item' + (variant ? ' ' + variant : '') + '">' +
                '<div class="stats-label">' + label + '</div>' +
                '<div class="stats-value">' + value + '</div>' +
                '</div>';
    }

    async function renderTenantPromoStatsPage() {
        var container = document.getElementById('dynamic-content-center');
        if (!container) return;

        container.innerHTML =
                '<div class="card">' +
                '  <div class="card-header">' +
                '    <div class="card-title"><i class="fa fa-chart-pie"></i> 租户推广统计</div>' +
                '  </div>' +
                '  <div class="card-body" id="tenant-promo-stats-body">正在加载…</div>' +
                '</div>';

        try {
            var data = await window.request({ url: EP.PROMO_TENANT_STATS, method: 'GET' });
            renderTenantPromoStats(data);
        } catch (e) {
            var body = document.getElementById('tenant-promo-stats-body');
            if (body) {
                body.innerHTML = '<div style="color:#c05656;padding:12px;">加载失败：' +
                        escPromoStat((e && e.message) || e) + '</div>';
            }
        }
    }

    function renderTenantPromoStats(data) {
        var body = document.getElementById('tenant-promo-stats-body');
        if (!body) return;
        var t = (data && data.totals) || {};
        var quota = data && data.tenantQuota;
        var quotaText = '';
        if (quota && quota.userTotalLimit != null) {
            var cur = quota.userCurrent || 0;
            quotaText = quota.userTotalLimit > 0
                    ? '（名额 ' + cur + '/' + quota.userTotalLimit +
                      '，剩余 ' + Math.max(quota.userTotalLimit - cur, 0) + '）'
                    : '（名额不限，已加入 ' + cur + ' 人）';
        }

        body.innerHTML =
                '<div style="font-size:13px;color:#5a6472;line-height:1.9;margin-bottom:12px;">' +
                    '统计本租户「租户推广码」带来的加入漏斗：点击只计数不落明细，此处呈现注册之后的真实转化。' +
                    '机构：<b>' + escPromoStat((data && data.orgName) || '-') + '</b>' +
                    '（' + escPromoStat((data && data.tenantCode) || '-') + '）' + quotaText +
                '</div>' +
                '<div class="stats-panel">' +
                    statsItemHtml('租户推广码', t.codeCount || 0) +
                    statsItemHtml('推广人数', t.promoterCount || 0) +
                    statsItemHtml('加入人数', t.joined || 0, 'success') +
                    statsItemHtml('待审批', t.pending || 0, 'warning') +
                    statsItemHtml('已审批', t.approved || 0, 'success') +
                    statsItemHtml('已缴费', t.paid || 0, 'success') +
                '</div>' +
                '<div class="table-container" style="margin-top:14px;">' +
                    '<table class="data-table">' +
                        '<thead><tr>' +
                            '<th>推广人</th><th>账号</th><th>角色</th><th>推广码数</th>' +
                            '<th>加入</th><th>待审批</th><th>已审批</th><th>已缴费</th>' +
                        '</tr></thead>' +
                        '<tbody id="tenant-promo-promoter-body"></tbody>' +
                    '</table>' +
                '</div>';

        renderPromoterRows((data && data.promoters) || []);
    }

    function renderPromoterRows(promoters) {
        var tbody = document.getElementById('tenant-promo-promoter-body');
        if (!tbody) return;
        if (!promoters.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888;">' +
                    '暂无推广记录——租户内用户可在「我的推广」页生成租户推广码后分享</td></tr>';
            return;
        }
        tbody.innerHTML = promoters.map(function (p) {
            return '<tr>' +
                    '<td>' + escPromoStat(p.promoterName || '-') + '</td>' +
                    '<td>' + escPromoStat(p.promoterAccount || '-') + '</td>' +
                    '<td>' + escPromoStat(roleText(p.promoterRole)) + '</td>' +
                    '<td>' + (p.codeCount || 0) + '</td>' +
                    '<td>' + (p.joined || 0) + '</td>' +
                    '<td>' + (p.pending || 0) + '</td>' +
                    '<td>' + (p.approved || 0) + '</td>' +
                    '<td>' + (p.paid || 0) + '</td>' +
                    '</tr>';
        }).join('');
    }

    window.renderTenantPromoStatsPage = renderTenantPromoStatsPage;
})();
