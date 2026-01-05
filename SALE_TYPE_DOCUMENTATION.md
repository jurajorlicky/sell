# Sale Type System Documentation

## Overview
The system now supports two types of sales records for each sale:
- **Operational** (`sale_type: 'operational'`) - Used for system functionality, tracking, status management
- **Invoice** (`sale_type: 'invoice'`) - Used for invoicing and accounting purposes

## How It Works

### Automatic Duplication
When a sale is created (either manually via `CreateSaleModal` or automatically via `ListedProductsPage`), the system automatically creates **two identical sale records**:
1. One with `sale_type: 'operational'` - for system operations
2. One with `sale_type: 'invoice'` - for invoicing/accounting

### Display Logic
- **Admin Sales Page** - Shows only operational sales
- **User Sales Page** - Shows only operational sales
- **User Details Modal** - Shows only operational sales
- **Admin Dashboard** - Counts only operational sales

### Invoice Sales
- Invoice sales are created automatically but are **not displayed** in the UI
- They can be accessed directly via database queries for invoicing purposes
- Invoice sales maintain the same data structure as operational sales

## Database Migration
Run the migration file `supabase/migrations/add_sale_type_column.sql` to add the `sale_type` column to the `user_sales` table.

## Future Enhancements
- Add admin interface to view/manage invoice sales
- Add export functionality for invoice sales
- Add separate status tracking for invoice sales if needed

