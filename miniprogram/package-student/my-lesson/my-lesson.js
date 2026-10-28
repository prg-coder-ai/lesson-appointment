// 学生端「我的课时」（2026-10-28）
//
// 数据链：
//   GET /lesson/balance                      → 账户三数（剩余/累计/已消耗）+ 后端生成的 tip
//   GET /lesson/flows?pageNum&pageSize       → 流水分页（PageResult，字段是 rows 不是 records）
// 展示映射（来源文案、数值正负、色调）统一走 shared/domain/lessonLedger.js（与 Web 同一份权威源）。
//
// 本页**只读**：课时由课堂收尾自动结算，充值/改判属运营动作，学生端不提供入口。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { withTerms } from '../../core/term.js';
import { formatDateTime } from '../../shared/domain/datetime.js';
import {
  lessonSourceText,
  formatLessonAmount,
  lessonChangeText,
  lessonRowTitle,
  lessonBalanceTone
} from '../../shared/domain/lessonLedger.js';

const PAGE_SIZE = 20;

Page(withTerms({
  data: {
    balance: { remaining: '0', total: '0', used: '0' },
    toneClass: 'normal',
    tip: '',
    rows: [],
    pageNum: 0,
    totalPages: 0,
    total: 0,
    loading: false,
    loaded: false
  },

  onLoad() {
    if (!requireAuth()) return;
    this.loadBalance();
    this.loadFlows(true);
  },

  onPullDownRefresh() {
    Promise.all([this.loadBalance(), this.loadFlows(true)])
      .then(() => wx.stopPullDownRefresh())
      .catch(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    // 还有下一页才继续拉，避免到底后每次都空请求
    if (!this.data.loading && this.data.pageNum < this.data.totalPages) {
      this.loadFlows(false);
    }
  },

  loadBalance() {
    return request({ url: ENDPOINTS.LESSON_BALANCE, customLoading: false })
      .then((d) => {
        const b = d || {};
        this.setData({
          balance: {
            remaining: formatLessonAmount(b.remainingLessons),
            total: formatLessonAmount(b.totalLessons),
            used: formatLessonAmount(b.usedLessons)
          },
          // 色调只给语义（normal/empty/owed），颜色在 wxss 里按 class 取
          toneClass: lessonBalanceTone(b),
          tip: b.tip || ''
        });
      })
      .catch(() => {});
  },

  loadFlows(reset) {
    if (this.data.loading) return Promise.resolve();
    const page = reset ? 1 : this.data.pageNum + 1;
    this.setData({ loading: true });
    return request({
      url: ENDPOINTS.LESSON_FLOWS,
      params: { pageNum: page, pageSize: PAGE_SIZE },
      customLoading: false
    })
      .then((d) => {
        const list = ((d && d.rows) || []).map((f) => ({
          id: f.id,
          time: formatDateTime(f.createTime, false),
          title: lessonRowTitle(f),
          source: lessonSourceText(f.source),
          change: lessonChangeText(f.changeLessons),
          positive: Number(f.changeLessons) > 0,
          after: formatLessonAmount(f.remainingAfter),
          reason: f.reason || ''
        }));
        this.setData({
          rows: reset ? list : this.data.rows.concat(list),
          pageNum: page,
          totalPages: (d && d.totalPages) || 0,
          total: (d && d.total) || 0,
          loading: false,
          loaded: true
        });
      })
      .catch(() => {
        this.setData({ loading: false, loaded: true });
      });
  }
}));
