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
  const meeting = location.state?.meeting || loadMeetingLocal(meetingId);
  const [permissions, setPermissions] = useState({ cam: false, mic: false, error: "" });
  const [notices, setNotices] = useState([]);
  const [requests, setRequests] = useState([]);
  const [events, setEvents] = useState([]);
  const [chatText, setChatText] = useState("");
  const [activeGroupId, setActiveGroupId] = useState("");
  const [mainSpeaker, setMainSpeaker] = useState("我");

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then(() => setPermissions({ cam: true, mic: true, error: "" }))
      .catch((error) => setPermissions({ cam: false, mic: false, error: error.message }));
  }, []);

  const groups = useMemo(() => {
    if (meeting?.type === "grouped" && Array.isArray(meeting.groups) && meeting.groups.length > 0) {
      return meeting.groups;
    }
    return [];
  }, [meeting]);

  useEffect(() => {
    if (groups.length > 0 && !activeGroupId) {
      setActiveGroupId(groups[0].groupId);
    }
  }, [groups, activeGroupId]);

  useEffect(() => {
    if (me.role !== "master_host" || groups.length <= 1) {
      return;
    }
    const timer = setInterval(() => {
      setActiveGroupId((prev) => {
        const idx = groups.findIndex((g) => g.groupId === prev);
        if (idx < 0) {
          return groups[0].groupId;
        }
        return groups[(idx + 1) % groups.length].groupId;
      });
    }, 12000);
    return () => clearInterval(timer);
  }, [groups, me.role]);

  const roomName = useMemo(() => {
    if (me.role === "master_host" && groups.length > 0 && activeGroupId) {
      return `${meeting?.roomName || `biz-${meetingId}`}-${activeGroupId}`;
    }
    return roomParam || `biz-${meetingId}`.toLowerCase();
  }, [me.role, groups, activeGroupId, meeting, meetingId, roomParam]);

  const participantCards = buildParticipantCards(me, meeting, config, activeGroupId);

  return (
    <section className="panel">
      <h2>{roleMeetingTitle(me.role)}</h2>
      <p>
        会议ID: {meetingId} | 当前房间: {roomName}
      </p>
      <p>
        设备权限: 摄像头 {permissions.cam ? "已授权" : "未授权"} / 麦克风 {permissions.mic ? "已授权" : "未授权"}
      </p>
      {permissions.error ? <p className="error">设备权限异常: {permissions.error}</p> : null}

      {me.role === "master_host" && groups.length > 0 ? (
        <div className="group-tabs">
          {groups.map((group) => (
            <button key={group.groupId} className={activeGroupId === group.groupId ? "tab-active" : ""} onClick={() => setActiveGroupId(group.groupId)}>
              {group.groupName}
            </button>
          ))}
        </div>
      ) : null}

      <div className="meeting-layout">
        <div>
          <div className="video-stage">
            <JitsiEmbed
              domain={config.system.jitsiDomain}
              roomName={roomName}
              displayName={me.displayName}
              uiConfig={config.system.ui}
              onEvent={(name, payload) => setEvents((prev) => [{ t: new Date().toLocaleTimeString(), name, payload }, ...prev].slice(0, 40))}
            />
          </div>
          <div className="participant-grid">
            {participantCards.map((card) => (
              <button
                key={card.id}
                className={`participant-card ${mainSpeaker === card.name ? "participant-active" : ""}`}
                onClick={async () => {
                  setMainSpeaker(card.name);
                  if (me.role === "master_host" || me.role === "group_host") {
                    await authorizeControl("member:speak-control", meetingId, { focusUser: card.username }).catch(() => {});
                  }
                }}
              >
                <strong>{card.name}</strong>
                <span>{card.roleLabel}</span>
              </button>
            ))}
          </div>
        </div>

        <aside className="side-panels">
          <div className="glass-panel">
            <h3>通知栏</h3>
            {notices.length === 0 ? <p className="hint">暂无通知</p> : null}
            {notices.map((item, idx) => (
              <p key={idx}>
                [{item.t}] {item.text}
              </p>
            ))}
          </div>

          <div className="glass-panel">
            <h3>发言请求</h3>
            {me.role === "member" ? (
              <button
                onClick={() => {
                  setRequests((prev) => [...prev, { id: Date.now(), from: me.displayName, status: "pending" }]);
                  setNotices((prev) => [{ t: now(), text: "已向主持人提交发言申请" }, ...prev].slice(0, 20));
                }}
              >
                申请发言
              </button>
            ) : null}
            {requests.length === 0 ? <p className="hint">暂无请求</p> : null}
            {requests.map((req) => (
              <div key={req.id} className="request-row">
                <span>
                  {req.from} - {req.status}
                </span>
                {(me.role === "group_host" || me.role === "master_host") && req.status === "pending" ? (
                  <span>
                    <button
                      onClick={async () => {
                        await authorizeControl("member:speak-control", meetingId, { target: req.from }).catch(() => {});
                        setRequests((prev) => prev.map((x) => (x.id === req.id ? { ...x, status: "approved" } : x)));
                        setNotices((prev) => [{ t: now(), text: `已批准 ${req.from} 发言` }, ...prev].slice(0, 20));
                      }}
                    >
                      同意
                    </button>
                    <button
                      onClick={() => {
                        setRequests((prev) => prev.map((x) => (x.id === req.id ? { ...x, status: "rejected" } : x)));
                        setNotices((prev) => [{ t: now(), text: `已拒绝 ${req.from} 发言` }, ...prev].slice(0, 20));
                      }}
                    >
                      拒绝
                    </button>
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          <div className="glass-panel">
            <h3>文字消息</h3>
            <div className="toolbar">
              <input value={chatText} placeholder="输入消息..." onChange={(e) => setChatText(e.target.value)} />
              <button
                onClick={() => {
                  if (!chatText.trim()) {
                    return;
                  }
                  setNotices((prev) => [{ t: now(), text: `我: ${chatText.trim()}` }, ...prev].slice(0, 20));
                  setChatText("");
                }}
              >
                发送
              </button>
            </div>
          </div>
        </aside>
      </div>

      <details className="event-detail">
        <summary>会中事件详情</summary>
        {events.map((item, idx) => (
          <p key={idx}>
            [{item.t}] {item.name}
          </p>
        ))}
      </details>
    </section>
  );
}

function roleMeetingTitle(role) {
  if (role === "master_host") {
    return "总主持人会议页面";
  }
  if (role === "group_host") {
    return "分组主持人会议页面";
  }
  return "普通用户会议页面";
}

function buildParticipantCards(me, meeting, config, activeGroupId) {
  if (meeting?.type === "grouped" && Array.isArray(meeting.groups)) {
    const targetGroup = meeting.groups.find((x) => x.groupId === activeGroupId) || meeting.groups[0];
    if (!targetGroup) {
      return [];
    }
    const users = config.users || [];
    const hostUser = users.find((u) => u.username === targetGroup.hostUsername);
    const memberUsers = targetGroup.members.map((username) => users.find((u) => u.username === username)).filter(Boolean);
    return [
      { id: "main-hall", name: "主会场", roleLabel: "会场", username: "main" },
      ...(hostUser ? [{ id: hostUser.id, name: hostUser.displayName, roleLabel: "本组主持", username: hostUser.username }] : []),
      ...memberUsers.map((u) => ({ id: u.id, name: u.displayName, roleLabel: "参会者", username: u.username }))
    ];
  }
  return [{ id: me.id, name: me.displayName, roleLabel: "当前用户", username: me.username }];
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

function now() {
  return new Date().toLocaleTimeString();
}

