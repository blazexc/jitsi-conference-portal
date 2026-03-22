import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import YAML from "yaml";
import { useAuth } from "./modules/auth-context";
import {
  authorizeControl,
  bootstrap,
  history,
  loadConfig,
  logs,
  rollback,
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
  const { isAuthed, loading } = useAuth();
  const [state, setState] = useState({ loading: false, config: null, me: null });

  useEffect(() => {
    if (!isAuthed) {
      // 未登录时不再等待 bootstrap，直接交给路由跳转到登录页。
      setState({ loading: false, config: null, me: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true }));
    bootstrap()
      .then((res) => {
        setState({ loading: false, config: res.config, me: res.me });
      })
      .catch(() => {
        setState({ loading: false, config: null, me: null });
      });
  }, [isAuthed]);

  if (loading || state.loading) {
    return <div className="center-panel">加载中...</div>;
  }

  if (!isAuthed) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="layout">
      <Header me={state.me} />
      <main className="content">
        <Routes>
          <Route path="/" element={<PortalHome config={state.config} me={state.me} />} />
          <Route path="/meeting/main" element={<MeetingPage mode="main" config={state.config} me={state.me} />} />
          <Route path="/meeting/group/:groupId" element={<MeetingPage mode="group" config={state.config} me={state.me} />} />
          <Route path="/console/master" element={<MasterConsole config={state.config} me={state.me} />} />
          <Route path="/console/group" element={<GroupConsole config={state.config} me={state.me} />} />
          <Route path="/config/editor" element={<ConfigEditor />} />
          <Route path="/config/preview" element={<ConfigPreview />} />
          <Route path="/config/history" element={<ConfigHistory />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/wall" element={<MatrixWall config={state.config} me={state.me} />} />
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
        <h1>Jitsi 会议门户</h1>
        <p>
          当前用户: {me.displayName} ({me.role})
        </p>
      </div>
      <nav className="nav">
        <Link to="/">门户首页</Link>
        <Link to="/meeting/main">主会场</Link>
        <Link to="/console/master">总主持台</Link>
        <Link to="/console/group">小组主持台</Link>
        <Link to="/wall">矩阵墙</Link>
        <Link to="/config/editor">配置编辑</Link>
        <Link to="/config/preview">配置预览</Link>
        <Link to="/config/history">配置历史</Link>
        <Link to="/logs">系统日志</Link>
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
      <h2>主持人登录</h2>
      <p>总主持/小组主持通过账号密码登录，普通成员请使用直入链接。</p>
      {error && <p className="error">{error}</p>}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            await hostLogin(form.username, form.password);
            navigate("/");
          } catch (e) {
            setError(e?.response?.data?.message || "登录失败");
          }
        }}
      >
        <label>
          用户名
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
  const location = useLocation();
  const navigate = useNavigate();
  const { memberTokenLogin, isAuthed } = useAuth();
  const [message, setMessage] = useState("正在验证成员链接...");

  useEffect(() => {
    const token = new URLSearchParams(location.search).get("token");
    if (!token) {
      setMessage("缺少 token 参数");
      return;
    }
    memberTokenLogin(token)
      .then(() => navigate("/"))
      .catch((error) => setMessage(error?.response?.data?.message || "成员链接验证失败"));
  }, [location.search, memberTokenLogin, navigate]);

  if (isAuthed) {
    return <Navigate to="/" replace />;
  }
  return <div className="center-panel">{message}</div>;
}

function PortalHome({ config, me }) {
  const groups = config.meetingTemplate.groups;
  return (
    <section className="panel">
      <h2>{config.system.systemName}</h2>
      <p>角色：{me.role}</p>
      <div className="grid">
        <Card title="进入主会场" to="/meeting/main" />
        {groups.map((group) => (
          <Card key={group.id} title={`进入 ${group.name}`} to={`/meeting/group/${group.id}`} />
        ))}
        <Card title="总主持控制台" to="/console/master" />
        <Card title="小组主持控制台" to="/console/group" />
        <Card title="矩阵巡检墙" to="/wall" />
      </div>
    </section>
  );
}

function Card({ title, to }) {
  return (
    <Link className="card" to={to}>
      {title}
    </Link>
  );
}

function MeetingPage({ mode, config, me }) {
  const params = useParams();
  const [events, setEvents] = useState([]);
  const roomName = useMemo(() => {
    if (mode === "main") {
      return `${config.system.defaultMeetingPrefix}-${config.meetingTemplate.mainRoomName}`;
    }
    return `${config.system.defaultMeetingPrefix}-${params.groupId}`;
  }, [mode, config, params.groupId]);

  return (
    <section className="panel">
      <h2>{mode === "main" ? "主会场页" : `小组会议页 - ${params.groupId}`}</h2>
      <JitsiEmbed
        domain={config.system.jitsiDomain}
        roomName={roomName}
        displayName={me.displayName}
        uiConfig={config.system.ui}
        onEvent={(name, payload) => {
          setEvents((prev) => [{ time: new Date().toLocaleTimeString(), name, payload }, ...prev].slice(0, 30));
        }}
      />
      <div className="event-list">
        <h3>会中事件与状态面板</h3>
        {events.map((item, index) => (
          <div key={`${item.time}-${index}`} className="event-item">
            [{item.time}] {item.name}
          </div>
        ))}
      </div>
    </section>
  );
}

