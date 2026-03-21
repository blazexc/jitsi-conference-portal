# Jitsi 标准化部署说明（简版）

本项目不修改 Jitsi 前端源码，会议能力全部通过 `external_api.js` 接入。

建议：

1. 使用官方 `docker-jitsi-meet`
2. `PUBLIC_URL` 设置为你的正式域名
3. 保留 `HTTP_PORT=8000` 作为反代上游
4. HTTPS 终止放在反向代理层

业务门户通过配置文件的 `system.jitsiDomain` 指向同域名，以便加载：

`https://<jitsi-domain>/external_api.js`

