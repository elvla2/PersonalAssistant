import { createBrowserClient } from '@supabase/ssr';
import { isDesktopMode } from '@/lib/db/isDesktop';
import { createLocalBrowserClient } from '@/lib/db/localBrowserClient';

let client: any = null;

export function createClient() {
  if (isDesktopMode()) {
    if (client && client.__isLocal) return client;
    client = createLocalBrowserClient();
    return client;
  }

  if (client && !client.__isLocal) return client;
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return client;
}
