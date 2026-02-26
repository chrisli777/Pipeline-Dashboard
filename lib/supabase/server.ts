import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function createClient() {
  let cookieStore: Awaited<ReturnType<typeof cookies>> | null = null;
  
  try {
    cookieStore = await cookies();
  } catch {
    // cookies() may not be available in some contexts
  }

  // whi_database (wyxzerhrhhxrclqsfpyi)
  const supabaseUrl = 'https://wyxzerhrhhxrclqsfpyi.supabase.co'
  const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5eHplcmhyaGh4cmNscXNmcHlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NTk5NDMsImV4cCI6MjA4NTAzNTk0M30.9v7eHL7bH-9ev7jFaWhyjiKEeRFujzi8lEzDAHWEJEQ'
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
