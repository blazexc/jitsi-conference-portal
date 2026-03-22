import axios from "axios";

export const http = axios.create({
  baseURL: "/api",
  withCredentials: true
});

export async function fetchMe() {
  const { data } = await http.get("/auth/me");
  return data;
}

export async function loginHost(username, password) {
  const { data } = await http.post("/auth/login", { username, password });
  return data;
}

export async function loginMemberByToken(token) {
  const { data } = await http.post("/auth/member-entry", { token });
  return data;
}

export async function logout() {
  const { data } = await http.post("/auth/logout");
  return data;
}

export async function bootstrap() {
  const { data } = await http.get("/bootstrap");
  return data;
}

export async function createMeeting(name) {
  const { data } = await http.post("/meeting/create", { name });
  return data;
}

export async function createGroupedMeeting(name, groups) {
  const { data } = await http.post("/meeting/create-grouped", { name, groups });
  return data;
}

export async function joinMeeting(meetingId) {
  const { data } = await http.post("/meeting/join", { meetingId });
  return data;
}

export async function listMeeting() {
  const { data } = await http.get("/meeting/list");
  return data;
}

export async function authorizeControl(action, roomId, payload = {}) {
  const { data } = await http.post("/control/authorize", { action, roomId, payload });
  return data;
}

export async function loadConfig() {
  const { data } = await http.get("/config/current");
  return data;
}

export async function validateConfig(rawYaml) {
  const { data } = await http.post("/config/validate", { rawYaml });
  return data;
}

export async function saveConfig(rawYaml) {
  const { data } = await http.post("/config/save", { rawYaml });
  return data;
}

export async function history(limit = 5) {
  const { data } = await http.get(`/config/history?limit=${limit}`);
  return data;
}

export async function rollback(fileName) {
  const { data } = await http.post("/config/rollback", { fileName });
  return data;
}

export async function logs() {
  const { data } = await http.get("/logs");
  return data;
}
