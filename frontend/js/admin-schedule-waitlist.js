/* 候补队列 / 递补模块（从 admin-schedule.js 迁出，独立文件）
 * 仅含逻辑；DOM 元素(#waitlistSection/#waitlistBody/#waitlistSummary/#scheduleSelect)由 admin-schedule.js 渲染。
 * 依赖全局函数：toast / switchTab / getNowAvailableSitesRaw / loadSchedule / displySchedule（本页）
 *   fetchWaitlistQueue / promoteWaitlist / getUserNameById（courseAndBooking.js）。
 * 本文件在 admin.html 中位于 admin-schedule.js 之后加载，故运行时上述全局函数均已就绪。
 */
/* ============ 候补队列与递补（排期维度） ============
   递补统一放在这里完成：只有排期维度能同时看到「剩余席位」和「候补排队次序」，这两样齐了才能做决定。
   入口：预订管理页在 cancelled 行（已确认取消、该排期腾出一个空位）或 waiting 行上的
        「查询递补」按钮 → 带 scheduleId 跳到本页并锁定该排期（复用 window.pendingDeepLink 机制）。 */

// 渲染序号令牌：快速切换排期时，慢响应不能覆盖新排期的结果
let waitlistRenderSeq = 0;

/** 隐藏候补面板并清空内容——清空而不只是 display:none，避免下次显示时闪出上一次的残留 */
function hideWaitlistPanel() {
    waitlistRenderSeq++;   // 作废在途请求的结果
    const section = document.getElementById('waitlistSection');
    const body = document.getElementById('waitlistBody');
    const summary = document.getElementById('waitlistSummary');
    if (body) body.innerHTML = '';
    if (summary) summary.textContent = '';
    if (section) section.style.display = 'none';
}

/**
 * 渲染当前排期的候补队列（按申请时间升序，次序即递补次序）。
 * @param {string} scheduleId 排期ID；为空则隐藏面板
 */
async function renderWaitlistPanel(scheduleId) {
    const section = document.getElementById('waitlistSection');
    const body = document.getElementById('waitlistBody');
    const summary = document.getElementById('waitlistSummary');
    if (!section || !body) return;
    if (!scheduleId) { hideWaitlistPanel(); return; }

    const seq = ++waitlistRenderSeq;
    const queue = await fetchWaitlistQueue(scheduleId);
    if (seq !== waitlistRenderSeq) return;    // 已被更新的渲染取代，丢弃在途结果

    if (!Array.isArray(queue) || queue.length === 0) { hideWaitlistPanel(); return; }

    // 剩余席位与候补队列必须同源同一时刻读取，否则会给出“还有空位”的错误判断
    const remainRawNum = getNowAvailableSitesRaw();
    const remainText = remainRawNum <= 0 ? '约满' : String(remainRawNum);
    const noSeat = remainRawNum <= 0;

    if (summary) {
        summary.textContent = '共 ' + queue.length + ' 人候补 · 剩余席位 ' + remainText
            + (noSeat ? '（暂无空位，需先腾出空位才能递补）' : '');
    }

    let rows = '';
    for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        const studentName = await getUserNameById(item.studentId);
        const appliedAt = String(item.createTime || '').replace('T', ' ').slice(0, 16);
        rows += '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #F1EFE8;">'
              +   '<span style="min-width:56px;color:#888780;">第 ' + (i + 1) + ' 位</span>'
              +   '<span style="flex:1;color:#2C2C2A;">' + studentName + '</span>'
              +   '<span style="color:#888780;">申请于 ' + (appliedAt || '—') + '</span>'
              +   '<button class="btn btn-primary" ' + (noSeat ? 'disabled' : '')
              +     ' onclick="clickPromoteWaitlist(\'' + item.bookingId + '\',' + (i + 1) + ')">'
              +     '<i class="fa fa-level-up-alt"></i> 递补</button>'
              + '</div>';
    }
    body.innerHTML = rows;
    section.style.display = '';
    if (typeof switchTab === 'function') switchTab('tab-advanced');
}

/**
 * 点击「递补」：确认后调用服务端原子递补接口。
 *
 * 名额校验、并发防重、课次生成、通知学生全部在服务端完成。
 * 无论成败都刷新队列——成功要看到队列少一人、剩余席位减一；
 * 失败（如已被他人抢先递补）也要刷新，否则界面与库不一致。
 */
async function clickPromoteWaitlist(bookingId, position) {
    if (!bookingId) return;

    // 先记住当前锁定的是哪个排期：loadSchedule() 会重建排期下拉、选中复位到「请选择排期」占位，
    // 不记住的话刷新后就找不到排期了（详见下方 reselectScheduleOption 处的说明）
    const keepScheduleId = (document.getElementById('scheduleSelect') || {}).value || '';

    const ok = confirm('确认把「第 ' + position + ' 位」候补递补为正式预订？\n\n'
        + '· 该学生状态由「候补」变为「预定已确认」\n'
        + '· 生成该学生的课程时间表\n'
        + '· 系统自动发消息通知该学生');
    if (!ok) return;

    const result = await promoteWaitlist(bookingId);
    if (result) {
        toast('递补成功：已生成课次，并已通知该学生。', true);
    }

    await loadSchedule();
    // loadSchedule() 末尾是 `scheduleSelect.innerHTML = '<option value="">请选择排期</option>'` + 逐个 append，
    // 选中状态随之复位到占位项；若直接 displySchedule()，checkCourseAndSchedule 会因"未选排期"早退 →
    // 画面变成"排期未选中 + 候补面板消失"，管理员刚点完递补就丢失了上下文。
    // 因此刷新后必须把同一个排期重新选回来。
    reselectScheduleOption(keepScheduleId);
    await displySchedule();   // 重新读取该排期剩余席位并重渲染候补队列
}

/**
 * 在排期下拉中按 scheduleId 选中对应项。
 * 深链落地与递补后刷新都需要"把某个排期选回来"，共用同一份实现，避免两处逻辑跑偏。
 * @returns {boolean} 是否找到并选中
 */
function reselectScheduleOption(scheduleId) {
    if (!scheduleId) return false;
    const scheduleSelect = document.getElementById('scheduleSelect');
    if (!scheduleSelect || !scheduleSelect.options) return false;
    for (let i = 0; i < scheduleSelect.options.length; i++) {
        if (String(scheduleSelect.options[i].value) === String(scheduleId)) {
            scheduleSelect.selectedIndex = i;
            return true;
        }
    }
    return false;
}

window.hideWaitlistPanel = hideWaitlistPanel;
window.renderWaitlistPanel = renderWaitlistPanel;
window.clickPromoteWaitlist = clickPromoteWaitlist;
window.reselectScheduleOption = reselectScheduleOption;
