const test = require("node:test");
const assert = require("node:assert/strict");
const { configSchema } = require("../config-schema");

test("配置模型应能通过最小示例", () => {
  const parsed = configSchema.parse({
    version: "v1",
    updatedAt: new Date().toISOString(),
    updatedBy: "test",
    system: {
      systemName: "test",
      jitsiDomain: "example.com",
      defaultMeetingPrefix: "p",
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
    roles: [],
    meetingTemplate: { mainRoomName: "main", groups: [] },
    users: [],
    recordingPolicy: {
      defaultRecord: false,
      allowedRoles: ["master_host"],
      allowedRoomIds: [],
      allowGroupRecording: false,
      allowIndependentTranscription: false
    },
    notifications: {
      enabled: true,
      templates: { join: "a", dispatch: "b", recordingStarted: "c", recordingStopped: "d" }
    },
    matrixWall: {
      enabled: true,
      minTilesPerGroup: 2,
      maxTilesPerGroup: 6,
      rotateSeconds: 30,
      maxConcurrentIframes: 12
    }
  });
  assert.equal(parsed.system.systemName, "test");
});

