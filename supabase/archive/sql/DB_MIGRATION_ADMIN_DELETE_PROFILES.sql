-- Migration: Allow admins to delete profiles, user_sales, and user_products
-- This adds RLS policies for admins to delete user-related data

-- ============================================================================
-- PROFILES POLICIES
-- ============================================================================

-- Drop existing admin policies if they exist
DROP POLICY IF EXISTS "Admins can delete all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;

-- Create policy for admins to delete any profile
CREATE POLICY "Admins can delete all profiles"
ON profiles
FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Create policy for admins to update any profile
CREATE POLICY "Admins can update all profiles"
ON profiles
FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- ============================================================================
-- USER_SALES POLICIES
-- ============================================================================

-- Drop existing admin delete policy if it exists
DROP POLICY IF EXISTS "Admins can delete user_sales" ON user_sales;

-- Create policy for admins to delete any user_sale
CREATE POLICY "Admins can delete user_sales"
ON user_sales
FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- ============================================================================
-- USER_PRODUCTS POLICIES
-- ============================================================================

-- Drop existing admin delete policy if it exists
DROP POLICY IF EXISTS "Admins can delete user_products" ON user_products;

-- Create policy for admins to delete any user_product
CREATE POLICY "Admins can delete user_products"
ON user_products
FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify policies were created for profiles
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'profiles' 
  AND policyname LIKE '%admin%'
ORDER BY policyname;

-- Verify policies were created for user_sales
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'user_sales' 
  AND policyname LIKE '%admin%'
ORDER BY policyname;

-- Verify policies were created for user_products
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'user_products' 
  AND policyname LIKE '%admin%'
ORDER BY policyname;

-- ============================================================================
-- FUNCTION TO DELETE USER FROM AUTH.USERS
-- ============================================================================

-- Create a function to delete user from auth.users
-- This function uses SECURITY DEFINER to bypass RLS
-- WARNING: This function should only be called by admins

CREATE OR REPLACE FUNCTION delete_auth_user(user_id_to_delete uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Check if the current user is an admin
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;

  -- Delete from auth.users (this will cascade to profiles if CASCADE is set)
  DELETE FROM auth.users WHERE id = user_id_to_delete;
  
  -- If the user was deleted, we're done
  -- Otherwise, this function might fail silently if the user doesn't exist
END;
$$;

-- Grant execute permission to authenticated users (RLS will check admin status)
GRANT EXECUTE ON FUNCTION delete_auth_user(uuid) TO authenticated;

-- Note: The above function may not work if auth schema is not accessible
-- Alternative approach: Use Edge Function or Supabase Admin API

