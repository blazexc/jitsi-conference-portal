# Jitsi 会议门户系统（全新实现）

本项目是一个基于 **Jitsi 官方 IFrame API** 的会议业务门户，支持：

- 主会场 + breakout room 分组会议
- 三类角色：总主持 / 小组主持 / 普通成员
- 普通成员链接直入、主持人账号密码登录
- 会中控制动作后端二次鉴权
- YAML 配置在线编辑、校验、发布、历史回滚
- 简版操作日志
- 多房间矩阵巡检墙（单页多 iframe 轮播）

## 项目结构

- `frontend/`：React + Vite 业务前端（11 个页面）
- `backend/`：Express 轻后端（认证、权限、配置、日志）
- `infra/`：部署脚本与反向代理参考
- `docs/`：中文部署、使用、测试文档

## 快速启动（本地开发）

```bash
# 1) 启动后端
cd backend
npm install
npm run dev

# 2) 新终端启动前端
cd frontend
npm install
npm run dev
```

默认访问：

- 前端开发地址：`http://127.0.0.1:5173`
- 后端 API：`http://127.0.0.1:18080`

默认示例主持账号：

- `master / Master@123`
- `host_a / Master@123`
- `host_b / Master@123`

## Docker 启动

```bash
docker compose up -d --build
```

业务系统 HTTP 端口：`18080`

## 文档入口

- 部署文档：[docs/deploy.md](./docs/deploy.md)
- 使用文档：[docs/usage-guide.md](./docs/usage-guide.md)
- 测试清单：[docs/test-plan.md](./docs/test-plan.md)

