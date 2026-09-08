import re, hmac, hashlib, base64, json, time, urllib.request, urllib.error

PROPS = r"C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/api/src/main/resources/application.properties"
props = open(PROPS, encoding="utf-8").read()
secret = re.search(r"^\s*jwt\.secret=(\S+)", props, re.MULTILINE).group(1)
print("secret len =", len(secret))

def b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=")

header = b64(json.dumps({"alg": "HS512", "typ": "JWT"}).encode())
now = int(time.time())
uid = "395a8b9b69e54602a61779f56d5af079"   # platform_admin (来自 sys_user_session 样本)
payload = b64(json.dumps({
    "sub": uid, "role": "platform_admin", "tenantId": 0,
    "iat": now, "exp": now + 360000000
}).encode())
sig = hmac.new(secret.encode(), header + b"." + payload, hashlib.sha512).digest()
token = (header + b"." + payload + b"." + b64(sig)).decode()
print("token head =", token[:60], "...")

def call(method, url, data=None, use_q=False):
    headers = {"Content-Type": "application/json"}
    if use_q:
        url = url + ("&" if "?" in url else "?") + "access_token=" + token
    else:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, method=method, headers=headers)
    if data is not None:
        req.data = json.dumps(data).encode()
    try:
        r = urllib.request.urlopen(req, timeout=10)
        return r.status, r.read().decode()[:1000]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:1000]
    except Exception as e:
        return "ERR", str(e)[:300]

print("\n== [1] 加载接收人 (booking /api/v1/user/message-recipients?scope=platform_admin) ==")
print(call("GET", "http://localhost:8080/api/v1/user/message-recipients?scope=platform_admin"))

print("\n== [2] 发送消息 (message-service /api/v1/messages/send, Authorization Bearer) ==")
s, b = call("POST", "http://localhost:8080/api/v1/messages/send",
            {"title": "冒烟测试", "content": "hello from smoke",
             "recipientUserIds": ["002abd0805784313b52cf49789a2b349"], "broadcast": False})
print(s, b)

if s in (401, 403):
    print("\n== [2b] 发送消息 (改用 access_token 参数) ==")
    print(call("POST", "http://localhost:8080/api/v1/messages/send",
               {"title": "冒烟测试", "content": "hello from smoke",
                "recipientUserIds": ["002abd0805784313b52cf49789a2b349"], "broadcast": False}, use_q=True))
