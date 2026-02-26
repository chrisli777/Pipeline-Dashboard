import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function createClient() {
  let cookieStore: Awaited<ReturnType<typeof cookies>> | null = null;
  
  try {
    cookieStore = await cookies();
  } catch {
    // cookies() may not be available in some contexts
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  console.log("[v0] Supabase env check - URL exists:", !!supabaseUrl, "Key exists:", !!supabaseAnonKey)

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[v0] Missing env vars. NEXT_PUBLIC_SUPABASE_URL:", !!process.env.NEXT_PUBLIC_SUPABASE_URL, "SUPABASE_URL:", !!process.env.SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_ANON_KEY:", !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "SUPABASE_ANON_KEY:", !!process.env.SUPABASE_ANON_KEY)
    throw new Error('Supabase URL and Anon Key are required. Check your environment variables.')
  }

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
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
