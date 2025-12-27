# How to Add Yourself as an Admin

To access the admin dashboard, you need to add your user account to the `admin_users` table. Follow these steps:

## 1. Get Your User ID

Your user ID is visible in your profile page. You can also get it by running this SQL query in the Supabase SQL Editor:

```sql
SELECT id FROM auth.users WHERE email = 'your-email@example.com';
```

Replace `your-email@example.com` with the email you used to register.

## 2. Add Yourself as an Admin

Run the following SQL query in the Supabase SQL Editor:

```sql
INSERT INTO admin_users (id) 
VALUES ('your-user-id-here');
```

Replace `your-user-id-here` with your actual user ID from step 1.

## 3. Access the Admin Dashboard

After adding yourself as an admin:

1. Log out and log back in to refresh your session
2. Navigate to `/admin` in your browser
3. You should now have access to the admin dashboard

## Admin Features

As an admin, you can:
- View all user products
- Create sales from user products
- View all sales history
- Manage the platform from the admin dashboard