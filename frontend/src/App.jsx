import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import YAML from "yaml";
import { useAuth } from "./modules/auth-context";
import {
  authorizeControl,
  bootstrap,
  createGroupedMeeting,
  createMeeting,
  joinMeeting,
  loadConfig,
  saveConfig,
  validateConfig
} from "./modules/api";
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
  const { isAuthed, loading, user: authedUser } = useAuth();
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
          me: authedUser || null,
          meetings: [],
          error: error?.response?.data?.message || "加载门户数据失败"
        });
      });
  }, [isAuthed, authedUser]);

  if (loading || state.loading) {
    return <div className="center-panel">加载中...</div>;
  }
  if (!isAuthed) {
    return <Navigate to="/login" replace />;
  }
  if (!state.config || !state.me) {
    return (
      <div className="center-panel">
        <h2>页面加载失败</h2>
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
        <h1>Jitsi 会议业务系统</h1>
        <p>
          当前用户: {me.displayName} ({me.role})
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
      <p>输入账号密码登录系统</p>
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
        <button type="submit">登录</button>
      </form>
    </div>
  );
}

function MemberEntryPage() {
  const { memberTokenLogin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [message, setMessage] = useState("正在验证链接...");

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
      <p>输入会议ID并加入会议</p>
      <JoinMeetingForm meetings={meetings} />
    </section>
  );
}

function GroupHostHome({ meetings }) {
  const [name, setName] = useState("");
  const [created, setCreated] = useState("");
  return (
    <section className="panel">
      <h2>分组主持人首页</h2>
      <JoinMeetingForm meetings={meetings} />
      <hr />
      <h3>发起会议</h3>
      <div className="toolbar">
        <input placeholder="会议名称" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          onClick={async () => {
            const res = await createMeeting(name);
            setCreated(res.meeting.meetingId);
          }}
        >
          创建会议
        </button>
      </div>
      {created ? <p className="hint">会议创建成功，会议ID: {created}</p> : null}
    </section>
  );
}

function MasterHome({ meetings }) {
  const [name, setName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupRows, setGroupRows] = useState([{ groupId: "group-a", groupName: "第一组", hostUsername: "host_a", membersText: "member_01" }]);
  const [created, setCreated] = useState("");
  return (
    <section className="panel">
      <h2>总主持人首页</h2>
      <JoinMeetingForm meetings={meetings} />

      <hr />
      <h3>发起会议</h3>
      <div className="toolbar">
        <input placeholder="会议名称" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          onClick={async () => {
            const res = await createMeeting(name);
            setCreated(res.meeting.meetingId);
          }}
        >
          创建会议
        </button>
      </div>

      <hr />
      <h3>发起分组会议</h3>
      <div className="toolbar">
        <input placeholder="分组会议名称" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
        <button
          onClick={() =>
            setGroupRows((prev) => [...prev, { groupId: `group-${prev.length + 1}`, groupName: `第${prev.length + 1}组`, hostUsername: "", membersText: "" }])
          }
        >
          + 添加分组
        </button>
      </div>
      {groupRows.map((row, index) => (
        <div key={index} className="toolbar">
          <input placeholder="分组ID" value={row.groupId} onChange={(e) => updateGroupRow(groupRows, setGroupRows, index, "groupId", e.target.value)} />
          <input placeholder="分组名称" value={row.groupName} onChange={(e) => updateGroupRow(groupRows, setGroupRows, index, "groupName", e.target.value)} />
          <input
            placeholder="分组主持账号"
            value={row.hostUsername}
            onChange={(e) => updateGroupRow(groupRows, setGroupRows, index, "hostUsername", e.target.value)}
          />
          <input
            placeholder="与会者账号(逗号分隔)"
            value={row.membersText}
            onChange={(e) => updateGroupRow(groupRows, setGroupRows, index, "membersText", e.target.value)}
          />
        </div>
      ))}
      <button
        onClick={async () => {
          const payload = groupRows.map((row) => ({
            groupId: row.groupId,
            groupName: row.groupName,
            hostUsername: row.hostUsername,
            members: row.membersText
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          }));
          const res = await createGroupedMeeting(groupName, payload);
          setCreated(res.meeting.meetingId);
        }}
      >
        创建分组会议
      </button>

      {created ? <p className="hint">会议创建成功，会议ID: {created}</p> : null}
      <p>
        <Link to="/master/config">进入配置页面</Link>
      </p>
    </section>
  );
}

function updateGroupRow(rows, setter, index, key, value) {
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
              navigate(`/meeting/${res.meeting.meetingId}?room=${encodeURIComponent(res.roomName)}`);
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
      <ul>
        {meetings.slice(0, 8).map((item) => (
          <li key={item.meetingId}>
            {item.meetingId} - {item.name}
          </li>
        ))}
      </ul>
    </>
  );
}

