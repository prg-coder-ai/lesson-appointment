#!/bin/sh
# 在容器启动时从 /etc/resolv.conf 提取 DNS 服务器，生成 resolver 配置。
# 供 default.conf 中 proxy_pass $var 变量在运行时解析上游域名使用
# （K8s / Docker 通用，无需硬编码 DNS IP）。
NS=$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf)
echo "resolver ${NS} valid=10s ipv6=off;" > /etc/nginx/conf.d/00-resolver.conf
echo "[00-resolver.sh] resolver -> ${NS}"
