const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { parseAndValidateYaml, loadCurrentRawYaml } = require("./config-service");

const SESSION_TTL = "12h";
const MEMBER_TOKEN_TTL_SECONDS = 60 * 60 * 8;

function getConfig() {
  const parsed = parseAndValidateYaml(loadCurrentRawYaml());
  if (!parsed.ok) {
    throw new Error(`配置不可用: ${parsed.errors.join("; ")}`);
  }
  return parsed.normalized;
}

function findUserByUsername(username) {
  const config = getConfig();
  return config.users.find((user) => user.username === username) || null;
}

async function authenticateHost(username, password) {
  const user = findUserByUsername(username);
  if (!user) {
    return null;
  }
  if (user.role === "member") {
    return null;
  }
  const ok = await bcrypt.compare(password, user.passwordHash || "");
  if (!ok) {
    return null;
  }
  return sanitizeUser(user);
}

function issueSessionToken(user) {
  const jwtSecret = process.env.JWT_SECRET || "jitsi-portal-jwt-secret";
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      groupId: user.groupId || "",
      displayName: user.displayName,
      username: user.username
    },
    jwtSecret,
    { expiresIn: SESSION_TTL }
  );
}

function issueMemberJoinToken(userId, roomId) {
  const config = getConfig();
  const user = config.users.find((item) => item.id === userId && item.role === "member");
  if (!user) {
    throw new Error("member 用户不存在");
  }

  const jwtSecret = process.env.JWT_SECRET || "jitsi-portal-jwt-secret";
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      groupId: user.groupId || "",
      roomId,
      displayName: user.displayName,
      username: user.username,
      entry: "member-link"
    },
    jwtSecret,
    { expiresIn: MEMBER_TOKEN_TTL_SECONDS }
  );
}

function parseToken(token) {
  const jwtSecret = process.env.JWT_SECRET || "jitsi-portal-jwt-secret";
  return jwt.verify(token, jwtSecret);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    groupId: user.groupId || "",
    canStartRecording: Boolean(user.canStartRecording),
    canStartTranscription: Boolean(user.canStartTranscription)
  };
}

module.exports = {
  authenticateHost,
  issueSessionToken,
  issueMemberJoinToken,
  parseToken,
  getConfig
};

