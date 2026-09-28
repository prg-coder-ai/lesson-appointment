// 学生端——课程预订管理页面（student-bookingCards.js）
// 全局变量 userId/userRole/userTimeZone 等来自 api.js

userTimeZoneDisplay = "none";
document.write('<script src="/js/public/pagefoot.js"></script>');

// 课程是否已有「已发布排期」的会话内缓存：课程卡片每次重渲染都需判断，
// 避免对同一课程反复请求排期列表（fetchScheduleList 是网络请求，N 门课程时尤其明显）。
const _courseSchedulePublishCache = new Map();

/* ============================================================================
 * 「剩余员额」的显示口径与判定口径（2026-09-28）
 *
 * 显示：剩余员额 <= 0 时显示「满额」，其余显示数字。
 * 判定：isScheduleFull() / applyBookingButtons() 仍需拿到**数值**来决定是否放出候补按钮。
 *
 * 两者必须分开存，否则会互相打架：
 *   - <input type="number"> 不收非数字文本 → 写「满额」会被浏览器静默丢弃（所以改成了 text）；
 *   - 若把「满额」当数值去 Number() → NaN → `Number.isFinite(NaN)` 为 false →
 *     被判定成「未满」→ 满员时候补按钮反而不出现（原缺陷的翻版）。
 * 故：显示文案写 value，数值另存 data-remaining，回读一律优先 data-remaining。
 * 三个函数定义在文件顶层（而非渲染函数内），便于被 tests 直接覆盖。
 * ========================================================================== */
const FULLY_BOOKED_TEXT = '满额';

/** 剩余员额 → 展示文案；''/null/undefined/非有限数 一律按「未知」返回空串（不伪装成 0） */
function formatRemainingSites(remainingSites) {
    if (remainingSites === null || remainingSites === undefined || remainingSites === '') return '';
    const n = Number(remainingSites);
    if (!Number.isFinite(n)) return '';
    return n > 0 ? String(n) : FULLY_BOOKED_TEXT;
}

/** 把剩余员额写进只读展示框：文案 + 数值载体(data-remaining) + 满额样式(site-full) */
function applyRemainingSitesDisplay(el, remainingSites) {
    if (!el) return;
    const text = formatRemainingSites(remainingSites);
    el.value = text;
    if (el.dataset) {
        el.dataset.remaining = (text === '') ? '' : String(Number(remainingSites));
    }
    if (el.classList) {
        el.classList.toggle('site-full', text === FULLY_BOOKED_TEXT);
    }
}

/** 从 DOM 回读剩余员额：优先数值载体 data-remaining，其次才用显示文案 */
function readRemainingSitesFromDom() {
    const el = document.getElementById('now_availableSites');
    if (!el) return null;
    const raw = el.dataset ? el.dataset.remaining : undefined;
    if (raw !== undefined && raw !== '') return raw;
    return el.value;
}

// 导出给自动化测试使用（渲染函数本身在块内，未调用前拿不到其内部函数）
window.formatRemainingSites = formatRemainingSites;
window.applyRemainingSitesDisplay = applyRemainingSitesDisplay;
window.readRemainingSitesFromDom = readRemainingSitesFromDom;

/**
 * 渲染课程预订管理页面
 * 对于学生，仅显示已发布的课程（status=active）
 */
