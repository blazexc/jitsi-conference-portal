const fs = require("fs");
const path = require("path");
const YAML = require("yaml");
const { configSchema, validateBusinessRules } = require("./config-schema");

const dataDir = path.join(process.cwd(), "data");
const configPath = path.join(dataDir, "conference-config.yaml");
const historyDir = path.join(dataDir, "history");

function ensureStorage() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, defaultConfigYaml(), "utf8");
  }
}

function loadCurrentRawYaml() {
  ensureStorage();
  return fs.readFileSync(configPath, "utf8");
}

function parseAndValidateYaml(rawYaml) {
  try {
    const parsed = YAML.parse(rawYaml);
    const normalized = configSchema.parse(parsed);
    const business = validateBusinessRules(normalized);
    return {
      ok: business.errors.length === 0,
      normalized,
      errors: business.errors,
      warnings: business.warnings
    };
  } catch (error) {
    return {
      ok: false,
      normalized: null,
      errors: [String(error.message || error)],
      warnings: []
    };
  }
}

function saveConfig(rawYaml, operator) {
  ensureStorage();
  const validation = parseAndValidateYaml(rawYaml);

  if (!validation.ok) {
    return validation;
  }

  // 保存前先备份当前版本，确保可回滚。
  const currentRaw = loadCurrentRawYaml();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupName = `${stamp}.yaml`;
  fs.writeFileSync(path.join(historyDir, backupName), currentRaw, "utf8");
  trimHistory(5);

  const next = {
    ...validation.normalized,
    version: nextVersion(validation.normalized.version),
    updatedAt: new Date().toISOString(),
    updatedBy: operator || "unknown"
  };
  fs.writeFileSync(configPath, YAML.stringify(next), "utf8");

  return {
    ok: true,
    normalized: next,
    errors: [],
    warnings: validation.warnings
  };
}

function nextVersion(version) {
  const matched = String(version || "v1").match(/^v(\d+)$/);
  if (!matched) {
    return "v1";
  }
  return `v${Number(matched[1]) + 1}`;
}

function trimHistory(maxKeep) {
  const files = fs
    .readdirSync(historyDir)
    .filter((file) => file.endsWith(".yaml"))
    .map((file) => ({
      file,
      time: fs.statSync(path.join(historyDir, file)).mtimeMs
    }))
    .sort((a, b) => b.time - a.time);

  for (const entry of files.slice(maxKeep)) {
    fs.unlinkSync(path.join(historyDir, entry.file));
  }
}

function listHistory(limit = 5) {
  ensureStorage();
  return fs
    .readdirSync(historyDir)
    .filter((file) => file.endsWith(".yaml"))
    .map((file) => {
      const fullPath = path.join(historyDir, file);
      return {
        file,
        updatedAt: fs.statSync(fullPath).mtime.toISOString()
      };
    })
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, Number(limit));
}

function rollback(fileName, operator) {
  ensureStorage();
  const targetPath = path.join(historyDir, String(fileName || ""));
  if (!fs.existsSync(targetPath)) {
    return {
      ok: false,
      errors: [`版本文件不存在: ${fileName}`],
      warnings: []
    };
  }

  const raw = fs.readFileSync(targetPath, "utf8");
  const validation = parseAndValidateYaml(raw);
  if (!validation.ok) {
    return validation;
  }

  const next = {
    ...validation.normalized,
    version: nextVersion(validation.normalized.version),
    updatedAt: new Date().toISOString(),
    updatedBy: operator || "rollback"
  };
  fs.writeFileSync(configPath, YAML.stringify(next), "utf8");
  return {
    ok: true,
    normalized: next,
    errors: [],
    warnings: validation.warnings
  };
}

function defaultConfigYaml() {
  const defaultConfig = {
    version: "v1",
    updatedAt: new Date().toISOString(),
    updatedBy: "system-init",
    system: {
      systemName: "Jitsi 会议门户系统",
      jitsiDomain: "room.shukunnet.com",
      defaultMeetingPrefix: "grid",
      enableRecordingButton: true,
      enableTranscriptionButton: false,
      enableChat: true,
      enableScreenShare: true,
      enableBreakoutRooms: true,
      ui: {
        prejoinPageEnabled: true,
        startWithAudioMuted: true,
        startWithVideoMuted: true
      }
    },
    roles: [
      {
        role: "master_host",
        actions: [
          "breakout:create",
          "breakout:close",
          "breakout:auto-assign",
          "breakout:dispatch",
          "recording:start",
          "recording:stop",
          "notification:send",
          "member:speak-control",
          "meeting:password-update",
          "config:edit"
        ]
      },
      {
        role: "group_host",
        actions: [
          "group:member-manage",
          "recording:start",
          "recording:stop",
          "notification:send",
          "member:speak-control"
        ]
      },
      {
        role: "member",
        actions: ["meeting:join", "member:raise-hand"]
      }
    ],
    meetingTemplate: {
      mainRoomName: "main-hall",
      groups: [
        {
          id: "group-a",
          name: "第一组",
          defaultHostUserId: "host-a",
          autoAssign: true,
          allowManualDispatch: true
        },
        {
          id: "group-b",
          name: "第二组",
          defaultHostUserId: "host-b",
          autoAssign: true,
          allowManualDispatch: true
        }
      ]
    },
    users: [
      {
        id: "master-1",
        username: "master",
        displayName: "总主持",
        role: "master_host",
        groupId: "",
        // 明文密码是 "Master@123"，仅示例环境使用。
        passwordHash: "$2b$10$KHgyhg8IlFC8tZV3tV2fN.Om8Bhnl2x9wvx7x2BifKt/.Y9bWSi4S",
        canStartRecording: true,
        canStartTranscription: true
      },
      {
        id: "host-a",
        username: "host_a",
        displayName: "一组主持",
        role: "group_host",
        groupId: "group-a",
        passwordHash: "$2b$10$KHgyhg8IlFC8tZV3tV2fN.Om8Bhnl2x9wvx7x2BifKt/.Y9bWSi4S",
        canStartRecording: true,
        canStartTranscription: false
      },
      {
        id: "host-b",
        username: "host_b",
        displayName: "二组主持",
        role: "group_host",
        groupId: "group-b",
        passwordHash: "$2b$10$KHgyhg8IlFC8tZV3tV2fN.Om8Bhnl2x9wvx7x2BifKt/.Y9bWSi4S",
        canStartRecording: true,
        canStartTranscription: false
      },
      {
        id: "member-1",
        username: "member_01",
        displayName: "普通成员01",
        role: "member",
        groupId: "group-a",
        passwordHash: "",
        canStartRecording: false,
        canStartTranscription: false
      }
    ],
    recordingPolicy: {
      defaultRecord: false,
      allowedRoles: ["master_host", "group_host"],
      allowedRoomIds: ["main", "group-a", "group-b"],
      allowGroupRecording: true,
      allowIndependentTranscription: false
    },
    notifications: {
      enabled: true,
      templates: {
        join: "欢迎加入会场",
        dispatch: "你已被调度到新的分组",
        recordingStarted: "录制已开始",
        recordingStopped: "录制已停止"
      }
    },
    matrixWall: {
      enabled: true,
      minTilesPerGroup: 2,
      maxTilesPerGroup: 6,
      rotateSeconds: 30,
      maxConcurrentIframes: 12
    }
  };

  return YAML.stringify(defaultConfig);
}

module.exports = {
  ensureStorage,
  loadCurrentRawYaml,
  parseAndValidateYaml,
  saveConfig,
  listHistory,
  rollback
};

