import { useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getFees, calculatePayout } from '../lib/fees';
import { FaTimes, FaUpload, FaFileExcel, FaCheck, FaExclamationTriangle, FaDownload, FaSpinner } from 'react-icons/fa';
import * as XLSX from 'xlsx';

interface BulkProductImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userEmail: string;
  onImportComplete: () => void;
}

interface ParsedRow {
  sku: string;
  size: string;
  price: number;
  rowIndex: number;
}

interface MatchedProduct {
  row: ParsedRow;
  product: {
    id: string;
    name: string;
    image_url: string | null;
    sku: string;
  } | null;
  status: 'matched' | 'not_found' | 'error' | 'duplicate';
  error?: string;
}

interface ImportResult {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  details: { sku: string; size: string; price: number; status: string; message: string }[];
}

export default function BulkProductImportModal({ isOpen, onClose, userId, userEmail, onImportComplete }: BulkProductImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [matchedProducts, setMatchedProducts] = useState<MatchedProduct[]>([]);
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [matching, setMatching] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setFile(null);
    setParsedRows([]);
    setMatchedProducts([]);
    setStep('upload');
    setError(null);
    setImportResult(null);
    setMatching(false);
    setProgress(0);
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileSelect = async (selectedFile: File) => {
    setError(null);

    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv',
    ];
    const isValid = validTypes.includes(selectedFile.type) ||
      selectedFile.name.endsWith('.xlsx') ||
      selectedFile.name.endsWith('.xls') ||
      selectedFile.name.endsWith('.csv');

    if (!isValid) {
      setError('Please select an XLSX, XLS, or CSV file.');
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      setError('File is too large. Maximum size is 5MB.');
      return;
    }

    setFile(selectedFile);

    try {
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet, { defval: '' });

      if (jsonData.length === 0) {
        setError('File is empty. Please add data rows.');
        return;
      }

      const rows: ParsedRow[] = [];
      const errors: string[] = [];

      jsonData.forEach((row, index) => {
        const sku = String(row['sku'] || row['SKU'] || row['Sku'] || '').trim();
        const size = String(row['size'] || row['Size'] || row['SIZE'] || '').trim();
        const priceRaw = row['price'] || row['Price'] || row['PRICE'] || '';
        const price = typeof priceRaw === 'number' ? priceRaw : parseFloat(String(priceRaw).replace(',', '.'));

        if (!sku) {
          errors.push(`Row ${index + 2}: Missing SKU`);
          return;
        }
        if (!size) {
          errors.push(`Row ${index + 2}: Missing size`);
          return;
        }
        if (isNaN(price) || price <= 0) {
          errors.push(`Row ${index + 2}: Invalid price "${priceRaw}"`);
          return;
        }

        rows.push({ sku, size, price: Math.round(price), rowIndex: index + 2 });
      });

      if (rows.length === 0) {
        setError(`No valid rows found.\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n... and ${errors.length - 5} more errors` : ''}`);
        return;
      }

      setParsedRows(rows);

      if (errors.length > 0) {
        setError(`${errors.length} row(s) skipped due to errors. ${rows.length} valid row(s) found.`);
      }

      // Match products by SKU
      await matchProducts(rows);
    } catch (err: any) {
      console.error('Error parsing file:', err);
      setError('Error parsing file: ' + (err.message || 'Unknown error'));
    }
  };

  const matchProducts = async (rows: ParsedRow[]) => {
    setMatching(true);
    setStep('preview');

    try {
      // Get unique SKUs
      const uniqueSkus = [...new Set(rows.map(r => r.sku))];

      // Fetch all matching products from the products table
      const { data: products, error: fetchError } = await supabase
        .from('products')
        .select('id, name, image_url, sku')
        .in('sku', uniqueSkus);

      if (fetchError) throw fetchError;

      // Build a map of SKU -> product
      const skuMap = new Map<string, { id: string; name: string; image_url: string | null; sku: string }>();
      (products || []).forEach(p => {
        if (p.sku) {
          skuMap.set(p.sku.toLowerCase(), p);
        }
      });

      // Check existing user_products for duplicates
      const { data: existingProducts } = await supabase
        .from('user_products')
        .select('product_id, size')
        .eq('user_id', userId)
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());

      const existingSet = new Set(
        (existingProducts || []).map(ep => `${ep.product_id}|${ep.size}`)
      );

      // Match each row
      const matched: MatchedProduct[] = rows.map(row => {
        const product = skuMap.get(row.sku.toLowerCase());
        if (!product) {
          return { row, product: null, status: 'not_found' as const, error: 'Product not found for this SKU' };
        }

        // Check if this product+size combo already exists for this user
        const key = `${product.id}|${row.size}`;
        if (existingSet.has(key)) {
          return { row, product, status: 'duplicate' as const, error: 'User already has this product+size listed' };
        }

        return { row, product, status: 'matched' as const };
      });

      setMatchedProducts(matched);
    } catch (err: any) {
      console.error('Error matching products:', err);
      setError('Error matching products: ' + (err.message || 'Unknown error'));
    } finally {
      setMatching(false);
    }
  };

  const handleImport = async () => {
    const toImport = matchedProducts.filter(m => m.status === 'matched');
    if (toImport.length === 0) {
      setError('No valid products to import.');
      return;
    }

    setStep('importing');
    setProgress(0);
    setError(null);

    const result: ImportResult = {
      total: matchedProducts.length,
      success: 0,
      failed: 0,
      skipped: matchedProducts.filter(m => m.status !== 'matched').length,
      details: [],
    };

    // Add skipped items to details
    matchedProducts
      .filter(m => m.status !== 'matched')
      .forEach(m => {
        result.details.push({
          sku: m.row.sku,
          size: m.row.size,
          price: m.row.price,
          status: m.status === 'not_found' ? 'Not found' : 'Duplicate',
          message: m.error || '',
        });
      });

    try {
      // Get fees for payout calculation
      const fees = await getFees();
      const expirationDays = fees.offer_expiration_days || 30;

      // Insert products in batches of 10
      const batchSize = 10;
      for (let i = 0; i < toImport.length; i += batchSize) {
        const batch = toImport.slice(i, i + batchSize);

        const insertData = batch.map(m => {
          const payout = calculatePayout(m.row.price, fees.fee_percent, fees.fee_fixed);
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + expirationDays);

          return {
            id: crypto.randomUUID(),
            user_id: userId,
            product_id: m.product!.id,
            name: m.product!.name,
            size: m.row.size,
            price: m.row.price,
            image_url: m.product!.image_url,
            payout,
            sku: m.product!.sku,
            expires_at: expiresAt.toISOString(),
          };
        });

        const { error: insertError } = await supabase
          .from('user_products')
          .insert(insertData);

        if (insertError) {
          batch.forEach(m => {
            result.failed++;
            result.details.push({
              sku: m.row.sku,
              size: m.row.size,
              price: m.row.price,
              status: 'Failed',
              message: insertError.message,
            });
          });
        } else {
          batch.forEach(m => {
            result.success++;
            result.details.push({
              sku: m.row.sku,
              size: m.row.size,
              price: m.row.price,
              status: 'Success',
              message: `Added as ${m.product!.name}`,
            });
          });
        }

        setProgress(Math.min(100, Math.round(((i + batch.length) / toImport.length) * 100)));
      }
    } catch (err: any) {
      console.error('Import error:', err);
      setError('Import error: ' + (err.message || 'Unknown error'));
    }

    setImportResult(result);
    setStep('done');
    if (result.success > 0) {
      onImportComplete();
    }
  };

  const downloadTemplate = () => {
    const wsData = [
      ['sku', 'size', 'price'],
      ['FZ5246-001', '42', '150'],
      ['CW2288-111', 'M', '89'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    XLSX.writeFile(wb, 'bulk_import_template.xlsx');
  };

  const matchedCount = matchedProducts.filter(m => m.status === 'matched').length;
  const notFoundCount = matchedProducts.filter(m => m.status === 'not_found').length;
  const duplicateCount = matchedProducts.filter(m => m.status === 'duplicate').length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-[80] overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Bulk Product Import</h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">For user: {userEmail}</p>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <FaTimes className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-6">
              <div className="bg-blue-50 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">File format</h3>
                <p className="text-xs text-blue-800">
                  Upload an XLSX or CSV file with columns: <strong>sku</strong>, <strong>size</strong>, <strong>price</strong>.
                  Products are matched by SKU from the product catalog.
                </p>
                <button
                  onClick={downloadTemplate}
                  className="mt-3 inline-flex items-center px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <FaDownload className="mr-1.5" />
                  Download template
                </button>
              </div>

              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-gray-400 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const droppedFile = e.dataTransfer.files[0];
                  if (droppedFile) handleFileSelect(droppedFile);
                }}
              >
                <FaFileExcel className="text-4xl text-gray-400 mx-auto mb-4" />
                <p className="text-sm font-medium text-gray-700">
                  {file ? file.name : 'Click to select or drag & drop file'}
                </p>
                <p className="text-xs text-gray-500 mt-1">XLSX, XLS, or CSV (max 5MB)</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              {matching ? (
                <div className="text-center py-8">
                  <FaSpinner className="animate-spin text-2xl text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-600">Matching products by SKU...</p>
                </div>
              ) : (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-green-700">{matchedCount}</p>
                      <p className="text-xs text-green-600 font-medium">Matched</p>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-red-700">{notFoundCount}</p>
                      <p className="text-xs text-red-600 font-medium">Not found</p>
                    </div>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-yellow-700">{duplicateCount}</p>
                      <p className="text-xs text-yellow-600 font-medium">Duplicates</p>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="max-h-[300px] overflow-y-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Row</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">SKU</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Size</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Price</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Product</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {matchedProducts.map((m, idx) => (
                            <tr key={idx} className={
                              m.status === 'matched' ? 'bg-white' :
                              m.status === 'not_found' ? 'bg-red-50' :
                              'bg-yellow-50'
                            }>
                              <td className="px-3 py-2 text-xs text-gray-500">{m.row.rowIndex}</td>
                              <td className="px-3 py-2 text-xs font-mono text-gray-900">{m.row.sku}</td>
                              <td className="px-3 py-2 text-xs text-gray-700">{m.row.size}</td>
                              <td className="px-3 py-2 text-xs font-semibold text-gray-900">{m.row.price} €</td>
                              <td className="px-3 py-2 text-xs text-gray-700 max-w-[150px] truncate">
                                {m.product?.name || '-'}
                              </td>
                              <td className="px-3 py-2">
                                {m.status === 'matched' && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-800">
                                    <FaCheck className="mr-1" /> Ready
                                  </span>
                                )}
                                {m.status === 'not_found' && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-800">
                                    <FaExclamationTriangle className="mr-1" /> Not found
                                  </span>
                                )}
                                {m.status === 'duplicate' && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-100 text-yellow-800">
                                    Duplicate
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: Importing */}
          {step === 'importing' && (
            <div className="text-center py-8 space-y-4">
              <FaSpinner className="animate-spin text-3xl text-gray-600 mx-auto" />
              <p className="text-sm font-medium text-gray-700">Importing products...</p>
              <div className="w-full bg-gray-200 rounded-full h-2 max-w-md mx-auto">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500">{progress}%</p>
            </div>
          )}

          {/* Step 4: Done */}
          {step === 'done' && importResult && (
            <div className="space-y-4">
              <div className={`rounded-xl p-4 ${importResult.success > 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <div className="flex items-center mb-2">
                  {importResult.success > 0 ? (
                    <FaCheck className="text-green-600 mr-2" />
                  ) : (
                    <FaExclamationTriangle className="text-red-600 mr-2" />
                  )}
                  <h3 className={`text-sm font-bold ${importResult.success > 0 ? 'text-green-900' : 'text-red-900'}`}>
                    Import complete
                  </h3>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div className="text-center">
                    <p className="text-xl font-bold text-green-700">{importResult.success}</p>
                    <p className="text-xs text-green-600">Imported</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-red-700">{importResult.failed}</p>
                    <p className="text-xs text-red-600">Failed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-yellow-700">{importResult.skipped}</p>
                    <p className="text-xs text-yellow-600">Skipped</p>
                  </div>
                </div>
              </div>

              {/* Details Table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="max-h-[250px] overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">SKU</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Size</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Price</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {importResult.details.map((d, idx) => (
                        <tr key={idx} className={
                          d.status === 'Success' ? 'bg-white' :
                          d.status === 'Failed' ? 'bg-red-50' :
                          'bg-yellow-50'
                        }>
                          <td className="px-3 py-2 text-xs font-mono text-gray-900">{d.sku}</td>
                          <td className="px-3 py-2 text-xs text-gray-700">{d.size}</td>
                          <td className="px-3 py-2 text-xs font-semibold text-gray-900">{d.price} €</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              d.status === 'Success' ? 'bg-green-100 text-green-800' :
                              d.status === 'Failed' ? 'bg-red-100 text-red-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {d.status}
                            </span>
                            {d.message && (
                              <p className="text-[10px] text-gray-500 mt-0.5 truncate max-w-[200px]">{d.message}</p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3">
              <div className="flex items-start">
                <FaExclamationTriangle className="text-red-400 mt-0.5 mr-2 flex-shrink-0" />
                <p className="text-xs text-red-800 whitespace-pre-line">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 sm:p-6 flex justify-between items-center flex-shrink-0">
          {step === 'upload' && (
            <div className="w-full flex justify-end">
              <button onClick={handleClose} className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-xl">
                Cancel
              </button>
            </div>
          )}

          {step === 'preview' && !matching && (
            <>
              <button
                onClick={resetState}
                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-xl"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={matchedCount === 0}
                className="px-4 py-2 text-sm font-semibold text-white bg-black hover:bg-gray-800 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
              >
                <FaUpload className="mr-2" />
                Import {matchedCount} product{matchedCount !== 1 ? 's' : ''}
              </button>
            </>
          )}

          {step === 'done' && (
            <div className="w-full flex justify-between">
              <button
                onClick={resetState}
                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-xl"
              >
                Import more
              </button>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-semibold text-white bg-black hover:bg-gray-800 rounded-xl"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
