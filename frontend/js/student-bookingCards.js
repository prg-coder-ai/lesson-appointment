// 学生端——课程预订管理页面（student-bookingCards.js）
// 全局变量 userId/userRole/userTimeZone 等来自 api.js

userTimeZoneDisplay = "none";
document.write('<script src="/js/public/pagefoot.js"></script>');

/**
 * 渲染课程预订管理页面
 * 对于学生，仅显示已发布的课程（status=active）
 */
async function renderStudentBookingCards() {
    assignLoadobjectListFunction(window.loadAndRenderCourse_student); // 指定列表加载函数（window. 前缀确保全局查找）
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

        html += `
        <div class="card">
            <div class="card-title"><i class="fa fa-filter"></i> <span data-term="course">课程</span>筛选</div>
            <div class="filter-form" style="display: flex; gap: 20px; margin-top: 10px; margin-bottom: 12px;">
                <div>
                    <label><span data-term="course">课程</span></label>
                    <input type="text" id="course-name-input" placeholder="课程名称">
                </div>
                <div>
                    <label><span data-term="classType">语言类型</span>：</label>
                    <select id="languageType-select">
                        <option value="">全部</option>
                        ${courseTypeOptionsHtml('', { empty: '全部' })}
                    </select>
                </div>
                <div>
                    <label><span data-term="classLevel">难度等级</span>：</label>
                    <select id="difficultyLevel-select">
                        <option value="">全部</option>
                        <option value="B1"><span data-term="classLevelB1">B1入门</span></option>
                        <option value="B2"><span data-term="classLevelB2">B2初级</span></option>
                        <option value="B3">B3中级</option>
                        <option value="B4">B4高级</option>
                    </select>
                </div>
                <div class="filter-item" style="display:none">
                    <label>状态：</label>
                    <select id="course-status-select">
                        <option value="">全部</option>
                        <option value="active">有效</option>
                        <option value="pending">挂起</option>
                    </select>
                </div>
                <button class="btn" onclick="localsearchCourse()">
                    <i class="fa fa-search"></i> 搜索
                </button>
                <button class="btn btn-default" onclick="resetCourseFilter()">
                    <i class="fa fa-redo"></i>重置
                </button>
            </div>
            <!-- 课程选择下拉（隐含教师ID），位于搜索栏与分页区域之间 -->
            <div class="form-line">
                <label><span data-term="course">课程</span>：</label>
                <input type="text" id="teacherIdForCourse" style="display:none;">
                <select id="courseSelect" onchange="loadSchedule()">
                    <option value="">请先选择<span data-term="course">课程</span></option>
                </select>
            </div>`;

        html += getPagebar();

        html += `
        <hr>
        <div>
            <!-- 排期选择下拉 -->
            <div class="form-line" style="display:flex;padding-top:10px;">
                <label>选择排期：</label>
                <select id="scheduleSelect" onchange="displaySchedule()">
                    <option value="">请选择排期</option>
                </select>
            </div>
            <div class="section">
                <div class="section-title">排期信息</div>
                <div class="form-line" style="display:none;">
                    <label>Id</label>
                    <input type="label" id="scheduleId">
                </div>
                <div class="form-line" style="display:none;">
                    <label>cId</label>
                    <input type="label" id="courseId">
                </div>
                <div class="form-line nofocus" style="display:flex;">
                    <label><span data-term="teacher">教师</span></label>
                    <input type="label" id="teacherNameForCourse" value="" class="readonly" style="display:flex;">
                </div>
                <div class="schedule-container" style="display:flex;">
                    <!-- 左侧：排期时区 -->
                    <div class="schedule-column">
                        <div class="form-line">
                            <label>排期时区：</label>
                            <input type="text" id="originalTimeZone" readonly>
                        </div>
                        <div class="form-line">
                            <label>开始日期：</label>
                            <input type="date" id="startDate" class="readonly">
                            <input type="text" id="startDate_weekday" class="readonly" style="width:52px" placeholder="星期">
                        </div>
                        <div class="form-line" style="display:flex;" >
                            <label><span data-term="lessonTime">上课时间</span>：</label>
                            <input type="time" id="startTime" class="readonly">
                        </div>
                        <div class="form-line">
                            <label>结束日期：</label>
                            <input type="date" id="endDate" class="readonly">
                        </div>
                    </div>
                    <!-- 右侧：用户时区 -->
                    <div class="schedule-column" id="rightBlock" style="display:${userTimeZoneDisplay};">
                        <div class="form-line">
                            <label>我的时区：</label>
                            <input type="text" id="timeZone" class="readonly">
                        </div>
                        <div class="form-line">
                            <label>开始日期：</label>
                            <input type="date" id="displayStartDate" readonly>
                            <input type="text" id="displayStartDate_weekday" class="readonly" style="width:52px">
                        </div>
                        <div class="form-line">
                            <label><span data-term="lessonTime">上课时间</span>：</label>
                            <input type="time" id="displayStartTime" class="readonly">
                        </div>
                        <div class="form-line">
                            <label>结束日期：</label>
                            <input type="date" id="displayEndDate" readonly>
                            <input type="text" id="displayEndDate_weekday" class="readonly" style="width:52px">
                        </div>
                    </div>
                </div>
                <div class="form-line nofocus">
                    <label>重复类型：</label>
                    <select id="repeatType" onchange="freshByRepeatType()">
                        <option value="none" disabled:true>不重复</option>
                        <option value="day" disabled:true>每天</option>
                        <option value="week" disabled:true>每周</option>
                        <option value="month" disabled:true>每月</option>
                    </select>
                </div>
                <div class="form-line nofocus">
                    <label>重复周期：</label>
                    <input type="number" id="interval" value="1" min="1" style="width:80px">
                    <span id="repeatUnit">天</span>
                </div>
                <!-- 每周重复：星期选择 -->
                <div class="form-line nofocus" id="weekDaysBox" style="display:none;">
                    <label>重复星期：</label>
                    <div id="weekDays">
                        <label><input type="checkbox" value="1">周一</label>
                        <label><input type="checkbox" value="2">周二</label>
                        <label><input type="checkbox" value="3">周三</label>
                        <label><input type="checkbox" value="4">周四</label>
                        <label><input type="checkbox" value="5">周五</label>
                        <label><input type="checkbox" value="6">周六</label>
                        <label><input type="checkbox" value="7">周日</label>
                    </div>
                </div>
                <!-- 每月重复：日期选择（复选框由脚本动态生成） -->
                <div class="form-line nofocus" id="monthDaysBox" style="display:none;">
                    <label>重复日期：</label>
                    <div id="monthDays"></div>
                </div>
            </div>
            <!-- 预订号（隐藏） -->
            <div class="form-line">
                <label><input type="label" id="bookingId" value="" style="display:none;"></label>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 24px;">
                <div class="form-line nofocus">
                    <label>预订状态：</label>
                    <select id="bookingStatus">
                        <option value="none">无预订</option>
                        <option value="booking">已预订,待确认</option>
                        <!-- status=waiting（候补预订）：名额已满时的候补申请 -->
                        <option value="waiting">候补</option>
                        <option value="booked">预订成功</option>
                        <option value="canceling">取消待确认</option>
                        <option value="canceled">已取消</option>
                        <option value="completed">已完成</option>
                    </select>
                </div>
                <div class="form-line nofocus" style="display:none;">
                    <label>状态：</label>
                    <select id="status" style="display:none;">
                        <option value="pending">待发布</option>
                        <option value="inactive">已收回</option>
                        <option value="active">已发布</option>
                        <option value="frozen">已删除</option>
                    </select>
                </div>
                <div class="sched-form-line">
                    <label>总席位数：</label>
                    <input type="number" id="availableSites" value="1" min="1" readonly class="readonly" style="width:80px">
                </div>
                <div class="sched-form-line">
                    <label>剩余席位数：</label>
                    <input type="number" id="now_availableSites" value="1" min="1" readonly style="width:80px">
                </div>
            </div>
            <!-- 操作按钮 -->
            <div class="btn-group">
                <button class="btn-primary" onclick="previewSchedule()">预览排期</button>
                <!-- 已预订当前排期时显示取消按钮，否则显示预订按钮 -->
                <button class="btn-primary" id="bookBtn" onclick="makeOneBooking_student()">预定<span data-term="course">排期</span></button>
                <!-- 候补预订：仅当「剩余席位数」为 0（名额已满）时显示。
                     流程与「预定排期」一致（同一接口、同一表单数据），只是 status 置为 waiting；
                     显示条件由 applyBookingButtons() 统一决定，默认不在有余位时显示。 -->
                <button class="btn-warning" id="waitBtn" style="display:none;" onclick="makeOneWaitBooking_student()">候补预订</button>
                <button class="btn-danger" id="cancelBtn" onclick="cancelBooking_student()">取消预定</button>
                <!-- 用户已取消预订时显示删除按钮 -->
                <button class="btn-danger" id="deleteBtn" onclick="deleteBooking_student()">删除预定</button>
                <button class="btn-success" id="refreshBtn" onclick="refreshData_student()">刷新</button>
            </div>
        </div>
        </div> <!-- .card -->
        <!-- 排期结果 -->
        <div class="section">
            <div class="section-title">排期结果（列表）</div>
            <table>
                <thead>
                    <tr>
                        <th>课次</th>
                        <th>日期</th>
                        <th>时间</th>
                    </tr>
                </thead>
                <tbody id="resultBody"></tbody>
            </table>
        </div>
        <div class="section">
            <div class="section-title">日历视图</div>
            <div id="calendar" class="calendar"></div>
        </div>`;

        dynamicContentCenter.innerHTML = html;

        // 动态生成每月 1-31 号复选框，每 10 个换一行
        let monthDaysHtml = '';
        for (let i = 1; i <= 31; i++) {
            monthDaysHtml += `<label><input type="checkbox" value="${i}">${i}</label>`;
            if (i % 10 === 0 && i !== 31) monthDaysHtml += '<br>';
        }
        document.getElementById('monthDays').innerHTML = monthDaysHtml;

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

        // 检索课程（仅 status=active 的已发布课程），按课程名称/语言/难度筛选
        async function loadAndRenderCourse_student() {
            const params = new URLSearchParams({
                pageNum: Pagination.pageNum,
                pageSize: Pagination.pageSize,
                courseName: document.getElementById('course-name-input').value.trim(),
                languageType: document.getElementById('languageType-select').value,
                difficultyLevel: document.getElementById('difficultyLevel-select').value,
                status: "active"
            });
            try {
                const result = await request({ url: `/course/page?${params.toString()}` });
                if (result) {
                    const pageData = result;
                    // 更新分页状态
                    Pagination.total = pageData.total;
                    Pagination.totalPages = pageData.totalPages;
                    courseList = pageData.rows;
                } else {
                    Pagination.total = 0;
                    Pagination.totalPages = 0;
                    courseList = [];
                }
            } catch (e) {
                courseList = [];
            }
            renderCourseSelect();
        }

        // 把 courseList 填充到课程下拉框中
        function renderCourseSelect() {
            const sel = document.getElementById('courseSelect');
            sel.innerHTML = '<option value="">请选择<span data-term="course">课程</span></option>';
            let index = (Pagination.pageNum - 1) * Pagination.pageSize;

            courseList.forEach(item => {
                index++;
                if (item.status == 'active') {
                    const opt = document.createElement('option');
                    opt.value = item.courseId;
                    opt.innerText = `${index}. ${item.courseName}`;
                    sel.appendChild(opt);
                }
            });
            renderPagination(Pagination);
        }

        // ====== 学生端深链处理 ======
        // dl: { scdid, tid, sid }，来自 /booking 入口的 URL 参数
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

                // 反查课程详情，获取教师ID和课程名称
                let course = null;
                try {
                    course = await request({ url: `/course/${courseId}` });
                } catch (e) { /* ignore */ }
                if (!course) {
                    alert('课程不存在或已下架');
                    return;
                }

                // 确保目标课程在下拉框中（分页可能导致不在当前页）
                const courseSelect = document.getElementById('courseSelect');
                let courseFound = false;
                for (let i = 0; i < courseSelect.options.length; i++) {
                    if (String(courseSelect.options[i].value) === String(courseId)) {
                        courseSelect.selectedIndex = i;
                        courseFound = true;
                        break;
                    }
                }
                if (!courseFound) {
                    const opt = document.createElement('option');
                    opt.value = course.courseId;
                    opt.innerText = course.courseName;
                    courseSelect.appendChild(opt);
                    courseSelect.value = courseId;
                }
                document.getElementById('courseId').value = courseId;

                // 设置教师信息
                const teacherId = course.teacherId || schedule.teacherId || '';
                document.getElementById('teacherIdForCourse').value = teacherId;
                if (teacherId) {
                    const teacherName = await getUserNameById(teacherId);
                    document.getElementById('teacherNameForCourse').value = teacherName;
                }

                // 加载该课程的有效排期并填充排期下拉框
                scheduleList = await fetchScheduleList(courseId, "active");
                const scheduleSelect = document.getElementById('scheduleSelect');
                scheduleSelect.innerHTML = '<option value="">请选择<span data-term="course">课程</span>排期</option>';
                let schedFound = false;
                if (scheduleList && scheduleList.length > 0) {
                    scheduleList.forEach(s => {
                        if (s.status == 'active') {
                            const opt = document.createElement('option');
                            opt.value = s.scheduleId;
                            let text = `排期: ${s.name}`;
                            if (s.startDate && s.startTime) {
                                text += ` / ${s.startDate} ${s.startTime}`;
                            } else if (s.startDate) {
                                text += ` / ${s.startDate}`;
                            }
                            opt.innerText = text;
                            scheduleSelect.appendChild(opt);
                            if (String(s.scheduleId) === String(dl.scdid)) {
                                schedFound = true;
                            }
                        }
                    });
                }

                if (schedFound) {
                    scheduleSelect.value = dl.scdid;
                    displaySchedule();
                    document.querySelector('.section')?.scrollIntoView({ behavior: 'smooth' });
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
                        renderCourseSelect();
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
            now_availableSites.value = remainingSites;

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

            // 刷新重复类型
            if (scheduleObject.repeatType) {
                document.getElementById('repeatType').value = scheduleObject.repeatType;
            } else {
                document.getElementById('repeatType').value = 'none';
            }

            // 刷新重复间隔
            if (scheduleObject.interval) {
                document.getElementById('interval').value = scheduleObject.interval;
            } else {
                document.getElementById('interval').value = 1;
            }

            // 刷新排期发布状态
            if (scheduleObject.status) {
                document.getElementById('status').value = scheduleObject.status;
            } else {
                document.getElementById('status').value = "pending";
            }

            // 刷新结束日期
            if (scheduleObject.endDate) {
                document.getElementById('endDate').value = scheduleObject.endDate;
            } else {
                document.getElementById('endDate').value = '';
            }

            // 按重复类型选中下拉项
            const sel = document.getElementById('repeatType');
            if (sel != null) {
                sel.selectedIndex = scheduleObject.repeatType;
            }

            // 刷新每周/每月重复的勾选项（如有）
            if (scheduleObject.repeatType === 2 && Array.isArray(scheduleObject.repeatDays)) {
                const checkboxes = document.querySelectorAll('#weekDays input[type="checkbox"]');
                checkboxes.forEach(cb => {
                    cb.checked = scheduleObject.repeatDays.includes(Number(cb.value));
                });
            } else if (scheduleObject.repeatType === 3 && Array.isArray(scheduleObject.repeatDays)) {
                const checkboxes = document.querySelectorAll('#monthDays input[type="checkbox"]');
                checkboxes.forEach(cb => {
                    cb.checked = scheduleObject.repeatDays.includes(Number(cb.value));
                });
            }
            freshByRepeatType();
        }

        // 切换重复类型：更新重复单位，并显示对应的星期（周一~周日）/日期（1-31）勾选区
        function freshByRepeatType() {
            const type = document.getElementById('repeatType').value;
            const unit = { none: "", day: "天", week: "周", month: "月" };
            document.getElementById('repeatUnit').innerText = unit[type];
            document.getElementById('weekDaysBox').style.display = (type === 'week') ? 'flex' : 'none';
            document.getElementById('monthDaysBox').style.display = (type === 'month') ? 'flex' : 'none';
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

        // 将内部函数暴露到 window 作用域，供页面内联事件（onclick 等）调用
        window.renderStudentBookingCards = renderStudentBookingCards;
        window.loadAndRenderCourse_student = loadAndRenderCourse_student;
        window.previewSchedule = previewSchedule;
        window.freshByRepeatType = freshByRepeatType;
        window.renderCalendar = renderCalendar;
        window.displaySchedule = displaySchedule;
        window.makeOneBooking_student = makeOneBooking_student;
        window.makeOneWaitBooking_student = makeOneWaitBooking_student;
        window.deleteBooking_student = deleteBooking_student;
        window.cancelBooking_student = cancelBooking_student;
        window.resetSchedule = resetSchedule;
        window.refreshData_student = refreshData_student;
        window.loadSchedule = loadSchedule;
        window.reloadBooking = reloadBooking_student;
        window.operateBookingStatus = operateBookingStatus;

        // 将当前排期重置为初始值
        function resetSchedule() {
            obj = resetScheduleObject();
            renderSchedule(obj);
        }

        // 构造一个各字段为默认值的排期对象
        function resetScheduleObject() {
            scheduleObject = {
                scheduleId: "",
                courseId: currentCourseId,
                courseName: "",
                teacherId: "",
                teacherName: "",
                startDate: (function () {
                    const now = new Date();
                    const year = now.getFullYear();
                    const month = String(now.getMonth() + 1).padStart(2, '0');
                    const day = String(now.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                })(),
                endDate: (function () {
                    // 结束日期 = 开始日期 + 30 天
                    let startDate = new Date();
                    startDate.setDate(startDate.getDate() + 30);
                    let month = String(startDate.getMonth() + 1).padStart(2, '0');
                    let day = String(startDate.getDate()).padStart(2, '0');
                    return `${startDate.getFullYear()}-${month}-${day}`;
                })(),
                startTime: (function () {
                    const now = new Date();
                    const hours = String(now.getHours()).padStart(2, '0');
                    const minutes = String(now.getMinutes()).padStart(2, '0');
                    return `${hours}:${minutes}`;
                })(),
                endTime: (function () {
                    const now = new Date();
                    now.setHours(now.getHours() + 1);
                    const hours = String(now.getHours()).padStart(2, '0');
                    const minutes = String(now.getMinutes()).padStart(2, '0');
                    return `${hours}:${minutes}`;
                })(),
                repeatType: 0,
                interval: 1,
                repeatDays: [],
                status: "pending",
                timeZone: userTimeZone,
                userTimeZone: userTimeZone
            };
            return scheduleObject;
        }

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
            setVal('interval', 1);
            setVal('status', 'pending');
            // 席位两项留空 = “未知”：总席位数是管理员在「排期设置」时设定的数据（存在排期上），
            // 学生页不产生这个数，未选排期时编一个 1 出来反而像真值。
            // 归空后 isScheduleFull() 按“未知即未满”处理，不会误阻断预定。
            setVal('availableSites', '');
            setVal('now_availableSites', '');

            // 4) 重复类型回到“不重复”，收起每周/每月勾选区并清除勾选
            setVal('repeatType', 'none');
            if (document.getElementById('repeatType')) freshByRepeatType();
            const repeatBoxes = document.querySelectorAll('#weekDays input[type="checkbox"], #monthDays input[type="checkbox"]');
            repeatBoxes.forEach(function (cb) { cb.checked = false; });

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
        async function loadSchedule() {
            const courseSelect = document.getElementById('courseSelect');
            const cid = courseSelect ? courseSelect.value : '';
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

            // 根据 courseList 查询指定 id = cid 的课程，更新教师信息
            let selectedCourse = null;
            if (Array.isArray(courseList)) {
                selectedCourse = courseList.find(course => course.courseId === cid);
                if (selectedCourse != null) {
                    // 更新当前教师ID并显示教师名称
                    document.getElementById('teacherIdForCourse').value = selectedCourse.teacherId;
                    const teacherName = await getUserNameById(selectedCourse.teacherId);
                    document.getElementById('teacherNameForCourse').value = teacherName;
                }
            }

            try {
                scheduleList = await fetchScheduleList(cid, "active");
                const scheduleSelect = document.getElementById('scheduleSelect');
                if (scheduleSelect && scheduleList && scheduleList.length > 0) {
                    // 把 scheduleList 按 scheduleId 添加到排期下拉列表中
                    // （下拉框已在函数开头重置为“请选择课程排期”占位，这里直接追加新选项）
                    scheduleList.forEach(schedule => {
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
                }
            } catch (e) {
                cnt = 0;
            }

            if (cnt > 0) return;

            // 该课程没有有效排期：下拉框给出提示，「排期信息」回到已重置的初始状态
            // （resetScheduleInfoPanel 里已含右侧「我的时区」列的清空与隐藏）
            const scheduleSelectEmpty = document.getElementById('scheduleSelect');
            if (scheduleSelectEmpty) {
                scheduleSelectEmpty.innerHTML = '<option value="">暂时该<span data-term="course">课程</span>没有排期</option>';
            }
            resetScheduleInfoPanel();
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
            await reloadBooking_student();

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

        // 收集页面上的排期表单数据
        function getScheduleFormData() {
            const form = {
                courseId: document.getElementById('courseId').value,
                scheduleId: document.getElementById('scheduleId').value,
                startDate: document.getElementById('startDate').value,
                startTime: document.getElementById('startTime').value,
                repeatType: document.getElementById('repeatType').value,
                interval: document.getElementById('interval').value,
                status: document.getElementById('status').value,
                timeZone: document.getElementById('originalTimeZone').value, // 保持排期的原始时区
                userTimeZone: userTimeZone, // 输出时间的时区
                // 仅当 repeatType 为 week/month 时读取勾选项，其他情况为空数组
                repeatDays: (() => {
                    const repeatTypeVal = document.getElementById('repeatType').value;
                    if (repeatTypeVal === 'week') {
                        const weekDayInputs = document.querySelectorAll('#weekDays input[type=checkbox]');
                        let arr = [];
                        weekDayInputs.forEach(cb => {
                            if (cb.checked) arr.push(Number(cb.value));
                        });
                        return arr;
                    } else if (repeatTypeVal === 'month') {
                        const weekDayInputs = document.querySelectorAll('#monthDays input[type=checkbox]');
                        let arr = [];
                        weekDayInputs.forEach(cb => {
                            if (cb.checked) arr.push(Number(cb.value));
                        });
                        return arr;
                    } else {
                        return [];
                    }
                })(),
                endDate: document.getElementById('endDate').value
            };
            return form;
        }

        // 预览排期：生成排期列表并渲染结果表格与日历
        async function previewSchedule() {
            if (!checkCourseAndSchedule(true, true)) return; // 判断选择有效性
            const form = getScheduleFormData();
            // 生成排期列表 localDateTime List<Date,TIME>
            scheduleResult = await generateScheduleListFromServer(form);
            renderResult();
            renderCalendar();
        }

        // 当前排期是否「名额已满」（剩余席位数 <= 0）。
        // 判据取 renderSchedule 算出的剩余席位；若尚未算出则回退读页面字段。
        // 注意：未知（尚未选定排期）时一律按“未满”处理，避免误阻断正常预定。
        function isScheduleFull() {
            let v = currentRemainingSites;
            if (v == null) {
                const el = document.getElementById('now_availableSites');
                v = el ? el.value : null;
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
                bookVisible = false;                 // 已候补：不再显示预定/候补，用「取消预定」退出候补
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

        // 预订当前排期（新增或更新预订）
        // TBD: 修改一个预订后，按预订 id 查询获取预订对象，更新预订状态
        async function makeOneBooking_student() {
            if (!checkCourseAndSchedule(true, true)){
                alert("请选择课程和排期");
                return; // 判断选择有效性   
            }
            // 名额已满：不进入预定处理，只提示可改走「候补预订」
            // （isScheduleFull 取 renderSchedule 算出的剩余席位数，并回退读页面字段）
            if (isScheduleFull()) {
                alert(WAITLIST_TIP);
                return;
            }

            const status = "booking";
            const formData = getScheduleFormData();
            const teacharId = document.getElementById('teacherIdForCourse').value;

            const bidItem = document.getElementById("bookingId");
            let bookingid = bidItem ? (bidItem.value || "") : "";
            let dto = {
                bookingId: bookingid || "",
                scheduleId: formData.scheduleId || "",
                studentId: userId,
                teacherId: teacharId,
                status: status
            };

            const retId = await createOrUpdateBookingObj(bookingid, dto);
            if (retId != null) {
                alert(bookingid !== "" ? '修改成功' : '预定成功，请等待管理员确认');
            } else {
                // 服务端会做名额校验（满员直接拒绝），失败原因已由请求拦截器弹出；
                // 这里补一句可行动的提示，避免用户只看到“失败”不知道下一步。
                alert((bookingid !== "" ? '修改失败' : '预定失败')
                    + '：若名额已满，请改用「候补预订」排队；也可刷新页面后重试。');
            }
            await reloadBooking_student();
        }

        // 候补预订：名额已满时的替代入口，业务流程与 makeOneBooking_student 完全一致
        // （同一校验、同一接口、同一份表单数据），只是把 status 置为 "waiting"。
        // 页面「预订状态」下拉中 waiting 显示为“候补”。
        // 说明：候补记录不占用席位（后端 countByScheduleId 已排除 waiting），
        //       管理员确认名额释放后再把该记录的 status 改为 booked 即可转为正式预订。
        async function makeOneWaitBooking_student() {
            if (!checkCourseAndSchedule(true, true)) {
                alert("请选择课程和排期");
                return;
            }
            // 只在名额已满时需要候补；尚有余位时引导用户直接预定
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

            const status = "waiting";
            const formData = getScheduleFormData();
            const teacharId = document.getElementById('teacherIdForCourse').value;

            const bidItem = document.getElementById("bookingId");
            // 已有历史记录（如已取消）时复用其 bookingId 改为候补，避免同一排期堆叠多条记录
            let bookingid = bidItem ? (bidItem.value || "") : "";
            let dto = {
                bookingId: bookingid || "",
                scheduleId: formData.scheduleId || "",
                studentId: userId,
                teacherId: teacharId,
                status: status
            };

            const retId = await createOrUpdateBookingObj(bookingid, dto);
            if (retId != null) {
                alert(bookingid !== "" ? '已改为候补，请等待名额释放' : '候补成功，请等待管理员确认');
            } else {
                alert('重试：' + (bookingid !== "" ? '候补修改失败' : '候补失败'));
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

        // 刷新：重新读取排期数据并显示
        function refreshData_student() {
            loadSchedule();
            // TBD: 如果原来的排期 ID 存在，则显示原排期（selected 指定相应的 id）
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
    loadAndRenderCourse_student();
}

// 重置筛选条件
function resetCourseFilter() {
    document.getElementById('course-name-input').value = '';
    document.getElementById('languageType-select').value = '';
    document.getElementById('course-status-select').value = '';
    document.getElementById('difficultyLevel-select').value = '';
    Pagination.pageNum = 1;
    loadAndRenderCourse_student();
}

/**
 * 页面设计说明：
 * 1. 课程选择：按课程名称、语言、难度检索（教师检索暂未开放），下拉单选；
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
