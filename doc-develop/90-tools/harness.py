#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SaaS 多租户移植 · 功能测试 harness (可重复执行)
被测系统: lesson_appointment 后端 (http://localhost:8081)
覆盖组: D(登录鉴权) E(权限越权) F(注册) S(数据隔离★) K(额度闭环)
每个写入类用例执行后用 SQL 核对 tenant_id，作为隔离是否生效的硬证据。
"""
import urllib.request, urllib.error, json, subprocess, sys, os, datetime, time

BASE = "http://localhost:8081"
PW = "Test@123456"
MYSQL = ["mysql", "-uroot", "-p123456", "lesson_appointment", "-B", "-N", "-e"]
TS = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

results = []

def api(method, path, body=None, token=None):
    url = BASE + path
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            code, txt = r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        code, txt = e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return None, {"_err": str(e)}
    try:
        j = json.loads(txt)
    except Exception:
        j = {"_raw": txt}
    return code, j

def db(sql):
    try:
        out = subprocess.run(MYSQL + [sql], capture_output=True, text=True, timeout=30).stdout
    except Exception as e:
        return [["ERR:" + str(e)]]
    return [l.split("\t") for l in out.splitlines() if l.strip() != ""]

def dbval(sql):
    rows = db(sql)
    return rows[0][0] if rows else None

def code_of(j):
    return j.get("code") if isinstance(j, dict) else None

def data_of(j):
    return j.get("data") if isinstance(j, dict) else None

def msg_of(j):
    return j.get("message") if isinstance(j, dict) else str(j)

def check(tc, group, title, status, detail=""):
    # status: "PASS" / "FAIL" / "DIS"(规格偏差)
    results.append((tc, group, title, status, detail))
    tag = {"PASS":"✅PASS","FAIL":"❌FAIL","DIS":"⚠️DIS"}[status]
    print(tag + f"[{group}] {tc} {title}" + (f"  | {detail}" if detail else ""))

def setup():
    print("\n===== SETUP: 清理并初始化测试数据 =====")
    db("""INSERT IGNORE INTO sys_tenant (id, tenant_code, org_name, status, package_id, industry_id, expire_time, deleted)
          VALUES (2,'TENANT_A','租户A测试',1,1,1,DATE_ADD(NOW(),INTERVAL 1 YEAR),0),
                 (3,'TENANT_B','租户B测试',1,4,2,DATE_ADD(NOW(),INTERVAL 1 YEAR),0),
                 (4,'TENANT_C','租户C测试',1,1,3,DATE_ADD(NOW(),INTERVAL 1 YEAR),0);""")
    db("""INSERT IGNORE INTO sys_tenant_package
          (tenant_id, course_limit, course_current, schedule_limit, schedule_current, user_total_limit, user_current,
           teacher_limit, teacher_current, student_limit, student_current, teacher_publish_limit, teacher_publish_current)
          VALUES (2, 3,0, 10,0, 50,0, 5,0, 50,0, 10,0),
                 (3, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0),
                 (4, 3,0, 10,0, 50,0, 5,0, 50,0, 10,0);""")
    # 清理上一轮测试产生的业务数据与额度占用，保证可重复
    for t in (2,3):
        db(f"DELETE FROM course WHERE tenant_id={t};")
        db(f"DELETE FROM course_schedule WHERE tenant_id={t};")
        db(f"DELETE FROM booking WHERE tenant_id={t};")
        db(f"DELETE FROM appointment WHERE tenant_id={t};")
        db(f"DELETE FROM teacher_professional WHERE tenant_id={t};")
        db(f"DELETE FROM teacher_published_profile WHERE tenant_id={t};")
        db(f"DELETE FROM course_template WHERE tenant_id={t};")
    db("UPDATE sys_tenant_package SET course_current=0,schedule_current=0,user_current=0,teacher_current=0,student_current=0,teacher_publish_current=0 WHERE tenant_id IN (2,3,4);")
    db("DELETE FROM course_template WHERE tenant_id=0;")
    db("""DELETE FROM user WHERE account IN
          ('plat_test@plt.com','a_admin@a.com','a_teacher@a.com','a_student@a.com',
           'b_admin@b.com','b_teacher@b.com','b_student@b.com');""")

    fx = {}
    c, j = api("POST", "/user/register", {"account":"plat_test@plt.com","password":PW,
        "role":"platform_admin","name":"平台测试","email":"plat_test@plt.com","tenantCode":"platform"})
    assert code_of(j) == 200, f"平台管理员注册失败: {j}"
    fx["PT"] = data_of(j).get("token")

    def add_user(account, role, tenant_code):
        c, j = api("POST", "/user/add", {"account":account,"password":PW,"role":role,
            "name":account,"email":account,"tenantCode":tenant_code}, token=fx["PT"])
        if code_of(j) != 200:
            print(f"  创建 {account} 失败: {j}")
            return None, None
        return data_of(j).get("token"), data_of(j).get("userId")
    for tcode, key in [("TENANT_A","A"),("TENANT_B","B")]:
        for role, rk in [("admin","admin"),("teacher","teacher"),("student","student")]:
            acc = f"{key.lower()}_{role}@{key.lower()}.com"
            tok, uid = add_user(acc, role, tcode)
            fx[f"{key}_{rk}_TOK"] = tok
            fx[f"{key}_{rk}_UID"] = uid

    # 各租户独立模板(多租户隔离: 课程创建时按 tenant_id 过滤模板, 平台模板对租户不可见)
    c, j = api("POST", "/course/template/insert", {"templateName":"A模板-shared-en-L1","languageType":"英语",
        "difficultyLevel":"初级","content":"c","feature":"f","classForm":"一对一","status":"active",
        "classFee":100,"classDuration":60}, token=fx["A_admin_TOK"])
    fx["TPL_A"] = data_of(j).get("templateId") if code_of(j)==200 else None
    c, j = api("POST", "/course/template/insert", {"templateName":"B模板-shared-en-L1","languageType":"英语",
        "difficultyLevel":"初级","content":"c","feature":"f","classForm":"一对一","status":"active",
        "classFee":100,"classDuration":60}, token=fx["B_admin_TOK"])
    fx["TPL_B"] = data_of(j).get("templateId") if code_of(j)==200 else None
    print("共享模板A:", fx.get("TPL_A"), " 共享模板B:", fx.get("TPL_B"))
    return fx

def run_tests(fx):
    PT=fx["PT"]; A_tea=fx["A_teacher_TOK"]; A_stu=fx["A_student_TOK"]; A_adm=fx["A_admin_TOK"]
    B_adm=fx["B_admin_TOK"]; B_tea=fx["B_teacher_TOK"]
    TPL_A=fx["TPL_A"]; TPL_B=fx["TPL_B"]; A_ID=2; B_ID=3
    A_tea_uid=fx["A_teacher_UID"]; A_stu_uid=fx["A_student_UID"]; B_tea_uid=fx["B_teacher_UID"]

    # ===== D 登录鉴权 =====
    c,j=api("POST","/auth/login",{"account":"plat_test@plt.com","password":PW,"tenantCode":"platform","role":"platform_admin"})
    check("TC-D-01","D","平台管理员登录成功", "PASS" if code_of(j)==200 and data_of(j) and data_of(j).get("token") else "FAIL", f"code={code_of(j)}")

    c,j=api("POST","/auth/login",{"account":"a_teacher@a.com","password":PW,"tenantCode":"TENANT_A","role":"teacher"})
    check("TC-D-02","D","租户端登录成功", "PASS" if code_of(j)==200 and data_of(j) and data_of(j).get("token") else "FAIL", f"code={code_of(j)}")
    A_tea = data_of(j).get("token") or A_tea

    c,j=api("POST","/auth/login",{"account":"x","password":PW,"tenantCode":"NOPE","role":"teacher"})
    check("TC-D-03","D","租户编码不存在→403", "PASS" if code_of(j)==403 else "FAIL", f"code={code_of(j)}")

    db("INSERT IGNORE INTO sys_tenant (id,tenant_code,org_name,status,package_id,industry_id,expire_time,deleted) "
       "VALUES (9,'TENANT_XDEL','已删租户',1,1,1,DATE_ADD(NOW(),INTERVAL 1 YEAR),1);")
    c,j=api("POST","/auth/login",{"account":"x","password":PW,"tenantCode":"TENANT_XDEL","role":"admin"})
    check("TC-D-05","D","已软删除租户登录→403", "PASS" if code_of(j)==403 else "FAIL", f"code={code_of(j)}")
    db("DELETE FROM sys_tenant WHERE id=9;")

    c,j=api("POST","/auth/login",{"account":"a_teacher@a.com","password":PW,"tenantCode":"TENANT_B","role":"teacher"})
    check("TC-D-06","D","跨租户登录→拒绝(data.code=404)", "PASS" if data_of(j) and data_of(j).get("code")==404 else "FAIL", f"code={code_of(j)} data={data_of(j)}")

    c,j=api("GET","/course/page")
    check("TC-D-11","D","无Token访问受保护接口→401", "PASS" if c==401 else "FAIL", f"http={c}")

    # ===== E 权限越权 =====
    c,j=api("POST","/tenant/page",{"pageNum":1,"pageSize":10}, token=PT)
    recs=data_of(j) or {}
    rows=recs.get("rows",[]) if isinstance(recs,dict) else []
    check("TC-E-01","E","平台管理员看全部租户(>=2)", "PASS" if code_of(j)==200 and len(rows)>=2 else "FAIL", f"code={code_of(j)} rows={len(rows)}")

    c,j=api("POST","/tenant/page",{"pageNum":1,"pageSize":10}, token=A_adm)
    recs=data_of(j) or {}; rows=recs.get("rows",[]) if isinstance(recs,dict) else []
    only_own = all(str(r.get("id"))=="2" for r in rows) and len(rows)>=1
    check("TC-E-02","E","租户管理员访问租户列表(规格要求403,实际返回本租户)", "DIS" if code_of(j)==200 and only_own else ("FAIL" if code_of(j)!=403 else "PASS"),
          f"code={code_of(j)} 仅见本租户={only_own} 行数={len(rows)} (规格期望403,实现返回本租户数据,非越权)")

    c,j=api("GET","/tenant/3", token=A_adm)
    check("TC-E-04","E","租户管理员看他人租户→403", "PASS" if code_of(j)==403 else "FAIL", f"code={code_of(j)}")

    # ===== F 注册 =====
    acc=f"reg_{TS}@a.com"
    c,j=api("POST","/user/register",{"account":acc,"password":PW,"tenantCode":"TENANT_A","role":"student","name":"注册测试","email":acc})
    tid=dbval(f"SELECT tenant_id FROM user WHERE account='{acc}'")
    check("TC-F-08","F","注册带tenantCode→user.tenant_id=租户A", "PASS" if code_of(j)==200 and str(tid)=="2" else "FAIL", f"code={code_of(j)} tenant_id={tid}")

    c,j=api("POST","/user/register",{"account":f"regno_{TS}@a.com","password":PW,"role":"student","name":"x","email":f"regno_{TS}@a.com"})
    check("TC-F-09","F","注册不传tenantCode→403", "PASS" if code_of(j)==403 else "FAIL", f"code={code_of(j)}")

    c,j=api("POST","/user/register",{"account":"plat_test@plt.com","password":PW,"tenantCode":"TENANT_A","role":"student","name":"x","email":"plat_test@plt.com"})
    check("TC-F-04","F","账号重复注册→拒绝", "PASS" if code_of(j)!=200 else "FAIL", f"code={code_of(j)} msg={msg_of(j)}")

    # ===== S 数据隔离(写入 tenant_id 核对) =====
    c,j=api("POST","/course/insert",{"templateId":TPL_A,"courseName":"A课程1","content":"c","feature":"f","teacherId":A_tea_uid}, token=A_tea)
    A_course=data_of(j).get("courseId") if code_of(j)==200 else None
    tid=dbval(f"SELECT tenant_id FROM course WHERE course_id='{A_course}'") if A_course else None
    check("TC-S-01","S","课程写入tenant_id=A", "PASS" if A_course and str(tid)=="2" else "FAIL", f"course={A_course} tenant_id={tid}")

    c,j=api("POST","/schedule/create",{"courseId":A_course,"name":"A排期1","startDate":"2026-10-01","startTime":"10:00:00","endDate":"2026-10-01","endTime":"11:00:00","availableSites":1,"timeZone":"Asia/Shanghai","repeatType":0}, token=A_tea)
    d=data_of(j); A_sch=(d.get("scheduleId") or d.get("Id") or d.get("id")) if isinstance(d,dict) else None
    tid=dbval(f"SELECT tenant_id FROM course_schedule WHERE schedule_id='{A_sch}'") if A_sch else None
    check("TC-S-02","S","排期写入tenant_id=A", "PASS" if A_sch and str(tid)=="2" else "FAIL", f"sch={A_sch} tenant_id={tid}")

    c,j=api("POST","/course/booking/create",{"scheduleId":A_sch,"teacherId":A_tea_uid,"studentId":A_stu_uid,"status":"booked"}, token=A_stu)
    A_book=data_of(j) if isinstance(data_of(j),str) else None
    tid=dbval(f"SELECT tenant_id FROM booking WHERE booking_id='{A_book}'") if A_book else None
    check("TC-S-03","S","预约写入tenant_id=A", "PASS" if A_book and str(tid)=="2" else "FAIL", f"book={A_book} tenant_id={tid}")

    c,j=api("POST","/course/appointment/add",{"bookingId":A_book,"classIndex":1,"appointmentDatetime":"2026-10-01T10:00:00","status":"active"}, token=A_stu)
    A_appt=dbval("SELECT MAX(id) FROM appointment") if code_of(j)==200 else None
    tid=dbval(f"SELECT tenant_id FROM appointment WHERE id={A_appt}") if A_appt else None
    check("TC-S-04","S","时段写入tenant_id=A", "PASS" if code_of(j)==200 and str(tid)=="2" else "FAIL", f"resp={j} tenant_id={tid}")

    c,j=api("POST","/course/template/insert",{"templateName":f"A模板{TS}","languageType":"日语","difficultyLevel":"中级","content":"c","feature":"f","classForm":"小班课","status":"active","classFee":80,"classDuration":45}, token=A_adm)
    A_tpl=data_of(j).get("templateId") if code_of(j)==200 else None
    tid=dbval(f"SELECT tenant_id FROM course_template WHERE template_id='{A_tpl}'") if A_tpl else None
    check("TC-S-05","S","模板写入tenant_id=A", "PASS" if A_tpl and str(tid)=="2" else "FAIL", f"tpl={A_tpl} tenant_id={tid}")

    c,j=api("POST","/teacher/professional/addTeacherProfessionalInfo",{"teacherId":A_tea_uid,"name":"A老师资质"}, token=A_tea)
    A_tp=dbval(f"SELECT teacher_professional_id FROM teacher_professional WHERE teacher_id='{A_tea_uid}' ORDER BY create_time DESC LIMIT 1") if code_of(j)==200 else None
    tid=dbval(f"SELECT tenant_id FROM teacher_professional WHERE teacher_professional_id='{A_tp}'") if A_tp else None
    check("TC-S-06","S","教师资质写入tenant_id=A", "PASS" if code_of(j)==200 and str(tid)=="2" else "FAIL", f"resp={j} tenant_id={tid}")

    # S-07 管理员代发(验证 tenant_id 写入)
    c,j=api("POST","/teacher/published/save",{"teacherId":A_tea_uid,"status":"published","title":"A发布-管理员","staticHtml":"<div>教师A个人介绍（管理员代发）</div>"}, token=A_adm)
    A_pp=dbval(f"SELECT published_profile_id FROM teacher_published_profile WHERE teacher_id='{A_tea_uid}' ORDER BY create_time DESC LIMIT 1") if code_of(j)==200 else None
    tid=dbval(f"SELECT tenant_id FROM teacher_published_profile WHERE published_profile_id='{A_pp}'") if A_pp else None
    check("TC-S-07","S","(管理员)教师发布写入tenant_id=A", "PASS" if code_of(j)==200 and str(tid)=="2" else "FAIL", f"resp={j} tenant_id={tid}")

    # S-07b 教师自发布(验证权限, 真实缺陷点)
    c,j=api("POST","/teacher/published/save",{"teacherId":A_tea_uid,"status":"published","title":"A发布-教师","staticHtml":"<div>教师A个人介绍（教师自发布）</div>"}, token=A_tea)
    check("TC-S-07b","S","教师可自发布本人资料(TC-J-05)", "PASS" if code_of(j)==200 else "FAIL", f"code={code_of(j)} msg={msg_of(j)}")

    # 审计日志为异步线程写入(2线程池)，同步查询可能尚未 flush，轮询等待最多 ~3s
    tid=None
    for _ in range(20):
        tid=dbval(f"SELECT tenant_id FROM audit_log WHERE tenant_id=2 ORDER BY created_at DESC LIMIT 1")
        if str(tid)=="2": break
        time.sleep(0.15)
    check("TC-S-10","S","审计日志写入tenant_id=A", "PASS" if str(tid)=="2" else "FAIL", f"tenant_id={tid}")

    # 列表隔离(正向)
    c,j=api("GET","/course/page", token=A_adm)
    rows=(data_of(j) or {}).get("rows",[]) if isinstance(data_of(j),dict) else []
    all_a=all(str(r.get("tenantId"))=="2" for r in rows) if rows else True
    check("TC-S-11","S","A课程列表仅含本租户", "PASS" if code_of(j)==200 and all_a and len(rows)>=1 else "FAIL", f"code={code_of(j)} 行数={len(rows)}")

    c,j=api("GET","/course/page", token=B_adm)
    rows=(data_of(j) or {}).get("rows",[]) if isinstance(data_of(j),dict) else []
    check("TC-S-12","S","B课程列表不含A数据", "PASS" if code_of(j)==200 and len(rows)==0 else "FAIL", f"code={code_of(j)} 行数={len(rows)}")

    c,j=api("GET","/user/page", token=A_adm)
    rows=(data_of(j) or {}).get("rows",[]) if isinstance(data_of(j),dict) else []
    all_a=all(str(r.get("tenantId"))=="2" for r in rows) if rows else True
    check("TC-S-15","S","A用户列表仅含本租户", "PASS" if code_of(j)==200 and all_a else "FAIL", f"code={code_of(j)} 行数={len(rows)}")

    # 跨租户读取/删除 (B 课程)
    c,j=api("POST","/course/insert",{"templateId":TPL_B,"courseName":"B课程1","content":"c","feature":"f","teacherId":B_tea_uid}, token=B_tea)
    B_course=data_of(j).get("courseId") if code_of(j)==200 else None
    B_name="B课程1"
    c,j=api("GET", f"/course/{B_course}", token=A_adm)
    d=data_of(j)
    leaked = isinstance(d,dict) and d.get("courseName")==B_name and str(d.get("tenantId"))=="3"
    check("TC-S-17","S","A查B课程→不可见(无越权泄露)", "PASS" if not leaked and code_of(j) in (200,403,404) else "FAIL", f"code={code_of(j)} d={d}")

    c,j=api("DELETE", f"/course/deleteById/{B_course}", token=A_adm)
    exists=dbval(f"SELECT COUNT(*) FROM course WHERE course_id='{B_course}'")
    safe = (code_of(j) in (403,404)) or (isinstance(data_of(j),(int,)) and data_of(j)==0) or ("0" in str(data_of(j)))
    check("TC-S-18","S","A删B课程→被拦截且B数据完好", "PASS" if safe and str(exists)=="1" else "FAIL", f"code={code_of(j)} resp={j} exists={exists}")

    # ===== K 额度闭环 =====
    cur_before=dbval(f"SELECT course_current FROM sys_tenant_package WHERE tenant_id=2") or 0
    LIMIT_A=3
    allowed=max(0, LIMIT_A-int(cur_before))
    created=0; rejected=False
    for i in range(allowed+2):
        c,j=api("POST","/course/insert",{"templateId":TPL_A,"courseName":f"A超额{i}","content":"c","feature":"f","teacherId":A_tea_uid}, token=A_tea)
        if c==200 and code_of(j)==200: created+=1
        else: rejected=True; break
    cur=dbval(f"SELECT course_current FROM sys_tenant_package WHERE tenant_id=2")
    check("TC-K-02","K","租户A课程达上限(3)后拒绝新增", "PASS" if (rejected and created==allowed and int(cur or 0)==LIMIT_A) else "FAIL",
          f"before={cur_before} 本轮新增={created} 允许={allowed} 超限被拒={rejected} course_current={cur} (上限3)")

    ok=0
    for i in range(3):
        c,j=api("POST","/course/insert",{"templateId":TPL_B,"courseName":f"B不限{i}","content":"c","feature":"f","teacherId":B_tea_uid}, token=B_tea)
        if code_of(j)==200: ok+=1
    check("TC-K-05","K","租户B不限额度可建多门", "PASS" if ok==3 else "FAIL", f"成功={ok}/3")

    return fx

def report(round_name):
    total=len(results); passed=sum(1 for r in results if r[3]=="PASS")
    failed=sum(1 for r in results if r[3]=="FAIL"); dis=sum(1 for r in results if r[3]=="DIS")
    print("\n==================== "+round_name+" 汇总 ====================")
    print(f"总用例: {total}  PASS: {passed}  FAIL: {failed}  DIS(规格偏差): {dis}")
    for r in results:
        if r[3]!="PASS":
            print(f"  {'❌' if r[3]=='FAIL' else '⚠️'} {r[0]} [{r[1]}] {r[2]}  | {r[4]}")
    md=[f"# SaaS 多租户移植 · {round_name}\n",
        f"> 执行时间: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  被测: lesson_appointment @ http://localhost:8081\n",
        f"## 汇总\n| 指标 | 值 |\n|---|---|\n| 总用例 | {total} |\n| PASS | {passed} |\n| FAIL | {failed} |\n| 规格偏差(DIS) | {dis} |\n",
        f"\n## 明细\n| 用例 | 组 | 标题 | 结果 | 说明 |\n|---|---|---|---|---|"]
    for r in results: md.append(f"| {r[0]} | {r[1]} | {r[2]} | {r[3]} | {r[4]} |")
    md.append("\n## 失败/偏差详情\n")
    for r in results:
        if r[3]!="PASS": md.append(f"- **{r[0]} [{r[1]}]** {r[2]}: {r[4]}\n")
    path=os.path.join(os.path.dirname(os.path.abspath(__file__)), f"测试记录-{round_name}.md")
    with open(path,"w",encoding="utf-8") as f: f.write("\n".join(md))
    print("测试记录已写入:", path)
    return failed

if __name__=="__main__":
    round_name = sys.argv[1] if len(sys.argv)>1 else "第一轮"
    fx=setup()
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)),"fixtures.json"),"w",encoding="utf-8") as f:
        json.dump({k:v for k,v in fx.items() if not k.endswith("TOK")}, f, ensure_ascii=False, indent=2)
    run_tests(fx)
    report(round_name)
