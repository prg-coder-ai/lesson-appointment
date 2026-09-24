// functoions for appointmentNotes display and data load

/* ============================================================
 * 通用刷新入口（页面顶部「刷新」按钮）
 * ------------------------------------------------------------
 * 历史问题：原实现把「标题文本」直接当 key 传给 loadAdminPageContent()，
 *   而 loadAdminPageContent 只认菜单 key（messages / schedule / overview …）。
 *   因标题文本（如「消息中心」）永远匹配不到 case，switch 落空 —— 而函数开头
 *   已经 dynamicContentCenter.innerHTML = ''，于是表现为：
 *   点顶部「刷新」→ 内容区被清空且不再渲染 → 页面空白。
 *
 * 现在的三级回退策略：
 *   1) 优先调用「页面自己的刷新函数」（页面模块用 registerPageRefresh 注册），
 *      可保留页面内部状态（分页 / 当前标签 / 搜索词等），体验与页内刷新一致；
 *   2) 没注册 → 按当前菜单 key 调 loadAdminPageContent(key) 整页重渲染；
 *   3) 仍不行 → 退回历史行为（拿标题文本再试一次）。
 * ============================================================ */

// 页面自有刷新函数注册表：{ menuKey: function() { ... } }
window.pageRefreshHandlers = window.pageRefreshHandlers || {};

/**
 * 注册某个菜单页面的刷新函数（页面模块加载时调用一次即可）
 * @param {string} menuKey 菜单 key，如 'messages' / 'schedule'
 * @param {Function} fn 刷新函数；返回 false 表示「容器已不在/无法自刷新」，交由通用逻辑兜底重渲染
 */
function registerPageRefresh(menuKey, fn) {
    if (!menuKey || typeof fn !== 'function') return;
    window.pageRefreshHandlers[menuKey] = fn;
}

// 取当前菜单 key：优先用 loadAdminPageContent 录制下来的值，其次当前高亮的菜单项
function resolveCurrentMenuKey() {
    if (typeof window.currentMenuKey === 'string' && window.currentMenuKey.trim() !== '') {
        return window.currentMenuKey.trim();
    }
    const active = document.querySelector('.menu-item.active');
    return (active && active.getAttribute('key')) || '';
}

// 包装各页面自己的 loadAdminPageContent：只额外记录当前 key，不改动其原有逻辑
// （student/teacher/admin/platform_admin 四套页面都有同名函数，包一层即可通用）
(function wrapLoadAdminPageContentToTrackKey() {
    if (typeof window.loadAdminPageContent !== 'function') return;
    const orig = window.loadAdminPageContent;
    window.loadAdminPageContent = function (key) {
        const k = (key === undefined || key === null) ? '' : String(key).trim();
        if (k) {
            window.currentMenuKey = k;
        } else {
            const act = document.querySelector('.menu-item.active');
            window.currentMenuKey = (act && act.getAttribute('key')) || window.currentMenuKey || 'overview';
        }
        return orig.apply(this, arguments);
    };
})();

function refreshRightPage() {
    const key = resolveCurrentMenuKey();

    // 1) 页面已注册自有刷新函数 → 优先调用（保留页面内部状态）
    const own = key ? window.pageRefreshHandlers[key] : null;
    if (typeof own === 'function') {
        let handled = true;
        try { handled = own(key) !== false; }
        catch (e) { console.error('refreshRightPage: 页面刷新函数执行异常，回退为整页重渲染', e); handled = false; }
        if (handled) return;
    }

    // 2) 按当前菜单 key 整页重渲染
    if (key && typeof window.loadAdminPageContent === 'function') {
        window.loadAdminPageContent(key);
        return;
    }

    // 3) 最后兜底：历史行为（标题文本）
    if (typeof window.loadAdminPageContent === 'function'
        && typeof pageTitle !== 'undefined' && pageTitle && pageTitle.textContent !== '') {
        window.loadAdminPageContent(pageTitle.textContent);
    }
}

 //获取days天数以内的预约列表
 /*private String UserId;  //
    private String Role;     
    private int Days; */
 async function getAppointmentListData(conditions ){     
    return await getAppointmentList(conditions);  
} 


// 获取课程数量,当日 days=1,一周内 days=7
async function getCountOfTodayAppointment() {

  //const token = getToken && typeof getToken === 'function' ? getToken() : '';
  let days =1;
  try { //指定天数内的预约课程数
      const res  =  await  request({url:`${API_BASE_URL}/course/appointment/statistical/onDays`, 
        Method:"get",  
        params: { ondays:days }//controller: @RequestParam("ondays") int days
     });
 
        return res  ;  
      
    } catch (e) {
      // 网络或服务器异常处理
     console.error("getCountOfTodayAppointment",e);
     return null;
    }
} //获取今日预约次数

//获取最近days天的课程
 //NoUsed
async function getAppointmentList(conditions ) {
  
 try {
     // 允许传递排序字段和排序方式（如 appointmentTime 字段降序）
     const res  = await request({
       url: `${API_BASE_URL}/course/appointment/statistical/listByDays`, 
       Method: "get", 
       params: { 
         days:    conditions.Days, // controller: @RequestParam("days") int days
         userId:  conditions.UserId,
         role:    conditions.Role,
         // 向后端传递排序参数，需后端Controller方法新增@RequestParam("sortField")和@RequestParam("sortOrder")参数，并在Service/Mapper中根据这两个参数动态设置order by子句
         sortField: "appointmentDatetime",   // 例如后端：@RequestParam(required = false, defaultValue = "appointmentTime") String sortField
         sortOrder: "asc"               // 例如后端：@RequestParam(required = false, defaultValue = "desc") String sortOrder
       }
     });
     
     // 返回统计结果对象， array
     return res  ;  
   } catch (e) {
     // 网络或服务器异常处理
    console.error("getAppointmentList",e);
    return null;
   }
 }
 
/**
 *  const params = {
      pageNum: Pagination.pageNum,
      pageSize: Pagination.pageSize,
    
     name:   document.getElementById('course-name-select').value,
     days:   document.getElementById('appoint-days-select').value,
     status: document.getElementById('appoint-status-select').value ,
   }
   */
 //分页显示--获取 显示 -- 
/**
 * 获取指定天数内的预约分页列表（兼容后端 @RequestBody）
 * @param {Object} query AppointmentQueryPage请求对象，比如 {pageNum, pageSize, days, userId, role, status}
 * @returns {Promise<Object>} 分页查询 PageResult 对象
 *
 * 注意：参数通过 data 传递（POST body），不能用 GET 方式，否则后端无法绑定 @RequestBody
 * 用法示例：
 *   const query = { pageNum: 1, pageSize: 10, days: 7, userId: ..., role: ..., status: ... };
 *   const res = await fetchAppointmentListPage(query);
 */
