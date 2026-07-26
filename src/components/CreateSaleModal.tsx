import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { sendNewSaleEmail } from '../lib/email';
import { logger } from '../lib/logger';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useToast } from './Toast';
import { FaTimes, FaSave, FaUser, FaBox, FaSearch } from 'react-icons/fa';

interface CreateSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaleCreated: () => void;
  preSelectedUserId?: string; // Optional: pre-select a user by ID
  preSelectedUserEmail?: string; // Optional: pre-select a user by email
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

interface ManualSaleItemForm {
  productSearch: string;
  selectedProductId: string;
  selectedProduct: Product | null;
  productName: string;
  size: string;
  price: string;
  payout: string;
  sku: string;
  imageUrl: string;
  availableSizes: { size: string; price: number }[];
  filteredProducts: Product[];
  showProductSuggestions: boolean;
  loadingSizes: boolean;
}

const createEmptySaleItem = (): ManualSaleItemForm => ({
  productSearch: '',
  selectedProductId: '',
  selectedProduct: null,
  productName: '',
  size: '',
  price: '',
  payout: '',
  sku: '',
  imageUrl: '',
  availableSizes: [],
  filteredProducts: [],
  showProductSuggestions: false,
  loadingSizes: false
});

export default function CreateSaleModal({ isOpen, onClose, onSaleCreated, preSelectedUserId, preSelectedUserEmail }: CreateSaleModalProps) {
  const { showToast } = useToast();
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form fields
  const [userEmailSearch, setUserEmailSearch] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showUserSuggestions, setShowUserSuggestions] = useState(false);
  const [firstItem, setFirstItem] = useState<ManualSaleItemForm>(createEmptySaleItem());
  const [secondItem, setSecondItem] = useState<ManualSaleItemForm>(createEmptySaleItem());
  const [hasSecondProduct, setHasSecondProduct] = useState(false);
  const [externalId, setExternalId] = useState('');
  const [saleDate, setSaleDate] = useState<string>('');
  const [sendEmail, setSendEmail] = useState(true); // Default: send email

  const userInputRef = useRef<HTMLInputElement>(null);
  const firstProductInputRef = useRef<HTMLInputElement>(null);
  const secondProductInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Reset form fields (but keep user if pre-selected)
      if (!preSelectedUserId && !preSelectedUserEmail) {
        resetForm();
      } else {
        // Reset only non-user fields
        setFirstItem(createEmptySaleItem());
        setSecondItem(createEmptySaleItem());
        setHasSecondProduct(false);
        setExternalId('');
      }
      
      // Set default date to today
      const today = new Date();
      const dateString = today.toISOString().split('T')[0];
      setSaleDate(dateString);
      
      // Load users and products
      loadUsers();
      loadProducts();
    }
  }, [isOpen, preSelectedUserId, preSelectedUserEmail]);

  // Pre-select user when users are loaded and preSelectedUserId/preSelectedUserEmail is provided
  useEffect(() => {
    if (isOpen && allUsers.length > 0 && (preSelectedUserId || preSelectedUserEmail)) {
      let user: User | undefined;
      if (preSelectedUserId) {
        user = allUsers.find(u => u.id === preSelectedUserId);
      } else if (preSelectedUserEmail) {
        user = allUsers.find(u => u.email === preSelectedUserEmail);
      }
      
      // Always select user if found (force selection when pre-selected)
      if (user) {
        setSelectedUserId(user.id);
        setSelectedUser(user);
        setUserEmailSearch(user.email);
        setShowUserSuggestions(false);
      }
    }
  }, [isOpen, allUsers, preSelectedUserId, preSelectedUserEmail]);

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
      if (firstProductInputRef.current && !firstProductInputRef.current.contains(target)) {
        const productSuggestions = document.querySelector('[data-product-suggestions="0"]');
        if (productSuggestions && !productSuggestions.contains(target)) {
          setFirstItem((prev) => ({ ...prev, showProductSuggestions: false }));
        }
      }

      if (secondProductInputRef.current && !secondProductInputRef.current.contains(target)) {
        const productSuggestions = document.querySelector('[data-product-suggestions="1"]');
        if (productSuggestions && !productSuggestions.contains(target)) {
          setSecondItem((prev) => ({ ...prev, showProductSuggestions: false }));
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
    const updateFilteredProducts = (
      item: ManualSaleItemForm,
      setItem: React.Dispatch<React.SetStateAction<ManualSaleItemForm>>
    ) => {
      if (item.productSearch.length > 0) {
        const filtered = products.filter(product =>
          product.name.toLowerCase().includes(item.productSearch.toLowerCase()) ||
          (product.sku && product.sku.toLowerCase().includes(item.productSearch.toLowerCase()))
        ).slice(0, 5);
        setItem((prev) => ({ ...prev, filteredProducts: filtered, showProductSuggestions: true }));
      } else {
        setItem((prev) => ({ ...prev, filteredProducts: [], showProductSuggestions: false }));
      }
    };

    updateFilteredProducts(firstItem, setFirstItem);
  }, [firstItem.productSearch, products]);

  useEffect(() => {
    const updateFilteredProducts = (
      item: ManualSaleItemForm,
      setItem: React.Dispatch<React.SetStateAction<ManualSaleItemForm>>
    ) => {
      if (item.productSearch.length > 0) {
        const filtered = products.filter(product =>
          product.name.toLowerCase().includes(item.productSearch.toLowerCase()) ||
          (product.sku && product.sku.toLowerCase().includes(item.productSearch.toLowerCase()))
        ).slice(0, 5);
        setItem((prev) => ({ ...prev, filteredProducts: filtered, showProductSuggestions: true }));
      } else {
        setItem((prev) => ({ ...prev, filteredProducts: [], showProductSuggestions: false }));
      }
    };

    updateFilteredProducts(secondItem, setSecondItem);
  }, [secondItem.productSearch, products]);

  const resetForm = () => {
    setUserEmailSearch('');
    setSelectedUserId('');
    setSelectedUser(null);
    setFirstItem(createEmptySaleItem());
    setSecondItem(createEmptySaleItem());
    setHasSecondProduct(false);
    setExternalId('');
    setSaleDate('');
    setSendEmail(true); // Reset to default: send email
    setShowUserSuggestions(false);
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

  const handleProductSelect = async (product: Product, itemIndex: 0 | 1) => {
    const setItem = itemIndex === 0 ? setFirstItem : setSecondItem;

    setItem((prev) => ({
      ...prev,
      selectedProductId: product.id,
      selectedProduct: product,
      productName: product.name,
      sku: product.sku || '',
      imageUrl: product.image_url || '',
      productSearch: product.name,
      showProductSuggestions: false,
      size: '',
      price: '',
      payout: '',
      availableSizes: []
    }));

    // Load available sizes for this product
    try {
      setItem((prev) => ({ ...prev, loadingSizes: true }));
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
      
      setItem((prev) => ({ ...prev, availableSizes: sizes }));
    } catch (err: any) {
      logger.warn('Error loading sizes', err);
      setItem((prev) => ({ ...prev, availableSizes: [] }));
    } finally {
      setItem((prev) => ({ ...prev, loadingSizes: false }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedUserId) {
      setError('Please select a user');
      return;
    }

    if (!saleDate) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const itemsToValidate = hasSecondProduct ? [firstItem, secondItem] : [firstItem];
      const manualSaleItems = itemsToValidate.map((item, index) => {
        if (!item.selectedProductId || !item.selectedProduct) {
          throw new Error(index === 0 ? 'Please select the first product' : 'Please select the second product');
        }

        if (!item.productName || !item.size || !item.price || !item.payout) {
          throw new Error(index === 0 ? 'Please fill in all fields for the first product' : 'Please fill in all fields for the second product');
        }

        const priceNum = parseFloat(item.price);
        const payoutNum = parseFloat(item.payout);

        if (isNaN(priceNum) || priceNum <= 0) {
          throw new Error(index === 0 ? 'First product price must be a positive number' : 'Second product price must be a positive number');
        }

        if (isNaN(payoutNum) || payoutNum <= 0 || payoutNum > priceNum) {
          throw new Error(index === 0
            ? 'First product payout must be a positive number and less than or equal to price'
            : 'Second product payout must be a positive number and less than or equal to price');
        }

        return {
          productId: item.selectedProduct.id,
          productName: item.productName,
          size: item.size,
          price: priceNum,
          payout: payoutNum,
          sku: item.sku || null,
          imageUrl: item.imageUrl || null
        };
      });

      const totalPrice = manualSaleItems.reduce((sum, item) => sum + item.price, 0);
      const totalPayout = manualSaleItems.reduce((sum, item) => sum + item.payout, 0);
      const summaryName = manualSaleItems.map((item) => item.productName).join(' + ');
      const summarySize = manualSaleItems.map((item) => item.size).join(' / ');
      const summarySku = manualSaleItems.map((item) => item.sku).filter(Boolean).join(' / ');
      const primaryItem = manualSaleItems[0];
      const notificationEmail = selectedUser?.email;

      // Use selected date for both created_at and invoice_date
      // Use noon UTC to avoid timezone shifting the date by one day
      const saleDateISO = saleDate + 'T12:00:00.000Z';

      // Create single sale with proper dates
      const saleData = {
        user_id: selectedUserId,
        product_id: primaryItem.productId,
        name: summaryName,
        size: summarySize,
        price: totalPrice,
        payout: totalPayout,
        sku: summarySku || null,
        external_id: externalId || null,
        image_url: primaryItem.imageUrl || null,
        status: 'accepted',
        is_manual: true,
        created_at: saleDateISO,
        invoice_date: saleDateISO,
        manual_sale_items: manualSaleItems.map((item) => ({
          productName: item.productName,
          size: item.size,
          price: item.price,
          payout: item.payout
        }))
      };

      const { data: insertedSale, error: saleError } = await supabase
        .from('user_sales')
        .insert([saleData])
        .select()
        .single();

      if (saleError) throw saleError;

      // Send email notification if enabled
      if (sendEmail && notificationEmail) {
        try {
          await sendNewSaleEmail({
            email: notificationEmail,
            productName: summaryName,
            size: summarySize,
            price: totalPrice,
            payout: totalPayout,
            external_id: externalId || insertedSale.id,
            image_url: primaryItem.imageUrl || undefined,
            sku: summarySku
          });
        } catch (emailError) {
          logger.warn('Failed to send email notification', emailError);
          // Don't fail the sale creation if email fails
        }
      }

      logger.info('Sale created successfully', { saleId: insertedSale.id, items: manualSaleItems.length });
      
      showToast(`Sale created: ${summaryName}`, 'success');
      
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

  const handleCloseModal = useCallback(() => onClose(), [onClose]);
  useEscapeKey(handleCloseModal, isOpen);

  const renderProductSection = (
    item: ManualSaleItemForm,
    setItem: React.Dispatch<React.SetStateAction<ManualSaleItemForm>>,
    itemIndex: 0 | 1,
    title: string
  ) => {
    const inputRef = itemIndex === 0 ? firstProductInputRef : secondProductInputRef;

    return (
      <div className="space-y-4 rounded-2xl border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {itemIndex === 1 && (
            <button
              type="button"
              onClick={() => {
                setHasSecondProduct(false);
                setSecondItem(createEmptySaleItem());
              }}
              className="text-sm font-medium text-red-600 hover:text-red-700"
            >
              Remove
            </button>
          )}
        </div>

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
                  ref={inputRef}
                  type="text"
                  value={item.productSearch}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setItem((prev) => ({
                      ...prev,
                      productSearch: nextValue,
                      ...(nextValue === '' ? createEmptySaleItem() : {})
                    }));
                  }}
                  onFocus={() => {
                    if (item.filteredProducts.length > 0) {
                      setItem((prev) => ({ ...prev, showProductSuggestions: true }));
                    }
                  }}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                  placeholder="Start typing product name..."
                  required
                />
              </div>
              {item.showProductSuggestions && item.filteredProducts.length > 0 && (
                <div
                  data-product-suggestions={String(itemIndex)}
                  className="absolute z-[60] w-full mt-1 bg-white border border-gray-300 rounded-xl shadow-lg max-h-60 overflow-auto"
                >
                  {item.filteredProducts.map((product) => (
                    <div
                      key={`${itemIndex}-${product.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleProductSelect(product, itemIndex);
                      }}
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0 flex items-center space-x-3"
                    >
                      {product.image_url && (
                        <img
                          loading="lazy"
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
              {item.selectedProduct && (
                <div className="mt-2 text-sm text-green-600">
                  ✓ Selected: {item.selectedProduct.name}
                </div>
              )}
            </>
          )}
        </div>

        {item.selectedProductId && (
          <>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Product Name *
              </label>
              <input
                type="text"
                value={item.productName}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-gray-900"
                readOnly
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Size *
              </label>
              {item.loadingSizes ? (
                <div className="text-sm text-gray-600">Loading sizes...</div>
              ) : item.availableSizes.length > 0 ? (
                <select
                  value={item.size}
                  onChange={(e) => {
                    const selectedSize = e.target.value;
                    const selectedSizeData = item.availableSizes.find((sizeOption) => sizeOption.size === selectedSize);
                    setItem((prev) => ({
                      ...prev,
                      size: selectedSize,
                      price: selectedSizeData ? selectedSizeData.price.toString() : prev.price
                    }));
                  }}
                  className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                  required
                >
                  <option value="">Select size...</option>
                  {item.availableSizes.map((sizeOption) => (
                    <option key={sizeOption.size} value={sizeOption.size}>
                      {sizeOption.size} ({sizeOption.price.toFixed(2)} €)
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={item.size}
                  onChange={(e) => setItem((prev) => ({ ...prev, size: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                  placeholder="For example: 42, M, L"
                  required
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Sale Price (€) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={item.price}
                  onChange={(e) => setItem((prev) => ({ ...prev, price: e.target.value }))}
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
                  value={item.payout}
                  onChange={(e) => setItem((prev) => ({ ...prev, payout: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                SKU (optional)
              </label>
              <input
                type="text"
                value={item.sku}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-gray-900"
                placeholder="For example: NIKE-AM90-42"
                readOnly
              />
            </div>

            {item.imageUrl && (
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Product Image
                </label>
                <div className="mt-2">
                  <img
                    loading="lazy"
                    src={item.imageUrl}
                    alt={item.productName}
                    className="w-32 h-32 object-contain border border-gray-200 rounded-lg bg-gray-50"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[70]"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
        <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
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

            {renderProductSection(firstItem, setFirstItem, 0, 'Product 1')}

            {!hasSecondProduct ? (
              <button
                type="button"
                onClick={() => setHasSecondProduct(true)}
                className="w-full px-4 py-3 border border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Add second product
              </button>
            ) : (
              renderProductSection(secondItem, setSecondItem, 1, 'Product 2')
            )}

            {/* Sale Date */}
            {firstItem.selectedProductId && (
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

            {/* Send Email Toggle - at the very bottom before buttons */}
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
