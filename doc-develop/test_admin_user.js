/**
 * admin-user.js 前端集成测试（无浏览器，jsdom 加载真实源码 + mock 依赖）
 * 对齐测试用例文档：
 *   TC-F-09 用户列表渲染（返回本租户用户）
 *   TC-F-10 按角色筛选 teacher/student 列表正确 + 编辑弹窗带入 isTeacher（修复点）
 *   TC-F-11 修改用户状态
 * 验证本次修复：openEditUserModal 之前引用未声明的 isTeacher 会抛 ReferenceError，
 * 导致编辑弹窗打不开、角色信息无法带入；现已按 user.role 带入并改用 innerHTML 渲染标题。
 */
const fs = require('fs');
const { JSDOM } = require('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/jsdom');

const SRC = 'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/frontend/js/admin-user.js';
const code = fs.readFileSync(SRC, 'utf8');

const RUNNER = [
  ';(async function(){',
  '  let pass=0, fail=0; const log=[];',
  "  function check(n,c){ if(c){pass++;log.push('  ✓ '+n);} else {fail++;log.push('  ✗ '+n);} }",
  "  window.__rows = { teacher:[{userId:'T1',name:'李老师',account:'t1',email:'t@e.com',phone:'13800001111',status:'active',role:'teacher'}],",
  "                    student:[{userId:'S1',name:'王同学',account:'s1',email:'s@e.com',phone:'13900002222',status:'active',role:'student'}] };",
  "  await renderTeacherCards('teacher');",
  "  await new Promise(r=>setTimeout(r,60)); // loadUserList 为异步，等待列表行与缓存填充",
  "  const teacherTitle = document.querySelector('.card-title') && document.querySelector('.card-title').textContent;",
  "  check('TC-F-10 teacher 列表标题含「教师」', /教师/.test(teacherTitle));",
  "  const tbody = document.querySelector('#user-table-body');",
  "  check('TC-F-09 列表渲染出 T1 行', !!tbody && /李老师/.test(tbody.textContent));",
  "  let threw=false, titleTeacher='', phoneTeacher='';",
  "  try { openEditUserModal('T1'); const t=document.getElementById('editUserModalTitle'); titleTeacher=t?t.textContent:''; const pf=document.querySelector('#editUserForm [name=\"phone\"]'); phoneTeacher=pf?pf.value:''; }",
  "  catch(e){ threw=true; log.push('  ✗ 编辑教师弹窗抛异常: '+e.message); }",
  "  check('TC-F-10 编辑教师弹窗不再抛 ReferenceError（isTeacher 已带入）', !threw);",
  "  check('TC-F-10 编辑教师标题=编辑教师信息（无字面 <span>）', titleTeacher==='编辑教师信息');",
  "  check('TC-F-10 编辑表单手机号回填真实值（非脱敏串）', phoneTeacher==='13800001111');",
  "  let addTitle='', addThrew=false;",
  "  try { openAddUserModal(); const t=document.getElementById('addUserModalTitle'); addTitle=t?t.textContent:''; }",
  "  catch(e){ addThrew=true; log.push('  ✗ 添加弹窗异常: '+e.message); }",
  "  check('添加弹窗不抛异常且标题带入角色=添加教师（当前角色 teacher）', !addThrew && addTitle==='添加教师');",
  "  await renderTeacherCards('student');",
  "  await new Promise(r=>setTimeout(r,60));",
  "  const studentTitle = document.querySelector('.card-title') && document.querySelector('.card-title').textContent;",
  "  check('TC-F-10 student 列表标题含「学生」', /学生/.test(studentTitle));",
  "  let threwS=false, titleStudent='';",
  "  try { openEditUserModal('S1'); const t=document.getElementById('editUserModalTitle'); titleStudent=t?t.textContent:''; }",
  "  catch(e){ threwS=true; log.push('  ✗ 编辑学生弹窗抛异常: '+e.message); }",
  "  check('TC-F-10 编辑学生弹窗不抛异常', !threwS);",
  "  check('TC-F-10 编辑学生标题=编辑学生信息', titleStudent==='编辑学生信息');",
  "  window.__reqs = [];",
  "  confirmTeacher('T1','teacher');",
  "  await new Promise(r=>setTimeout(r,60));",
  "  const hit = (window.__reqs||[]).find(r => /\\/user\\/updateStatus/.test(r.url));",
  "  check('TC-F-11 调用 /user/updateStatus', !!hit);",
  "  check('TC-F-11 提交 status=active', !!hit && hit.data && hit.data.status==='active');",
  "  check('TC-F-11 提交 userId=T1', !!hit && hit.data && hit.data.userId==='T1');",
  "  window.__result = { pass, fail, log };",
  "})();"
].join('\n');

const html = '<!DOCTYPE html><html><body></body></html>';
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
const w = dom.window;

w.document.write = () => {};                 // 屏蔽 document.write('<script src=pagefoot.js>')，避免覆盖文档
w.API_BASE_URL = '';
w.dynamicContentCenter = w.document.createElement('div');
w.document.body.appendChild(w.dynamicContentCenter);
w.Pagination = { pageNum: 1, pageSize: 10, total: 0, totalPages: 1 };
w.request = async (cfg) => {
  w.__reqs = w.__reqs || [];
  w.__reqs.push(cfg);
  const url = String(cfg.url || '');
  if (url.indexOf('/user/page') >= 0) {
    const role = new URLSearchParams(url.split('?')[1] || '').get('role') || 'teacher';
    const rows = w.__rows[role] || [];
    return { total: rows.length, totalPages: 1, rows };
  }
  return { code: 200, data: {} };
};
w.applyTerms = () => {};
w.escapeAttr = (s) => s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
w.getPagebar = () => '';
w.assignLoadobjectListFunction = () => {};
w.renderPagination = () => {};
w.openComposeToUser = () => {};
w.alert = () => {};
w.confirm = () => true;

w.eval(code + '\n' + RUNNER);

setTimeout(() => {
  const r = w.__result || { pass: 0, fail: 0, log: ['(结果未产出)'] };
  console.log(r.log.join('\n'));
  console.log('\n结果：' + r.pass + ' 通过, ' + r.fail + ' 失败');
  process.exit(r.fail === 0 ? 0 : 1);
}, 300);
