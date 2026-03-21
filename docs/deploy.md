# 部署文档（Ubuntu + Docker）

## 1. 端口说明（按你的要求仅列 HTTP）

- 业务系统 HTTP：`18080`
- Jitsi Web 上游 HTTP：`8000`（Jitsi Web 容器默认映射，可按需调整）

说明：

- 你会手工配置域名与反向代理，因此这里只给上游 HTTP 端口。
- Jitsi 媒体端口由 Jitsi 标准部署处理，不在本文展开。

## 2. 部署业务系统

```bash
git clone <你的项目仓库地址> jitsi-conference-portal
cd jitsi-conference-portal
docker compose up -d --build
```

健康检查：

```bash
curl http://127.0.0.1:18080/api/healthz
```

## 3. 部署 Jitsi（标准化 Docker）

推荐使用官方 `docker-jitsi-meet`。

```bash
git clone https://github.com/jitsi/docker-jitsi-meet.git /opt/docker-jitsi-meet
cd /opt/docker-jitsi-meet
cp env.example .env
./gen-passwords.sh
```

关键 `.env` 参数（示例）：

- `PUBLIC_URL=https://room.shukunnet.com:16443`
- `HTTP_PORT=8000`
- `HTTPS_PORT=8443`（如果你统一走反代，可内部端口即可）

启动：

```bash
docker compose up -d
```

## 4. 反向代理建议

- `https://<你的域名>/` -> `http://127.0.0.1:8000`（Jitsi）
- `https://<你的域名>/portal/` -> `http://127.0.0.1:18080`（业务系统）

确保业务系统配置中的 `system.jitsiDomain` 与 Jitsi 域名一致。

## 5. 首次上线检查

1. 打开 `https://<你的域名>/portal/` 登录门户
2. 主持人进入主会场页面，确认能加载 Jitsi iframe
3. 进入配置编辑页，执行“校验配置”并保存一次
4. 配置历史页确认出现备份版本
5. 系统日志页确认出现登录与配置操作日志

