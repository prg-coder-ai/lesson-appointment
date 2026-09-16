import { term, courseType, enumTerm } from '../../core/term.js';

// 验证：小程序端直接复用 shared/terms.js 的纯函数（与 Web 端同源）
Page({
  data: {},
  onLoad() {
    this.setData({
      teacher: term('teacher'),
      course: term('course'),
      student: term('student'),
      lesson: term('lesson'),
      french: courseType('french'),
      english: courseType('english'),
      level: enumTerm('classLevel', 'B2')
    });
  }
});