//OK
async function fetchAppointmentListPage(query) {
  try {
    const res = await request({
      url: `${API_BASE_URL}/course/appointment/statistical/listByDaysByPage`, 
      method: "post", // 必须为POST，以便@RequestBody生效
      data: query // 直接作为body传递 ，controller作为对象接收，不能有括号T
      // 不需要 params 字段
    });
    return res;
  } catch (e) {
    console.error("fetchAppointmentListPage", e);
    return null;
  }
}
//分页读取数据，不参考时间排序 Result《PageResult》
async function datamaintain_fetchAppointmenPage(query) {
  try {
    const res = await request({
      url: `${API_BASE_URL}/course/appointment/listByPage`, 
      method: "post", // 必须为POST，以便@RequestBody生效
      data: query // 直接作为body传递 ，controller作为对象接收，不能有括号T
      // 不需要 params 字段
    });
    return res;
  } catch (e) {
    console.error("datamaintain_fetchAppointmenPage", e);
    return null;
  }
}
 
   // ========================================================================
   // 退改规则提示（学生取消课次前 / 管理员审核确认前共用）
   // ------------------------------------------------------------------------
   // 判定一律由服务端算（/refund-rule/hint），前端不自己算时间差 ——
   // 客户端时钟不准或时区处理不一致时，前端算出的档位会和服务端、和审核人看到的对不上。
   // ========================================================================

   /**
    * 取某课次的退改规则提示。
    * @returns {Promise<Object|null>} 失败返回 null（不打断取消课次流程，只是不给提示）
    */
   async function fetchRefundHintForAppointment(appointmentId) {
     try {
       return await request({
         url: `${API_BASE_URL}/refund-rule/hint`,
         method: 'get',
         params: { appointmentId: appointmentId },
         customErrorMsg: false   // 提示失败由弹窗自己说明，不再叠一层全局错误条
       });
     } catch (e) {
       console.error('fetchRefundHintForAppointment', e);
       return null;
     }
   }

   function escapeRefundText(text) {
     if (text === null || text === undefined) return '';
     return String(text)
       .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
   }

   /** 档位配色：免责绿 / 部分退费橙 / 不退费与已过时红 */
   function refundLevelColor(level) {
     if (level === 'free') return '#3a8a3a';
     if (level === 'partial') return '#c0871b';
     if (level === 'none' || level === 'past') return '#c0392b';
     return '#5a6472';
   }

   /**
    * 退改规则提示弹窗（Promise<boolean>：true=用户点了"继续"）。
    *
    * 用原生 DOM + 内联样式，不依赖各页面自己的弹窗 CSS ——
    * 学生页/教师页/管理页三套样式表不同，引用页面类名会在某一页上失效。
    * 也不放进 overflow:auto 的内容容器里，避免被裁切。
    */
   function showRefundRuleDialog(hint, options) {
     var opts = options || {};
     var title = opts.title || '退改规则提示';
     var confirmText = opts.confirmText || '继续';
     var intro = opts.intro || '';

     return new Promise(function (resolve) {
       var mask = document.createElement('div');
       mask.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
         'background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:10000;';

       var box = document.createElement('div');
       box.style.cssText = 'width:92%;max-width:520px;background:#fff;border-radius:8px;padding:20px 22px;' +
         'box-shadow:0 6px 24px rgba(0,0,0,0.18);font-size:14px;color:#2c3542;';

       var head = '<div style="display:flex;justify-content:space-between;align-items:center;' +
         'border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:12px;">' +
         '<div style="font-weight:600;font-size:15px;">' + escapeRefundText(title) + '</div>' +
         '<span id="refundRuleDialogClose" style="cursor:pointer;color:#999;font-size:16px;">✕</span></div>';

       var body = '';
       if (intro) {
         body += '<div style="color:#5a6472;margin-bottom:10px;line-height:1.7;">' + escapeRefundText(intro) + '</div>';
       }

       if (!hint) {
         body += '<div style="padding:10px 14px;background:#fff8e6;border:1px solid #ffe0a3;' +
           'border-radius:6px;color:#8a5a00;line-height:1.8;">' +
           '未能获取该课次的退改规则提示（可能是网络问题或该课次已被处理）。' +
           '你仍可继续，但请自行确认退改条件。</div>';
       } else {
         var color = refundLevelColor(hint.level);
         body += '<div style="padding:12px 14px;background:#f6f8fa;border:1px solid #e3e8ee;' +
           'border-radius:6px;line-height:1.9;">';
         if (hint.courseName) {
           body += '<div>课程：<b>' + escapeRefundText(hint.courseName) + '</b></div>';
         }
         if (hint.lessonTime) {
           body += '<div>课次时间：<b>' + escapeRefundText(hint.lessonTime) + '</b></div>';
         }
         body += '<div>距上课还有：<b>' + escapeRefundText(hint.aheadText || '-') + '</b></div>';
         body += '<div>判定档位：<b style="color:' + color + ';">' +
           escapeRefundText(hint.levelText || '-') + '</b>' +
           (hint.refundPercent === null || hint.refundPercent === undefined
             ? '' : '（退费比例 <b>' + hint.refundPercent + '%</b>）') + '</div>';
         body += '<div>适用规则：' + escapeRefundText(hint.scopeText || '-') + '</div>';
         body += '</div>';

         if (hint.ruleText) {
           body += '<div style="margin-top:10px;font-size:12px;color:#8a94a6;">三档规则：' +
             escapeRefundText(hint.ruleText) + '</div>';
         }
         if (hint.fallbackNotice) {
           body += '<div style="margin-top:8px;font-size:12px;color:#c0871b;">' +
             escapeRefundText(hint.fallbackNotice) + '</div>';
         }
         // 余额体系尚未落地时明确告知用户"退费尚未入账"，避免用户以为钱已到账
         if (hint.refundPercent !== null && hint.refundPercent !== undefined && hint.refundPercent > 0) {
           body += '<div style="margin-top:10px;padding:8px 12px;background:#fffaf0;' +
             'border:1px solid #ffe0a3;border-radius:6px;font-size:12px;color:#8a5a00;line-height:1.7;">' +
             '退费金额由管理员审核确认后登记。当前系统尚未开通在线余额账户，' +
             '实际退还方式请与机构确认。</div>';
         }
       }

       var foot = '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">' +
         '<button id="refundRuleDialogCancel" class="btn btn-default" ' +
         'style="padding:8px 16px;border:1px solid #d9dee5;background:#fff;border-radius:4px;cursor:pointer;">取消</button>' +
         '<button id="refundRuleDialogOk" class="btn btn-primary" ' +
         'style="padding:8px 16px;border:1px solid #1a6fd4;background:#1a6fd4;color:#fff;border-radius:4px;cursor:pointer;">' +
         escapeRefundText(confirmText) + '</button></div>';

       box.innerHTML = head + body + foot;
       mask.appendChild(box);
       document.body.appendChild(mask);

       function done(val) {
         if (mask.parentNode) mask.parentNode.removeChild(mask);
         document.removeEventListener('keydown', onKey);
         resolve(val);
       }
       function onKey(e) { if (e.key === 'Escape') done(false); }

       box.querySelector('#refundRuleDialogOk').addEventListener('click', function () { done(true); });
       box.querySelector('#refundRuleDialogCancel').addEventListener('click', function () { done(false); });
       box.querySelector('#refundRuleDialogClose').addEventListener('click', function () { done(false); });
       mask.addEventListener('click', function (e) { if (e.target === mask) done(false); });
       document.addEventListener('keydown', onKey);
     });
   }

   /**
    * 学生点「取消课次」：先展示退改规则提示，用户确认后再提交申请。
    * 原来是一点就直接把状态改成 cancelling，学生完全看不到自己会承担什么退改代价。
    */
   async function studentApplyCancelWithRule(appointmentId) {
     const hint = await fetchRefundHintForAppointment(appointmentId);
     const ok = await showRefundRuleDialog(hint, {
       title: '提交前请确认退改规则',
       intro: '提交后课次进入「取消待确认」，需等待管理员审核确认。',
       confirmText: '确认提交'
     });
     if (!ok) return;
     await setApointmentStatusAndReload(appointmentId, "cancelling");
   }

   /**
    * 管理员点「确认」取消课次：先把该课次的退费档位摆出来，确认后再落库。
    * 审核人据此判断是否该退、退多少，避免"点了确认才发现早过了免责线"。
    */
   async function adminConfirmCancelWithRule(appointmentId) {
     const hint = await fetchRefundHintForAppointment(appointmentId);
     const ok = await showRefundRuleDialog(hint, {
       title: '审核确认前请核对退费档位',
       intro: '确认后该课次将被取消，并按下列档位登记退费。档位按「此刻」的提前量重新计算，可能与学生申请时不同。',
       confirmText: '确认取消'
     });
     if (!ok) return;
     await confirmCancellingAppointment(appointmentId, true);
   }

   // ========================================================================
   // 上课提醒：档位标签 + 管理员手动发送
   // ------------------------------------------------------------------------
   // 「该不该发、发第几档、发过没有」全部由服务端判定（/notify-rule/preview 试算、
   // /notify-rule/manual-send 发送）。前端不再按本地时间翻 appointment.status：
   //   ① 浏览器时钟可改，且排期带 timeZone（见 cardInfo.origTz），客户端换算出的档位
   //      与服务端、与另一位审核人看到的可能不一致；
   //   ② appointment.status 只有 noted1/noted2 两个"通知位"，档位数一多就装不下，
   //      而该字段同时还在被管理端下拉当业务状态筛选用。
   // 通知是否发过，现在记在 notification_dispatch_log 流水表（键 = 课次 + 档位 + 收件人）。
   // ========================================================================

   /** 档位序号 → 偏移文案（如 {1:'3 天'}），取自租户默认通知规则，刷新列表时更新 */
   window.notifyStageLabels = window.notifyStageLabels || {};

   /**
    * 拉取租户默认通知规则的档位，用于把历史状态 noted1/noted2 翻译成
    * 「已发第 N 档·提前 X」。失败不打断列表渲染，标签退回「已发第 N 档」。
    */
   async function loadNotifyStageLabels() {
     // 档位文案只有管理端用得上（学生页/教师页共用同一个刷新入口，也会走到这里），
     // 这两类角色直接返回，省掉一次注定 403 的请求。判断故意写成"排除法"——
     // 角色串以后若细分（如 tenant_admin），不会因此静默拿不到档位文案。
     if (typeof userRole !== 'undefined' && (userRole === 'student' || userRole === 'teacher')) {
       return window.notifyStageLabels || {};
     }
     try {
       const rule = await request({
         url: `${API_BASE_URL}/notify-rule/detail`,
         method: 'get',
         customErrorMsg: false
       });
       const points = (rule && Array.isArray(rule.points)) ? rule.points : [];
       const labels = {};
       points.forEach(function (p, i) {
         const seq = (p.seq === null || p.seq === undefined) ? (i + 1) : Number(p.seq);
         if (seq > 0 && p.offsetText) labels[seq] = p.offsetText;
       });
       window.notifyStageLabels = labels;
       return labels;
     } catch (e) {
       console.error('loadNotifyStageLabels', e);
       window.notifyStageLabels = {};
       return {};
     }
   }

   /** 第 seq 档的可读描述；拿不到配置时退化为「已发第 N 档」 */
   function notifyStageLabel(seq) {
     const offsetText = (window.notifyStageLabels || {})[seq];
     return offsetText ? `已发第${seq}档·提前${offsetText}` : `已发第${seq}档`;
   }

   /**
    * 遗留通知状态（noted1 / noted2）在列表里的展示文案。
    *
    * 分角色：管理端需要知道它对应第几档、提前多久（判断要不要补发），
    * 学生/教师看到「第几档」只是在替系统解释实现细节 —— 给一句「已提醒」就够。
    */
   function notifyLegacyNotedText(seq) {
     if (typeof userRole !== 'undefined' && userRole === 'admin') {
       return '正常（' + notifyStageLabel(seq) + '·历史标记）';
     }
     return '已提醒';
   }

   /**
    * 该课次状态是否还值得发送提醒。
    * 名单与服务端 NotifyDispatchService.DEAD_APPOINTMENT_STATUS 保持一致 ——
    * 这里只决定按钮显不显示，真正能不能发由服务端说了算（已过上课时间会被拒绝）。
    */
   function isNotifyActionable(status) {
     const dead = ['completed', 'cancelled', 'canceled', 'changed', 'frozen',
                   'cancelling', 'canceling', 's-cancelling', 't-cancelling',
                   'rej-booking', 'rej-cancelling', 'delete', 'deleted'];
     return !dead.includes(String(status === null || status === undefined ? '' : status).trim());
   }

   /** 取该课次的通知计划：各档应发时刻 + 已发/待发/已过期 */
   async function fetchNotifyPlan(appointmentId) {
     try {
       return await request({
         url: `${API_BASE_URL}/notify-rule/preview`,
         method: 'get',
         params: { appointmentId: appointmentId },
         customErrorMsg: false
       });
     } catch (e) {
       console.error('fetchNotifyPlan', e);
       return null;
     }
   }

   /**
    * 管理员手动补发一次上课提醒。不受自动发送的幂等限制（流水 dedup_key 不同），
    * 可以重复发；发哪一档由服务端按「当前距上课还有多久」自动判定。
    */
   async function sendNotifyManual(appointmentId) {
     return await request({
       url: `${API_BASE_URL}/notify-rule/manual-send`,
       method: 'post',
       data: { appointmentId: appointmentId },
       customErrorMsg: false
     });
   }

   /** 从 request 的 reject 值里取一条人话错误信息（形态有 Result / 字符串 / axios error 三种） */
   function notifyErrText(e) {
     if (!e) return '操作失败';
     if (typeof e === 'string') return e;
     const respData = e.response && e.response.data;
     if (respData && (respData.message || respData.msg)) return respData.message || respData.msg;
     if (e.message) return e.message;
     return '操作失败';
   }

   /** 单档状态 → 颜色（已发绿 / 待发蓝 / 已过期灰） */
   function notifyStateColor(state) {
     if (state === 'DISPATCHED') return '#3a8a3a';
     if (state === 'PAST') return '#8a94a6';
     if (state === 'WAITING') return '#1a6fd4';
     return '#5a6472';
   }

   /**
    * 档位表 HTML。
    *
    * 把「已有档位」全摆出来的意义在于：管理员点发送前能看清待会儿会发的是第几档、
    * 有没有档位其实早就过期了（过期不补，这是服务端的策略，不在界面上说明会让人以为漏发）。
    */
   function renderNotifyPlanRows(plan) {
     const points = (plan && Array.isArray(plan.points)) ? plan.points : [];
     if (points.length === 0) {
       return '<div style="padding:10px 12px;background:#fff8e6;border:1px solid #ffe0a3;' +
         'border-radius:6px;color:#8a5a00;">该课程当前没有可用的通知时间点，请先到' +
         '「系统配置 → 通知规则」配置。</div>';
     }
     let rows = '';
     points.forEach(function (p) {
       const color = notifyStateColor(p.state);
       rows += '<tr>' +
         '<td style="padding:6px 8px;border-bottom:1px solid #eef1f5;">第' + p.seq + '档 · ' +
           escapeRefundText(p.stageText || '') + '</td>' +
         '<td style="padding:6px 8px;border-bottom:1px solid #eef1f5;">提前 ' +
           escapeRefundText(p.offsetText || '') + '</td>' +
         '<td style="padding:6px 8px;border-bottom:1px solid #eef1f5;">' +
           escapeRefundText(p.expectTime || '-') + '</td>' +
         '<td style="padding:6px 8px;border-bottom:1px solid #eef1f5;color:' + color + ';">' +
           escapeRefundText(p.stateText || '-') + '</td>' +
         '</tr>';
     });
     return '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
       '<thead><tr style="background:#f6f8fa;color:#5a6472;">' +
       '<th style="padding:6px 8px;text-align:left;font-weight:600;">档位</th>' +
       '<th style="padding:6px 8px;text-align:left;font-weight:600;">提前量</th>' +
       '<th style="padding:6px 8px;text-align:left;font-weight:600;">应发时刻</th>' +
       '<th style="padding:6px 8px;text-align:left;font-weight:600;">状态</th>' +
       '</tr></thead><tbody>' + rows + '</tbody></table>';
   }

   /**
    * 「发送上课提醒」弹窗。
    *
    * 先把该课次的通知计划摆出来（发哪几档、哪档已发、哪档已过期），
    * 再让管理员点「立即发送」。发送结果就地回显并且**不关闭**弹窗 ——
    * 手动发送可重复，管理员常常要确认「刚才那条到底发出去没有」。
    */
   function showLessonNotifyDialog(plan, appointmentId) {
     return new Promise(function (resolve) {
       const mask = document.createElement('div');
       mask.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
         'background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:10000;';

       const box = document.createElement('div');
       box.style.cssText = 'width:92%;max-width:560px;background:#fff;border-radius:8px;padding:20px 22px;' +
         'box-shadow:0 6px 24px rgba(0,0,0,0.18);font-size:14px;color:#2c3542;';

       let head = '<div style="display:flex;justify-content:space-between;align-items:center;' +
         'border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:12px;">' +
         '<div style="font-weight:600;font-size:15px;">发送上课提醒</div>' +
         '<span id="lessonNotifyClose" style="cursor:pointer;color:#999;font-size:16px;">✕</span></div>';

       let body = '';
       if (plan) {
         body += '<div style="line-height:1.9;margin-bottom:10px;">';
         if (plan.courseName) {
           body += '<div>课程：<b>' + escapeRefundText(plan.courseName) + '</b></div>';
         }
         if (plan.lessonTime) {
           body += '<div>上课时间：<b>' + escapeRefundText(plan.lessonTime) + '</b></div>';
         }
         body += '<div style="font-size:12px;color:#8a94a6;">生效规则：' +
           escapeRefundText(plan.scopeText || '-') + '</div></div>';
         if (plan.fallbackNotice) {
           body += '<div style="margin-bottom:10px;font-size:12px;color:#c0871b;">' +
             escapeRefundText(plan.fallbackNotice) + '</div>';
         }
       } else {
         body += '<div style="padding:10px 12px;background:#fff8e6;border:1px solid #ffe0a3;' +
           'border-radius:6px;color:#8a5a00;margin-bottom:10px;">未能获取该课次的通知计划' +
           '（可能是网络问题或课次已被处理）。仍可尝试直接发送。</div>';
       }

       body += '<div id="lessonNotifyPlan">' + renderNotifyPlanRows(plan) + '</div>';

       body += '<div style="margin-top:12px;padding:9px 12px;background:#f6f8fa;border:1px solid #e3e8ee;' +
         'border-radius:6px;font-size:12px;color:#5a6472;line-height:1.8;">' +
         '手动发送由服务端按「当前距上课还有多久」自动选定档位，不受自动发送的幂等限制，可重复发送。' +
         '已过上课时间的课次不再发送（过期档位不补发）。</div>';

       body += '<div id="lessonNotifyResult" style="display:none;margin-top:12px;padding:9px 12px;' +
         'border-radius:6px;font-size:13px;line-height:1.7;"></div>';

       const foot = '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">' +
         '<button id="lessonNotifyCancel" class="btn btn-default" ' +
         'style="padding:8px 16px;border:1px solid #d9dee5;background:#fff;border-radius:4px;cursor:pointer;">关闭</button>' +
         '<button id="lessonNotifySend" class="btn btn-primary" ' +
         'style="padding:8px 16px;border:1px solid #1a6fd4;background:#1a6fd4;color:#fff;border-radius:4px;cursor:pointer;">' +
         '立即发送提醒</button></div>';

       box.innerHTML = head + body + foot;
       mask.appendChild(box);
       document.body.appendChild(mask);

       function done() {
         if (mask.parentNode) mask.parentNode.removeChild(mask);
         document.removeEventListener('keydown', onKey);
         resolve(true);
       }
       function onKey(e) { if (e.key === 'Escape') done(); }

       const resultBox = box.querySelector('#lessonNotifyResult');
       function showResult(ok, text) {
         resultBox.style.display = 'block';
         resultBox.style.background = ok ? '#f2fbf3' : '#fdf3f2';
         resultBox.style.border = '1px solid ' + (ok ? '#bfe3c2' : '#f2c8c4');
         resultBox.style.color = ok ? '#2f6b34' : '#b0342a';
         resultBox.textContent = text;
       }

       const sendBtn = box.querySelector('#lessonNotifySend');
       sendBtn.addEventListener('click', async function () {
         sendBtn.disabled = true;
         sendBtn.style.opacity = '0.6';
         sendBtn.textContent = '发送中…';
         try {
           const r = await sendNotifyManual(appointmentId);
           showResult(true, '已发送「' + (r && r.stageText ? r.stageText : '提醒') + '」' +
             (r && r.offsetText ? '（提前 ' + r.offsetText + '）' : '') +
             '，接收人：' + (r && r.audienceText ? r.audienceText : '-'));
           // 重取计划，把刚发出去的这一档标成「已发送」
           const fresh = await fetchNotifyPlan(appointmentId);
           if (fresh) box.querySelector('#lessonNotifyPlan').innerHTML = renderNotifyPlanRows(fresh);
         } catch (e) {
           console.error('sendNotifyManual', e);
           showResult(false, '发送失败：' + notifyErrText(e));
         } finally {
           sendBtn.disabled = false;
           sendBtn.style.opacity = '1';
           sendBtn.textContent = '再次发送';
         }
       });

       box.querySelector('#lessonNotifyCancel').addEventListener('click', done);
       box.querySelector('#lessonNotifyClose').addEventListener('click', done);
       mask.addEventListener('click', function (e) { if (e.target === mask) done(); });
       document.addEventListener('keydown', onKey);
     });
   }

   /**
    * 「上课通知」页行内入口：打开提醒弹窗，关闭后刷新列表
    * （手动发送不改 appointment.status，刷新只是为了刷新按钮可见性）。
    */
   async function openLessonNotifyDialog(appointmentId) {
     const plan = await fetchNotifyPlan(appointmentId);
     await showLessonNotifyDialog(plan, appointmentId);
   }

   //显示待确认预约
 async function showAppointmentList(appointmentList,id){
    //   const id = "pending-reservations";

    if (!Array.isArray(appointmentList) || appointmentList.length === 0) {
        const bookingContainer0 = document.getElementById(id);
        if (bookingContainer0) bookingContainer0.innerHTML = '';
        return;
    }

    // —— 缓存：避免同一 bookingId / scheduleId / courseId / userId 重复请求 ——
    const bookingCache  = new Map();
    const scheduleCache = new Map();
    const courseCache   = new Map();
    const userCache     = new Map();
    const getBookingCached  = (bid) => bookingCache.has(bid)  ? bookingCache.get(bid)  : (bookingCache.set(bid,  getBookingObject(bid).catch(() => null)),       bookingCache.get(bid));
    const getScheduleCached = (sid) => scheduleCache.has(sid) ? scheduleCache.get(sid) : (scheduleCache.set(sid, fetchSchedule(sid).catch(() => null)),            scheduleCache.get(sid));
    const getCourseCached   = (cid) => courseCache.has(cid)   ? courseCache.get(cid)   : (courseCache.set(cid,   getCourseById(cid).catch(() => null)),              courseCache.get(cid));
    const getUserCached     = (uid) => userCache.has(uid)     ? userCache.get(uid)     : (userCache.set(uid,     getUserNameById(uid).catch(() => 'n/a')),         userCache.get(uid));

    // —— 单条 appointment 处理：内部依赖链 booking→schedule→{course,student,teacher} ——
    //   schedule 之后的 3 个调用互相独立，用 Promise.all 并行
    async function processOne(appointment, idx) {
        const bookedObject = await getBookingCached(appointment.bookingId);
        if (!bookedObject) return null;

        const scheduleObject = await getScheduleCached(bookedObject.scheduleId);
        if (!scheduleObject) return null;

        // 三个独立调用并行
        const [classObject, studentName, teacherName] = await Promise.all([
            getCourseCached(scheduleObject.courseId),
            getUserCached(bookedObject.studentId),
            getUserCached(bookedObject.teacherId)
        ]);
        if (!classObject) return null;

        return {
            index: idx,
            scheduleId:    scheduleObject.scheduleId,
            origTz:        scheduleObject.timeZone,
            appointmentId: appointment.id,
            bookingId:     bookedObject.bookingId || bookedObject.id,
            className:     classObject.courseName,
            classIndex:    appointment.classIndex,
            studentName:   studentName,
            teacherName:   teacherName,
            studentId:     bookedObject.studentId,
            teacherId:     bookedObject.teacherId,
            appointmentTime: appointment.appointmentDatetime ? appointment.appointmentDatetime.replace('T', ' ') : '',
            status:        appointment.status
        };
    }

    // —— 多条 appointment 之间互相独立，整体并行；index 用序号保证顺序 ——
    const baseIndex = (Pagination.pageNum - 1) * Pagination.pageSize;
    const tasks = appointmentList.map((apt, i) => processOne(apt, baseIndex + i + 1));
    const results = await Promise.all(tasks);

    // 按原顺序拼装 HTML
    let pendingBookingsHtml = '';
    const isTeacher = (typeof userRole !== 'undefined' && userRole === 'teacher');

    if (isTeacher) {
        // teacher 端：同一排期（scheduleId）+ 同一上课日期 的课次聚合为一行；不同日期的排期不合并。
        // getScheduleCached / getUserCached 已按 id 缓存，同一排期只 fetchSchedule 一次。
        const groupMap = new Map();
        for (const cardItems of results) {
            if (!cardItems) continue;
            const datePart = cardItems.appointmentTime ? cardItems.appointmentTime.slice(0, 10) : '';
            const gKey = cardItems.scheduleId + '|' + datePart;
            if (!groupMap.has(gKey)) groupMap.set(gKey, []);
            groupMap.get(gKey).push(cardItems);
        }
        // 组内最早上课时间，用于合并后按预约时间升序
        const minTimeOf = (items) => {
            let m = '';
            for (const it of items) { if (it.appointmentTime && (!m || it.appointmentTime < m)) m = it.appointmentTime; }
            return m;
        };
        const groups = Array.from(groupMap.values()).sort((a, b) => {
            const ta = minTimeOf(a), tb = minTimeOf(b);
            return ta < tb ? -1 : (ta > tb ? 1 : 0);
        });
        // 客户端分页：teacher 已取回全部课次，按聚合后的行数回填空分页总数/页数
        const totalGroups = groups.length;
        Pagination.total = totalGroups;
        Pagination.totalPages = Math.ceil(totalGroups / Pagination.pageSize) || 0;
        // 注意：totalPages setter 会把下面的 pageNum 钳制回合法范围，故 start 须在设置后取
        const start = (Pagination.pageNum - 1) * Pagination.pageSize;
        const pageGroups = groups.slice(start, start + Pagination.pageSize);
        let gi = start;
        for (const items of pageGroups) {
            gi++;
            pendingBookingsHtml += formAppointmentGroupTr(items, gi);
        }
    } else {
        for (const cardItems of results) {
            if (cardItems) pendingBookingsHtml += formAppointmentTr(cardItems);
        }
    }

    //if(appointmentList.length === 0)  {
    //  pendingBookingsHtml +="<div> 近7日内没有课程</div>";
    //}

    const bookingContainer = document.getElementById(id);
    if (bookingContainer) {
        bookingContainer.innerHTML = ` ${pendingBookingsHtml}`;
        applyTerms(bookingContainer);
    }
   }
   //检查status，只有待确认的booking、cancelling才显示待确认，并显示相应的按钮 3天、1天前、当天
   function checkAppointmentStatus(status) {
    if (status === 'active' ) {
      return '正常';
    } else   if   (status === 'noted1') {
      // noted1 / noted2 是「通知标记寄存在业务状态字段里」那个时期的遗留值，现在不再产生
      // （通知记录已迁到 notification_dispatch_log 流水表）。保留展示仅为历史数据可读。
      return notifyLegacyNotedText(1);
    }  else   if   (status === 'noted2') {
      return notifyLegacyNotedText(2);
    } else   if   (status === 'completed') {
      return '完成';
    } else   if   (status === 'cancelling' || status === 'canceling') {
      return '取消待确认';
    } else if   (status === 't-cancelling') {
      return '教师申请取消';
    } else if (status === 'booked') {
      return '预约已确认';
    } else if (status === 'waiting') {
      // 候补预订（名额已满时的候补申请）
      return '候补';
    } else if (status === 'cancelled' || status === 'canceled') {
      return '已取消';
    } else if (status === 'deleted') {
      return '已删除';
    } else if (status === 't-reject' ) {
      return '已拒绝(T)';
    }else if (status === 'reject' ) {
      return '已拒绝';
    }
    return status;
   }
   function formAppointmentTr(cardInfo) {
      //console .log("cardInfo:", cardInfo);
     const info = `
          <tr>
              <td>   ${cardInfo.index}</td>
              <td   style="display:none;">${cardInfo.bookingId}</td>         
              <td>  ${cardInfo.className}  ${cardInfo.classIndex}  </td>
              <td>   ${cardInfo.studentName}</td>
              <td>   ${cardInfo.teacherName}</td>
              <td>   ${cardInfo.appointmentTime} ${cardInfo.origTz}</td>
              <td>    ${checkAppointmentStatus(cardInfo.status)}</td>
              <td class="course-info">
                ${ (userRole == "admin" && isNotifyActionable(cardInfo.status)) ?
                  `   <button class="btn btn-success" onclick='openLessonNotifyDialog(${cardInfo.appointmentId})'><i class="fa fa-bell"></i> 发送提醒</button> `
                  : ` `
              }
              ${ (userRole == "admin" && cardInfo.status=="cancelling")?
                 `   <button class="btn btn-success" onclick='adminConfirmCancelWithRule(${cardInfo.appointmentId})'>确认</button>  
                     <button class="btn btn-success" onclick='confirmCancellingAppointment(${cardInfo.appointmentId},false)'>取消</button>  
                     `
                  : ` `
              }

                            ${ (userRole == "admin")?
                 `   <button class="btn btn-warning" onclick='deleteAppointmentsById(${cardInfo.appointmentId})'>删除</button>                    
                     <button class="btn btn-warning" onclick='deleteAppointmentsByBookingId(${cardInfo.bookingId})'>全部删除</button>                    
                     `
                  : ` `
              }
              

              ${ (userRole == "admin" && cardInfo.status=="t-cancelling")?
                `   <button class="btn btn-success" onclick='teacherConfirmCancellingAppointment(${cardInfo.appointmentId},true)'>确认</button>  
                    <button class="btn btn-success" onclick='teacherConfirmCancellingAppointment(${cardInfo.appointmentId},false)'>取消</button>  
                    `
                 : ` `
             }
             ${ (userRole == "student" && cardInfo.status=="cancelling")?
              `   <button class="btn btn-success" onclick='setApointmentStatusAndReload(${cardInfo.appointmentId},"active")'>撤回申请</button>                    
                  `
               : ` `
           }
             ${ (userRole == "student" && cardInfo.status !="cancelling")?
              `   <button class="btn btn-success" onclick='studentApplyCancelWithRule(${cardInfo.appointmentId})'>${termText('leave')}</button>                    
                  `
               : ` `
           } 
            ${ (userRole == "teacher" && cardInfo.status=="t-cancelling")?
              `   <button class="btn btn-success" onclick='setApointmentStatusAndReload(${cardInfo.appointmentId},"active")'>撤回申请</button>                    
                  `
               : ` `
           }
             ${ (userRole == "teacher" && cardInfo.status !="t-cancelling")?
              `   <button class="btn btn-success" onclick='setApointmentStatusAndReload(${cardInfo.appointmentId},"t-cancelling")'>${termText('leave')}</button>                    
                  `
               : ` `
           } 
              </td>
              </tr>
     `; 
     return info;
  } 

  // teacher 端「今日课程」按排期聚合成一行：同一排期只取一次课程/时间，组内所有 studentId
  // 解析出的学生名拼成「、」串并附「共 N 人」；操作改为查看排期（drill-down 到排期详情再逐课次管理）。
  function formAppointmentGroupTr(items, groupIndex) {
      if (!Array.isArray(items) || items.length === 0) return '';
      const first = items[0];

      // 学生名去重后按「、」拼接
      const names = [];
      for (const it of items) {
          if (it.studentName && !names.includes(it.studentName)) names.push(it.studentName);
      }
      const studentStr = names.join('、') + `（共 ${items.length} 人）`;

      // 状态聚合：同一排期课次状态通常一致，若有差异并列展示
      const statusSet = [];
      for (const it of items) {
          const s = checkAppointmentStatus(it.status);
          if (!statusSet.includes(s)) statusSet.push(s);
      }
      const statusStr = statusSet.join('、');

      // 整组课次的 appointmentId / bookingId（用于「改期」批量操作与下钻预览）
      const aptIds = items.map(it => it.appointmentId).filter(x => x != null && x !== '');
      const bIds   = items.map(it => it.bookingId).filter(x => x != null && x !== '');
      const pending = items.some(it => it.status === 't-cancelling' || it.status === 'cancelling');
      const rescheduleBtn = pending
          ? `<button class="btn btn-warning" onclick='teacherRescheduleTodayGroup(${JSON.stringify(aptIds)}, false)'>取消改期</button>`
          : `<button class="btn btn-warning" onclick='teacherRescheduleTodayGroup(${JSON.stringify(aptIds)}, true)'>申请改期</button>`;

      return `
          <tr>
              <td>   ${groupIndex}</td>
              <td   style="display:none;"></td>
              <td>  ${first.className}  ${first.classIndex}  </td>
              <td>   ${studentStr}</td>
              <td>   ${first.teacherName}</td>
              <td>   ${first.appointmentTime} ${first.origTz}</td>
              <td>    ${statusStr}</td>
              <td class="course-info">
                ${rescheduleBtn}
                             </td>
              </tr>
       `;
  }
