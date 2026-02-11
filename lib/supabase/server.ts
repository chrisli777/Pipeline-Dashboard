import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  let cookieStore: Awaited<ReturnType<typeof cookies>> | null = null;
  
  try {
    cookieStore = await cookies();
  } catch {
    // cookies() may not be available in some contexts
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          try {
            if (cookieStore && typeof cookieStore.getAll === 'function') {
              return cookieStore.getAll();
            }
          } catch {
            // Ignore errors
          }
          return [];
        },
        setAll(cookiesToSet) {
          try {
            if (cookieStore) {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            }
          } catch {
            // The "setAll" method was called from a Server Component.
          }
        },
      },
    }
  );
}
