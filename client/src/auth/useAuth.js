import { useCallback, useEffect, useState } from "react";
import * as api from "../api/auth.js";
import { avatarUrl } from "../lib/avatar.js";

/**
 * Session state for the whole app.
 *
 * The cookie is httpOnly, so the client cannot read it. GET /api/auth/status on
 * mount is the only way to tell a returning user from a signed-out one; until
 * it answers, `booting` keeps the auth screen from flashing over a live session.
 *
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let live = true;
    api
      .status()
      .then((found) => live && setUser(found))
      .catch(() => live && setUser(null)) // 401 is the normal signed-out answer
      .finally(() => live && setBooting(false));
    return () => {
      live = false;
    };
  }, []);

  // both throw ApiError on 400/401/409; AuthScreen renders error.body
  const signUp = useCallback(async (payload) => {
    // deterministic avatar keyed on the username, so it survives re-renders and devices
    setUser(await api.register({ ...payload, avatar: avatarUrl(payload.userName) }));
  }, []);

  const signIn = useCallback(async (payload) => setUser(await api.login(payload)), []);

  const signOut = useCallback(async () => {
    // logout succeeds with or without a session, but a network failure must not strand the user
    await api.logout().catch(() => {});
    setUser(null);
  }, []);

  return { user, booting, signUp, signIn, signOut };
}