//
// ${ (typeof previewSchedule === 'function') ?
 //                 `   <button class="btn btn-success" onclick='previewSchedule("${first.scheduleId}","${first.origTz}",${JSON.stringify(bIds)})'><i class="fa fa-calendar"></i> 查看排期</button> `
 //                 : ` `
  //            }
  // ------------------------------------------------------------------------
  // 【已移除】checkStatusAndDate / sendNotesToUsers / sendNotesToTeacher / sendNotesToStudent
  // ------------------------------------------------------------------------
  // 这一段原先是「前端自己算提前量 → 自己拼文案 → 自己翻 appointment.status」的实现：
  //   · 时间判定用浏览器 new Date()，与排期 timeZone 不一致，且客户端时钟可改；
  //   · 文案里的「3天后有课」是写死的，改了通知规则也不会生效；
  //   · 最终只调用了空函数 sendNotesTo()，消息从未真正发出，
  //     noted1/noted2 只是状态翻转留下的痕迹，却还占着只有两个位置的通知标记。
  // 现在由服务端统一接管：NotifyDispatchService 定时扫描 + notification_dispatch_log 幂等
  // + message-service 落库推送；管理端手动补发走 openLessonNotifyDialog()。

//根据bookingId查询预约时间列表--List <Appointment>->List {date:date,time:time }
 async function getAppointmentsByBookingId( bookingId) {
 
  try {       
      const res  = await request(
          {url:`${API_BASE_URL}/course/appointment/getByBookingId`,  
          method:"get",
          params:{ bookingId:bookingId } // 筛选条件通过params传递
      });
      const results =   res ;
      if (Array.isArray(results)) {
          appointmentResults = results.map(item => {
            let date = "";
            let time = "";
            if (item.appointmentDatetime) {
              // 兼容 'YYYY-MM-DD HH:mm' 或 'YYYY-MM-DDTHH:mm'
              const dtString = item.appointmentDatetime.replace('T', ' ');
              const [d, t] = dtString.split(' ');
              date = d;
              time = t;
            }
            return {
              id  : item.id,
              date: date,
              time: time,
              status: item.status
            };
          });
        } else {
          appointmentResults = [];
        }
      return appointmentResults;
  } catch (e) {
      console.error(e);
      return [];
  }
}


