package com.reservation.utils;

import com.reservation.service.TermService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 服务端文案的术语化门面（静态入口）。
 *
 * <p><b>为什么需要它：</b>{@code Result.success(data, msg)} 与
 * {@code throw new XxxException(msg)} 都是静态调用点，遍布 Controller / Service，
 * 拿不到 Spring 容器里的 {@link TermService}。若在每个调用点都注入一次 Bean，
 * 会产生大量样板代码且极易漏改。这里用一个静态 holder 暴露最小的 {@code t(...)} 入口，
 * 让调用点只需把中文字面量换成占位符模板即可。
 *
 * <p><b>用法：</b>
 * <pre>
 *   return Result.success(data, TermMsg.t("{course}创建成功"));
 *   throw new BusinessException(TermMsg.t("该{schedule}名额已满"));
 * </pre>
 * 渲染用哪套词由 {@link TenantContext} 决定（租户词 &gt; 行业词 &gt; 平台词逐级回退），
 * 与业务代码是否显式传租户无关——请求入口已由 TenantInterceptor 设好。
 *
 * <p><b>为什么只能走占位符，不许对整串做子串替换：</b>
 * 见 {@link TermService#renderTemplate(String, Long, String)} 的注释。简言之，
 * 动态数据里若恰好出现锚点词（例如课程名就叫「课程A」）会被误改。
 * 本门面只替换模板里显式写出的 {@code {key}}，传入的数据一律原样保留。
 *
 * <p><b>多语言：</b>当前固定中文（{@link #LANG}）。项目中尚无"请求语言"上下文——
 * 前端是通过 {@code GET /term/map?lang=xx} 显式传参取词表的，后端自己渲染文案时无从得知。
 * 将来要做多语言，扩展点是唯一的：把 {@link #LANG} 换成从当前请求的
 * {@code Accept-Language} 头解析（或让 TenantInterceptor 把语言一并放进 TenantContext），
 * 其余调用点无需改动。
 *
 * <p><b>注意：</b>本类必须能被 Spring 扫描并实例化（{@code @Component}），
 * 静态字段才有值；因此**不能加私有构造器**。容器不可用时 {@code t()} 原样返回模板，
 * 即退化为"未做术语转换"，而不是抛异常打断业务。
 */
@Component
public class TermMsg {

    /** 当前渲染语言。项目暂只做中文；多语言改造只需改这一处，见类注释 */
    private static final String LANG = "zh";

    /** Spring 注入的实例；非 Spring 上下文（如纯单元测试）时为 null，此时原样返回模板 */
    private static TermService termService;

    @Autowired
    public void setTermService(TermService svc) {
        TermMsg.termService = svc;
    }

    /**
     * 按当前租户渲染文案模板。
     *
     * @param template 含 {@code {key}} 占位符的模板，如 {@code "{course}创建成功"}；
     *                 不含占位符时原样返回。key 在所有作用域都查不到时**原样保留 {@code {key}}**，
     *                 以便拼写错误在测试期暴露而非静默清空。
     * @return 渲染后的文案；模板为空、或容器尚未就绪时返回原值（保证不因文案问题打断业务）
     */
    public static String t(String template) {
        if (template == null || template.isEmpty()) return template;
        TermService svc = termService;
        if (svc == null) return template;
        return svc.renderTemplate(template, TenantContext.getTenantId(), LANG);
    }

    /**
     * 渲染文案模板，并合并**动态数据**（名额数、时间、课次名…）。
     *
     * <p>术语词与动态数据放进同一张 Map 一次渲染：避免"先渲染术语、再插入数据"的两趟陷阱
     * （数据值里若含 {@code {}} 会被二次展开），也避免同名冲突。
     * <b>动态数据的 key 优先于术语词</b>——但请勿把术语 key（如 {@code course}）用作动态数据的
     * key，否则会覆盖该词的行业话术，语义混乱。
     *
     * @param vars 动态数据，可为 null
     */
    public static String t(String template, Map<String, String> vars) {
        if (template == null || template.isEmpty()) return template;
        TermService svc = termService;
        if (svc == null) return template;
        Map<String, String> merged = new LinkedHashMap<>();
        // 先放术语词，再放动态数据（后放的优先，调用方的显式数据覆盖同名术语 key）
        merged.putAll(svc.getTermMap(TenantContext.getTenantId(), LANG));
        if (vars != null) merged.putAll(vars);
        return svc.renderTemplate(template, merged);
    }
}
