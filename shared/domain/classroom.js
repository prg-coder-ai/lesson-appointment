/**
 * 在线课堂领域层（2026-11-21）
 *
 * 把「课次标识、课次阶段、入口按钮、状态文案、课堂链接」这五件两端都要用、且错了不报错的事
 * 收成唯一权威源。Web（经 frontend/tools/gen-shared-bridge.js 挂 window.ClassroomDomain）与
 * 小程序（miniprogram/shared/domain/classroom.js 镜像）共用同一份实现。
 *
 * 为什么必须共享（三条都是真实踩过的坑）：
 *   ① classroomKeyOf 拼错（把第 1 课次写成 `sid~1`）→ 课堂服务把它当成另一堂课，
 *      表现为「课堂不存在」，不抛异常、不打日志；
 *   ② appointmentDatetime 是 **UTC 裸串**，按本地时间解析会让东八区整体偏 8 小时，
 *      出现「课已结束却显示进入课堂」；
 *   ③ 入口按钮的显隐规则（阶段 / 角色 / 预约状态 / 租户开关）有四个维度，
 *      各端各写一份必然分叉，用户在两处看到不同按钮。
 *
 * 本文件零 DOM、零 wx 依赖：只用内置 Date / encodeURIComponent。
 */

// ---------------------------------------------------------------------------
// 一、课次标识
// ---------------------------------------------------------------------------

/** 课次键分隔符，与后端 ClassroomKey.SEPARATOR 一致 */
export const CLASSROOM_KEY_SEPARATOR = '~';

/**
 * 由排期 id + 课次序号生成课次标识（**与后端 ClassroomKey.of 逐字同规则**）。
 *
 * 只在「手里只有 appointment 行 / 排期行（scheduleId + classIndex）」时使用；
 * 凡是服务端已经下发 classroomKey / scheduleId 的地方，一律直接用服务端的值。
 *
 * 规则：classIndex 为 null / ≤1 → 裸 id。
 *   · 第 1 课次（classIndex=1）→ 裸 scheduleId（历史数据与第 1 课次都存裸 id）；
 *   · 第 2 课次起 → `scheduleId~N`。
 *
 * ⚠ appointment.classIndex 实际是 **1-based**（CourseScheduleService:733 `int index = 1` 起自增）。
 *   实体注释写的「0~N-1，-1默认」是过时注释，别按 0 基写逻辑。
 */
export function classroomKeyOf(scheduleId, classIndex) {
  if (!scheduleId) return '';
  const idx = Number(classIndex);
  if (!idx || idx <= 1) return String(scheduleId);
  return String(scheduleId) + CLASSROOM_KEY_SEPARATOR + idx;
}

/**
 * 从课次键取课次序号：裸 id → 1；`sid~N` → N；后缀非法 → 1（宁可显示第 1 课次也不显示 NaN）。
 * 与 api 侧 classroom/ops.js#classIndexOf 同口径。
 */
export function classIndexOf(key) {
  const s = key == null ? '' : String(key);
  const i = s.indexOf(CLASSROOM_KEY_SEPARATOR);
  if (i < 0 || i === s.length - 1) return 1;
  const v = parseInt(s.slice(i + 1), 10);
  return v > 0 ? v : 1;
}

/** 课次键可读化：有课程名 → 「课程名 · 第N课次」，没有 → 「第N课次」 */
export function classroomLabel(key, courseName) {
  const name = (courseName == null ? '' : String(courseName)).trim();
  const tail = '第' + classIndexOf(key) + '课次';
  return name ? name + ' · ' + tail : tail;
}

// ---------------------------------------------------------------------------
// 二、课次阶段
// ---------------------------------------------------------------------------

/**
 * 宽松解析后端时间，得到 UTC 毫秒时间戳。
 *
 * 关键口径：`appointment.appointmentDatetime` / `classroom.startTime` 是**UTC 裸串**
 * （不带时区后缀），渲染时才用 DatetimeDomain.utcToZoned 转本地。
 * 所以这里必须按 UTC 解析 —— 按本地解析会让东八区整体偏 8 小时，
 * 表现为「课已结束却显示进入课堂」或反过来「还没到点就不能进」。
 */