async function saveAppointment( appointdata) { 
  // 分析参数传递是否正确
  // 正确写法：axios.post(url, data, config)
  // 原代码把headers和params放在了data里，实际上应该放在第三个参数
  try {
      // Axios POST请求 
      const res  =await request({
           url:`${API_BASE_URL}/course/appointment/add`,
           method:"post",
           data:  appointdata   // appointdata 在这里作为POST请求体body传递 
          });
         return  res; 
  } catch (e) {
      //alert("网络错误，获取课程列表失败");
      console.error(e);
      return   false;
  }
}
async function setApointmentStatusAndReload(appointmentId,status){
   await operateAppointmentStatus(appointmentId,status);
  loadAndShowAppointmentPage();
}
//设置一个预约时间的状态--学生提出
async function cancellingAppointment(appointmentId,bCancelling){
  let status="";
  if(bCancelling){
     status= "cancelling";
  } else {
     status= "active";
  }
 await setApointmentStatusAndReload(appointmentId,status);//courseAndBooking.js
 return ;
}

//教师、管理员提出的确认或拒绝
async function confirmCancellingAppointment(appointmentId,bCancelled){
  let status="";
  if(bCancelled){
     status= "cancelled";
  } else {
     status= "reject";
  }
 await setApointmentStatusAndReload(appointmentId,status);//courseAndBooking.js
 return ;
}

