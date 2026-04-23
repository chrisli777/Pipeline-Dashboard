-- Add role column to app_users table and create raya user
-- Role values: 'admin' (full access), 'viewer' (read-only, no sync, local save only)

-- Add role column if it doesn't exist
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin';

-- Update existing users to have admin role
UPDATE app_users SET role = 'admin' WHERE role IS NULL;

-- Create raya user with viewer role
-- Password: raya (hashed using crypt with bf algorithm)
INSERT INTO app_users (user_id, username, password_hash, role, created_at)
VALUES (
  gen_random_uuid(),
  'raya',
  crypt('raya', gen_salt('bf')),
  'viewer',
  NOW()
)
ON CONFLICT (username) DO UPDATE SET 
  password_hash = crypt('raya', gen_salt('bf')),
  role = 'viewer';
