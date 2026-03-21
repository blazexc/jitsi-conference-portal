const { z } = require("zod");

// 统一约束角色枚举，避免配置文件出现拼写差异导致权限失效。
const roleEnum = z.enum(["master_host", "group_host", "member"]);

// 用户定义：首版允许用户名密码登录（主持角色）和成员链接直入（member 角色）。
const userSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  displayName: z.string().min(1),
  role: roleEnum,
  groupId: z.string().optional().default(""),
  passwordHash: z.string().optional().default(""),
  canStartRecording: z.boolean().default(false),
  canStartTranscription: z.boolean().default(false)
});

const groupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  defaultHostUserId: z.string().optional().default(""),
  autoAssign: z.boolean().default(true),
  allowManualDispatch: z.boolean().default(true)
});

const rolePermissionSchema = z.object({
  role: roleEnum,
  actions: z.array(z.string().min(1)).default([])
});

const configSchema = z.object({
  version: z.string().default("v1"),
  updatedAt: z.string().default(new Date().toISOString()),
  updatedBy: z.string().default("system"),
  system: z.object({
    systemName: z.string().min(1),
    jitsiDomain: z.string().min(1),
    defaultMeetingPrefix: z.string().min(1),
    enableRecordingButton: z.boolean().default(true),
    enableTranscriptionButton: z.boolean().default(false),
    enableChat: z.boolean().default(true),
    enableScreenShare: z.boolean().default(true),
    enableBreakoutRooms: z.boolean().default(true),
    ui: z.object({
      prejoinPageEnabled: z.boolean().default(true),
      startWithAudioMuted: z.boolean().default(true),
      startWithVideoMuted: z.boolean().default(true)
    })
  }),
  roles: z.array(rolePermissionSchema).default([]),
  meetingTemplate: z.object({
    mainRoomName: z.string().min(1),
    groups: z.array(groupSchema).default([])
  }),
  users: z.array(userSchema).default([]),
  recordingPolicy: z.object({
    defaultRecord: z.boolean().default(false),
    allowedRoles: z.array(roleEnum).default(["master_host"]),
    allowedRoomIds: z.array(z.string()).default([]),
    allowGroupRecording: z.boolean().default(false),
    allowIndependentTranscription: z.boolean().default(false)
  }),
  notifications: z.object({
    enabled: z.boolean().default(true),
    templates: z.object({
      join: z.string().default("欢迎加入会议"),
      dispatch: z.string().default("你已被调度到新的分组"),
      recordingStarted: z.string().default("录制已开始"),
      recordingStopped: z.string().default("录制已停止")
    })
  }),
  matrixWall: z.object({
    enabled: z.boolean().default(true),
    minTilesPerGroup: z.number().int().min(2).max(6).default(2),
    maxTilesPerGroup: z.number().int().min(2).max(6).default(6),
    rotateSeconds: z.number().int().min(10).max(300).default(30),
    maxConcurrentIframes: z.number().int().min(2).max(24).default(12)
  })
});

// 二次业务校验：用于返回“错误 + 警告”列表，满足配置校验器页面需求。
function validateBusinessRules(config) {
  const errors = [];
  const warnings = [];

  const groupIds = new Set(config.meetingTemplate.groups.map((group) => group.id));
  const userIds = new Set(config.users.map((user) => user.id));

  for (const user of config.users) {
    if (user.role === "group_host" && !user.groupId) {
      errors.push(`小组主持用户 ${user.username} 缺少 groupId`);
    }

    if (user.groupId && !groupIds.has(user.groupId)) {
      errors.push(`用户 ${user.username} 绑定了不存在的小组 ${user.groupId}`);
    }

    if (user.role !== "member" && !user.passwordHash) {
      warnings.push(`主持角色用户 ${user.username} 未配置 passwordHash，无法账号密码登录`);
    }
  }

  const groupHosts = config.meetingTemplate.groups.map((group) => group.defaultHostUserId).filter(Boolean);
  for (const hostId of groupHosts) {
    if (!userIds.has(hostId)) {
      errors.push(`小组默认主持人 ${hostId} 不存在`);
    }
  }

  const duplicateGroupId = findFirstDuplicate(config.meetingTemplate.groups.map((group) => group.id));
  if (duplicateGroupId) {
    errors.push(`检测到重复 breakout room/group id: ${duplicateGroupId}`);
  }

  for (const roomId of config.recordingPolicy.allowedRoomIds) {
    if (roomId !== "main" && !groupIds.has(roomId)) {
      errors.push(`录制策略中的房间 ${roomId} 不存在`);
    }
  }

  if (config.matrixWall.minTilesPerGroup > config.matrixWall.maxTilesPerGroup) {
    errors.push("matrixWall.minTilesPerGroup 不能大于 maxTilesPerGroup");
  }

  return { errors, warnings };
}

function findFirstDuplicate(items) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item)) {
      return item;
    }
    seen.add(item);
  }
  return "";
}

module.exports = {
  configSchema,
  validateBusinessRules
};

