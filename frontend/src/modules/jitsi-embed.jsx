import { useEffect, useRef } from "react";

function loadExternalApi(domain) {
  return new Promise((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `https://${domain}/external_api.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Jitsi external_api.js 加载失败"));
    document.body.appendChild(script);
  });
}

// 该组件统一封装 Jitsi IFrame API 生命周期，外层页面只关注房间与角色参数。
export default function JitsiEmbed({ domain, roomName, displayName, uiConfig, onEvent }) {
  const containerRef = useRef(null);
  const apiRef = useRef(null);

  useEffect(() => {
    let disposed = false;
    async function mount() {
      await loadExternalApi(domain);
      if (disposed || !containerRef.current) {
        return;
      }

      const options = {
        roomName,
        width: "100%",
        height: 560,
        parentNode: containerRef.current,
        userInfo: {
          displayName
        },
        configOverwrite: {
          prejoinPageEnabled: uiConfig?.prejoinPageEnabled ?? true,
          startWithAudioMuted: uiConfig?.startWithAudioMuted ?? true,
          startWithVideoMuted: uiConfig?.startWithVideoMuted ?? true
        },
        interfaceConfigOverwrite: {
          MOBILE_APP_PROMO: false
        }
      };

      const api = new window.JitsiMeetExternalAPI(domain, options);
      apiRef.current = api;

      const events = [
        "participantJoined",
        "participantLeft",
        "breakoutRoomsUpdated",
        "recordingStatusChanged",
        "displayNameChange",
        "audioMuteStatusChanged",
        "videoConferenceJoined",
        "cameraError",
        "micError"
      ];
      for (const evt of events) {
        api.addListener(evt, (payload) => {
          onEvent?.(evt, payload || {});
        });
      }
    }

    mount().catch((error) => {
      onEvent?.("embedError", { message: error.message });
    });

    return () => {
      disposed = true;
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
    };
  }, [domain, roomName, displayName, uiConfig, onEvent]);

  return <div className="jitsi-embed" ref={containerRef} />;
}

