# Price Comparison Logic Analysis & Improvement Suggestions

## Current Issues

### 1. **EditProductModal.tsx - Slovak Text**
- Line 211-214 still has Slovak text that needs translation

### 2. **Floating Point Comparison**
- Using `===` for price comparison can cause issues with decimal numbers
- Should use epsilon tolerance (e.g., 0.01€)

### 3. **Dashboard Logic - Owner Detection**
- `fetchMarketPricesWithTimeout` doesn't exclude current user's products
- Should fetch separately: lowest consignor (excluding user) and eshop price
- Then determine if user is the owner of the lowest price

### 4. **Unclear "Same Lowest" Logic**
- When user has same price but isn't owner, shows "Same Lowest" (yellow)
- This is confusing - should clarify: "Tied for lowest" or "Same price, not first"

### 5. **Missing Edge Cases**
- What if price is between eshop and consignor price?
- What if multiple users have the same lowest price?

## Recommended Improvements

### 1. **Fix Floating Point Comparison**
```typescript
const PRICE_EPSILON = 0.01; // 1 cent tolerance

function isPriceEqual(price1: number, price2: number): boolean {
  return Math.abs(price1 - price2) < PRICE_EPSILON;
}

function isPriceLower(price1: number, price2: number): boolean {
  return price1 < price2 - PRICE_EPSILON;
}
```

### 2. **Improve Dashboard Logic**
- Fetch lowest consignor price EXCLUDING current user
- Fetch eshop price separately
- Determine if user is owner of the absolute lowest price
- Better categorization:
  - **Lowest** (green): User has the absolute lowest price (beats both eshop and consignors)
  - **Tied for Lowest** (yellow): User has same price as lowest, but not first in line
  - **Above Lowest** (red): User's price is higher than lowest
  - **Below Eshop** (green): User beats eshop but there are lower consignor prices

### 3. **Better Status Messages**
- "Lowest" → "You have the lowest price"
- "Same Lowest" → "Tied for lowest (not first in line)"
- "Higher" → "€X.XX above lowest price"
- "Below Eshop" → "€X.XX below eshop (but €Y.YY above lowest consignor)"

### 4. **Fix EditProductModal**
- Remove Slovak text
- Use same epsilon comparison
- Better feedback when price equals lowest

### 5. **Add Price Difference Display**
- Show exact difference in €
- Show percentage difference
- Show how many competitors have lower prices

## Implementation Priority

1. **High Priority:**
   - Fix Slovak text in EditProductModal
   - Fix floating point comparison
   - Fix Dashboard to exclude user's own products when determining "owner"

2. **Medium Priority:**
   - Improve status messages
   - Better edge case handling

3. **Low Priority:**
   - Add price difference details
   - Add competitor count

