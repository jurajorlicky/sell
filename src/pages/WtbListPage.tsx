import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminNavigation from '../components/AdminNavigation';
import { supabase } from '../lib/supabase';
import {
  FaCheck,
  FaCopy,
  FaDownload,
  FaExclamationTriangle,
  FaEye,
  FaHeart,
  FaPlus,
  FaSearch,
  FaSignOutAlt,
  FaSync,
  FaTimes,
  FaTrash,
} from 'react-icons/fa';

interface ProductSearchResult {
  id: string;
  name: string;
  image_url: string | null;
  sku: string | null;
}

interface ProductSize {
  size: string;
}

interface WtbItem {
  id?: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  sku: string | null;
  sizes: string[];
}

const STORAGE_KEY = 'admin_wtb_list_items';
const DEFAULT_IMAGE = '/default-image.png';

const mapWtbRow = (row: any): WtbItem => ({
  id: row.id,
  productId: row.product_id,
  name: row.name,
  imageUrl: row.image_url,
  sku: row.sku,
  sizes: Array.isArray(row.sizes) ? row.sizes : [],
});

const sortSizes = (sizes: string[]) =>
  [...sizes].sort((a, b) => {
    const numericA = parseFloat(a);
    const numericB = parseFloat(b);

    if (!Number.isNaN(numericA) && !Number.isNaN(numericB)) {
      return numericA - numericB;
    }

    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });

const loadImage = (src: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

const getWtbLines = (items: WtbItem[]) =>
  items.flatMap((item) => {
    if (item.sizes.length === 0) {
      return [`${item.name} - Any size`];
    }

    return item.sizes.map((size) => `${item.name} - ${size}`);
  });

const getWtbCopyText = (items: WtbItem[]) => ['WTB', ...getWtbLines(items)].join('\n');

const getWrappedLines = (
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) => {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';

  words.forEach((word) => {
    const testLine = line ? `${line} ${word}` : word;
    if (context.measureText(testLine).width <= maxWidth) {
      line = testLine;
      return;
    }

    if (line) lines.push(line);
    line = word;
  });

  if (line) lines.push(line);

  return lines.length ? lines : [text];
};

const drawTextLines = (
  context: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number
) => {
  lines.forEach((lineText, index) => {
    context.fillText(lineText, x, y + index * lineHeight);
  });
};

const createWtbImage = async (items: WtbItem[]) => {
  const width = 1600;
  const padding = 50;
  const gap = 22;
  const rows = items.length > 4 ? 2 : 1;
  const columns = Math.max(1, Math.ceil(items.length / rows));
  const tileWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
  const nameFontSize = Math.max(18, Math.min(28, tileWidth / 8));
  const nameLineHeight = nameFontSize + 8;
  const sizeFontSize = Math.max(15, Math.min(22, tileWidth / 10));
  const sizeLineHeight = sizeFontSize + 6;
  const measureCanvas = document.createElement('canvas');
  const measureContext = measureCanvas.getContext('2d');
  if (!measureContext) {
    throw new Error('Canvas is not supported in this browser.');
  }
  measureContext.font = `800 ${nameFontSize}px Arial, sans-serif`;
  const nameLinesByItem = items.map((item) => getWrappedLines(measureContext, item.name, tileWidth - 18));
  const maxNameLines = Math.max(1, ...nameLinesByItem.map((lines) => lines.length));
  const tileHeight = tileWidth + 16 + maxNameLines * nameLineHeight + 2 + sizeLineHeight + 20;
  const headerHeight = 150;
  const height = headerHeight + padding + rows * tileHeight + Math.max(0, rows - 1) * gap + padding;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas is not supported in this browser.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);

  context.fillStyle = '#111827';
  context.font = '800 86px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('WTB', width / 2, 82);

  const images = await Promise.all(items.map((item) => loadImage(item.imageUrl || DEFAULT_IMAGE)));

  items.forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = padding + column * (tileWidth + gap);
    const y = headerHeight + padding + row * (tileHeight + gap);
    const image = images[index];
    const imageSize = tileWidth;

    context.fillStyle = '#f9fafb';
    context.strokeStyle = '#e5e7eb';
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(x, y, tileWidth, tileHeight, 20);
    context.fill();
    context.stroke();

    context.fillStyle = '#ffffff';
    context.strokeStyle = '#e5e7eb';
    context.beginPath();
    context.roundRect(x, y, imageSize, imageSize, 20);
    context.fill();
    context.stroke();

    if (image) {
      const scale = Math.min((imageSize - 18) / image.width, (imageSize - 18) / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      context.drawImage(
        image,
        x + (imageSize - drawWidth) / 2,
        y + (imageSize - drawHeight) / 2,
        drawWidth,
        drawHeight
      );
    }

    context.textAlign = 'center';
    context.textBaseline = 'top';
    context.fillStyle = '#111827';
    context.font = `800 ${nameFontSize}px Arial, sans-serif`;
    const nameY = y + imageSize + 16;
    const nameLines = nameLinesByItem[index];
    drawTextLines(context, nameLines, x + tileWidth / 2, nameY, nameLineHeight);

    context.fillStyle = '#4b5563';
    context.font = `700 ${sizeFontSize}px Arial, sans-serif`;
    const sizes = item.sizes.length ? item.sizes.join(' / ') : 'Any size';
    const sizeY = nameY + nameLines.length * nameLineHeight + 2;
    drawTextLines(context, getWrappedLines(context, sizes, tileWidth - 18), x + tileWidth / 2, sizeY, sizeLineHeight);
  });

  return canvas.toDataURL('image/png');
};

