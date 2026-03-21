const { getConfig } = require("./auth-service");

function actionsForRole(role) {
  const config = getConfig();
  const record = config.roles.find((entry) => entry.role === role);
  return record ? record.actions : [];
}

function hasAction(role, action) {
  return actionsForRole(role).includes(action);
}

function assertAction(user, action) {
  if (!user) {
    return { ok: false, message: "未登录" };
  }
  if (!hasAction(user.role, action)) {
    return { ok: false, message: `角色 ${user.role} 无权执行 ${action}` };
  }
  return { ok: true, message: "ok" };
}

module.exports = {
  actionsForRole,
  hasAction,
  assertAction
};

