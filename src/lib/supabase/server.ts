import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isDesktopMode } from '@/lib/db/isDesktop';
import { createLocalDatabaseClient } from '@/lib/db/localAdapter';
import { validateLocalSession } from '@/lib/db/localAuthEngine';

export async function createClient() {
  if (isDesktopMode()) {
    let userId: string | undefined;
    try {
      const cookieStore = await cookies();
      const token = cookieStore.get('pa_session_token')?.value;
      if (token) {
        const sessionUser = validateLocalSession(token);
        if (sessionUser) {
          userId = sessionUser.id;
        }
      }
      if (!userId) {
        userId = cookieStore.get('pa_user_id')?.value;
      }
    } catch {
      // Cookies may be unavailable in some server component rendering paths
    }
    return createLocalDatabaseClient(userId) as any;
  }

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Can be ignored if called from a Server Component and middleware is refreshing tokens.
          }
        },
      },
    }
  );
}
