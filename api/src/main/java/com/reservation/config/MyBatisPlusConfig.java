// config/MyBatisPlusConfig.java
package  com.reservation.config; 

import com.baomidou.mybatisplus.annotation.DbType;
 
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.TenantLineInnerInterceptor;
import com.reservation.utils.TenantContext;
import net.sf.jsqlparser.expression.LongValue;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Arrays;
import java.util.List;
// 整合原有分页配置，加入多租户拦截器，自动拼接tenant_id条件，业务代码零侵入。
@Configuration
public class MyBatisPlusConfig {

    /**
     * 不参与租户隔离的平台表
     */
    private static final List<String> IGNORE_TABLES = Arrays.asList(
            "sys_tenant",
            "sys_tenant_package",
            "sys_package_template",
            "sys_tenant_stats_monthly",
            "sys_metric_sample",
            "sys_metric_hourly",
            "sys_system_config",
            "sys_platform_admin",
            "sys_dict",
            "user_refresh_token",
            // 会话表是平台级数据（平台管理员需查看全平台在线分布），不参与租户隔离
            "sys_user_session",
            // 行业专业词汇表是共享词表（平台词/行业词 tenant_id=0），
            // 租户端也要消费（/term/map 三级合并），作用域过滤由业务层显式控制，不能走租户插件
            "sys_term",
            // 行业字典是平台级共享数据，表结构也无 tenant_id 列；
            // 租户端需据其解析所属行业编码（/tenant/industry -> switchIndustry），
            // 若不排除，插件会拼出 `tenant_id = ?` 导致 Unknown column 报错
            "sys_industry",
            // 通知规则的「时间点明细」表刻意没有 tenant_id 列（规则头才有），
            // 隔离靠 rule_id 关联的规则头间接保证（规则头走插件过滤）。
            // 同样必须排除，否则插件的 `tenant_id = ?` 会直接撞 Unknown column
            "course_notify_rule_point",
            // 微信 openid 关联表：虽然有 tenant_id 列，但语义是冗余统计，
            // 隔离语义是「一个微信全局只绑一个账号」（uk_wx_openid 全局唯一）。
            // 若走租户插件，平台管理员视角会被拼 tenant_id = 当前租户 → 查不到绑定、静默失败。
            "wx_userid",
            // 推广三表：平台级数据，表结构也无 tenant_id 列。
            // 若不排除，租户插件会拼出 `tenant_id = ?` → Unknown column 全线报错
            // （与 sys_industry / course_notify_rule_point 同一原因）
            "promo_referral", "promo_conversion", "promo_achievement",
            // 协议/隐私政策：平台级共享数据。sys_legal_doc 虽含 tenant_id 列，但该列是
            // 「作用域维度」（0=平台级，>0=租户覆盖级），隔离由业务层显式按 tenant_id 过滤，
            // 不能走租户插件；否则会被拼 `tenant_id = ?` 误伤（与 sys_term 同因）。
            "sys_legal_doc", "sys_legal_accept",
            // 微信 PC 扫码登录/绑定的一次性 state（2026-10-14 P2）：表结构无 tenant_id 列，
            // 生命周期只有 5 分钟（生成→确认/失败/过期即消费删除）。
            // 不排除则插件的 `tenant_id = ?` 直接撞 Unknown column（与 sys_industry 同因）。
            "wx_login_state",
            // 登录风控三表（2026-10-22 P0）：无 tenant_id 列，且全部读写发生在**免登录端点**
            // （/auth/login、/auth/wechat-login、/user/account/exist）——
            // 此时 TenantContext 为空，插件会兜底拼 `tenant_id = -1`，不排除即 Unknown column。
            // 这个坑的特殊性：只在免登录路径复现，本地带 token 测全绿、线上首登 500，
            // 报错信息完全不像权限问题。
            "auth_rate_counter", "auth_device", "auth_challenge",
            // eclassroom 课堂实例注册表 + 租户课堂关系表（2026-10-27 阶段1）：
            // 两表均为平台级管理表（无 tenant_id 列），由平台管理员维护。
            // sys_eclassroom_instance = 课堂服务实例注册（地址/端口/状态）；
            // sys_tenant_eclassroom = 租户-实例关联（tenant_id 是业务列而非隔离列，由业务层显式查询）。
            // 不排除则插件的 `tenant_id = ?` 会撞 Unknown column（与 sys_industry 同因）。
            "sys_eclassroom_instance", "sys_tenant_eclassroom"
    );

    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();

        // 多租户拦截器（必须放在分页拦截器之前）
        TenantLineInnerInterceptor tenantInterceptor = new TenantLineInnerInterceptor();
        tenantInterceptor.setTenantLineHandler(new com.baomidou.mybatisplus.extension.plugins.handler.TenantLineHandler() {
            /**
             * 租户值。
             * 注意：本方法返回非 null 时，插件会无条件拼出 `tenant_id = <本值>`，
             *      不会做 null / NullValue 判断（已通过反编译 mybatis-plus-extension 3.5.7 确认）。
             *      因此不能返回 NullValue，否则 SQL 变成 tenant_id = NULL，恒不成立，查出 0 条。
             */
            @Override
            public net.sf.jsqlparser.expression.Expression getTenantId() {
                Long tenantId = TenantContext.getTenantId();
                // 平台管理员（0）已由 ignoreTable 短路，不会走到这里；
                // 无租户上下文（未登录 / 异步线程 / 定时任务）用 -1 兜底：
                // 既不拼出 tenant_id = NULL，也不会退化成查全量，避免越权
                return new LongValue(tenantId == null ? -1L : tenantId);
            }

            @Override
            public String getTenantIdColumn() {
                return "tenant_id";
            }

            /**
             * 是否跳过该表的租户条件。
             * 返回 true 时插件不会追加任何条件，这是让平台管理员"查全量"的唯一正确方式。
             */
            @Override
            public boolean ignoreTable(String tableName) {
                Long tenantId = TenantContext.getTenantId();
                // 平台管理员（tenantId=0）：不拼接租户条件，可查看全部租户数据
                if (tenantId != null && tenantId == 0) {
                    return true;
                }
                // 其余身份：平台表不参与隔离
                return IGNORE_TABLES.contains(tableName);
            }
        });
        interceptor.addInnerInterceptor(tenantInterceptor);

        // 分页拦截器
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL));

        return interceptor;
    }
}