export default function WtbListPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState<ProductSearchResult[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const [availableSizes, setAvailableSizes] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [wtbItems, setWtbItems] = useState<WtbItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingWtbItems, setLoadingWtbItems] = useState(true);
  const [loadingSizes, setLoadingSizes] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingWtbItem, setSavingWtbItem] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [copiedWtbText, setCopiedWtbText] = useState(false);

  const loadWtbItems = useCallback(async () => {
    setLoadingWtbItems(true);
    setError(null);

    try {
      const { data, error: wtbError } = await supabase
        .from('wtb_items')
        .select('id, product_id, name, image_url, sku, sizes, position, created_at')
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

      if (wtbError) throw wtbError;

      if (data && data.length > 0) {
        setWtbItems(data.map(mapWtbRow));
        return;
      }

      const storedItems = localStorage.getItem(STORAGE_KEY);
      if (storedItems) {
        const localItems = JSON.parse(storedItems) as WtbItem[];
        if (localItems.length > 0) {
          const rows = localItems.map((item, index) => ({
            product_id: item.productId,
            name: item.name,
            image_url: item.imageUrl,
            sku: item.sku,
            sizes: item.sizes,
            position: index,
          }));

          const { data: insertedData, error: insertError } = await supabase
            .from('wtb_items')
            .insert(rows)
            .select('id, product_id, name, image_url, sku, sizes, position, created_at');

          if (insertError) throw insertError;
          setWtbItems((insertedData || []).map(mapWtbRow));
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (err: any) {
      setError('Error loading WTB list: ' + err.message);
      setWtbItems([]);
    } finally {
      setLoadingWtbItems(false);
    }
  }, []);

  useEffect(() => {
    loadWtbItems();
  }, [loadWtbItems]);

  const searchProducts = useCallback(async (term: string) => {
    if (term.trim().length < 2) {
      setProducts([]);
      return;
    }

    setLoadingProducts(true);
    setError(null);

    try {
      const { data, error: productsError } = await supabase
        .from('products')
        .select('id, name, image_url, sku')
        .ilike('name', `%${term.trim()}%`)
        .order('name', { ascending: true })
        .limit(20);

      if (productsError) throw productsError;
      setProducts(data || []);
    } catch (err: any) {
      setError('Error loading products: ' + err.message);
    } finally {
      setLoadingProducts(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      searchProducts(searchTerm);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchProducts, searchTerm]);

  const loadSizes = async (product: ProductSearchResult) => {
    setSelectedProduct(product);
    setSelectedSizes([]);
    setAvailableSizes([]);
    setLoadingSizes(true);
    setError(null);

    try {
      const { data, error: sizesError } = await supabase
        .from('product_price_view')
        .select('size')
        .eq('product_id', product.id);

      if (sizesError) throw sizesError;

      const uniqueSizes = Array.from(
        new Set((data as ProductSize[] | null)?.map((item) => item.size).filter(Boolean) || [])
      );

      setAvailableSizes(sortSizes(uniqueSizes));
    } catch (err: any) {
      setError('Error loading sizes: ' + err.message);
    } finally {
      setLoadingSizes(false);
    }
  };

  const toggleSize = (size: string) => {
    setSelectedSizes((current) =>
      current.includes(size) ? current.filter((item) => item !== size) : sortSizes([...current, size])
    );
  };

  const addSelectedProduct = async () => {
    if (!selectedProduct) return;

    setSavingWtbItem(true);
    setError(null);

    try {
      const existingIndex = wtbItems.findIndex((item) => item.productId === selectedProduct.id);
      const row = {
        product_id: selectedProduct.id,
        name: selectedProduct.name,
        image_url: selectedProduct.image_url,
        sku: selectedProduct.sku,
        sizes: selectedSizes,
        position: existingIndex === -1 ? wtbItems.length : existingIndex,
        updated_at: new Date().toISOString(),
      };

      const { data, error: upsertError } = await supabase
        .from('wtb_items')
        .upsert(row, { onConflict: 'product_id' })
        .select('id, product_id, name, image_url, sku, sizes, position, created_at')
        .single();

      if (upsertError) throw upsertError;

      const nextItem = mapWtbRow(data);
      setWtbItems((current) => {
        const currentIndex = current.findIndex((item) => item.productId === selectedProduct.id);
        if (currentIndex === -1) {
          return [...current, nextItem];
        }

        return current.map((item, index) => (index === currentIndex ? nextItem : item));
      });

      setSelectedProduct(null);
      setSelectedSizes([]);
      setAvailableSizes([]);
    } catch (err: any) {
      setError('Error saving WTB item: ' + err.message);
    } finally {
      setSavingWtbItem(false);
    }
  };

  const removeItem = async (itemToRemove: WtbItem) => {
    setError(null);

    try {
      const query = supabase.from('wtb_items').delete();
      const { error: deleteError } = itemToRemove.id
        ? await query.eq('id', itemToRemove.id)
        : await query.eq('product_id', itemToRemove.productId);

      if (deleteError) throw deleteError;
      setWtbItems((current) => current.filter((item) => item.productId !== itemToRemove.productId));
    } catch (err: any) {
      setError('Error deleting WTB item: ' + err.message);
    }
  };

  const clearWtbItems = async () => {
    if (wtbItems.length === 0) return;

    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from('wtb_items')
        .delete()
        .not('id', 'is', null);

      if (deleteError) throw deleteError;
      setWtbItems([]);
    } catch (err: any) {
      setError('Error clearing WTB list: ' + err.message);
    }
  };

  const showWtbImage = async () => {
    if (wtbItems.length === 0) return;

    setGeneratingImage(true);
    setError(null);

    try {
      const dataUrl = await createWtbImage(wtbItems);
      setImageDataUrl(dataUrl);
    } catch (err: any) {
      setError('Error generating image: ' + err.message);
    } finally {
      setGeneratingImage(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([searchProducts(searchTerm), loadWtbItems()]);
    setRefreshing(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const wtbCopyText = useMemo(() => getWtbCopyText(wtbItems), [wtbItems]);

  const copyWtbText = async () => {
    if (wtbItems.length === 0) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(wtbCopyText);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = wtbCopyText;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      setCopiedWtbText(true);
      window.setTimeout(() => setCopiedWtbText(false), 1800);
    } catch (err: any) {
      setError('Error copying WTB text: ' + err.message);
    }
  };

  const selectedProductAlreadyAdded = useMemo(
    () => !!selectedProduct && wtbItems.some((item) => item.productId === selectedProduct.id),
    [selectedProduct, wtbItems]
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 sticky top-0 z-40 shadow-lg">
        <div className="mx-auto max-w-[1680px] px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-rose-500 to-red-500 rounded-2xl shadow-lg">
                <FaHeart className="text-white text-xl" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight">
                  WTB List
                </h1>
                <p className="text-xs sm:text-sm text-gray-400 hidden sm:block">Create image-ready want to buy lists</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing || loadingProducts || loadingWtbItems}
                className="inline-flex items-center px-3 py-2 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-all border border-white/20 text-sm disabled:opacity-50"
              >
                <FaSync className={`sm:mr-2 ${refreshing || loadingProducts || loadingWtbItems ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center px-3 py-2 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-all border border-white/20 text-sm"
              >
                <FaSignOutAlt className="sm:mr-2" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1680px] px-2 sm:px-4 lg:px-8 py-3 sm:py-6 lg:py-8">
        <AdminNavigation />

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <FaExclamationTriangle className="h-5 w-5 text-red-600" />
                <p className="ml-3 text-sm text-red-800">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800" aria-label="Close error">
                <FaTimes />
              </button>
            </div>
          </div>
        )}

        <section className="bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
          <div className="px-3 sm:px-4 lg:px-6 py-5 border-b border-gray-200 text-center">
            <h2 className="text-5xl sm:text-6xl font-black text-gray-950 tracking-normal">WTB</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-0">
            <div className="p-3 sm:p-5 lg:p-6 border-b lg:border-b-0 lg:border-r border-gray-200">
              <div className="relative mb-4">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm" />
                <input
                  type="text"
                  placeholder="Search products from DB..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {loadingProducts ? (
                  <div className="col-span-full py-12 text-center text-gray-600">Loading products...</div>
                ) : products.length === 0 ? (
                  <div className="col-span-full py-12 text-center">
                    <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <FaSearch className="text-gray-500 text-xl" />
                    </div>
                    <p className="text-sm font-semibold text-gray-900">
                      {searchTerm.trim().length < 2 ? 'Search for a product' : 'No products found'}
                    </p>
                  </div>
                ) : (
                  products.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => loadSizes(product)}
                      className={`flex items-center gap-3 text-left p-3 rounded-xl border transition-all ${
                        selectedProduct?.id === product.id
                          ? 'border-rose-400 bg-rose-50'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <span className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5">
                        <img
                          loading="lazy"
                          className="h-full w-full object-contain"
                          src={product.image_url || DEFAULT_IMAGE}
                          alt={product.name}
                          onError={(event) => {
                            event.currentTarget.src = DEFAULT_IMAGE;
                          }}
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-gray-900 break-words">{product.name}</span>
                        <span className="block text-xs text-gray-500 mt-1 font-mono">{product.sku || 'No SKU'}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <aside className="p-3 sm:p-5 lg:p-6 bg-gray-50">
              <div className="mb-5">
                <h3 className="text-base font-bold text-gray-900 mb-3">Selected product</h3>
                {!selectedProduct ? (
                  <div className="rounded-xl border border-dashed border-gray-300 bg-white p-5 text-sm text-gray-600 text-center">
                    Pick a product to choose sizes.
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5">
                        <img
                          className="h-full w-full object-contain"
                          src={selectedProduct.image_url || DEFAULT_IMAGE}
                          alt={selectedProduct.name}
                          onError={(event) => {
                            event.currentTarget.src = DEFAULT_IMAGE;
                          }}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 break-words">{selectedProduct.name}</p>
                        <p className="text-xs text-gray-500 font-mono mt-1">{selectedProduct.sku || 'No SKU'}</p>
                      </div>
                    </div>

                    <div className="mb-4">
                      <p className="text-xs font-semibold uppercase text-gray-500 mb-2">Sizes</p>
                      {loadingSizes ? (
                        <p className="text-sm text-gray-600">Loading sizes...</p>
                      ) : availableSizes.length === 0 ? (
                        <p className="text-sm text-gray-600">No sizes found. It will be added as any size.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {availableSizes.map((size) => {
                            const isSelected = selectedSizes.includes(size);
                            return (
                              <button
                                key={size}
                                onClick={() => toggleSize(size)}
                                className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                                  isSelected
                                    ? 'border-rose-500 bg-rose-600 text-white'
                                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                {size}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={addSelectedProduct}
                      disabled={savingWtbItem}
                      className="w-full inline-flex items-center justify-center px-4 py-3 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
                    >
                      <FaPlus className="mr-2" />
                      {savingWtbItem ? 'Saving...' : selectedProductAlreadyAdded ? 'Update WTB item' : 'Add to WTB'}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-bold text-gray-900">WTB items ({wtbItems.length})</h3>
                  {wtbItems.length > 0 && (
                    <button
                      onClick={clearWtbItems}
                      className="text-sm font-semibold text-gray-500 hover:text-red-600"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {loadingWtbItems ? (
                  <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600 text-center">
                    Loading WTB list...
                  </div>
                ) : wtbItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-300 bg-white p-5 text-sm text-gray-600 text-center">
                    Your WTB list is empty.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {wtbItems.map((item) => (
                      <div key={item.productId} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
                        <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white p-1">
                          <img
                            className="h-full w-full object-contain"
                            src={item.imageUrl || DEFAULT_IMAGE}
                            alt={item.name}
                            onError={(event) => {
                              event.currentTarget.src = DEFAULT_IMAGE;
                            }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 break-words">{item.name}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {item.sizes.length ? item.sizes.join(' / ') : 'Any size'}
                          </p>
                        </div>
                        <button
                          onClick={() => removeItem(item)}
                          className="h-10 w-10 flex-shrink-0 inline-flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:text-red-600 hover:bg-red-50"
                          aria-label={`Remove ${item.name}`}
                        >
                          <FaTrash />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {wtbItems.length > 0 && (
                  <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <h4 className="text-sm font-bold text-gray-900">Copy WTB</h4>
                      <button
                        onClick={copyWtbText}
                        className="inline-flex items-center justify-center px-3 py-2 rounded-xl bg-white border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        {copiedWtbText ? <FaCheck className="mr-2 text-green-600" /> : <FaCopy className="mr-2" />}
                        {copiedWtbText ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm leading-6 text-gray-900 font-sans">
                      {wtbCopyText}
                    </pre>
                  </div>
                )}

                <button
                  onClick={showWtbImage}
                  disabled={wtbItems.length === 0 || generatingImage}
                  className="mt-5 w-full inline-flex items-center justify-center px-4 py-3 bg-gray-950 hover:bg-gray-800 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
                >
                  <FaEye className="mr-2" />
                  {generatingImage ? 'Generating...' : 'Show as image'}
                </button>
              </div>
            </aside>
          </div>
        </section>
      </main>

      {imageDataUrl && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 px-3 sm:px-6">
          <div className="w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 p-3 sm:p-4">
              <h2 className="text-base sm:text-lg font-bold text-gray-900">WTB image</h2>
              <div className="flex items-center gap-2">
                <a
                  href={imageDataUrl}
                  download="wtb-list.png"
                  className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-gray-950 text-white hover:bg-gray-800"
                  aria-label="Download image"
                >
                  <FaDownload />
                </a>
                <button
                  onClick={() => setImageDataUrl(null)}
                  className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50"
                  aria-label="Close image"
                >
                  <FaTimes />
                </button>
              </div>
            </div>
            <div className="max-h-[78vh] overflow-auto bg-gray-100 p-3 sm:p-5">
              <img src={imageDataUrl} alt="Generated WTB list" className="w-full h-auto rounded-xl bg-white shadow-sm" />
              <div className="mt-4 rounded-xl bg-white border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="text-sm font-bold text-gray-900">Copy WTB</h3>
                  <button
                    onClick={copyWtbText}
                    className="inline-flex items-center justify-center px-3 py-2 rounded-xl bg-white border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    {copiedWtbText ? <FaCheck className="mr-2 text-green-600" /> : <FaCopy className="mr-2" />}
                    {copiedWtbText ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm leading-6 text-gray-900 font-sans">
                  {wtbCopyText}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
