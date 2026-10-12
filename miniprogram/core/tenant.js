// 小程序端：租户信息只读服务封装（走业务端 api / apiBase）
// 租户管理员视角：只读查看本租户的 tenantCode / 租期 / 套餐 / 余量，无写操作。
// 对应后端：TenantController.getCurrentTenant / TenantPackageController.getPackageByTenant
//          / PackageTemplateController.getById（均对 admin 角色开放）。

import { request } from './request.js';
import { ENDPOINTS } from '../shared/apiPaths.js';

// 当前登录者所属租户（Result<Tenant> → Tenant）
export async function getCurrentTenant() {
  return request({ url: ENDPOINTS.TENANT_CURRENT, method: 'GET', customErrorMsg: false });
}

// 某租户实际持有的套餐（Result<TenantPackage> → TenantPackage）
// 尚未配置套餐时后端返回 404，这里降级为 null（表示不限额）
export async function getTenantPackage(tenantId) {
  if (!tenantId) return null;
  try {
    return await request({ url: ENDPOINTS.TENANT_PACKAGE_BY_TENANT(tenantId), method: 'GET', customErrorMsg: false });
  } catch (e) {
    return null;
  }
}

// 套餐模板详情（用于把 packageId 转成可读"套餐"名）
export async function getPackageTemplate(id) {
  if (!id) return null;
  try {
    return await request({ url: ENDPOINTS.PACKAGE_TEMPLATE_GET(id), method: 'GET', customErrorMsg: false });
  } catch (e) {
    return null;
  }
}

// 租户状态 → 中文
export function tenantStatusText(s) {
  return s === 1 ? '正常' : s === 2 ? '停用' : s === 3 ? '退租' : (s == null ? '未知' : '' + s);
}

// 把 TenantPackage 的若干资源额度整理成"已用 / 限额 / 余量"列表项
// 限额为 0 表示不限；余量 = 限额 - 已用（不低于 0）
export function toQuotaRows(pkg) {
  if (!pkg) return [];
  const defs = [
    { key: 'course', label: '课程', limitKey: 'courseLimit', curKey: 'courseCurrent' },
    { key: 'schedule', label: '排期', limitKey: 'scheduleLimit', curKey: 'scheduleCurrent' },
    { key: 'user', label: '注册用户', limitKey: 'userTotalLimit', curKey: 'userCurrent' },
    { key: 'teacher', label: '教师', limitKey: 'teacherLimit', curKey: 'teacherCurrent' },
    { key: 'student', label: '学生', limitKey: 'studentLimit', curKey: 'studentCurrent' },
    { key: 'teacherPublish', label: '教师信息发布', limitKey: 'teacherPublishLimit', curKey: 'teacherPublishCurrent' }
  ];
  return defs.map(d => {
    const limit = pkg[d.limitKey] || 0;
    const current = pkg[d.curKey] || 0;
    const unlimited = limit <= 0;
    return {
      key: d.key,
      label: d.label,
      limit,
      current,
      unlimited,
      remain: unlimited ? null : Math.max(0, limit - current),
      percent: unlimited ? 0 : (current === 0 ? 0 : Math.min(999, Math.round(current * 100 / limit)))
    };
  });
}
