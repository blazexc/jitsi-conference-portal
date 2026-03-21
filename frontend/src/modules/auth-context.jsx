import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { fetchMe, loginHost, loginMemberByToken, logout as apiLogout } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchMe()
      .then((res) => {
        if (mounted) {
          setUser(res.user);
        }
      })
      .catch(() => {
        if (mounted) {
          setUser(null);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthed: Boolean(user),
      async hostLogin(username, password) {
        const res = await loginHost(username, password);
        setUser(res.user);
      },
      async memberTokenLogin(token) {
        const res = await loginMemberByToken(token);
        setUser(res.user);
      },
      async logout() {
        await apiLogout();
        setUser(null);
      }
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth 必须在 AuthProvider 内使用");
  }
  return context;
}