export function parseUtcLoose(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  const s = String(v).trim();
  // 显式时区（Z / +08:00）→ 交给引擎
  if (/[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
    const t1 = Date.parse(s);
    if (!isNaN(t1)) return t1;
  }
  // 裸串（后端 UTC 墙钟）→ 按 UTC 解析
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  }
  const t2 = Date.parse(s);
  return isNaN(t2) ? NaN : t2;
}

/** 课次阶段常量 */
export const CLASSROOM_PHASE = {
  UPCOMING: 'upcoming',   // 未开始
  LIVE: 'live',           // 进行中（含已开课未到结束时间）
  PAST: 'past',           // 已结束（超过 开始+时长）
  UNKNOWN: 'unknown'      // 时间缺失/无法解析
};

/**
 * 课次阶段。
 *
 * @param {*} rawDatetime     appointment.appointmentDatetime（**UTC 裸串**）
 * @param {*} durationMinutes 课时分钟数（取排期 classDuration，缺失按 60）
 * @param {number} [nowMs]    参考时刻（默认 Date.now()，测试可注入）
 * @returns {'upcoming'|'live'|'past'|'unknown'}
 */
export function classroomPhaseOf(rawDatetime, durationMinutes, nowMs) {
  const start = parseUtcLoose(rawDatetime);
  if (isNaN(start)) return CLASSROOM_PHASE.UNKNOWN;
  let dur = Number(durationMinutes);
  if (!(dur > 0)) dur = 60;
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  if (now >= start + dur * 60000) return CLASSROOM_PHASE.PAST;
  if (now >= start) return CLASSROOM_PHASE.LIVE;
  return CLASSROOM_PHASE.UPCOMING;
}

// ---------------------------------------------------------------------------
// 三、入口按钮
// ---------------------------------------------------------------------------

/**
 * 不构成「我的课堂」的预约状态（与后端 BookingStatus.NON_OCCUPYING 同口径）。
 * 这些状态下即使有 scheduleId，也不应给课堂入口。
 */
export const NON_CLASSROOM_STATUS = {
  cancelled: 1, canceled: 1, cancelling: 1, canceling: 1,
  reject: 1, 'rej-booking': 1, delete: 1, deleted: 1, frozen: 1, waiting: 1,
  't-cancelled': 1, 't-reject': 1, 't-cancelling': 1
};

/** 该预约/课次状态是否还应该有课堂入口（空状态视为可用，交给课堂服务判定） */
export function isClassroomEligible(status) {
  if (!status) return true;
  return !NON_CLASSROOM_STATUS[String(status)];
}

/** 入口动作常量 */
export const CLASSROOM_ACTION = {
  PREP: 'prep',         // 课前准备 / 课程准备（teacher 文案不同）
  ENTER: 'enter',       // 进入课堂
  REPLAY: 'replay'      // 课程回看
};

/**
 * 课次入口按钮列表（Web 与小程序共用规则，两端只负责渲染与点击行为）。
 *
 * | 阶段 | 学生 | 教师 |
 * |---|---|---|
 * | upcoming | 课前准备 + 进入课堂 | 课程准备 + 进入课堂 |
 * | live     | 进入课堂 | 进入课堂 |
 * | past     | 课程回看 | 课程回看 |
 * | unknown  | 进入课堂 | 进入课堂 |
 *
 * @param {Object} opts
 * @param {string} opts.phase         classroomPhaseOf 的返回值
 * @param {string} opts.role          'student' | 'teacher' | 'admin' | 'platform_admin'
 * @param {string} [opts.status]      预约状态（不合格则整体不给按钮）
 * @param {boolean} [opts.enabled]    租户课堂开关；**undefined 视为未核对 → 放行**（交给课堂服务判）
 * @param {boolean} [opts.includePrep] 是否给出「准备」类按钮（小程序无设备检测，传 false）
 * @returns {Array<{action:string,label:string}>}
 */