//教师申请延期与撤回
async function teacherCancellingAppointment(appointmentId,bCancelling){
  let status="";
  if(bCancelling){
     status= "t-cancelling";
  } else {
     status= "active";
  }
 await setApointmentStatusAndReload(appointmentId,status);//courseAndBooking.js
 return ;
}

//对教师延期申请的确认或拒绝
async function teacherConfirmCancellingAppointment(appointmentId,bCancelled){
  let status="";
  if(bCancelled){
     status= "t-cancelled";
  } else {
     status= "t-reject";
  }
 await setApointmentStatusAndReload(appointmentId,status);//courseAndBooking.js
 return ;
}
// teacher 端：对一组/一次课次批量「申请改期」(t-cancelling) 或「取消改期」(active)
async function bulkSetAppointmentStatus(aptIds, status) {
    if (!Array.isArray(aptIds) || aptIds.length === 0) return;
    for (const id of aptIds) {
        if (id != null && id !== '') await operateAppointmentStatus(id, status);
    }
}
// 「今日课程」聚合行：整组课次批量改期，成功后刷新今日课程列表
async function teacherRescheduleTodayGroup(aptIds, bApply) {
    await bulkSetAppointmentStatus(aptIds, bApply ? 't-cancelling' : 'active');
    if (typeof loadAndShowAppointmentPage === 'function') loadAndShowAppointmentPage();
}
window.bulkSetAppointmentStatus = bulkSetAppointmentStatus;
window.teacherRescheduleTodayGroup = teacherRescheduleTodayGroup;

