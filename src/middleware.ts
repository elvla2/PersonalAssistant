import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Desktop mode is enabled inside Electron, via environment variables, or local desktop cookies
  const isDesktop =
    process.env.DESKTOP_MODE === 'true' ||
    process.env.NEXT_PUBLIC_DESKTOP_MODE === 'true' ||
    request.cookies.has('x-desktop-mode') ||
    request.cookies.has('pa_session_token');

  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/signup');
  const isPublicRoute =
    isAuthRoute ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.');

  // 1. Desktop Mode (100% Local SQLite Multi-User Architecture)
  if (isDesktop) {
    const hasLocalSession = Boolean(request.cookies.get('pa_session_token')?.value);

    // If user is NOT logged in: protect private application routes and allow /login and /signup
    if (!hasLocalSession && !isPublicRoute) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(url);
    }

    // If user IS logged in: redirect away from auth routes to the dashboard
    if (hasLocalSession && isAuthRoute) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }

    return NextResponse.next({ request });
  }

  // 2. Standard Web Mode (Supabase Auth Flow)
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Clean up any stale desktop cookie if running in standard web mode
  if (request.cookies.has('x-desktop-mode')) {
    supabaseResponse.cookies.delete('x-desktop-mode');
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh auth token
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect private application routes
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  // Redirect authenticated user away from auth pages to dashboard
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
