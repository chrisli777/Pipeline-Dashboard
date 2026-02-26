import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  // whi_database (wyxzerhrhhxrclqsfpyi)
  return createBrowserClient(
    'https://wyxzerhrhhxrclqsfpyi.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5eHplcmhyaGh4cmNscXNmcHlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NTk5NDMsImV4cCI6MjA4NTAzNTk0M30.9v7eHL7bH-9ev7jFaWhyjiKEeRFujzi8lEzDAHWEJEQ'
  );
}
