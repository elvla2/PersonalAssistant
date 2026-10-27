export const LOCAL_USER_ID = '00000000-0000-0000-0000-000000000001';

export const LOCAL_USER = {
  id: LOCAL_USER_ID,
  email: 'local@assistant.app',
  user_metadata: {
    display_name: 'Local User',
  },
  role: 'authenticated',
  aud: 'authenticated',
  app_metadata: {
    provider: 'local',
    providers: ['local'],
  },
  created_at: '2026-01-01T00:00:00.000Z',
};

function formatUserRecord(rawUser: { id: string; email: string; display_name?: string }) {
  return {
    id: rawUser.id,
    email: rawUser.email,
    user_metadata: {
      display_name: rawUser.display_name || rawUser.email.split('@')[0],
    },
    role: 'authenticated',
    aud: 'authenticated',
    app_metadata: {
      provider: 'local',
      providers: ['local'],
    },
    created_at: new Date().toISOString(),
  };
}

export const localAuth = {
  getUser: async () => {
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch('/api/auth/local-session');
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const json = await res.json();
            if (json?.user) {
              return {
                data: { user: formatUserRecord(json.user) },
                error: null,
              };
            }
          }
        }
      } catch (err) {
        console.warn('[localAuth] getUser fetch error:', err);
      }
      return { data: { user: null }, error: null };
    }

    return {
      data: { user: LOCAL_USER },
      error: null,
    };
  },

  getSession: async () => {
    const userRes = await localAuth.getUser();
    if (userRes.data?.user) {
      return {
        data: {
          session: {
            access_token: 'local-token',
            token_type: 'bearer',
            expires_in: 3600000,
            refresh_token: 'local-refresh-token',
            user: userRes.data.user,
          },
        },
        error: null,
      };
    }
    return { data: { session: null }, error: null };
  },

  signInWithPassword: async ({
    email,
    password,
  }: {
    email: string;
    password?: string;
  }) => {
    try {
      const res = await fetch('/api/auth/local-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      let data: any = null;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      } else {
        const text = await res.text();
        data = { error: `Server error (${res.status}): ${text.slice(0, 150)}` };
      }

      if (!res.ok || !data || data.error) {
        return {
          data: { user: null, session: null },
          error: { message: data?.error || `Request failed with status ${res.status}` },
        };
      }
      const formatted = formatUserRecord(data.user);
      return {
        data: {
          user: formatted,
          session: {
            access_token: data.token || 'local-token',
            token_type: 'bearer',
            expires_in: 3600000,
            refresh_token: 'local-refresh-token',
            user: formatted,
          },
        },
        error: null,
      };
    } catch (err: any) {
      return {
        data: { user: null, session: null },
        error: { message: err?.message || 'Network error signing in' },
      };
    }
  },

  signUp: async ({
    email,
    password,
    options,
  }: {
    email: string;
    password?: string;
    options?: any;
  }) => {
    try {
      const displayName =
        options?.data?.display_name || email.split('@')[0];
      const res = await fetch('/api/auth/local-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName }),
      });
      let data: any = null;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      } else {
        const text = await res.text();
        data = { error: `Server error (${res.status}): ${text.slice(0, 150)}` };
      }

      if (!res.ok || !data || data.error) {
        return {
          data: { user: null, session: null },
          error: { message: data?.error || `Request failed with status ${res.status}` },
        };
      }
      const formatted = formatUserRecord(data.user);
      return {
        data: {
          user: formatted,
          session: {
            access_token: data.token || 'local-token',
            token_type: 'bearer',
            expires_in: 3600000,
            refresh_token: 'local-refresh-token',
            user: formatted,
          },
        },
        error: null,
      };
    } catch (err: any) {
      return {
        data: { user: null, session: null },
        error: { message: err?.message || 'Network error signing up' },
      };
    }
  },

  signOut: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    return { error: null };
  },

  exchangeCodeForSession: async () => ({
    data: { user: LOCAL_USER, session: { access_token: 'local-token', user: LOCAL_USER } },
    error: null,
  }),

  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    if (typeof window !== 'undefined') {
      localAuth.getSession().then(({ data }) => {
        if (data?.session) {
          callback('SIGNED_IN', data.session);
        } else {
          callback('SIGNED_OUT', null);
        }
      }).catch(() => {});
    }
    return {
      data: {
        subscription: {
          unsubscribe: () => {},
        },
      },
    };
  },

  admin: {
    listUsers: async () => ({
      data: { users: [LOCAL_USER] },
      error: null,
    }),
  },
};
