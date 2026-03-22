const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const meetingFile = path.join(process.cwd(), "data", "meetings.json");

function ensureMeetingFile() {
  if (!fs.existsSync(meetingFile)) {
    fs.writeFileSync(meetingFile, JSON.stringify({ meetings: [] }, null, 2), "utf8");
  }
}

function loadMeetings() {
  ensureMeetingFile();
  const parsed = JSON.parse(fs.readFileSync(meetingFile, "utf8"));
  parsed.meetings = Array.isArray(parsed.meetings) ? parsed.meetings : [];
  return parsed;
}

function saveMeetings(store) {
  ensureMeetingFile();
  fs.writeFileSync(meetingFile, JSON.stringify(store, null, 2), "utf8");
}

function createMeeting({ name, createdBy, createdRole, type = "single", groups = [] }) {
  const store = loadMeetings();
  const meetingId = `M-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 6)}`;
  const meeting = {
    meetingId,
    name: String(name || "未命名会议"),
    type,
    groups,
    createdBy,
    createdRole,
    createdAt: new Date().toISOString(),
    roomName: `biz-${meetingId.toLowerCase()}`,
    status: "active"
  };
  store.meetings.push(meeting);
  saveMeetings(store);
  return meeting;
}

function findMeeting(meetingId) {
  const store = loadMeetings();
  return store.meetings.find((item) => item.meetingId === meetingId) || null;
}

function listMeetings(limit = 20) {
  const store = loadMeetings();
  return store.meetings.slice(-Number(limit)).reverse();
}

module.exports = {
  createMeeting,
  findMeeting,
  listMeetings
};