function MasterConsole({ config, me }) {
  const [message, setMessage] = useState("");
  if (me.role !== "master_host") {
    return <NoPermission />;
  }
  return (
    <section className="panel">
      <h2>总主持控制台</h2>
      <p>该页面提供 breakout rooms 管理、录制、通知与调度动作（先后端鉴权，再执行前端 IFrame 命令）。</p>
      <div className="toolbar">
        <button onClick={() => runControl("breakout:create", "main", setMessage)}>创建全部分组</button>
        <button onClick={() => runControl("breakout:close", "main", setMessage)}>关闭全部分组</button>
        <button onClick={() => runControl("breakout:auto-assign", "main", setMessage)}>自动分配成员</button>
        <button onClick={() => runControl("recording:start", "main", setMessage)}>开始主会场录制</button>
        <button onClick={() => runControl("recording:stop", "main", setMessage)}>停止主会场录制</button>
        <button onClick={() => runControl("notification:send", "main", setMessage)}>发送全局通知</button>
        <button onClick={() => runControl("meeting:password-update", "main", setMessage)}>一键更新入会密码</button>
      </div>
      <h3>小组列表</h3>
      <ul>
        {config.meetingTemplate.groups.map((group) => (
          <li key={group.id}>
            {group.name} ({group.id}) - 默认主持: {group.defaultHostUserId || "未设置"}
          </li>
        ))}
      </ul>
      {message && <p className="hint">{message}</p>}
    </section>
  );
}

function GroupConsole({ config, me }) {
  if (!(me.role === "group_host" || me.role === "master_host")) {
    return <NoPermission />;
  }
  const groupId = me.role === "group_host" ? me.groupId : config.meetingTemplate.groups[0]?.id;
  const group = config.meetingTemplate.groups.find((item) => item.id === groupId);
  const members = config.users.filter((user) => user.groupId === groupId && user.role === "member");
  const [message, setMessage] = useState("");
  return (
    <section className="panel">
      <h2>小组主持控制台</h2>
      <p>当前小组: {group?.name || "未匹配"}</p>
      <div className="toolbar">
        <button onClick={() => runControl("group:member-manage", groupId, setMessage)}>管理成员状态</button>
        <button onClick={() => runControl("recording:start", groupId, setMessage)}>开始小组录制</button>
        <button onClick={() => runControl("recording:stop", groupId, setMessage)}>停止小组录制</button>
        <button onClick={() => runControl("notification:send", groupId, setMessage)}>发送本组通知</button>
        <button onClick={() => runControl("member:speak-control", groupId, setMessage)}>授权成员发言/共享</button>
      </div>
      <h3>本组成员</h3>
      <ul>
        {members.map((member) => (
          <li key={member.id}>
            {member.displayName} ({member.username})
          </li>
        ))}
      </ul>
      {message && <p className="hint">{message}</p>}
    </section>
  );
}

async function runControl(action, roomId, setMessage) {
  try {
    await authorizeControl(action, roomId, { requestedAt: new Date().toISOString() });
    setMessage(`动作 ${action} 已通过后端授权，可执行 Jitsi 命令`);
  } catch (error) {
    setMessage(error?.response?.data?.message || `动作 ${action} 授权失败`);
  }
}

function ConfigEditor() {
  const [rawYaml, setRawYaml] = useState("");
  const [message, setMessage] = useState("加载中...");

  useEffect(() => {
    loadConfig()
      .then((res) => {
        setRawYaml(res.rawYaml);
        setMessage("配置已载入");
      })
      .catch((error) => setMessage(error?.response?.data?.message || "读取配置失败"));
  }, []);

  return (
    <section className="panel">
      <h2>配置文件编辑页</h2>
      <div className="split">
        <div>
          <Editor height="540px" language="yaml" value={rawYaml} onChange={(value) => setRawYaml(value || "")} />
          <div className="toolbar">
            <button
              onClick={async () => {
                try {
                  const res = await validateConfig(rawYaml);
                  setMessage(`校验完成: 错误 ${res.errors.length} 条，警告 ${res.warnings.length} 条`);
                } catch (error) {
                  setMessage(error?.response?.data?.message || "校验失败");
                }
              }}
            >
              校验配置
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await saveConfig(rawYaml);
                  setRawYaml(YAML.stringify(res.normalized));
                  setMessage(`保存成功，当前版本 ${res.normalized.version}`);
                } catch (error) {
                  setMessage(error?.response?.data?.message || "保存失败");
                }
              }}
            >
              发布/保存配置
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await loadConfig();
                  setRawYaml(res.rawYaml);
                  setMessage("已载入当前配置");
                } catch (error) {
                  setMessage(error?.response?.data?.message || "载入失败");
                }
              }}
            >
              载入当前配置
            </button>
          </div>
        </div>
        <aside>
          <h3>配置说明</h3>
          <ul>
            <li>左侧编辑 YAML，右侧查看说明。</li>
            <li>保存时自动备份最近 5 个版本。</li>
            <li>字段错误请先校验再发布。</li>
          </ul>
          <p className="hint">{message}</p>
        </aside>
      </div>
    </section>
  );
}

