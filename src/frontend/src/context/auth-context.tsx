import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import Cookies from "js-cookie";

const COOKIE_NAME = "colby_api_key";
const COOKIE_EXPIRES_DAYS = 7;

interface AuthContextValue {
  apiKey: string | null;
  isAuthenticated: boolean;
  setApiKey: (key: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string | null>(() => Cookies.get(COOKIE_NAME) ?? null);

  useEffect(() => {
    setApiKeyState(Cookies.get(COOKIE_NAME) ?? null);
  }, []);

  const setApiKey = useCallback((key: string) => {
    const normalizedKey = key.trim();
    setApiKeyState(normalizedKey);
    Cookies.set(COOKIE_NAME, normalizedKey, {
      expires: 7,
      secure: window.location.protocol === "https:",
      sameSite: "Strict",
      path: "/",
    });
  }, []);

  const logout = useCallback(() => {
    setApiKeyState(null);
    Cookies.remove(COOKIE_NAME, { path: "/" });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      apiKey,
      isAuthenticated: Boolean(apiKey),
      setApiKey,
      logout
    }),
    [apiKey, setApiKey, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

