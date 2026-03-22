const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const fs = require("fs");

const {
  ensureStorage,
  loadCurrentRawYaml,
  parseAndValidateYaml,
  saveConfig,
  listHistory,
  rollback
} = require("./config-service");
const { authenticateHost, issueSessionToken, issueMemberJoinToken, parseToken, getConfig } = require("./auth-service");
const { assertAction } = require("./permissions");
const { appendOperation, listOperations } = require("./log-service");
const { createMeeting, findMeeting, listMeetings } = require("./meeting-service");

ensureStorage();

const app = express();
const port = Number(process.env.PORT || 18080);
const frontendDist = path.join(process.cwd(), "..", "frontend", "dist");

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "jitsi-portal-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      sameSite: "lax",
      httpOnly: true,
      secure: false
    }
  })
);

app.get("/api/healthz", (_request, response) => {
  response.json({
    ok: true,
    time: new Date().toISOString(),
    service: "jitsi-business-backend"
  });
});

app.post("/api/auth/login", async (request, response) => {
  const username = String(request.body.username || "");
  const password = String(request.body.password || "");
  const user = await authenticateHost(username, password);
  if (!user) {
    response.status(401).json({ ok: false, message: "用户名或密码错误" });
    return;
  }

  request.session.user = user;
  request.session.token = issueSessionToken(user);
  appendOperation({
    actorId: user.id,
    actorRole: user.role,
    action: "auth:login",
    target: "session",
    detail: `${user.username} 登录成功`
  });
  response.json({ ok: true, user, token: request.session.token });
});

// 普通成员链接直入：URL 中携带 token，后端验签后建立会话。
app.post("/api/auth/member-entry", (request, response) => {
  const token = String(request.body.token || "");
  try {
    const payload = parseToken(token);
    request.session.user = {
      id: payload.sub,
      username: payload.username,
      displayName: payload.displayName,
      role: payload.role,
      groupId: payload.groupId || "",
      canStartRecording: false,
      canStartTranscription: false,
      forcedRoomId: payload.roomId || ""
    };
    request.session.token = token;
    appendOperation({
      actorId: payload.sub,
      actorRole: payload.role,
      action: "auth:member-entry",
      target: payload.roomId || "main",
      detail: "成员链接进入成功"
    });
    response.json({ ok: true, user: request.session.user, token });
  } catch (error) {
    response.status(401).json({ ok: false, message: `成员链接无效: ${error.message}` });
  }
});

app.post("/api/auth/logout", requireAuth, (request, response) => {
  const user = request.session.user;
  appendOperation({
    actorId: user.id,
    actorRole: user.role,
    action: "auth:logout",
    target: "session",
    detail: `${user.username} 退出`
  });
  request.session.destroy(() => {
    response.json({ ok: true });
  });
});

app.get("/api/auth/me", (request, response) => {
  if (!request.session.user) {
    response.status(401).json({ ok: false, message: "未登录" });
    return;
  }
  response.json({ ok: true, user: request.session.user, token: request.session.token });
});

app.get("/api/bootstrap", requireAuth, (request, response) => {
  const config = getConfig();
  response.json({
    ok: true,
    config,
    me: request.session.user,
    meetings: listMeetings(50)
  });
});

app.post("/api/meeting/create", requireAuth, (request, response) => {
  const me = request.session.user;
  if (!(me.role === "master_host" || me.role === "group_host")) {
    response.status(403).json({ ok: false, message: "仅主持人可创建会议" });
    return;
  }
  const name = String(request.body.name || "").trim();
  if (!name) {
    response.status(400).json({ ok: false, message: "会议名称不能为空" });
    return;
  }
  const meeting = createMeeting({
    name,
    createdBy: me.username,
    createdRole: me.role,
    type: "single",
    groups: []
  });
  appendOperation({
    actorId: me.id,
    actorRole: me.role,
    action: "meeting:create",
    target: meeting.meetingId,
    detail: `创建会议 ${meeting.name}`
  });
  response.json({ ok: true, meeting });
});

app.post("/api/meeting/create-grouped", requireAuth, (request, response) => {
  const me = request.session.user;
  if (me.role !== "master_host") {
    response.status(403).json({ ok: false, message: "仅总主持可创建分组会议" });
    return;
  }

  const name = String(request.body.name || "").trim();
  const groups = Array.isArray(request.body.groups) ? request.body.groups : [];
  if (!name) {
    response.status(400).json({ ok: false, message: "会议名称不能为空" });
    return;
  }
  if (groups.length === 0) {
    response.status(400).json({ ok: false, message: "请至少添加一个分组" });
    return;
  }
  const normalizedGroups = groups.map((group) => ({
    groupId: String(group.groupId || "").trim(),
    groupName: String(group.groupName || "").trim(),
    hostUsername: String(group.hostUsername || "").trim(),
    members: Array.isArray(group.members) ? group.members.map((item) => String(item).trim()).filter(Boolean) : []
  }));
  const invalid = normalizedGroups.find((group) => !group.groupId || !group.groupName);
  if (invalid) {
    response.status(400).json({ ok: false, message: "分组ID和分组名不能为空" });
    return;
  }

  const meeting = createMeeting({
    name,
    createdBy: me.username,
    createdRole: me.role,
    type: "grouped",
    groups: normalizedGroups
  });
  appendOperation({
    actorId: me.id,
    actorRole: me.role,
    action: "meeting:create-grouped",
    target: meeting.meetingId,
    detail: `创建分组会议 ${meeting.name}`
  });
  response.json({ ok: true, meeting });
});