function MeetingPage({ me, config }) {
  const { meetingId } = useParams();
  const location = useLocation();
  const roomName = new URLSearchParams(location.search).get("room") || `biz-${meetingId}`.toLowerCase();
  const [events, setEvents] = useState([]);
  const [notify, setNotify] = useState([]);
  const [chatText, setChatText] = useState("");
  const [mainScreen, setMainScreen] = useState("local");
  const [permissions, setPermissions] = useState({ cam: false, mic: false, spk: false, error: "" });

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then(() => {
        setPermissions({ cam: true, mic: true, spk: true, error: "" });
      })
      .catch((error) => {
        setPermissions({ cam: false, mic: false, spk: false, error: error.message });
      });
  }, []);

  const roleTitle = me.role === "master_host" ? "总主持人会议页面" : me.role === "group_host" ? "分组主持人会议页面" : "普通用户会议页面";

  return (
    <section className="panel">
      <h2>{roleTitle}</h2>
      <p>会议ID: {meetingId}</p>
      <p>房间: {roomName}</p>
      <p>
        权限状态: 摄像头 {permissions.cam ? "已授权" : "未授权"} / 麦克风 {permissions.mic ? "已授权" : "未授权"} / 扬声器{" "}
        {permissions.spk ? "可用" : "未就绪"}
      </p>
      {permissions.error ? <p className="error">设备权限错误: {permissions.error}</p> : null}

      <div className="toolbar">
        <button onClick={() => setMainScreen("main-hall")}>主会场主画面</button>
        <button onClick={() => setMainScreen("group-host")}>本组主持主画面</button>
        <button onClick={() => setMainScreen("speaker")}>获准发言人主画面</button>
        <button onClick={() => runControlAction(me.role, "member:raise-hand", meetingId, setNotify)}>申请发言</button>
        <button onClick={() => addNotify(setNotify, "收到主持人通知：请准备发言")}>模拟透明通知</button>
      </div>

      {(me.role === "group_host" || me.role === "master_host") && (
        <div className="toolbar">
          <button onClick={() => runControlAction(me.role, "member:speak-control", meetingId, setNotify)}>批准发言请求</button>
          <button onClick={() => runControlAction(me.role, "recording:start", meetingId, setNotify)}>开始录制</button>
          <button onClick={() => runControlAction(me.role, "recording:stop", meetingId, setNotify)}>停止录制</button>
          <button onClick={() => runControlAction(me.role, "notification:send", meetingId, setNotify)}>向参会者发文字通知</button>
        </div>
      )}

      {(me.role === "group_host" || me.role === "master_host") && (
        <div className="toolbar">
          <button onClick={() => runControlAction(me.role, "group:member-manage", meetingId, setNotify)}>一键开关全部麦克风</button>
          <button onClick={() => runControlAction(me.role, "group:member-manage", meetingId, setNotify)}>一键开关全部扬声器</button>
          <button onClick={() => runControlAction(me.role, "group:member-manage", meetingId, setNotify)}>一键开关文件可见范围</button>
        </div>
      )}

      <p>当前主画面选择: {mainScreen}（主持人可覆盖）</p>

      <JitsiEmbed
        domain={config.system.jitsiDomain}
        roomName={roomName}
        displayName={me.displayName}
        uiConfig={config.system.ui}
        onEvent={(name, payload) => {
          setEvents((prev) => [{ time: new Date().toLocaleTimeString(), name, payload }, ...prev].slice(0, 40));
        }}
      />

      <div className="split">
        <div className="event-list">
          <h3>信息栏（透明通知）</h3>
          {notify.map((item, idx) => (
            <div key={`${item.time}-${idx}`} className="event-item">
              [{item.time}] {item.text}
            </div>
          ))}
        </div>
        <div className="event-list">
          <h3>会中事件</h3>
          {events.map((item, idx) => (
            <div key={`${item.time}-${idx}`} className="event-item">
              [{item.time}] {item.name}
            </div>
          ))}
        </div>
      </div>

      <div className="toolbar">
        <input value={chatText} placeholder="输入文字消息发送给主持人及参会者" onChange={(e) => setChatText(e.target.value)} />
        <button
          onClick={() => {
            if (chatText.trim()) {
              addNotify(setNotify, `我发送: ${chatText.trim()}`);
              setChatText("");
            }
          }}
        >
          发送文字信息
        </button>
        <button onClick={() => addNotify(setNotify, "上传文件并翻页分享（首版为业务层按钮）")}>上传文件并翻页分享</button>
      </div>
    </section>
  );
}

async function runControlAction(role, action, roomId, setNotify) {
  try {
    await authorizeControl(action, roomId, { role, roomId, at: new Date().toISOString() });
    addNotify(setNotify, `动作已执行: ${action}`);
  } catch (error) {
    addNotify(setNotify, `动作失败: ${error?.response?.data?.message || action}`);
  }
}

function addNotify(setter, text) {
  setter((prev) => [{ time: new Date().toLocaleTimeString(), text }, ...prev].slice(0, 30));
}

function MasterConfigPage({ me }) {
  const [rawYaml, setRawYaml] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadConfig()
      .then((res) => {
        setRawYaml(res.rawYaml);
        setMessage("配置已载入");
      })
      .catch((error) => {
        setMessage(error?.response?.data?.message || "读取配置失败");
      });
  }, []);

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
      <p>配置修改保存后立即生效</p>
      <Editor height="560px" language="yaml" value={rawYaml} onChange={(value) => setRawYaml(value || "")} />
      <div className="toolbar">
        <button
          onClick={async () => {
            const res = await validateConfig(rawYaml);
            setMessage(`校验完成：错误 ${res.errors.length} 条，警告 ${res.warnings.length} 条`);
          }}
        >
          校验配置
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
      {message ? <p className="hint">{message}</p> : null}
    </section>
  );
}