async function renderStudentBookingCards() {
    // 指定列表加载函数（翻页/改每页条数时的取数回调）。
    // loadAndRenderCourse_student 是下方代码块内的「块级函数声明」，在 strict / 打包后环境下
    // 仅在该块内可见，本行（块外）直接引用会抛 ReferenceError。故注册一个闭包包装器：翻页时才
    // 去读已经挂到 window 上的真实函数（window.loadAndRenderCourse_student 由本函数末尾统一
    // 赋值，渲染完成前必然已就绪），既保证首次渲染即注册回调，又始终指向当前最新闭包。
    assignLoadobjectListFunction(function reloadCourseList_student() {
        if (typeof window.loadAndRenderCourse_student === 'function') {
            return window.loadAndRenderCourse_student();
        }
    }, 'loadAndRenderCourse_student');
    const dynamicContentCenter = document.getElementById('dynamic-content-center');
    if (!dynamicContentCenter) return;

    let html = '';
    {
        // 「我的时区」换算的会话内序号。
        // 每次切换排期先 +1，异步换算返回时用序号比对：若不等于当前值，说明用户
        // 已经切到别的排期了，本次结果作废（防止慢响应后到、覆盖掉新排期的显示）。
        let bookingTzSeq = 0;

        // 「名额已满」判定的数据源：当前排期的剩余席位数（由 renderSchedule 在算出后写入）。
        // null = 尚未选定排期或尚未算出，此时一律按“未满”处理（不阻断正常预定）。
        let currentRemainingSites = null;
        // 当前用户对当前排期的预订对象（由 renderStudentBookingStatus 写入；null = 无预订）。
        // 供 applyBookingButtons() 判定按钮组合（如已候补时不再显示候补按钮）。
        let currentBookingObj = null;
        // 候补预订按钮是否在“未满员”时也显示。
        // false（默认）：候补只在名额已满时才有意义；置为 true 则任何情况下都显示候补按钮。
        const ALWAYS_SHOW_WAITLIST_BTN = false;
        // 「名额已满」的统一提示文案
        const WAITLIST_TIP = '该排期名额已满，可候补';

        // ===== 结构来自 student.html 的 <template id="tpl-student-booking"> =====

        // template+clone 改造（2026-09-28）：原 159 行 HTML 字符串已搬进 HTML 模板，

        // 这里只负责「取模板 → clone → 填两处动态口（分页骨架 / 时区列显隐）→ 绑事件」。

        const tplEl = document.getElementById('tpl-student-booking');

        if (!tplEl) {

            console.error('[student-bookingCards] 缺少 #tpl-student-booking 模板，课程预订页无法渲染');

            return;

        }

        dynamicContentCenter.replaceChildren(tplEl.content.cloneNode(true));



        // 术语替换：动态注入的内容须在 clone 后补一次，否则 data-term 锚点词不替换（既有缺陷顺手修复）

        if (typeof applyTerms === 'function') applyTerms(dynamicContentCenter);



        // 原 ${getPagebar()} 的落点：分页骨架

        const coursePagebar = document.getElementById('coursePagebar');

        if (coursePagebar && typeof getPagebar === 'function') {

            coursePagebar.innerHTML = getPagebar();

        }

        // 原 style="display:${userTimeZoneDisplay};"：右侧「我的时区」列初始显隐

        const rightBlockEl = document.getElementById('rightBlock');

        if (rightBlockEl) rightBlockEl.style.display = userTimeZoneDisplay;


        // 设置默认结束日期为今天 + 30 天
        const endDateInput = document.getElementById("endDate");
        if (endDateInput) {
            const today = new Date();
            today.setDate(today.getDate() + 30);
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            endDateInput.value = `${year}-${month}-${day}`;
        }

        await loadAndRenderCourse_student();

        // ====== 深链处理：/booking?scdid=&tid=&sid= 落地 ======
        if (window.pendingDeepLink) {
            try {
                await handleStudentDeepLink(window.pendingDeepLink);
            } catch (e) {
                console.error('深链处理异常:', e);
            }
            window.pendingDeepLink = null;
            history.replaceState(null, '', location.pathname);
        }

        // 检索课程（仅 status=active 的已发布课程），按课程名称搜索
        async function loadAndRenderCourse_student() {
            const nameInput = document.getElementById('course-name-input');
            const params = new URLSearchParams({
                pageNum: Pagination.pageNum,
                pageSize: Pagination.pageSize,
                courseName: nameInput ? nameInput.value.trim() : '',
                status: "active"
            });
            try {
                const result = await request({ url: `/course/page?${params.toString()}` });
                if (result) {
                    Pagination.total = result.total;
                    Pagination.totalPages = result.totalPages;
                    courseList = result.rows;
                } else {
                    Pagination.total = 0;
                    Pagination.totalPages = 0;
                    courseList = [];
                }
            } catch (e) {
                courseList = [];
            }

            // 并行判断每门课程是否已发布排期（active），供卡片显隐「待排期，可联系管理员」按钮。
            // 未发布任何排期 → __hasPublishedSchedule=false；否则 true；undefined 表示未判定（按有排期处理）。
            try {
                await Promise.all((courseList || []).map(async (c) => {
                    if (!c || !c.courseId) return;
                    if (_courseSchedulePublishCache.has(c.courseId)) {
                        c.__hasPublishedSchedule = _courseSchedulePublishCache.get(c.courseId);
                        return;
                    }
                    try {
                        const sch = await fetchScheduleList(c.courseId, 'active');
                        const has = Array.isArray(sch) && sch.length > 0;
                        c.__hasPublishedSchedule = has;
                        _courseSchedulePublishCache.set(c.courseId, has);
                    } catch (e) {
                        // 排期列表请求失败：保守视为「无已发布排期」，露出联系管理员入口
                        c.__hasPublishedSchedule = false;
                        _courseSchedulePublishCache.set(c.courseId, false);
                    }
                }));
            } catch (e) {
                // 判定异常不影响课程卡片本身渲染
                console.error('批量判定课程排期发布状态失败:', e);
            }

            renderCourseCards();
        }

        // 把 courseList 渲染为课程卡片网格（替代原下拉框）；点击卡片即选课
        function renderCourseCards() {
            const container = document.getElementById('courseCardList');
            if (!container) return;
            container.innerHTML = '';
            if (!Array.isArray(courseList) || courseList.length === 0) {
                container.innerHTML = '<div style="padding:16px;color:#999;">暂无可选课程</div>';
                renderPagination(Pagination);
                return;
            }
            let index = (Pagination.pageNum - 1) * Pagination.pageSize;
            courseList.forEach(item => {
                if (item.status !== 'active') return;
                index++;
                const card = document.createElement('div');
                card.className = 'course-card';
                card.setAttribute('data-course-id', item.courseId);
                card.style.cssText = 'border:1px solid #e6e6e6;border-radius:8px;padding:12px 14px;cursor:pointer;background:#fff;transition:box-shadow .15s,border-color .15s;';
                card.onmouseenter = () => { if (!card.classList.contains('selected')) card.style.boxShadow = '0 2px 8px rgba(0,0,0,.12)'; };
                card.onmouseleave = () => { if (!card.classList.contains('selected')) card.style.boxShadow = 'none'; };
                card.onclick = () => selectCourse(item.courseId);

                const name = document.createElement('div');
                name.style.cssText = 'font-weight:600;font-size:15px;color:#222;margin-bottom:6px;';
                name.innerText = `${index}. ${item.courseName || '(未命名课程)'}`;
                card.appendChild(name);

                const meta = document.createElement('div');
                meta.style.cssText = 'font-size:12px;color:#888;margin-top:4px;';
                const tags = [];
                if (item.languageType) tags.push(`语言:${item.languageType}`);
                if (item.difficultyLevel) tags.push(`难度:${item.difficultyLevel}`);
                if (item.__hasPublishedSchedule === false) {
                    // 该课程暂未发布任何排期：隐藏「点击查看排期」，改为「待排期，可联系管理员」按钮。
                    // 学生点此打开站内信发送页（默认接收范围=本租户管理员），可编辑诉求后发送。
                    if (tags.length) {
                        const tagLine = document.createElement('div');
                        tagLine.innerText = tags.join('  ·  ');
                        meta.appendChild(tagLine);
                    }
                    const contactBtn = document.createElement('button');
                    contactBtn.type = 'button';
                    contactBtn.className = 'btn btn-default btn-sm';
                    contactBtn.style.cssText = 'margin-top:6px;';
                    contactBtn.innerText = '待排期，可联系管理员';
                    contactBtn.onclick = function (e) {
                        e.stopPropagation();   // 避免触发卡片选中课程
                        contactAdminForSchedule(item.courseId, item.courseName);
                    };
                    meta.appendChild(contactBtn);
                } else {
                    meta.innerText = tags.join('  ·  ') || '点击查看排期';
                }
                card.appendChild(meta);

                if (String(item.courseId) === String(currentCourseId)) {
                    card.classList.add('selected');
                    card.style.borderColor = '#409eff';
                    card.style.boxShadow = '0 0 0 2px rgba(64,158,255,.25)';
                    card.style.background = '#f5faff';
                }
                container.appendChild(card);
            });
            renderPagination(Pagination);
        }

        // 选中课程后把视口滚到「选择排期」这一行（而非整个「排期信息」区块顶部），
        // 让学生一落点就正对着排期下拉框，便于立即选排期。
        function scrollToScheduleSelect() {
            const sel = document.getElementById('scheduleSelect');
            const target = sel ? (sel.closest('.form-line') || sel) : null;
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // 选中某门课程：高亮卡片并加载其排期
        async function selectCourse(courseId, scroll) {
            if (!courseId) return;
            currentCourseId = courseId;
            const cards = document.querySelectorAll('#courseCardList .course-card');
            cards.forEach(c => {
                if (String(c.getAttribute('data-course-id')) === String(courseId)) {
                    c.classList.add('selected');
                    c.style.borderColor = '#409eff';
                    c.style.boxShadow = '0 0 0 2px rgba(64,158,255,.25)';
                    c.style.background = '#f5faff';
                } else {
                    c.classList.remove('selected');
                    c.style.borderColor = '#e6e6e6';
                    c.style.boxShadow = 'none';
                    c.style.background = '#fff';
                }
            });
            await loadSchedule(courseId);
            if (scroll !== false) {
                scrollToScheduleSelect();
            }
        }

        // ====== 学生端深链处理 ======
        // dl: { scdid, tid }，来自 /booking 入口的 URL 参数
        // 优先级：scdid > tid（两者同时存在时只处理 scdid）
        async function handleStudentDeepLink(dl) {
            if (dl.scdid) {
                const schedule = await fetchSchedule(dl.scdid);
                if (!schedule) {
                    alert('排期不存在或已结束');
                    return;
                }
                const courseId = schedule.courseId;
                if (!courseId) {
                    alert('排期数据异常：缺少课程ID');
                    return;
                }

                // 反查课程详情，确保目标课程在 courseList 中（分页可能导致不在当前页）
                let course = null;
                try {
                    course = await request({ url: `/course/${courseId}` });
                } catch (e) { /* ignore */ }
                if (!course) {
                    alert('课程不存在或已下架');
                    return;
                }
                if (!Array.isArray(courseList)) courseList = [];
                const inList = courseList.some(c => String(c.courseId) === String(courseId));
                if (!inList) {
                    courseList.push(course);
                    renderCourseCards();
                }
                document.getElementById('courseId').value = courseId;

                // 选中卡片（高亮）+ 加载该课程排期（不滚动，下方统一滚动）
                await selectCourse(courseId, false);

                // 在排期下拉框中定位目标排期并展示
                const scheduleSelect = document.getElementById('scheduleSelect');
                let schedFound = false;
                if (scheduleSelect) {
                    for (let i = 0; i < scheduleSelect.options.length; i++) {
                        if (String(scheduleSelect.options[i].value) === String(dl.scdid)) {
                            schedFound = true;
                            break;
                        }
                    }
                }
                if (schedFound) {
                    scheduleSelect.value = dl.scdid;
                    await displaySchedule();
                    const schedSection = document.querySelector('.section');
                    if (schedSection) schedSection.scrollIntoView({ behavior: 'smooth' });
                } else {
                    alert('该排期当前不可预约（可能已下架或已满）');
                }
            } else if (dl.tid) {
                // 列出该教师的所有有效排期对应的课程
                const params = new URLSearchParams({
                    pageNum: 1,
                    pageSize: 100,
                    status: 'active',
                    teacherId: dl.tid
                });
                try {
                    const result = await request({ url: `/course/page?${params.toString()}` });
                    if (result && result.rows && result.rows.length > 0) {
                        Pagination.pageNum = 1;
                        courseList = result.rows;
                        Pagination.total = result.total;
                        Pagination.totalPages = result.totalPages;
                        renderCourseCards();
                    } else {
                        alert('该教师暂无可预约的课程');
                    }
                } catch (e) {
                    alert('加载教师课程失败');
                }
            }
        }

        // 将排期对象渲染到页面各字段（待细化：可简化为日期范围、时间、排期计划）
        async function renderSchedule(scheduleObject) {
            if (!scheduleObject) return;

            const totalBooked = await getBookingCountByScheduleId(scheduleObject.scheduleId);

            // 「总席位数」的唯一数据源 = 所选排期对象上的 availableSites，
            // 即管理员在「排期设置」时填的那个总席位（course_schedule.available_sites）。
            // 学生页只读展示，不接受页面输入，也不做任何推导；必须先于“剩余席位数”写入。
            // ★ 原实现只从 DOM 读 availableSites、从不写入（admin-schedule.js 里是有这行的），
            //   而 resetScheduleInfoPanel 又把它重置为 1，
            //   于是「剩余席位数 = 1 - 已预订数」：只有总席位恰好为 1 的排期才算得对，
            //   总席位 > 1 的排期会被误判成“名额已满”（候补按钮也会跟着误弹出来）。
            const availSitesInput = document.getElementById('availableSites');
            const scheduleTotalSites = Number(scheduleObject.availableSites);
            const hasScheduleTotalSites = Number.isFinite(scheduleTotalSites) && scheduleTotalSites > 0;
            if (availSitesInput && hasScheduleTotalSites) {
                availSitesInput.value = scheduleTotalSites;   // 该字段恒等于排期上的总席位
            }
            // 仅当排期数据里确实没有总席位（异常数据）时，才回退用页面现值，能算多少算多少
            const totalSites = hasScheduleTotalSites
                ? scheduleTotalSites
                : Number(availSitesInput && availSitesInput.value);

            const now_availableSites = document.getElementById('now_availableSites');
            let remainingSites = totalSites - totalBooked;
            if (!Number.isFinite(remainingSites) || remainingSites <= 0) {
                remainingSites = 0;
            }
            // 展示口径：剩余员额 <= 0 显示「满额」，其余显示数字。
            // 数值同时写入 data-remaining（见文件顶部说明），供「是否已满」判定回读。
            applyRemainingSitesDisplay(now_availableSites, remainingSites);

            // 记录剩余席位，供按钮组合（预定 / 候补预订）判定“名额是否已满”
            currentRemainingSites = Number(remainingSites) || 0;
            /*  名额已满时不再禁用「预定排期」按钮：
                  原因1——禁用后点击事件不触发，按钮上的提示（title）也看不到，
                        与需求“提示该排期名额已满，可候补”冲突；
                  原因2——满员时的正确处理是“点击后提示 + 不进入预定处理”，
                        同时放出「候补预订」按钮作为替代入口（见 applyBookingButtons）。 */
            applyBookingButtons();

            // 刷新排期ID
            if (scheduleObject.scheduleId) {
                document.getElementById('scheduleId').value = scheduleObject.scheduleId;
            } else {
                document.getElementById('scheduleId').value = '';
            }

            // 刷新排期时区
            if (scheduleObject.startDate) {
                document.getElementById('originalTimeZone').value = scheduleObject.timeZone;
            } else {
                document.getElementById('originalTimeZone').value = '';
            }
            document.getElementById('timeZone').value = userTimeZone;

            // 刷新开始日期及对应星期（左侧排期时区）
            if (scheduleObject.startDate) {
                document.getElementById('startDate').value = scheduleObject.startDate;
                const _wk = document.getElementById('startDate_weekday');
                if (_wk) {
                    const _d = new Date(scheduleObject.startDate);
                    _wk.value = isNaN(_d) ? '' : ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][_d.getDay()];
                }
            } else {
                document.getElementById('startDate').value = '';
                const _wk = document.getElementById('startDate_weekday');
                if (_wk) _wk.value = '';
            }

            // 刷新开始时间
            if (scheduleObject.startTime) {
                document.getElementById('startTime').value = scheduleObject.startTime;
            } else {
                document.getElementById('startTime').value = '';
            }

            // 学生端展示重复规则（只读）：重复类型 + 重复周期
            // repeatType 兼容字符串(none/day/week/month) 与 DB 数字枚举(0/1/2/3)
            const _rtRaw = scheduleObject.repeatType;
            const _rtNumMap = { 0: 'none', 1: 'day', 2: 'week', 3: 'month' };
            const _rt = (_rtRaw != null && _rtNumMap[_rtRaw] != null) ? _rtNumMap[_rtRaw]
                : (_rtRaw || 'none');
            const _ri = (scheduleObject.repeatInterval != null ? scheduleObject.repeatInterval : scheduleObject.interval);
            const _rd = scheduleObject.repeatDays;
            const _rtEl = document.getElementById('repeatTypeDisplay');
            const _rcEl = document.getElementById('repeatCycleDisplay');
            if (_rtEl) {
                const _typeLabel = { none: '不重复', day: '每天', week: '每周', month: '每月' }[_rt] || _rt || '';
                _rtEl.value = _typeLabel;
            }
            if (_rcEl) {
                // 例如 repeatType=day、interval=3 → “每3天一次”
                _rcEl.value = getRepeatDescription(_rt, _ri, _rd) || '—';
            }

            // 刷新结束日期
            if (scheduleObject.endDate) {
                document.getElementById('endDate').value = scheduleObject.endDate;
            } else {
                document.getElementById('endDate').value = '';
            }

        }

        // 清空右侧「我的时区」列（排期时区与用户时区一致、或没有排期时用），
        // 避免残留上一个排期的换算结果。
        function clearUserTzBlock() {
            ['displayStartDate', 'displayStartDate_weekday', 'displayStartTime',
                'displayEndDate', 'displayEndDate_weekday'].forEach(function (id) {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
        }

        // 按「排期快照」重算并渲染右侧“我的时区”列。
        // snapshot: { fromZone, startDate, startTime, endDate }
        // 说明：不再从表单读值，而是直接用排期对象快照 —— 这样与 renderSchedule
        //       写 DOM 的时机完全解耦，从根上消除“慢一步”。
        async function renderUserTzBlock(snapshot) {
            const seq = ++bookingTzSeq;      // 抢占当前序号，旧的异步结果随即作废
            const fromZone = (snapshot && snapshot.fromZone) || '';
            const sDate = (snapshot && snapshot.startDate) || '';
            const sTime = (snapshot && snapshot.startTime) || '';
            const eDate = (snapshot && snapshot.endDate) || '';

            // 日期或时间缺失时无法换算，直接清空，避免显示上一个排期的残留值
            if (!sDate || !sTime) {
                clearUserTzBlock();
                return;
            }

            await Promise.all([
                getMyDatetime({ fromZone: fromZone, startDate: sDate, startTime: sTime }, seq),
                getMyEndDatetime({ fromZone: fromZone, startDate: eDate || sDate, startTime: sTime }, seq)
            ]);
        }

        // 将排期时区的开始日期时间转换到用户时区并显示
        // @param {Object}  [snapshot] { fromZone, startDate, startTime }；缺省时回退为读表单
        // @param {number}  [seq]      调用方序号；与 bookingTzSeq 不符则丢弃本次结果
        async function getMyDatetime(snapshot, seq) {
            const displayTzInput = document.getElementById('timeZone');
            const timeZoneInput = document.getElementById('originalTimeZone');

            const s = snapshot || {};
            const fromZone = s.fromZone != null ? s.fromZone
                : (timeZoneInput ? timeZoneInput.value : (window.formData && window.formData.timeZone) || "");
            const startDate = s.startDate != null ? s.startDate
                : ((document.getElementById('startDate') || {}).value || "");
            const startTime = s.startTime != null ? s.startTime
                : ((document.getElementById('startTime') || {}).value || "");

            const toTz = (displayTzInput && displayTzInput.value) || userTimeZone;
            // 组装为 DateTime 字符串（格式：yyyy-MM-dd HH:mm:ss）
            const dateTimeStr = `${startDate} ${startTime.length === 5 ? startTime + ":00" : startTime}`;
            try {
                let newTzDateTime = await tzSwitchTo(fromZone, dateTimeStr, toTz);
                // 期间用户已切换排期 → 本次结果已过期，直接丢弃
                if (seq != null && seq !== bookingTzSeq) return;
                const newDateTime = newTzDateTime ? newTzDateTime.dateTime : "";
                if (typeof newDateTime === "string" && newDateTime.trim().length > 0 && newDateTime.includes(' ')) {
                    const [newDate, newTime] = newDateTime.split(' ');
                    document.getElementById('displayStartDate').value = newDate;
                    document.getElementById('displayStartTime').value = newTime;
                    document.getElementById('displayStartDate_weekday').value = newTzDateTime.weekday;
                } else {
                    console.error("tzSwitchTo 返回的 newDateTime 不是有效的字符串，值为：", newDateTime);
                }
            } catch (err) {
                alert("调用时区转换接口失败");
                console.error(err);
            }
        }

        // 将排期时区的结束日期转换到用户时区并显示
        // @param {Object}  [snapshot] { fromZone, startDate, startTime }
        // @param {number}  [seq]      调用方序号；与 bookingTzSeq 不符则丢弃本次结果
        async function getMyEndDatetime(snapshot, seq) {
            const displayTzInput = document.getElementById('timeZone');
            const timeZoneInput = document.getElementById('originalTimeZone');

            const s = snapshot || {};
            const fromZone = s.fromZone != null ? s.fromZone
                : (timeZoneInput ? timeZoneInput.value : "");
            const startDate = s.startDate != null ? s.startDate
                : ((document.getElementById('endDate') || {}).value || "");
            const startTime = s.startTime != null ? s.startTime
                : ((document.getElementById('startTime') || {}).value || "");

            const toTz = (displayTzInput && displayTzInput.value) || userTimeZone;
            // 组装为 DateTime 字符串（格式：yyyy-MM-dd HH:mm:ss）
            const dateTimeStr = `${startDate} ${startTime.length === 5 ? startTime + ":00" : startTime}`;
            try {
                const newDateTime = await tzSwitchTo(fromZone, dateTimeStr, toTz);
                if (seq != null && seq !== bookingTzSeq) return;
                if (newDateTime) {
                    const newDate = newDateTime.dateTime.split(' ')[0];
                    document.getElementById('displayEndDate').value = newDate;
                    document.getElementById('displayEndDate_weekday').value = newDateTime.weekday;
                }
            } catch (err) {
                alert("调用时区转换接口失败");
                console.error(err);
            }
        }

        // 分页回调依赖 window.loadAndRenderCourse_student（pagefoot.js 通过 window 取数）；
        // 其余块内函数也保留 window 暴露：既要供 student.html 菜单/深链入口调用，
        // 也要供回归测试 check_schedule_refresh_behavior 直接驱动（loadSchedule/displaySchedule/...）。
        window.renderStudentBookingCards = renderStudentBookingCards;
        window.loadAndRenderCourse_student = loadAndRenderCourse_student;
        window.previewSchedule = previewSchedule;
        window.displaySchedule = displaySchedule;
        window.refreshData_student = refreshData_student;
        window.loadSchedule = loadSchedule;
        window.selectCourse = selectCourse;


        // 事件绑定改用 addEventListener（取代原 10+ 处内联 onclick），

        // 这里统一绑定一次（带单次绑定守卫，避免 loadAndRenderCourse_student 重复触发时重复挂监听）。

        function bindStudentBookingEvents() {
            // 每次 replaceChildren 后节点都是全新的，直接绑定即可（旧节点已被销毁，不会重复挂监听）
            const $ = (id) => document.getElementById(id);

            const on = (el, ev, fn) => { if (el) el.addEventListener(ev, fn); };



            on($('btn-search-course'), 'click', localsearchCourse);

            on($('btn-reset-course'), 'click', resetCourseFilter);

            on($('scheduleSelect'), 'change', displaySchedule);

            on($('previewBtn'), 'click', previewSchedule);

            on($('bookBtn'), 'click', () => submitBooking('booking'));

            on($('waitBtn'), 'click', () => submitBooking('waiting'));

            on($('cancelBtn'), 'click', cancelBooking_student);

            on($('deleteBtn'), 'click', deleteBooking_student);

            on($('refreshBtn'), 'click', refreshData_student);

            document.querySelectorAll('.result-tab').forEach(function (tab) {

                on(tab, 'click', function () { switchResultTab(tab.dataset.tab); });

            });

        }

        bindStudentBookingEvents();


        // 把「排期信息」区域重置为“尚未选择排期”的初始状态。
        // 使用场景：切换课程（loadSchedule）、所选课程没有有效排期。
        // 为什么需要它：切换课程后只有排期下拉框会被刷新，而「排期信息」里的时区、日期、
        //   上课时间、剩余席位、预订按钮状态等仍是上一门课程的那个排期 —— 用户看到的就是
        //   “排期列表已刷新、等待选择排期，但旧排期信息还留在页面上”。
        function resetScheduleInfoPanel() {
            // 1) 作废尚未返回的时区换算请求，并清空右侧「我的时区」列，
            //    否则慢响应回来会把上一排期的换算结果写回已经清空的区域
            bookingTzSeq++;
            clearUserTzBlock();

            // 2) 状态归零：当前没有选中任何排期（避免预订/取消动作落到上一排期上）
            selectedScheuleId = null;
            scheduleObject = null;
            // 按钮组合判定依赖的这两项也要归零：剩余席位未知 → 不显示「候补预订」；
            // 预订对象为空 → 不残留上一排期的按钮组合
            currentRemainingSites = null;
            currentBookingObj = null;

            // 3) 清空排期自身字段（注：课程/教师信息属于「课程」，不在此重置）
            const setVal = function (id, v) {
                const el = document.getElementById(id);
                if (el) el.value = (v == null ? '' : v);
            };
            setVal('scheduleId');
            setVal('originalTimeZone');
            setVal('startDate');
            setVal('startDate_weekday');
            setVal('startTime');
            setVal('endDate');
            // 重复规则（学生端只读展示）：切换课程/未选排期时清空，避免残留上一排期的值
            setVal('repeatTypeDisplay');
            setVal('repeatCycleDisplay');
            // 席位两项留空 = “未知”：总席位数是管理员在「排期设置」时设定的数据（存在排期上），
            // 学生页不产生这个数，未选排期时编一个 1 出来反而像真值。
            // 归空后 isScheduleFull() 按“未知即未满”处理，不会误阻断预定。
            setVal('availableSites', '');
            setVal('now_availableSites', '');
            // 「剩余员额」的数值载体与满额样式一并复位（文案已由上面的 setVal 清空）：
            // 否则残留上一排期的 data-remaining，isScheduleFull() 在 currentRemainingSites
            // 为 null 时会读到旧值，误弹候补按钮
            applyRemainingSitesDisplay(document.getElementById('now_availableSites'), null);

            // 5) 预订状态回到“无预订”，按钮组合回到初始（否则会残留上一排期的取消/删除按钮）
            setVal('bookingId');
            setVal('bookingStatus', 'none');
            if (document.getElementById('bookBtn')) {
                renderStudentBookingStatus(null);
                const refreshBtn = document.getElementById('refreshBtn');
                if (refreshBtn) refreshBtn.style.display = 'block';
            }

            // 6) 清空上一排期的「排期结果」列表与日历标记
            scheduleResult = null;
            if (document.getElementById('resultBody')) renderResult();
            if (document.getElementById('calendar')) renderCalendar();

            // 7) 右侧「我的时区」列：没有排期就没有换算对象，清空并隐藏
            userTimeZoneDisplay = "none";
            const rightBlock = document.getElementById('rightBlock');
            if (rightBlock) rightBlock.style.display = userTimeZoneDisplay;
        }

        // 把排期下拉框恢复为“请选择课程排期”的占位状态（去掉上一门课程的排期选项）
        function resetScheduleSelect() {
            const scheduleSelect = document.getElementById('scheduleSelect');
            if (scheduleSelect) {
                scheduleSelect.innerHTML = '<option value="">请选择<span data-term="course">课程</span>排期</option>';
            }
        }

        // 加载所选课程的有效排期（status=active），填充到排期下拉框
        async function loadSchedule(cid) {
            // cid 优先取入参（卡片点击/深链传入），否则回退到全局 currentCourseId
            if (!cid) cid = (typeof currentCourseId !== 'undefined' && currentCourseId) ? currentCourseId : '';
            // 有效排期数量（★ 提到函数级：原实现声明在 try 块内，块外引用会直接 ReferenceError）
            let cnt = 0;

            // ★ 课程一变，先把「排期信息」重置为“尚未选择排期”的初始状态，再去请求新的排期列表。
            //   否则在请求往返期间、以及返回后用户还没选排期时，页面上一直留着上一门课程的排期信息。
            resetScheduleInfoPanel();
            resetScheduleSelect();

            // 选回“请先选择课程”时，课程自身字段也一并清掉，不留上一门课程的痕迹
            if (!cid) {
                currentCourseId = '';
                const courseIdElem0 = document.getElementById('courseId');
                if (courseIdElem0) courseIdElem0.value = '';
                const teacherNameElem0 = document.getElementById('teacherNameForCourse');
                if (teacherNameElem0) teacherNameElem0.value = '';
                return [];
            }
            currentCourseId = cid;

            // 把页面的 courseId 节点内容设置为 cid
            const courseIdElem = document.getElementById('courseId');
            if (courseIdElem) {
                courseIdElem.value = cid;
            }

            // ===== 教师信息：最佳努力获取，绝不阻塞排期加载（与管理端修复同思路）=====
            // 先把课程自带的 teacherId 同步落到隐藏域（零风险），教师姓名改为“异步补充”，
            // 不再 await —— 这样排期下拉的填充不必等教师姓名接口返回（管理端教训：排期加载绝不应依赖教师数据）。
            let selectedCourse = null;
            if (Array.isArray(courseList)) {
                selectedCourse = courseList.find(course => course.courseId === cid);
            }
            const teacherIdElem = document.getElementById('teacherIdForCourse');
            if (teacherIdElem) teacherIdElem.value = (selectedCourse && selectedCourse.teacherId) || '';
            const teacherNameElem = document.getElementById('teacherNameForCourse');
            if (teacherNameElem) teacherNameElem.value = '';
            if (selectedCourse && selectedCourse.teacherId) {
                // getUserNameById 内部已自带 try/catch（异常返回 n/a）；这里再包一层确保任何意外都不会阻断排期下拉填充。
                getUserNameById(selectedCourse.teacherId)
                    .then(name => { if (teacherNameElem) teacherNameElem.value = name || ''; })
                    .catch(e => console.error('获取教师名称失败（不影响排期加载）:', e));
            }

            // ===== 排期加载：核心链路，优先于教师姓名，且自身已 try/catch =====
            try {
                scheduleList = await fetchScheduleList(cid, "active");
            } catch (e) {
                // 拉取失败：清空可能残留的旧排期数据，避免用户误选到上一门课的排期
                cnt = 0;
                scheduleList = [];
                console.error('加载排期列表失败:', e);
            }

            // 下拉填充统一走 fillScheduleSelect（与「刷新」共用同一份口径，避免两处分叉）
            cnt = fillScheduleSelect(scheduleList);
        }

        /**
         * 用排期列表重建「排期」下拉框，并可选地把选中项恢复为指定排期。
         *
         * 抽出来供两条路径共用：
         *   - 切换课程（loadSchedule）：重置面板后按新列表填充；
         *   - 原地刷新（refreshData_student）：填充后把选中项选回原排期。
         * 否则 status 过滤、选项文案、空提示文案会在两处逐渐分叉。
         *
         * @param {Array} list fetchScheduleList 的返回值
         * @param {string|number} [keepScheduleId] 需保持选中的排期 ID。该排期已不在
         *        有效列表中时**不强行选中**（下拉停回占位项），由调用方判断原排期是否还在。
         * @returns {number} 有效排期（status=active）数量
         */
        function fillScheduleSelect(list, keepScheduleId) {
            resetScheduleSelect();   // 先写回占位项，顺带清掉上一门课程留下的选项
            const scheduleSelect = document.getElementById('scheduleSelect');
            if (!scheduleSelect) return 0;

            let cnt = 0;
            (Array.isArray(list) ? list : []).forEach(schedule => {
                if (schedule.status == 'active') { // TBD: 过滤在后端完成
                    cnt++;
                    const opt = document.createElement('option');
                    opt.value = schedule.scheduleId;
                    let displayText = `排期: ${schedule.name}`;
                    if (schedule.startDate && schedule.startTime) {
                        displayText += ` / ${schedule.startDate} ${schedule.startTime}`;
                    } else if (schedule.startDate) {
                        displayText += ` / ${schedule.startDate}`;
                    }
                    opt.innerText = displayText;
                    scheduleSelect.appendChild(opt);
                }
            });

            if (cnt === 0) {
                // 该课程没有有效排期：给明确提示（空白下拉会被误读成“还在加载”）
                scheduleSelect.innerHTML = '<option value="">暂时该<span data-term="course">课程</span>没有排期</option>';
            } else if (keepScheduleId) {
                const exists = Array.prototype.some.call(
                    scheduleSelect.options, o => String(o.value) === String(keepScheduleId));
                if (exists) scheduleSelect.value = String(keepScheduleId);
            }
            return cnt;
        }

        // 排期列表选择变化时，重新显示排期计划及预订情况
        async function displaySchedule() {
            const scheduleSelect = document.getElementById('scheduleSelect');
            if (!scheduleSelect) return;
            const selectedId = scheduleSelect.value;
            if (!selectedId) return;

            // 在 scheduleList 中查找对应的排期对象
            const selectedSchedule = scheduleList.find(s => String(s.scheduleId) === String(selectedId));
            if (!selectedSchedule) return;

            scheduleObject = selectedSchedule;
            selectedScheuleId = selectedId;

            // 换排期后这两项都是“未知”，先归零：避免 renderSchedule 算剩余席位时
            // 用上一个排期的预订状态去判定候补按钮（正确的值稍后由 reloadBooking_student 写入）
            currentRemainingSites = null;
            currentBookingObj = null;
            applyBookingButtons(null);

            // ★ 关键修复：renderSchedule 内部第一行就 await 了「查询已预订人数」（网络请求），
            //   因此它不会立刻把排期字段写进表单。此处必须 await 等它写完，再做「我的时区」换算；
            //   否则换算读到的是上一个排期的时区/日期/时间 —— 这正是“我的时区慢一步”的根因。
            if (typeof renderSchedule === 'function') {
                await renderSchedule(scheduleObject);
            }
            await reloadBooking_student();//读取用户的预订状态，刷新按钮组合

            // 排期时区与用户当前时区不一致时，显示用户时区的时间
            if (selectedSchedule.timeZone !== userTimeZone) {
                userTimeZoneDisplay = "block";
                document.getElementById('rightBlock').style.display = userTimeZoneDisplay;
                // 用当前排期的快照直接换算，不依赖 DOM 的写入时机
                await renderUserTzBlock({
                    fromZone: selectedSchedule.timeZone,
                    startDate: selectedSchedule.startDate,
                    startTime: selectedSchedule.startTime,
                    endDate: selectedSchedule.endDate
                });
            } else {
                // 两个时区相同：隐藏右侧列，并清掉里面的旧值，避免下次显示时闪出上一个排期的结果
                bookingTzSeq++;                  // 作废尚未返回的换算请求
                clearUserTzBlock();
                userTimeZoneDisplay = "none";
                document.getElementById('rightBlock').style.display = userTimeZoneDisplay;
            }
        }

        // 预览排期：
        // - 已预定（booked）：课次已真实落库到 appointment 表，直接从库读取真实课次列表渲染；
        //   即便管理员调整过个别课次时间，也以库为准。
        //   appointment 以排期原始时区存储，与用户时区不一致时逐条转换，保证与未预定路径显示一致。
        // - 未预定：按排期对象（repeatType 等）经 generateScheduleListFromServer 展开（后端已按用户时区返回）。
        async function previewSchedule() {
            if (!checkCourseAndSchedule(true, true)) return; // 判断选择有效性
            if (!scheduleObject) return;

            // 已预定：从 appointment 表取真实课次列表（按 appointmentDatetime 升序）
            const isBooked = !!(currentBookingObj && currentBookingObj.status === 'booked' && currentBookingObj.bookingId);
            if (isBooked) {
                const fetchAppts = (typeof getAppointmentsByBookingId === 'function')
                    ? getAppointmentsByBookingId
                    : window.getAppointmentsByBookingId;
                let appts = (typeof fetchAppts === 'function') ? await fetchAppts(currentBookingObj.bookingId) : [];
                if (!Array.isArray(appts)) appts = [];

                // appointment 以排期原始时区存储，与用户时区不一致时转换到用户时区
                const tzSwitch = (typeof tzSwitchTo === 'function') ? tzSwitchTo : window.tzSwitchTo;
                if (scheduleObject.timeZone !== userTimeZone && typeof tzSwitch === 'function') {
                    const converted = [];
                    for (const item of appts) {
                        const timePart = (item.time && item.time.length === 5) ? item.time + ':00' : (item.time || '');
                        const dtStr = `${item.date} ${timePart}`;
                        let newDt = { dateTime: dtStr };
                        try {
                            newDt = await tzSwitch(scheduleObject.timeZone, dtStr, userTimeZone) || newDt;
                        } catch (e) {
                            console.error('课次时区转换失败，沿用原始时间', e);
                        }
                        const [d, t] = (newDt.dateTime || '').split(' ');
                        converted.push({ id: item.id, date: d, time: t, status: item.status });
                    }
                    appts = converted;
                }
                scheduleResult = appts;
                renderResult();
                renderCalendar();
                switchResultTab('list');
                return;
            }

            // 未预定：按排期对象展开课次列表
            const form = {
                courseId: scheduleObject.courseId,
                scheduleId: scheduleObject.scheduleId,
                startDate: scheduleObject.startDate,
                startTime: scheduleObject.startTime,
                repeatType: scheduleObject.repeatType,
                interval: (scheduleObject.repeatInterval != null ? scheduleObject.repeatInterval : scheduleObject.interval),
                status: scheduleObject.status,
                timeZone: scheduleObject.timeZone,   // 排期的原始时区
                userTimeZone: userTimeZone,          // 输出时间的时区
                repeatDays: scheduleObject.repeatDays,
                endDate: scheduleObject.endDate
            };
            console.log('预览排期请求参数:', form);
            // 生成排期列表 localDateTime List<Date,TIME>
            scheduleResult = await generateScheduleListFromServer(form);

            renderResult();
            renderCalendar();
            // 预览后自动切到「日期列表」tab，让用户立刻看到输出（日历 tab 由用户自行切换）
            switchResultTab('list');
        }

        // 当前排期是否「名额已满」（剩余席位数 <= 0）。
        // 判据取 renderSchedule 算出的剩余席位；若尚未算出则回退读页面字段。
        // 注意：未知（尚未选定排期）时一律按“未满”处理，避免误阻断正常预定。
        function isScheduleFull() {
            let v = currentRemainingSites;
            if (v == null) {
                // 回读走 readRemainingSitesFromDom()：它优先取数值载体 data-remaining，
                // 因为满额时该字段的**显示文案**是「满额」，直接 Number('满额') 会得 NaN → 误判为「未满」
                v = readRemainingSitesFromDom();
            }
            if (v == null || v === '') return false;
            const n = Number(v);
            return Number.isFinite(n) && n <= 0;
        }

        // 统一决定「排期信息」区操作按钮的显示组合（预定 / 候补预订 / 取消 / 删除 / 刷新）。
        // 单一入口的意义：renderSchedule（算剩余席位）与 renderStudentBookingStatus（算预订状态）
        // 都会影响按钮，两处各自写 style.display 会互相覆盖，必须收敛到一个函数里判定。
        // @param {Object|null} [bObj] 当前预订对象；缺省取 currentBookingObj
        function applyBookingButtons(bObj) {
            const bookBtn = document.getElementById('bookBtn');
            if (!bookBtn) return;      // 容器已被卸载（用户已切到别的菜单）
            const waitBtn = document.getElementById('waitBtn');
            const cancelBtn = document.getElementById('cancelBtn');
            const deleteBtn = document.getElementById('deleteBtn');
            const refreshBtn = document.getElementById('refreshBtn');

            const booking = (bObj !== undefined) ? bObj : currentBookingObj;
            const status = booking ? booking.status : null;
            const full = isScheduleFull();

            // ---- 「预定排期」按钮 ----
            // 名额已满时不进入预定处理：按钮保持可见可点，点击后提示“该排期名额已满，可候补”。
            // 不能改成 disabled —— 禁用后 click 不触发、title 也不显示，等于没有任何提示。
            let bookVisible = true;
            // 是否处于“可以发起候补”的预订状态（无预订、或历史预订已取消）
            let canWaitlist = false;
            if (status == null) {
                bookVisible = true;
                canWaitlist = true;
            } else if (status === 'waiting') {
                bookVisible = false;                 // 已候补：不再显示预定/候补，用「取消预约」退出候补
            } else if (status === 'booked') {
                bookVisible = false;                 // 已确认：只能取消
            } else if (status === 'canceling' || status === 'cancelling') {
                bookVisible = true;                  // 取消待确认：保留原行为
            } else if (status === 'canceled' || status === 'cancelled') {
                bookVisible = false;                 // 已取消：走「删除预定」清理（保留原行为）
                canWaitlist = true;
            } else {
                bookVisible = true;                  // booking（待确认）等：保留原行为
            }

            bookBtn.style.display = bookVisible ? 'block' : 'none';
            bookBtn.disabled = false;                // 清掉历史遗留的 disabled，否则满员后永远点不动
            if (full) {
                bookBtn.title = WAITLIST_TIP;
                bookBtn.setAttribute('aria-label', WAITLIST_TIP);
            } else {
                bookBtn.title = '';
                bookBtn.removeAttribute('aria-label');
            }

            // ---- 「候补预订」按钮 ----
            // 默认仅在名额已满且当前没有有效预订时显示（候补只对满员排期有意义）
            if (waitBtn) {
                const showWait = canWaitlist && (full || ALWAYS_SHOW_WAITLIST_BTN);
                waitBtn.style.display = showWait ? 'block' : 'none';
                waitBtn.title = full ? WAITLIST_TIP : '';
            }

            // ---- 取消 / 删除（维持改造前的显示规则，这里只是集中设置，避免相互覆盖） ----
            let cancelVisible = false;
            let deleteVisible = false;
            if (status === 'waiting') {
                cancelVisible = true;                // 已候补：可退出候补（取消 → 已取消 → 再删除）
            } else if (status === 'booked') {
                cancelVisible = true;
            } else if (status === 'canceled' || status === 'cancelled') {
                cancelVisible = true;
                deleteVisible = true;
            } else if (status === 'canceling' || status === 'cancelling') {
                // 取消待确认：取消/删除按钮都隐藏（等待管理员确认）
            } else {
                // 无预订、booking（待确认）等：隐藏取消/删除
            }
            if (cancelBtn) cancelBtn.style.display = cancelVisible ? 'block' : 'none';
            if (deleteBtn) deleteBtn.style.display = deleteVisible ? 'block' : 'none';
            // 「刷新」是页面级动作，任何预订状态下都应可用。
            // （原实现在 booked / cancelling 状态下把它设为 none，会让用户在“已预订”时
            //   看不到刷新按钮，属明显不合理，此处统一为始终显示）
            if (refreshBtn) refreshBtn.style.display = 'block';
        }

        // 根据 bookingObject 显示当前用户对该排期的预订状态
        function renderStudentBookingStatus(bObj) {
            const bidItem = document.getElementById('bookingId');
            // ★ 预订主键字段名是 bookingId（Booking 实体的 @TableId）。
            //   原实现写的是 bObj.id —— 接口返回对象里没有 id 字段（实测 keys:
            //   tenantId,bookingId,scheduleId,studentId,teacherId,status,createTime），
            //   会被写成字符串 "undefined"，导致后续取消/删除/改订都带着错误的 id 提交。
            //   这里同时兼容 id，避免以后实体改名又踩一次。
            if (bidItem) {
                bidItem.value = bObj ? (bObj.bookingId || bObj.id || "") : "";
            }
            const listStatus = document.getElementById('bookingStatus');
            if (listStatus) {
                if (bObj == null) {
                    listStatus.value = "none";
                } else {
                    listStatus.value = bObj.status;   // status=waiting 时显示“候补”（见下拉选项）
                }
            }

            // 记录当前预订对象，供 applyBookingButtons() 判定按钮组合
            currentBookingObj = bObj || null;
            applyBookingButtons(bObj);
        }

        // 渲染排期结果列表
        function renderResult() {
            const body = document.getElementById('resultBody');
            body.innerHTML = '';
            if (scheduleResult != null) {
                scheduleResult.forEach(item => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `<td>${scheduleResult.indexOf(item) + 1}</td><td>${item.date}</td><td>${item.time}</td>`;
                    body.appendChild(tr);
                });
            }
        }

        // 渲染日历：在日历上标记所有排期日期（已排期日期用背景色块表示）
        function renderCalendar() {
            const cal = document.getElementById('calendar');
            cal.innerHTML = '';
            if (scheduleResult == null) return;

            const dateSet = new Set(scheduleResult.map(i => i.date));
            // 将 dateSet 的第一项（若存在）转为日期变量，格式假定 yyyy-MM-dd
            let firstDateVar = null;
            if (dateSet.size > 0) {
                const firstDateStr = Array.from(dateSet)[0];
                const [year, month, day] = firstDateStr.split('-');
                firstDateVar = new Date(Number(year), Number(month) - 1, Number(day));
            }

            // 日历起始日期：有排期日期时取其所在周的周一，否则取今天所在周的周一
            let startDate;
            if (firstDateVar) {
                startDate = new Date(firstDateVar); // 已在本地，0 点时间
            } else {
                startDate = new Date();
            }

            const dayOfWeek = startDate.getDay(); // 0=周日, 1=周一, ..., 6=周六
            const diffToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
            startDate.setDate(startDate.getDate() + diffToMonday);

            // 显示 35 天，横向排列，每行 7 天
            const daysToShow = 35;
            const today = new Date(startDate);
            today.setHours(0, 0, 0, 0); // 本地 0 点
            for (let i = 0; i <= daysToShow; i++) {
                const d = new Date(today);
                d.setDate(today.getDate() + i);
                // 保证是本地时区的年月日
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}`;
                const div = document.createElement('div');
                div.className = 'calendar-day';
                if (dateSet.has(dateStr)) div.classList.add('marked');
                div.innerText = d.getDate();
                cal.appendChild(div);
            }
        }

        // 排期结果 / 日历视图：tab 切换（同一份数据的两种展现，二选一不重复占竖向空间）
        function switchResultTab(tab) {
            const tabs = document.querySelectorAll('.result-tab');
            tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
            const listPanel = document.getElementById('resultPanelList');
            const calPanel = document.getElementById('resultPanelCalendar');
            if (listPanel) listPanel.style.display = (tab === 'list') ? 'block' : 'none';
            if (calPanel) calPanel.style.display = (tab === 'calendar') ? 'block' : 'none';
        }

        // 提交预订：预定(status='booking') 或 候补(status='waiting')，流程一致
        // （同一校验、同一接口、同一份表单数据），仅 status 不同。
        // 候补记录不占用席位（后端 countByScheduleId 已排除 waiting）；
        // 管理员确认名额释放后把 status 改为 booked 即转正式预订。
        async function submitBooking(status) {
            if (!checkCourseAndSchedule(true, true)) {
                alert("请选择课程和排期");
                return;
            }
            // 预定：名额已满则只提示改走候补；候补：尚有余位则引导直接预定
            if (status === 'booking') {
                if (isScheduleFull()) {
                    alert(WAITLIST_TIP);
                    return;
                }
            } else if (status === 'waiting') {
                if (!isScheduleFull()) {
                    alert("该排期尚有余位，请直接点「预定排期」");
                    return;
                }
                // 已存在有效预订（含已候补）时不重复提交
                const curStatus = currentBookingObj ? currentBookingObj.status : null;
                if (curStatus === 'waiting') {
                    alert("您已候补该排期，请勿重复提交");
                    return;
                }
                if (curStatus === 'booking' || curStatus === 'booked'
                    || curStatus === 'canceling' || curStatus === 'cancelling') {
                    alert("您已有该排期的预订，无需候补");
                    return;
                }
            }

            const scheduleId = (scheduleObject && scheduleObject.scheduleId) || '';
            const teacharId = document.getElementById('teacherIdForCourse').value;
            const bidItem = document.getElementById("bookingId");
            // 已有历史记录（如已取消）时复用其 bookingId，避免同一排期堆叠多条记录
            const bookingid = bidItem ? (bidItem.value || "") : "";
            const dto = {
                bookingId: bookingid || "",
                scheduleId: scheduleId || "",
                studentId: userId,
                teacherId: teacharId,
                status: status
            };

            const retId = await createOrUpdateBookingObj(bookingid, dto);
            if (retId != null) {
                if (status === 'booking') {
                    alert(bookingid !== "" ? '修改成功' : '预定成功，请等待管理员确认');
                } else {
                    alert(bookingid !== "" ? '已改为候补，请等待名额释放' : '候补成功，请等待管理员确认');
                }
            } else {
                if (status === 'booking') {
                    // 服务端会做名额校验（满员直接拒绝），失败原因已由请求拦截器弹出；
                    // 这里补一句可行动的提示，避免用户只看到“失败”不知道下一步。
                    alert((bookingid !== "" ? '修改失败' : '预定失败')
                        + '：若名额已满，请改用「候补预订」排队；也可刷新页面后重试。');
                } else {
                    alert('重试：' + (bookingid !== "" ? '候补修改失败' : '候补失败'));
                }
            }
            await reloadBooking_student();
        }

        // 收集页面上的预订表单数据
        function getBookFormData() {
            const bid = document.getElementById("bookingId").value;
            const bst = document.getElementById("bookingStatus").value;
            return { bookingid: bid, status: bst };
        }

        // 删除预订：仅未被确认的预订（booking）或已取消（canceled）的预订可由学生自行删除，不涉及时间列表
        // 管理员确认取消后，可删除该预订及对应的预订时间列表
        async function deleteBooking_student() {
            if (!checkCourseAndSchedule(true, true)){
                alert("请选择课程和排期");
                return; // 判断选择有效性   
            }
            if (!confirm("确认删除预订吗？")) return;
            const formData = getBookFormData();
            if ((formData.status == "booking") || (formData.status == "canceled")) {
                await operateBookingStatus(formData.bookingid, "delete");
                reloadBooking_student();
            } else {
                alert("请联系老师，确认后才能删除");
            }
        }

        // 取消预订：booking 可直接取消；booked 需置为 canceling 等待确认
        async function cancelBooking_student() {
            if (!checkCourseAndSchedule(true, true)){
                alert("请选择课程和排期");
                return; // 判断选择有效性   
            }
            const formData = getBookFormData();
            if (formData.status == "booked"){
                if (!confirm("确认取消预订吗？")) return;
            }
            await operateBookingStatus(formData.bookingid, formData.status != "booked" ? "canceled" : "canceling");
            reloadBooking_student();
        }

        /**
         * 「刷新」：保持当前排期不变，只重新从数据库读取该排期的数据并更新显示。
         *
         * 为什么不沿用 loadSchedule()：它是「切换课程」路径，函数开头就 resetScheduleInfoPanel()
         * + resetScheduleSelect()（否则请求往返期间、以及返回后用户还没选排期时，页面上会残留
         * 上一门课程的排期信息）。而刷新面对的是**同一个排期**，用户要的是“直接拿到最后的结果”
         * （例如刚在另一个窗口完成审核/取消，或管理员调整了课次）——若把选中排期清掉，
         * 用户还得分神重选一次，刷新反而变成了回退。
         *
         * 所以这里刻意不复用 loadSchedule()，改为：
         *   1) 重新拉取该课程的排期列表 → 重建下拉并**选回原排期**；
         *   2) 走 displaySchedule() 重渲染 —— 它内部依次重取「已预订人数」「我的预订状态」，
         *      并重算剩余员额 / 满额样式 / 按钮组合 / 「我的时区」换算，全部来自数据库而非本地推算；
         *   3) 刷新前若已预览过排期（结果区有内容），刷新后自动重放一次预览，
         *      课次列表与课次状态一并更新到最新。
         * 任何一步失败都**不清空页面**：宁可保留旧数据，也不要出现“刷新完啥也没了”。
         */
        async function refreshData_student() {
            const btn = document.getElementById('refreshBtn');
            const btnText = btn ? btn.textContent : '';
            // 记住刷新前的排期：优先全局选中值，回退下拉框当前值
            const keepScheduleId = selectedScheuleId
                || ((document.getElementById('scheduleSelect') || {}).value || '');

            if (btn) {
                btn.disabled = true;             // 防连点造成并发请求
                btn.textContent = '刷新中…';
            }
            try {
                // 未选课程：没有可刷新的排期对象，退回“重新加载排期列表”
                if (!currentCourseId) {
                    await loadSchedule();
                    return;
                }

                let list;
                try {
                    list = await fetchScheduleList(currentCourseId, 'active');
                } catch (e) {
                    // 关键：失败时保持页面原样（旧数据仍可用），不清空、不重置选中
                    console.error('刷新排期数据失败:', e);
                    alert('刷新失败，请稍后重试');
                    return;
                }
                scheduleList = Array.isArray(list) ? list : [];

                // 重建下拉并选回原排期；原排期已失效时下拉停在占位项
                fillScheduleSelect(scheduleList, keepScheduleId);
                const scheduleSelect = document.getElementById('scheduleSelect');
                const kept = !!(scheduleSelect && keepScheduleId
                    && String(scheduleSelect.value) === String(keepScheduleId));
                if (!kept) {
                    // 原排期已不在有效列表中（被取消 / 删除 / 改为非 active）：
                    // 清空面板，避免页面停留在一个已失效的排期上
                    // （resetScheduleInfoPanel 内会清 selectedScheuleId 并复位按钮组合）
                    resetScheduleInfoPanel();
                    return;
                }

                // 是否已展开课次列表：必须在 displaySchedule 之前取，避免被后续步骤影响
                const hadPreview = Array.isArray(scheduleResult) && scheduleResult.length > 0;

                // 与手动选排期完全同一条渲染链路
                await displaySchedule();

                if (hadPreview) {
                    // 重放预览：把“最后的结果”直接落到结果区，用户无需再点一次「预览排期」
                    await previewSchedule();
                }
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = btnText || '刷新';
                }
            }
        }

        // 状态变化时更新当前用户对当前排期的预订状态
        async function reloadBooking_student() {
            if (selectedScheuleId != null) {
                const bookingObjectList = await getBookingInfo(selectedScheuleId, userRole, userId);
                if (bookingObjectList != null && bookingObjectList.length > 0) {
                    // 同一学生同一排期可能存在多条历史记录（如“已取消” + 重新预订/候补），
                    // 接口按 create_time DESC 返回；原先无条件取 [0]，会把候补/新预订误显示成旧记录。
                    // 这里优先取“仍然有效”的那条（waiting/booking/booked/canceling）。
                    const activeStatuses = ['waiting', 'booking', 'booked', 'canceling', 'cancelling'];
                    const activeObj = bookingObjectList.find(
                        b => b && activeStatuses.indexOf(b.status) >= 0
                    );
                    renderStudentBookingStatus(activeObj || bookingObjectList[0]); // 用户的预订信息
                } else {
                    renderStudentBookingStatus(null);
                }
            }
        }
    }

}

// 搜索按钮：重置为第 1 页再查询
function localsearchCourse() {
    Pagination.pageNum = 1;
    // loadAndRenderCourse_student 是块级函数声明，模块作用域不可见，统一走 window 引用
    if (typeof window.loadAndRenderCourse_student === 'function') {
        window.loadAndRenderCourse_student();
    }
}

// 重置筛选条件
function resetCourseFilter() {
    const nameInput = document.getElementById('course-name-input');
    if (nameInput) nameInput.value = '';
    Pagination.pageNum = 1;
    // loadAndRenderCourse_student 是块级函数声明，模块作用域不可见，统一走 window 引用
    if (typeof window.loadAndRenderCourse_student === 'function') {
        window.loadAndRenderCourse_student();
    }
}

/**
 * 课程未发布排期时，学生点「待排期，可联系管理员」打开站内信发送页。
 * - 复用消息中心全局入口 openComposeMessage()：学生默认接收范围=本租户管理员（tenant_admin），正好对应「联系管理员」；
 *   进入即自动加载该范围接收人，学生只需编辑诉求正文并发送。
 * - 预填标题与正文模板，学生可自由修改后再发送。
 * @param {string} courseId   课程ID（仅用于上下文，文案已含课程名）
 * @param {string} courseName 课程名称
 */
function contactAdminForSchedule(courseId, courseName) {
    if (typeof window.openComposeMessage !== 'function') {
        alert('消息中心尚未加载，无法发送站内信，请稍后重试或联系管理员');
        return;
    }
    // 打开发送弹窗（同步插入 DOM，#msg-compose-root 即挂载点）
    window.openComposeMessage();

    const root = document.getElementById('msg-compose-root');
    if (!root) return;
    const titleEl = root.querySelector('#msg-title');
    const contentEl = root.querySelector('#msg-content');

    // 学生默认 scope 已是 tenant_admin；保险起见显式选中「本租户管理员」并刷新租户框显隐
    const scopeSel = root.querySelector('#msg-scope');
    if (scopeSel) {
        for (let i = 0; i < scopeSel.options.length; i++) {
            if (scopeSel.options[i].value === 'tenant_admin') { scopeSel.selectedIndex = i; break; }
        }
        // 仅同步租户框显隐（tenant_admin 无 data-tenant，不会要求填租户ID）；接收人已由 openComposeMessage 自动加载
        if (typeof scopeSel.dispatchEvent === 'function') {
            scopeSel.dispatchEvent(new Event('change'));
        }
    }

    const cname = (courseName || '(课程)').toString();
    if (titleEl && !titleEl.value) {
        titleEl.value = '课程排期申请：' + cname;
    }
    if (contentEl && !contentEl.value) {
        contentEl.value =
            '您好，我想报名课程《' + cname + '》，但目前该课程还没有发布可预约的排期。\n' +
            '麻烦管理员帮忙安排排期，我的诉求如下：\n' +
            '1. 期望上课时间（如每周六上午 10:00）：\n' +
            '2. 期望上课频率 / 总课次：\n' +
            '3. 其它诉求（如教师偏好、上课方式等）：';
    }
}

/**
 * 页面设计说明：
 * 1. 课程选择：按课程名称检索（教师检索暂未开放），卡片网格点选；
 * 2. 排期显示：根据所选课程查询排期并显示参数（开始日期/时间、重复类型/间隔/星期或日期、结束日期）；
 * 3. 预订操作：读取当前用户对该排期的预订，提供预览、预订、取消预订、删除操作；
 * 4. 排期结果：列表显示（年月日、时分）+ 日历标记（已排期日期用背景色块表示）。
 *
 * 数据操作（学生端）：
 * - 新建 booking：添加 booking，并把排期时间列表插入 appointment 数据表；
 * - 修改 booking 状态：取消（预订未被确认时）、预订（取消未被确认时）、删除（无待确认取消且无已确认预订时可自行删除），
 *   修改的同时按 booking.id 更新 appointment 中对应数据。
 *
 * 教师端（对应 controller：insert、update、updateStatus）：
 * - 查看自己的所有预订；确认预订、确认取消；临时调整已预约课次时间（appointment）。
 *
 * TBD：
 * 1. 检查不可选择的排期（已报满）；
 * 2. 按天预订的情况：已排期——可用、不可用、选择、不选择。
 */