//根据bookingId更新所有相关的预约时间状态
async function updateAppointmentsStatusByBookingId( bookingId,status) { 
  try {
      // 注意：后端接口 @RequestParam 需要参数在 params/query，不应放在 body
      // 必须通过 params 配置传递 bookingId 和 status，否则会报“Required request parameter 'bookingId' is not present”
      // PUT无body，参数全部通过params
      const res = await request({url: `${API_BASE_URL}/course/appointment/updateStatusByBookingId`, 
             method:"put",
              params: { bookingId: bookingId, status: status }
          }
      ); 
      console.info("appointments:", res );  
          return res  ;  
  } catch (e) {        
      console.error(e);
      return false;
  }
}
async function deleteAppointmentsByBookingId(bookingId) { 
  if (!bookingId) {
    console.error("deleteAppointmentsByBookingId: bookingId is required");
    return false;
  }
  try {
    // 检查参数传递，bookingId 通过 params 传递，method 必须为 delete
    const res = await request({
      url: `${API_BASE_URL}/course/appointment/deleteByBookingId`,
      method: "delete",
      params: { bookingId: bookingId } // 参数名称需与后端一致
    });
    return res;
  } catch (e) {
    console.error(e);
    return false;
  }
}

async function deleteAppointmentsById( appId) { 
  try {
      // Axios GET请求（修复response.json()错误，Axios已自动解析）
      const res  = await request({url:`${API_BASE_URL}/course/appointment/delete/${appId}`,
           method:"delete"
      });
        return res ; 
  } catch (e) {
      //alert("网络错误，获取课程列表失败");
      console.error(e);
      return   false;
  }
}

