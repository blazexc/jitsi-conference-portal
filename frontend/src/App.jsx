import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import YAML from "yaml";
import { useAuth } from "./modules/auth-context";
import { authorizeControl, bootstrap, createGroupedMeeting, createMeeting, joinMeeting, loadConfig, saveConfig, validateConfig } from "./modules/api";
import JitsiEmbed from "./modules/jitsi-embed";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/member-entry" element={<MemberEntryPage />} />
      <Route path="/*" element={<ProtectedLayout />} />
    </Routes>
  );
}

function ProtectedLayout() {
  const { isAuthed, loading } = useAuth();
  const [state, setState] = useState({ loading: false, config: null, me: null, meetings: [], error: "" });

  useEffect(() => {
    if (!isAuthed) {
      setState({ loading: false, config: null, me: null, meetings: [], error: "" });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    bootstrap()
      .then((res) => {
        setState({
          loading: false,
          config: res.config,
          me: res.me,
          meetings: Array.isArray(res.meetings) ? res.meetings : [],
          error: ""
        });
      })
      .catch((error) => {
        setState({
          loading: false,
          config: null,
          me: null,
          meetings: [],
          error: error?.response?.data?.message || "加载数据失败"
        });
      });
  }, [isAuthed]);

  if (loading || state.loading) {
    return <div className="center-panel">加载中...</div>;
  }
  if (!isAuthed) {
    return <Navigate to="/login" replace />;
  }
  if (!state.config || !state.me) {
    return (
      <div className="center-panel">
        <h2>加载失败</h2>
        <p>{state.error || "请刷新后重试"}</p>
      </div>
    );
  }

  return (
    <div className="layout">
      <Header me={state.me} />
      <main className="content">
        <Routes>
          <Route path="/" element={<RoleHome me={state.me} meetings={state.meetings} />} />
          <Route path="/meeting/:meetingId" element={<MeetingPage me={state.me} config={state.config} />} />
          <Route path="/master/config" element={<MasterConfigPage me={state.me} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function Header({ me }) {
  const { logout } = useAuth();
  return (
    <header className="header">
      <div>
        <h1>会议业务系统</h1>
        <p>
          {me.displayName} ({me.role})
        </p>
      </div>
      <nav className="nav">
        <Link to="/">首页</Link>
        {me.role === "master_host" ? <Link to="/master/config">配置页</Link> : null}
        <button type="button" onClick={() => logout()}>
          退出
        </button>
      </nav>
    </header>
  );
}

function LoginPage() {
  const { hostLogin, isAuthed } = useAuth();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const navigate = useNavigate();
  if (isAuthed) {
    return <Navigate to="/" replace />;
  }
  return (
    <div className="center-panel">
      <h2>登录页</h2>
      <p>输入账号与密码进入系统</p>
      {error ? <p className="error">{error}</p> : null}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await hostLogin(form.username, form.password);
            navigate("/");
          } catch (e) {
            setError(e?.response?.data?.message || "用户名或密码错误");
          }
        }}
      >
        <label>
          账号
          <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </label>
        <label>
          密码
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        <button type="submit">登录系统</button>
      </form>
    </div>
  );
}

function MemberEntryPage() {
  const { memberTokenLogin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [message, setMessage] = useState("正在校验直入链接...");
  useEffect(() => {
    const token = new URLSearchParams(location.search).get("token");
    if (!token) {
      setMessage("缺少 token");
      return;
    }
    memberTokenLogin(token)
      .then(() => navigate("/"))
      .catch(() => setMessage("链接无效"));
  }, [location.search, memberTokenLogin, navigate]);
  return <div className="center-panel">{message}</div>;
}

function RoleHome({ me, meetings }) {
  if (me.role === "member") {
    return <MemberHome meetings={meetings} />;
  }
  if (me.role === "group_host") {
    return <GroupHostHome meetings={meetings} />;
  }
  return <MasterHome meetings={meetings} />;
}

function MemberHome({ meetings }) {
  return (
    <section className="panel">
      <h2>普通用户首页</h2>
      <JoinMeetingForm meetings={meetings} />
    </section>
  );
}

function GroupHostHome({ meetings }) {
  const [name, setName] = useState("");
  const navigate = useNavigate();
  const [hint, setHint] = useState("");

  return (
    <section className="panel">
      <h2>分组主持人首页</h2>
      <JoinMeetingForm meetings={meetings} />
      <div className="section-gap" />
      <h3>发起会议</h3>
      <div className="toolbar">
        <input placeholder="会议名称" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          onClick={async () => {
            try {
              const res = await createMeeting(name);
              navigate(`/meeting/${res.meeting.meetingId}?room=${encodeURIComponent(res.meeting.roomName)}`, { state: { meeting: res.meeting } });
            } catch (error) {
              setHint(error?.response?.data?.message || "创建失败");
            }
          }}
        >
          创建会议并进入
        </button>
      </div>
      {hint ? <p className="error">{hint}</p> : null}
    </section>
  );
}

function MasterHome({ meetings }) {
  const [name, setName] = useState("");
  const [groupMeetingName, setGroupMeetingName] = useState("");
  const [groupRows, setGroupRows] = useState([{ groupName: "第一组", hostUsername: "host_a", membersText: "member_01" }]);
  const navigate = useNavigate();
  const [hint, setHint] = useState("");

  return (
    <section className="panel">
      <h2>总主持人首页</h2>
      <JoinMeetingForm meetings={meetings} />

      <div className="section-gap" />
      <h3>发起会议</h3>
      <div className="toolbar">
        <input placeholder="会议名称" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          onClick={async () => {
            try {
              const res = await createMeeting(name);
              navigate(`/meeting/${res.meeting.meetingId}?room=${encodeURIComponent(res.meeting.roomName)}`, { state: { meeting: res.meeting } });
            } catch (error) {
              setHint(error?.response?.data?.message || "创建失败");
            }
          }}
        >
          创建会议并进入
        </button>
      </div>

      <div className="section-gap" />
      <h3>发起分组会议</h3>
      <div className="toolbar">
        <input placeholder="分组会议名称" value={groupMeetingName} onChange={(e) => setGroupMeetingName(e.target.value)} />
        <button onClick={() => setGroupRows((prev) => [...prev, { groupName: `第${prev.length + 1}组`, hostUsername: "", membersText: "" }])}>
          + 添加分组
        </button>
      </div>
      {groupRows.map((row, index) => (
        <div className="toolbar" key={index}>
          <input placeholder="小组名称" value={row.groupName} onChange={(e) => updateGroupRows(groupRows, setGroupRows, index, "groupName", e.target.value)} />
          <input
            placeholder="主持人账号"
            value={row.hostUsername}
            onChange={(e) => updateGroupRows(groupRows, setGroupRows, index, "hostUsername", e.target.value)}
          />
          <input
            placeholder="用户账号(逗号分隔)"
            value={row.membersText}
            onChange={(e) => updateGroupRows(groupRows, setGroupRows, index, "membersText", e.target.value)}
          />
        </div>
      ))}
      <button
        onClick={async () => {
          try {
            const payload = groupRows.map((item, idx) => ({
              groupId: `group-${idx + 1}`,
              groupName: item.groupName,
              hostUsername: item.hostUsername,
              members: item.membersText
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean)
            }));
            const res = await createGroupedMeeting(groupMeetingName, payload);
            navigate(`/meeting/${res.meeting.meetingId}?room=${encodeURIComponent(res.meeting.roomName)}`, { state: { meeting: res.meeting } });
          } catch (error) {
            setHint(error?.response?.data?.message || "创建分组会议失败");
          }
        }}
      >
        创建分组会议并进入
      </button>

      <p>
        <Link to="/master/config">进入总主持配置页面</Link>
      </p>
      {hint ? <p className="error">{hint}</p> : null}
    </section>
  );
}

function updateGroupRows(rows, setter, index, key, value) {
  const next = [...rows];
  next[index] = { ...next[index], [key]: value };
  setter(next);
}

function JoinMeetingForm({ meetings }) {
  const [meetingId, setMeetingId] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  return (
    <>
      <div className="toolbar">
        <input placeholder="会议ID输入框" value={meetingId} onChange={(e) => setMeetingId(e.target.value)} />
        <button
          onClick={async () => {
            try {
              const res = await joinMeeting(meetingId);
              saveMeetingLocal(res.meeting);
              navigate(`/meeting/${res.meeting.meetingId}?room=${encodeURIComponent(res.roomName)}`, { state: { meeting: res.meeting } });
            } catch (error) {
              setMessage(error?.response?.data?.message || "加入会议失败");
            }
          }}
        >
          加入会议
        </button>
      </div>
      {message ? <p className="error">{message}</p> : null}

      <h3>最近会议</h3>
      <div className="meeting-list">
        {meetings.slice(0, 10).map((item) => (
          <button
            key={item.meetingId}
            className="meeting-item-btn"
            onClick={async () => {
              const res = await joinMeeting(item.meetingId);
              saveMeetingLocal(res.meeting);
              navigate(`/meeting/${res.meeting.meetingId}?room=${encodeURIComponent(res.roomName)}`, { state: { meeting: res.meeting } });
            }}
          >
            <strong>{item.meetingId}</strong>
            <span>{item.name}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function MeetingPage({ me, config }) {
  const { meetingId } = useParams();
  const location = useLocation();
  const roomParam = new URLSearchParams(location.search).get("room");
  const meeting = location.state?.meeting || loadMeetingLocal(meetingId) || { type: "single", roomName: roomParam || `biz-${meetingId}`.toLowerCase() };
  const [permissions, setPermissions] = useState({ cam: false, mic: false, error: "" });
  const [events, setEvents] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState("");
  const [carouselPage, setCarouselPage] = useState(0);
  const [drawerTab, setDrawerTab] = useState("participants");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [stageMode, setStageMode] = useState("grid");

  const safeTemplateGroups = config?.meetingTemplate?.groups || [];
  const safePrefix = config?.system?.defaultMeetingPrefix || "biz";
  const safeDomain = config?.system?.jitsiDomain || "";
  const safeUi = config?.system?.ui || {};

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then(() => setPermissions({ cam: true, mic: true, error: "" }))
      .catch((error) => setPermissions({ cam: false, mic: false, error: error.message }));
  }, []);

  const groups = useMemo(() => {
    if (Array.isArray(meeting?.groups) && meeting.groups.length > 0) {
      return meeting.groups.map((group) => ({ groupId: group.groupId, groupName: group.groupName }));
    }
    return safeTemplateGroups.map((group) => ({ groupId: group.id, groupName: group.name }));
  }, [meeting, safeTemplateGroups]);

  useEffect(() => {
    if (groups.length > 0 && !activeGroupId) {
      setActiveGroupId(groups[0].groupId);
    }
  }, [groups, activeGroupId]);

  useEffect(() => {
    if (me.role !== "master_host") {
      return;
    }
    const timer = setInterval(() => {
      setCarouselPage((prev) => prev + 1);
    }, 12000);
    return () => clearInterval(timer);
  }, [me.role]);

  const roomName = useMemo(() => {
    return roomParam || `${safePrefix}-${meetingId}`.toLowerCase();
  }, [meetingId, roomParam, safePrefix]);

  const activeGroup = activeGroupId || groups[0]?.groupId || "main";
  const carouselRooms = useMemo(() => {
    if (me.role !== "master_host") {
      return [roomName];
    }
    const start = (carouselPage % 100) * 8;
    return Array.from({ length: 8 }).map((_, idx) => `${safePrefix}-${activeGroup}-view-${start + idx + 1}`);
  }, [me.role, roomName, carouselPage, safePrefix, activeGroup]);

  const roleUsers = useMemo(() => {
    return Array.isArray(config?.users) ? config.users : [];
  }, [config?.users]);

  const groupMembers = useMemo(() => {
    if (me.role !== "master_host") {
      return roleUsers.filter((u) => u.groupId === me.groupId);
    }
    if (!activeGroupId) {
      return roleUsers;
    }
    return roleUsers.filter((u) => u.groupId === activeGroupId);
  }, [me.role, me.groupId, roleUsers, activeGroupId]);

  const requestItems = useMemo(() => {
    return events
      .filter((item) => /raise|request|hand|speak/i.test(item.name || ""))
      .slice(0, 20);
  }, [events]);

  const onlineCount = Math.max(1, events.filter((x) => /participantJoined/i.test(x.name || "")).length + 1);

  const handleControl = async (permission, payload, successLabel) => {
    try {
      await authorizeControl(permission, meetingId, payload);
      setEvents((prev) => [{ t: new Date().toLocaleTimeString(), name: successLabel, payload }, ...prev].slice(0, 80));
    } catch (error) {
      setEvents((prev) => [{ t: new Date().toLocaleTimeString(), name: "control_error", payload: error?.response?.data?.message || "control failed" }, ...prev].slice(0, 80));
    }
  };

  return (
    <section className="meeting-shell">
      <header className="meeting-topbar">
        <div className="meeting-meta">
          <h2>{roleMeetingTitle(me.role)}</h2>
          <p>
            ??ID: {meetingId} | ??: {roomName}
          </p>
        </div>
        <div className="meeting-status">
          <span className={`status-chip ${permissions.cam ? "ok" : "warn"}`}>??? {permissions.cam ? "???" : "???"}</span>
          <span className={`status-chip ${permissions.mic ? "ok" : "warn"}`}>??? {permissions.mic ? "???" : "???"}</span>
          <span className="status-chip neutral">?? {onlineCount}</span>
          <button type="button" className="drawer-toggle" onClick={() => setDrawerOpen((v) => !v)}>
            {drawerOpen ? "????" : "????"}
          </button>
        </div>
      </header>

      {me.role === "master_host" ? (
        <div className="meeting-group-strip">
          <button type="button" className={!activeGroupId ? "active" : ""} onClick={() => setActiveGroupId("")}>
            ??
          </button>
          {groups.map((group) => (
            <button
              type="button"
              key={group.groupId}
              className={activeGroupId === group.groupId ? "active" : ""}
              onClick={() => {
                setActiveGroupId(group.groupId);
                setCarouselPage(0);
              }}
            >
              {group.groupName}
            </button>
          ))}
        </div>
      ) : null}

      <div className="meeting-main">
        <div className="meeting-stage-wrap">
          {me.role === "master_host" ? (
            <div className={`meeting-stage ${stageMode === "focus" ? "focus-mode" : ""}`}>
              {carouselRooms.map((room) => (
                <article className="stage-tile" key={room}>
                  <div className="stage-tile-title">{room}</div>
                  <JitsiEmbed
                    domain={safeDomain}
                    roomName={room}
                    displayName={me.displayName}
                    uiConfig={safeUi}
                    onEvent={(name, payload) => setEvents((prev) => [{ t: new Date().toLocaleTimeString(), name, payload }, ...prev].slice(0, 80))}
                  />
                </article>
              ))}
            </div>
          ) : (
            <div className="meeting-stage-single">
              <JitsiEmbed
                domain={safeDomain}
                roomName={roomName}
                displayName={me.displayName}
                uiConfig={safeUi}
                onEvent={(name, payload) => setEvents((prev) => [{ t: new Date().toLocaleTimeString(), name, payload }, ...prev].slice(0, 80))}
              />
            </div>
          )}
        </div>

        {drawerOpen ? (
          <aside className="meeting-drawer">
            <div className="drawer-tabs">
              <button type="button" className={drawerTab === "participants" ? "active" : ""} onClick={() => setDrawerTab("participants")}>??</button>
              <button type="button" className={drawerTab === "requests" ? "active" : ""} onClick={() => setDrawerTab("requests")}>??</button>
              <button type="button" className={drawerTab === "events" ? "active" : ""} onClick={() => setDrawerTab("events")}>??</button>
            </div>
            {drawerTab === "participants" ? (
              <div className="drawer-list">
                {groupMembers.slice(0, 60).map((user) => (
                  <div className="drawer-item" key={user.userId || user.username}>
                    <strong>{user.displayName || user.username}</strong>
                    <span>{user.role}</span>
                  </div>
                ))}
                {groupMembers.length === 0 ? <p className="hint">??????</p> : null}
              </div>
            ) : null}
            {drawerTab === "requests" ? (
              <div className="drawer-list">
                {requestItems.map((item, idx) => (
                  <div className="drawer-item" key={`${item.t}-${idx}`}>
                    <strong>{item.name}</strong>
                    <span>{item.t}</span>
                  </div>
                ))}
                {requestItems.length === 0 ? <p className="hint">??????</p> : null}
              </div>
            ) : null}
            {drawerTab === "events" ? (
              <div className="drawer-list">
                {events.slice(0, 40).map((item, idx) => (
                  <div className="drawer-item" key={`${item.t}-${idx}`}>
                    <strong>{item.name}</strong>
                    <span>{item.t}</span>
                  </div>
                ))}
                {events.length === 0 ? <p className="hint">????</p> : null}
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>

      <div className="meeting-dock">
        <button type="button" title="??????" onClick={() => setStageMode((v) => (v === "grid" ? "focus" : "grid"))}>??</button>
        {(me.role === "master_host" || me.role === "group_host") && (
          <>
            <button type="button" title="????" onClick={() => handleControl("group:member-manage", { action: "mute-all" }, "mute_all")}>???</button>
            <button type="button" title="??????" onClick={() => handleControl("group:member-manage", { action: "unmute-all" }, "unmute_all")}>????</button>
            <button type="button" title="????" onClick={() => handleControl("recording:start", { action: "start-recording" }, "recording_start")}>??</button>
            <button type="button" title="????" onClick={() => handleControl("recording:stop", { action: "stop-recording" }, "recording_stop")}>??</button>
            <button type="button" title="?????????" onClick={() => handleControl("member:speak-control", { action: "approve-next-request" }, "approve_next_speaker")}>????</button>
          </>
        )}
      </div>

      {permissions.error ? <p className="error meeting-error-banner">??????: {permissions.error}</p> : null}
    </section>
  );
}

function roleMeetingTitle(role) {
  if (role === "master_host") {
    return "???????";
  }
  if (role === "group_host") {
    return "????????";
  }
  return "????????";
}

function MasterConfigPage({ me }) {
  const [rawYaml, setRawYaml] = useState("");
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  async function doLoad() {
    setStatus("loading");
    try {
      const res = await loadConfig();
      setRawYaml(res.rawYaml);
      setStatus("ready");
      setMessage("配置已加载");
    } catch (error) {
      setStatus("error");
      setMessage(error?.response?.data?.message || "配置加载失败");
    }
  }

  useEffect(() => {
    if (me.role === "master_host") {
      doLoad();
    }
  }, [me.role]);

  if (me.role !== "master_host") {
    return (
      <section className="panel">
        <h2>无权限</h2>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>总主持人配置页面</h2>
      {status === "loading" ? <p>loading...</p> : null}
      {status === "error" ? (
        <div>
          <p className="error">{message}</p>
          <button onClick={doLoad}>重试加载</button>
        </div>
      ) : null}
      {status === "ready" ? (
        <>
          <Editor height="560px" language="yaml" value={rawYaml} onChange={(value) => setRawYaml(value || "")} />
          <div className="toolbar">
            <button
              onClick={async () => {
                const res = await validateConfig(rawYaml);
                setMessage(`校验完成：错误 ${res.errors.length} 条，警告 ${res.warnings.length} 条`);
              }}
            >
              校验
            </button>
            <button
              onClick={async () => {
                const res = await saveConfig(rawYaml);
                setRawYaml(YAML.stringify(res.normalized));
                setMessage(`保存成功，版本 ${res.normalized.version}`);
              }}
            >
              保存并立即生效
            </button>
          </div>
        </>
      ) : null}
      {message ? <p className="hint">{message}</p> : null}
    </section>
  );
}

function saveMeetingLocal(meeting) {
  if (!meeting?.meetingId) {
    return;
  }
  sessionStorage.setItem(`meeting:${meeting.meetingId}`, JSON.stringify(meeting));
}

function loadMeetingLocal(meetingId) {
  const raw = sessionStorage.getItem(`meeting:${meetingId}`);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