export function classroomEntryActions(opts) {
  const o = opts || {};
  const phase = o.phase;
  const role = o.role;
  const isTeacher = role === 'teacher';

  // 明确未开通 → 不给入口；undefined（未核对）→ 放行，避免把刚开通的用户挡在外面
  if (o.enabled === false) return [];
  if (!isClassroomEligible(o.status)) return [];

  const includePrep = o.includePrep !== false;

  if (phase === CLASSROOM_PHASE.PAST) {
    return [{ action: CLASSROOM_ACTION.REPLAY, label: '课程回看' }];
  }
  if (phase === CLASSROOM_PHASE.LIVE) {
    return [{ action: CLASSROOM_ACTION.ENTER, label: '进入课堂' }];
  }

  // upcoming / unknown 都按「可以先进去看看」处理：unknown 时时间不可信，不做拦截
  const out = [];
  if (includePrep && phase === CLASSROOM_PHASE.UPCOMING) {
    out.push({ action: CLASSROOM_ACTION.PREP, label: isTeacher ? '课程准备' : '课前准备' });
  }
  out.push({ action: CLASSROOM_ACTION.ENTER, label: '进入课堂' });
  return out;
}

// ---------------------------------------------------------------------------
// 四、课堂状态文案与色调
// ---------------------------------------------------------------------------

/**
 * 课堂状态 → 展示文案 / 色调。
 *
 * 后端有两套状态来源，这里合并成一张表：
 *   · 课堂侧 classroom.status：SCHEDULED / READY / LIVE / PAUSED / CLOSED
 *   · 课次实例 ScheduleInstances.state：upcoming / ongoing / finished
 * 大小写与两套词都收，避免各端各写一份映射后出现「同一个课堂两端显示不同状态」。
 */
const STATE_TABLE = {
  // 课堂侧
  SCHEDULED: { text: '未开始', tone: 'neutral' },
  READY: { text: '待开课', tone: 'neutral' },
  LIVE: { text: '进行中', tone: 'success' },
  PAUSED: { text: '已暂停', tone: 'warning' },
  CLOSED: { text: '已结束', tone: 'muted' },
  // 课次实例侧
  upcoming: { text: '未开始', tone: 'neutral' },
  ongoing: { text: '进行中', tone: 'success' },
  finished: { text: '已结束', tone: 'muted' },
  // 其它
  CANCELLED: { text: '已取消', tone: 'muted' },
  CANCELED: { text: '已取消', tone: 'muted' }
};

/** 课堂状态文案；未知状态原样返回（便于暴露问题，而不是静默变成空白） */
export function classroomStateText(state) {
  if (!state) return '';
  const row = STATE_TABLE[String(state)];
  return row ? row.text : String(state);
}

/** 课堂状态色调：success / warning / muted / neutral */
export function classroomStateTone(state) {
  if (!state) return 'neutral';
  const row = STATE_TABLE[String(state)];
  return row ? row.tone : 'neutral';
}

// ---------------------------------------------------------------------------
// 五、课堂链接
// ---------------------------------------------------------------------------

/**
 * 生成可在**浏览器**打开的课堂链接（小程序自身不承载课堂页，它只负责把链接发出去）。
 *
 * 形如：`https://<webBase>/classroom.html?scheduleId=<key>&tCode=<tenantCode>`
 *
 * 为什么必须带 tCode：课堂页要按租户渲染行业术语与校色，缺 tCode 会退回默认词表；
 * 而管理员发出去的多半是「学生还没登录」的场景，链接必须自带租户上下文。
 *
 * @param {string} webBase    前端站点根（不带结尾斜杠）
 * @param {string} key        课次键（classroomKeyOf 的结果或服务端下发值）
 * @param {string} [tenantCode] 租户码；空则不附加该参数
 * @param {Object} [extra]    额外 query（如 { role: 'teacher' } 用于管理员代开课）
 * @returns {string} webBase 为空时返回空串（调用方据此提示「未配置前端站点」）
 */
export function classroomLink(webBase, key, tenantCode, extra) {
  if (!webBase || !key) return '';
  const base = String(webBase).replace(/\/+$/, '');
  const params = ['scheduleId=' + encodeURIComponent(String(key))];
  if (tenantCode) params.push('tCode=' + encodeURIComponent(String(tenantCode)));
  if (extra) {
    Object.keys(extra).forEach(function (k) {
      const v = extra[k];
      if (v !== undefined && v !== null && String(v) !== '') {
        params.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
      }
    });
  }
  return base + '/classroom.html?' + params.join('&');
}
