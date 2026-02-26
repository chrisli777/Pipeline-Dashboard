import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function createClient() {
  let cookieStore: Awaited<ReturnType<typeof cookies>> | null = null;
  
  try {
    cookieStore = await cookies();
  } catch {
    // cookies() may not be available in some contexts
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://wyxzerhrhhxrclqsfpyi.supabase.co'
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5eHplcmhyaGh4cmNscXNmcHlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NTk5NDMsImV4cCI6MjA4NTAzNTk0M30.9v7eHL7bH-9ev7jFaWhyjiKEeRFujzi8lEzDAHWEJEQ'

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
