/*
  # Create test_connection function
  
  Creates a simple function to test database connectivity
*/

create or replace function test_connection()
returns boolean
language plpgsql
security definer
as $$
begin
  return true;
end;
$$;