app.post("/api/meeting/join", requireAuth, (request, response) => {
  const me = request.session.user;
  const meetingId = String(request.body.meetingId || "").trim();
  if (!meetingId) {
    response.status(400).json({ ok: false, message: "会议ID不能为空" });
    return;
  }
  const meeting = findMeeting(meetingId);
  if (!meeting) {
    response.status(404).json({ ok: false, message: "未找到该会议ID" });
    return;
  }

  let roomName = meeting.roomName;
  if (meeting.type === "grouped") {
    const hit = meeting.groups.find((group) => {
      if (group.hostUsername === me.username) {
        return true;
      }
      return group.members.includes(me.username);
    });
    if (hit) {
      roomName = `${meeting.roomName}-${hit.groupId}`;
    }
  }

  appendOperation({
    actorId: me.id,
    actorRole: me.role,
    action: "meeting:join",
    target: meetingId,
    detail: `进入房间 ${roomName}`
  });

  response.json({ ok: true, meeting, roomName });
});

app.get("/api/meeting/list", requireAuth, (request, response) => {
  response.json({ ok: true, meetings: listMeetings(100) });
});

app.get("/api/config/current", requireAction("config:edit"), (_request, response) => {
  const rawYaml = loadCurrentRawYaml();
  const parsed = parseAndValidateYaml(rawYaml);
  response.json({
    ok: parsed.ok,
    rawYaml,
    config: parsed.normalized,
    errors: parsed.errors,
    warnings: parsed.warnings
  });
});

app.post("/api/config/validate", requireAction("config:edit"), (request, response) => {
  const rawYaml = String(request.body.rawYaml || "");
  const result = parseAndValidateYaml(rawYaml);
  response.json(result);
});

app.post("/api/config/save", requireAction("config:edit"), (request, response) => {
  const rawYaml = String(request.body.rawYaml || "");
  const result = saveConfig(rawYaml, request.session.user.username);
  if (!result.ok) {
    response.status(400).json(result);
    return;
  }
  appendOperation({
    actorId: request.session.user.id,
    actorRole: request.session.user.role,
    action: "config:save",
    target: "conference-config.yaml",
    detail: `版本更新至 ${result.normalized.version}`
  });
  response.json(result);
});

app.get("/api/config/history", requireAction("config:edit"), (request, response) => {
  const limit = Number(request.query.limit || 5);
  response.json({
    ok: true,
    items: listHistory(limit)
  });
});

app.post("/api/config/rollback", requireAction("config:edit"), (request, response) => {
  const fileName = String(request.body.fileName || "");
  const result = rollback(fileName, request.session.user.username);
  if (!result.ok) {
    response.status(400).json(result);
    return;
  }
  appendOperation({
    actorId: request.session.user.id,
    actorRole: request.session.user.role,
    action: "config:rollback",
    target: fileName,
    detail: `回滚成功，新版本 ${result.normalized.version}`
  });
  response.json(result);
});

// 控制动作二次校验：前端在发起 Jitsi command 之前先请求该接口，避免纯前端绕过。
app.post("/api/control/authorize", requireAuth, (request, response) => {
  const action = String(request.body.action || "");
  const roomId = String(request.body.roomId || "");
  const targetUserId = String(request.body.targetUserId || "");
  const decision = assertAction(request.session.user, action);
  if (!decision.ok) {
    response.status(403).json({ ok: false, message: decision.message });
    return;
  }

  if (request.session.user.role === "group_host") {
    if (roomId && roomId !== request.session.user.groupId && roomId !== "main") {
      response.status(403).json({ ok: false, message: "小组主持不能操作其他小组房间" });
      return;
    }
  }

  appendOperation({
    actorId: request.session.user.id,
    actorRole: request.session.user.role,
    action: `control:${action}`,
    target: roomId || targetUserId || "unknown",
    detail: JSON.stringify({
      targetUserId,
      payload: request.body.payload || {}
    })
  });

  response.json({ ok: true, approved: true });
});

app.post("/api/control/member-link", requireAction("breakout:dispatch"), (request, response) => {
  const userId = String(request.body.userId || "");
  const roomId = String(request.body.roomId || "");
  try {
    const token = issueMemberJoinToken(userId, roomId);
    response.json({
      ok: true,
      url: `/member-entry?token=${encodeURIComponent(token)}`
    });
  } catch (error) {
    response.status(400).json({ ok: false, message: error.message });
  }
});

app.get("/api/logs", requireAuth, (request, response) => {
  response.json({
    ok: true,
    items: listOperations(200)
  });
});

if (fs.existsSync(frontendDist)) {
  // 生产环境统一由后端托管前端静态资源，便于单端口 18080 暴露。
  app.use(express.static(frontendDist));
  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`jitsi-portal backend listening on ${port}`);
});

function requireAuth(request, response, next) {
  if (!request.session.user) {
    response.status(401).json({ ok: false, message: "未登录" });
    return;
  }
  next();
}

function requireAction(action) {
  return (request, response, next) => {
    if (!request.session.user) {
      response.status(401).json({ ok: false, message: "未登录" });
      return;
    }
    const decision = assertAction(request.session.user, action);
    if (!decision.ok) {
      response.status(403).json({ ok: false, message: decision.message });
      return;
    }
    next();
  };
}
