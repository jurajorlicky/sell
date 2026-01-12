import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { sendNewSaleEmail } from '../lib/email';
import { logger } from '../lib/logger';
import { FaTimes, FaSave, FaUser, FaBox, FaSearch } from 'react-icons/fa';

interface CreateSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaleCreated: () => void;
}

interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
}

interface Product {
  id: string;
  name: string;
  image_url?: string;
  sku?: string;
}

export default function CreateSaleModal({ isOpen, onClose, onSaleCreated }: CreateSaleModalProps) {
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [availableSizes, setAvailableSizes] = useState<{size: string; price: number}[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingSizes, setLoadingSizes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form fields
  const [userEmailSearch, setUserEmailSearch] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showUserSuggestions, setShowUserSuggestions] = useState(false);
  const [productSearch, setProductSearch] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);
  const [productName, setProductName] = useState('');
  const [size, setSize] = useState('');
  const [price, setPrice] = useState('');
  const [payout, setPayout] = useState('');
  const [sku, setSku] = useState('');
  const [externalId, setExternalId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [saleDate, setSaleDate] = useState<string>('');
  const [sendEmail, setSendEmail] = useState(true); // Default: send email

  const userInputRef = useRef<HTMLInputElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      loadProducts();
      resetForm();
      // Set default date to today
      const today = new Date();
      const dateString = today.toISOString().split('T')[0];
      setSaleDate(dateString);
    }
  }, [isOpen]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Check if click is outside user input and suggestions
      if (userInputRef.current && !userInputRef.current.contains(target)) {
        const userSuggestions = document.querySelector('[data-user-suggestions]');
        if (userSuggestions && !userSuggestions.contains(target)) {
          setShowUserSuggestions(false);
        }
      }
      
      // Check if click is outside product input and suggestions
      if (productInputRef.current && !productInputRef.current.contains(target)) {
        const productSuggestions = document.querySelector('[data-product-suggestions]');
        if (productSuggestions && !productSuggestions.contains(target)) {
          setShowProductSuggestions(false);
        }
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
    return undefined;
  }, [isOpen]);

  useEffect(() => {
    if (userEmailSearch.length > 0) {
      const filtered = allUsers.filter(user => 
        user.email.toLowerCase().includes(userEmailSearch.toLowerCase()) ||
        (user.first_name && user.first_name.toLowerCase().includes(userEmailSearch.toLowerCase())) ||
        (user.last_name && user.last_name.toLowerCase().includes(userEmailSearch.toLowerCase()))
      ).slice(0, 5);
      setFilteredUsers(filtered);
      setShowUserSuggestions(true);
    } else {
      setFilteredUsers([]);
      setShowUserSuggestions(false);
    }
  }, [userEmailSearch, allUsers]);

  useEffect(() => {
    if (productSearch.length > 0) {
      const filtered = products.filter(product => 
        product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        (product.sku && product.sku.toLowerCase().includes(productSearch.toLowerCase()))
      ).slice(0, 5);
      setFilteredProducts(filtered);
      setShowProductSuggestions(true);
    } else {
      setFilteredProducts([]);
      setShowProductSuggestions(false);
    }
  }, [productSearch, products]);

  useEffect(() => {
    if (selectedProductId) {
      const product = products.find(p => p.id === selectedProductId);
      if (product) {
        setSelectedProduct(product);
        setProductName(product.name);
        setSku(product.sku || '');
        setImageUrl(product.image_url || '');
        setProductSearch(product.name);
        setShowProductSuggestions(false);
      }
    }
  }, [selectedProductId, products]);

  const resetForm = () => {
    setUserEmailSearch('');
    setSelectedUserId('');
    setSelectedUser(null);
    setProductSearch('');
    setSelectedProductId('');
    setSelectedProduct(null);
    setProductName('');
    setSize('');
    setPrice('');
    setPayout('');
    setSku('');
    setImageUrl('');
    setExternalId('');
    setSaleDate('');
    setSendEmail(true); // Reset to default: send email
    setAvailableSizes([]);
    setShowUserSuggestions(false);
    setShowProductSuggestions(false);
  };

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name')
        .order('email', { ascending: true });

      if (error) throw error;
      setAllUsers(data || []);
    } catch (err: any) {
      logger.error('Error loading users', err);
      setError('Error loading users: ' + err.message);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadProducts = async () => {
    try {
      setLoadingProducts(true);
      const { data, error } = await supabase
        .from('products')
        .select('id, name, image_url, sku')
        .order('name', { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch (err: any) {
      logger.error('Error loading products', err);
      setError('Error loading products: ' + err.message);
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleUserSelect = (user: User) => {
    setSelectedUserId(user.id);
    setSelectedUser(user);
    setUserEmailSearch(user.email);
    setShowUserSuggestions(false);
  };

  const handleProductSelect = async (product: Product) => {
    setSelectedProductId(product.id);
    setSelectedProduct(product);
    setProductName(product.name);
    setSku(product.sku || '');
    setImageUrl(product.image_url || '');
    setProductSearch(product.name);
    setShowProductSuggestions(false);
    setSize('');
    setPrice('');
    
    // Load available sizes for this product
    try {
      setLoadingSizes(true);
      const { data, error } = await supabase
        .from('product_price_view')
        .select('size, final_price')
        .eq('product_id', product.id)
        .order('size', { ascending: true });
      
      if (error) throw error;
      
      const sizes = (data || []).map(item => ({
        size: item.size,
        price: item.final_price
      }));
      
      setAvailableSizes(sizes);
    } catch (err: any) {
      logger.warn('Error loading sizes', err);
      setAvailableSizes([]);
    } finally {
      setLoadingSizes(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedUserId) {
      setError('Please select a user');
      return;
    }

    if (!selectedProductId) {
      setError('Please select a product');
      return;
    }

    if (!productName || !size || !price || !payout || !saleDate) {
      setError('Please fill in all required fields');
      return;
    }

    const priceNum = parseFloat(price);
    const payoutNum = parseFloat(payout);

    if (isNaN(priceNum) || priceNum <= 0) {
      setError('Price must be a positive number');
      return;
    }

    if (isNaN(payoutNum) || payoutNum <= 0 || payoutNum > priceNum) {
      setError('Payout must be a positive number and less than or equal to price');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      if (!selectedProduct) {
        setError('Selected product was not found');
        return;
      }

      // Create sale with invoice date
      const saleDateObj = new Date(saleDate + 'T00:00:00');
      const invoiceDateISO = saleDateObj.toISOString();
      const currentDateISO = new Date().toISOString(); // Current date for created_at

      // Create single sale with invoice_date for PDF
      const saleData = {
        user_id: selectedUserId,
        product_id: selectedProduct.id,
        name: productName,
        size: size,
        price: priceNum,
        payout: payoutNum,
        sku: sku || null,
        external_id: externalId || null,
        image_url: imageUrl || null,
        status: 'accepted',
        is_manual: true, // Mark as manual sale
        created_at: currentDateISO, // Current date for tracking
        invoice_date: invoiceDateISO // Selected date for invoice/PDF
      };

      const { data: insertedSale, error: saleError } = await supabase
        .from('user_sales')
        .insert([saleData])
        .select()
        .single();

      if (saleError) throw saleError;

      // Send email notification if enabled
      if (sendEmail && selectedUser?.email) {
        try {
          await sendNewSaleEmail({
            email: selectedUser.email,
            productName: productName,
            size: size,
            price: priceNum,
            payout: payoutNum,
            external_id: externalId || insertedSale.id,
            image_url: imageUrl || undefined,
            sku: sku
          });
        } catch (emailError) {
          logger.warn('Failed to send email notification', emailError);
          // Don't fail the sale creation if email fails
        }
      }

      logger.info('Sale created successfully', { saleId: insertedSale.id });
      
      // Reset form
      resetForm();
      
      onSaleCreated();
      onClose();
    } catch (err: any) {
      logger.error('Error creating sale', err);
      setError('Error creating sale: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Create New Sale</h2>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mt-1">
              Manual sale
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <FaTimes className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* User Selection with Autocomplete */}
            <div className="relative">
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                <FaUser className="inline mr-2" />
                User Email *
              </label>
              {loadingUsers ? (
                <div className="text-sm text-gray-600">Loading users...</div>
              ) : (
                <>
                  <div className="relative">
                    <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      ref={userInputRef}
                      type="text"
                      value={userEmailSearch}
                      onChange={(e) => {
                        setUserEmailSearch(e.target.value);
                        if (e.target.value === '') {
                          setSelectedUserId('');
                          setSelectedUser(null);
                        }
                      }}
                      onFocus={() => {
                        if (filteredUsers.length > 0) {
                          setShowUserSuggestions(true);
                        }
                      }}
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                      placeholder="Start typing email..."
                      required
                    />
                  </div>
                  {showUserSuggestions && filteredUsers.length > 0 && (
                    <div 
                      data-user-suggestions
                      className="absolute z-[60] w-full mt-1 bg-white border border-gray-300 rounded-xl shadow-lg max-h-60 overflow-auto"
                    >
                      {filteredUsers.map((user) => (
                        <div
                          key={user.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUserSelect(user);
                          }}
                          className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                        >
                          <div className="font-medium text-gray-900">
                            {user.first_name || user.last_name 
                              ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                              : user.email}
                          </div>
                          <div className="text-sm text-gray-600">{user.email}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedUser && (
                    <div className="mt-2 text-sm text-green-600">
                      ✓ Selected: {selectedUser.email}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Product Selection with Autocomplete */}
            <div className="relative">
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                <FaBox className="inline mr-2" />
                Product *
              </label>
              {loadingProducts ? (
                <div className="text-sm text-gray-600">Loading products...</div>
              ) : (
                <>
                  <div className="relative">
                    <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      ref={productInputRef}
                      type="text"
                      value={productSearch}
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        if (e.target.value === '') {
                          setSelectedProductId('');
                          setSelectedProduct(null);
                          resetForm();
                        }
                      }}
                      onFocus={() => {
                        if (filteredProducts.length > 0) {
                          setShowProductSuggestions(true);
                        }
                      }}
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                      placeholder="Start typing product name..."
                      required
                    />
                  </div>
                  {showProductSuggestions && filteredProducts.length > 0 && (
                    <div 
                      data-product-suggestions
                      className="absolute z-[60] w-full mt-1 bg-white border border-gray-300 rounded-xl shadow-lg max-h-60 overflow-auto"
                    >
                      {filteredProducts.map((product) => (
                        <div
                          key={product.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleProductSelect(product);
                          }}
                          className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0 flex items-center space-x-3"
                        >
                          {product.image_url && (
                            <img 
                              src={product.image_url} 
                              alt={product.name}
                              className="w-10 h-10 object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          )}
                          <div>
                            <div className="font-medium text-gray-900">{product.name}</div>
                            {product.sku && (
                              <div className="text-sm text-gray-600">SKU: {product.sku}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedProduct && (
                    <div className="mt-2 text-sm text-green-600">
                      ✓ Selected: {selectedProduct.name}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Product Name (read-only when product is selected) */}
            {selectedProductId && (
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Product Name *
                </label>
                <input
                  type="text"
                  value={productName}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-gray-900"
                  readOnly
                />
              </div>
            )}

            {/* Size Selection */}
            {selectedProductId && (
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Size *
                </label>
                {loadingSizes ? (
                  <div className="text-sm text-gray-600">Loading sizes...</div>
                ) : availableSizes.length > 0 ? (
                  <select
                    value={size}
                    onChange={(e) => {
                      setSize(e.target.value);
                      // Auto-fill price if size is selected
                      const selectedSizeData = availableSizes.find(s => s.size === e.target.value);
                      if (selectedSizeData) {
                        setPrice(selectedSizeData.price.toString());
                      }
                    }}
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                    required
                  >
                    <option value="">Select size...</option>
                    {availableSizes.map((sizeOption) => (
                      <option key={sizeOption.size} value={sizeOption.size}>
                        {sizeOption.size} ({sizeOption.price.toFixed(2)} €)
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                    placeholder="For example: 42, M, L"
                    required
                  />
                )}
              </div>
            )}

            {/* Price and Payout */}
            {selectedProductId && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Sale Price (€) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Payout (€) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={payout}
                    onChange={(e) => setPayout(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>
            )}

            {/* SKU */}
            {selectedProductId && (
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  SKU (optional)
                </label>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-gray-900"
                  placeholder="For example: NIKE-AM90-42"
                  readOnly
                />
              </div>
            )}

            {/* Sale Date */}
            {selectedProductId && (
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Sale Date *
                </label>
                <input
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                  required
                />
              </div>
            )}

            {/* External ID */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                External ID (optional)
              </label>
              <input
                type="text"
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                placeholder="For example: ORDER-12345"
              />
            </div>

            {/* Send Email Toggle */}
            {selectedUser?.email && (
              <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <input
                  type="checkbox"
                  id="sendEmail"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 focus:ring-2"
                />
                <label htmlFor="sendEmail" className="text-sm font-medium text-gray-900 cursor-pointer">
                  Send email notification to {selectedUser.email}
                </label>
              </div>
            )}

            {/* Product Image (display only) */}
            {selectedProductId && imageUrl && (
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Product Image
                </label>
                <div className="mt-2">
                  <img 
                    src={imageUrl} 
                    alt={productName}
                    className="w-32 h-32 object-contain border border-gray-200 rounded-lg bg-gray-50"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2.5 text-gray-800 font-medium rounded-xl hover:bg-gray-100 transition-colors border border-gray-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center px-6 py-2.5 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transform hover:scale-105"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating...
                  </>
                ) : (
                  <>
                    <FaSave className="mr-2" />
                    Create Sale
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}