/////////////////////////////////////////////////////2026-7-1 /////////////////////////////////////////////////////
/*
 * ================================ Token 前后端协同原理简述 ================================
 * 
 * 1. Token是什么？
 *    Token（令牌）一般指JWT（JSON Web Token），是一种前后端分离应用中常用的身份认证机制。
 *    后端通过签发Token给登录用户，Token中包含用户ID、角色等信息，并用密钥签名防篡改。
 *    前端拿到Token后，在后续请求中携带该Token，实现"无状态"的身份认证。
 * 
 * 2. 协同流程
 *    （1）登录阶段：
 *       - 前端调用登录API（如 /login），后端验证用户名密码，验证通过后生成Token（带过期时间），返回给前端。
 *    （2）携带Token访问API：
 *       - 前端收到Token后，通常以 "Bearer {token}" 形式放入每次API请求的Header（如 Authorization 字段）。
 *    （3）后端校验Token：
 *       - 后端拦截API请求，提取并校验Token是否合法、是否过期，再确定用户身份。Token有效则放行，无效则返回未授权。
 *    （4）前端Token管理：
 *       - 前端可把Token保存在localStorage、sessionStorage等，每次需要访问受保护API时取出Token携带。Token过期后需重新登录获取。
 * 
 * 3. 典型代码参考（发送请求时携带Token）：
 *    (假设已拿到token变量)
 *    await request({
 *        url: API_BASE_URL + "/some/protected/api",
 *        method: "get",
 *        headers: {
 *           Authorization: "Bearer " + token
 *        }
 *    });
 * 
 * 4. 如何安全协同？
 *    - Token一般不建议长期存储在cookie中（防止XSS/CSRF漏洞），推荐存在localStorage/sessionStorage，仅每次请求时在header中携带。
 *    - 后端只信任自己签发且尚未过期的Token，且保证签名密钥安全不可泄露。
 *    - 未携带或非法Token的请求应被拦截（如通过Spring Security等机制）。
 * 
 * 5. Token用途拓展
 *    - 携带角色信息，后端根据token自动鉴权（如区分管理员与普通用户）。
 *    - 支持单点登录、刷新token机制、"登出"直接令前端删除本地token。
 * 
 * 总结：Token是现代Web应用前后端分离情况下实现身份认证和权限控制的核心手段之一，能让前端在无需保存会话的情况下参与安全通信，且提高了扩展性和安全性。
 */
