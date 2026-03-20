const CONTROL_CENTER_USER_KEY = "control_center_user_id";
const DEFAULT_CONTROL_CENTER_USER = "default-user";

export function getControlCenterUserId(): string {
  if (typeof window === "undefined") {
    return DEFAULT_CONTROL_CENTER_USER;
  }

  const existing = window.localStorage.getItem(CONTROL_CENTER_USER_KEY);
  if (existing && existing.trim()) {
    return existing;
  }

  window.localStorage.setItem(CONTROL_CENTER_USER_KEY, DEFAULT_CONTROL_CENTER_USER);
  return DEFAULT_CONTROL_CENTER_USER;
}