function ConfigPreview() {
  const [data, setData] = useState(null);
  useEffect(() => {
    loadConfig().then((res) => setData(res.config)).catch(() => setData(null));
  }, []);
  if (!data) {
    return <section className="panel">加载配置预览中...</section>;
  }
  return (
    <section className="panel">
      <h2>配置预览页</h2>
      <div className="grid">
        <article className="card">主会场: {data.meetingTemplate.mainRoomName}</article>
        <article className="card">breakout rooms: {data.meetingTemplate.groups.length} 个</article>
        <article className="card">用户总数: {data.users.length}</article>
        <article className="card">可录制角色: {data.recordingPolicy.allowedRoles.join(", ")}</article>
      </div>
      <h3>小组主持覆盖</h3>
      <ul>
        {data.meetingTemplate.groups.map((group) => (
          <li key={group.id}>
            {group.name} - 主持 {group.defaultHostUserId || "未配置"}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ConfigHistory() {
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
  async function refresh() {
    const res = await history(5);
    setItems(res.items);
  }
  useEffect(() => {
    refresh().catch(() => setItems([]));
  }, []);
  return (
    <section className="panel">
      <h2>配置历史页</h2>
      <button onClick={() => refresh().catch(() => setMessage("刷新失败"))}>刷新历史</button>
      <ul>
        {items.map((item) => (
          <li key={item.file}>
            {item.file} - {item.updatedAt}
            <button
              onClick={async () => {
                try {
                  await rollback(item.file);
                  setMessage(`回滚成功: ${item.file}`);
                  await refresh();
                } catch (error) {
                  setMessage(error?.response?.data?.message || "回滚失败");
                }
              }}
            >
              回滚
            </button>
          </li>
        ))}
      </ul>
      {message && <p className="hint">{message}</p>}
    </section>
  );
}

function LogsPage() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    logs()
      .then((res) => setItems(res.items))
      .catch(() => setItems([]));
  }, []);
  return (
    <section className="panel">
      <h2>系统日志页（简版）</h2>
      <div className="event-list">
        {items.map((item) => (
          <div className="event-item" key={item.id}>
            [{item.time}] {item.actorRole} {item.action} - {item.target}
          </div>
        ))}
      </div>
    </section>
  );
}

function MatrixWall({ config }) {
  const groups = config.meetingTemplate.groups;
  const [activeGroup, setActiveGroup] = useState(groups[0]?.id || "");
  const [index, setIndex] = useState(0);
  const group = groups.find((item) => item.id === activeGroup) || groups[0];
  const rotateSeconds = config.matrixWall.rotateSeconds;

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => prev + 1);
    }, rotateSeconds * 1000);
    return () => clearInterval(timer);
  }, [rotateSeconds]);

  const tileCount = Math.min(config.matrixWall.maxTilesPerGroup, 6);
  const roomNames = Array.from({ length: tileCount }).map((_, i) => `${config.system.defaultMeetingPrefix}-${group.id}-tile-${(index + i) % tileCount}`);

  return (
    <section className="panel">
      <h2>矩阵巡检墙</h2>
      <div className="toolbar">
        {groups.map((item) => (
          <button key={item.id} onClick={() => setActiveGroup(item.id)}>
            {item.name}
          </button>
        ))}
      </div>
      <p>
        当前组: {group?.name}，轮播间隔: {rotateSeconds}s
      </p>
      <div className="wall-grid">
        {roomNames.map((room) => (
          <div key={room} className="wall-tile">
            <div className="tile-title">{room}</div>
            <JitsiEmbed domain={config.system.jitsiDomain} roomName={room} displayName="巡检墙" uiConfig={config.system.ui} />
          </div>
        ))}
      </div>
    </section>
  );
}

function NoPermission() {
  return (
    <section className="panel">
      <h2>权限不足</h2>
      <p>当前角色无权访问此页面。</p>
    </section>
  );
}