// INSERT_YOUR_CODE
/**
 * 后端验证 Token 合法性的大致流程如下：
 * 
 * 1. 获取 Token：后端读取 HTTP 请求头（通常是 Authorization 字段，内容类似 "Bearer xxx.yyy.zzz"）。
 * 
 * 2. 校验签名：使用后端保存的签名密钥，对客户端传来的 Token 进行解码，并验证其签名是否合法、是否被篡改。
 *    （比如使用 jjwt、java-jwt 等库。密钥通常只在后端保存，前端无法伪造签名）
 * 
 * 3. 校验过期时间：解码后的 JWT payload 中包含 exp 字段，后端检查当前时间是否在有效时间范围（如果 Token 已过期则拒绝）
 * 
 * 4. 校验格式/内容：比如检查 Token 的类型、Payload 是否完整（用户ID、角色等信息），有无黑名单等。
 * 
 * 典型后端验证伪代码（Java/Spring 示例，见 JwtUtil.java）：
 * 
 *  String token = ... // 从请求头获取
 *  Claims claims = Jwts.parserBuilder()
 *      .setSigningKey(signingKey)         // 设置签名密钥
 *      .build()
 *      .parseClaimsJws(token)             // 解析与验证token
 *      .getBody();
 *  // 验证过期时间
 *  Date expirationDate = claims.getExpiration();
 *  if (expirationDate.before(new Date())) {
 *      // Token已过期
 *  }
 *  // 可附加更多校验如用户状态/权限等
 * 
 * 结论：只有签名有效且未过期的 Token，后端才认为是“合法”的，进而确认当前访问用户身份和权限。
 */


/* ============================================================
 * 「今日课程」页顶部：候补申请提示条（学生）
 * ------------------------------------------------------------
 * 为什么不做成「状态」下拉里的一个选项（2026-09-11 核查结论）：
 *   本页数据源是 appointment 表（已生成的课次），查询时按 Appointment::getStatus 过滤；
 *   而 waiting 是 booking 的状态，候补**不生成** appointment 行
 *   （appointment 只有 asgn_student / appointment/add 两个写入入口），
 *   因此在下拉里加 waiting 会是个恒返回 0 行的死选项，还会把两套状态机混进同一个下拉。
 *   所以候补在这里做提示条，完整清单交给「我的预订」页（那里有筛选与状态展示）。
 * ============================================================ */
async function renderWaitlistBanner() {
    const banner = document.getElementById('waitlist-banner');
    if (!banner) return false;            // 容器不在（非今日课程页 / 已被卸载）

    // 仅学生：管理员/教师看的是本租户或自己名下的课次，与候补无关
    if (typeof userRole === 'undefined' || userRole !== 'student'
        || typeof userId === 'undefined' || !userId) {
        banner.style.display = 'none';
        banner.innerHTML = '';
        return false;
    }

    let waitList = [];
    try {
        waitList = await request({
            url: `${API_BASE_URL}/course/booking/list`,
            method: 'post',
            // 由服务端按 status 过滤（BookingMapper.selectByCondition），不必把全部预订拉回来再筛
            data: { userRole: 'student', userId: userId, status: 'waiting' }
        }) || [];
    } catch (e) {
        console.error('renderWaitlistBanner: 查询候补申请失败', e);
        waitList = [];
    }

    if (!Array.isArray(waitList) || waitList.length === 0) {
        // 无候补：隐藏并清空，避免残留上一次的文案（切换账号/切换菜单后尤其明显）
        banner.style.display = 'none';
        banner.innerHTML = '';
        return false;
    }

    // 明细最多展示 3 条；排期取不到（已删除/已收回）就跳过该条，不让整条提示失败
    const MAX_DETAIL = 3;
    const details = await Promise.all(waitList.slice(0, MAX_DETAIL).map(async function (b) {
        try {
            const scd = await fetchSchedule(b.scheduleId);
            if (!scd) return '';
            const when = [scd.startDate, scd.startTime].filter(Boolean).join(' ');

            // 排队次序：由该排期的候补队列（按申请时间升序）现算，不落库、不进状态。
            // 有人撤销或递补后次序自动前移，不需要批量重排——次序是计算值而非状态。
            let queueText = '';
            try {
                const queue = await fetchWaitlistQueue(b.scheduleId);
                const idx = queue.findIndex(function (x) { return x.bookingId === b.bookingId; });
                if (idx >= 0) {
                    queueText = '第 ' + (idx + 1) + '/' + queue.length + ' 位';
                }
            } catch (e) {
                queueText = '';
            }

            const head = [scd.name || '', when].filter(Boolean).join(' ');
            return [head, queueText].filter(Boolean).join(' · ');
        } catch (e) {
            return '';
        }
    }));
    const shown = details.filter(Boolean);
    const rest = waitList.length - shown.length;

    banner.innerHTML =
        '<i class="fa fa-clock-o" style="font-size:16px;"></i>'
        + '<span>候补排队中：你有 <b>' + waitList.length + '</b> 条候补申请'
        + (shown.length ? '（' + shown.join('；') + (rest > 0 ? '，另有 ' + rest + ' 条' : '') + '）' : '')
        + '</span>'
        + '<span style="color:#a06a00;font-size:12px;">有名额释放后由管理员按排队次序递补，递补成功会发消息通知你</span>'
        + '<button class="btn btn-default" onclick="goToStudentMyBooking()">查看我的预订</button>';
    banner.style.display = 'flex';
    return true;
}

// 跳到学生端「我的预订」菜单（候补在那里有完整的筛选与状态展示）
function goToStudentMyBooking() {
    const item = document.querySelector('.menu-item[key="my_booking"]');
    if (item) { item.click(); return true; }   // 复用页面自身的菜单点击逻辑（高亮/标题/加载内容）
    if (typeof window.loadAdminPageContent === 'function') {
        window.loadAdminPageContent('my_booking');
        return true;
    }
    return false;
}

window.renderWaitlistBanner = renderWaitlistBanner;
window.goToStudentMyBooking = goToStudentMyBooking;

// 退改规则提示相关（按钮 onclick 里按名字调用，显式挂到 window 防止将来被包进 IIFE）
window.fetchRefundHintForAppointment = fetchRefundHintForAppointment;
window.showRefundRuleDialog = showRefundRuleDialog;
window.studentApplyCancelWithRule = studentApplyCancelWithRule;
window.adminConfirmCancelWithRule = adminConfirmCancelWithRule;

 