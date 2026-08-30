// config/MyBatisPlusConfig.java
package  com.reservation.config; 

import com.baomidou.mybatisplus.annotation.DbType;
 
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.TenantLineInnerInterceptor;
import com.reservation.utils.TenantContext;
import net.sf.jsqlparser.expression.LongValue;
import net.sf.jsqlparser.expression.NullValue;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Arrays;
import java.util.List;
// 整合原有分页配置，加入多租户拦截器，自动拼接tenant_id条件，业务代码零侵入。
@Configuration
public class MyBatisPlusConfig {

    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();

        // 多租户拦截器（必须放在分页拦截器之前）
        TenantLineInnerInterceptor tenantInterceptor = new TenantLineInnerInterceptor();
        tenantInterceptor.setTenantLineHandler(new com.baomidou.mybatisplus.extension.plugins.handler.TenantLineHandler() {
            @Override
            public net.sf.jsqlparser.expression.Expression getTenantId() {
                Long tenantId = TenantContext.getTenantId();
                // 平台管理员返回null，不拼接租户条件，查询全局数据
                return tenantId == null || tenantId == 0 ? new NullValue() : new LongValue(tenantId);
            }

            @Override
            public String getTenantIdColumn() {
                return "tenant_id";
            }

            @Override
            public boolean ignoreTable(String tableName) {
                // 全局平台表不参与租户隔离
                List<String> ignoreTables = Arrays.asList(
                        "sys_tenant",
                        "sys_package",
                        "sys_platform_admin",
                        "sys_dict"
                );
                return ignoreTables.contains(tableName);
            }
        });
        interceptor.addInnerInterceptor(tenantInterceptor);

        // 分页拦截器
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL));

        return interceptor;
    }
}