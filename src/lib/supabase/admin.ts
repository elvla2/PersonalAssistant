import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { isDesktopMode } from '@/lib/db/isDesktop';
import { createLocalDatabaseClient } from '@/lib/db/localAdapter';

export function createAdminClient(userId?: string) {
  if (isDesktopMode()) {
    return createLocalDatabaseClient(userId) as any;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.');
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
