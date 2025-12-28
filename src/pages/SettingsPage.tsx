import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import AdminNavigation from '../components/AdminNavigation';
import {
  FaSignOutAlt,
  FaSync,
  FaSave,
  FaPercent,
  FaEuroSign,
  FaExclamationTriangle,
  FaSignature,
  FaUpload,
  FaTrash,
  FaCog
} from 'react-icons/fa';

interface AdminSettings {
  id: string;
  fee_percent: number;
  fee_fixed: number;
  offer_expiration_days?: number;
  buyer_signature_url?: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [feePercent, setFeePercent] = useState<string>('');
  const [feeFixed, setFeeFixed] = useState<string>('');
  const [offerExpirationDays, setOfferExpirationDays] = useState<number>(30);
  const [refreshing, setRefreshing] = useState(false);
  const [buyerSignatureUrl, setBuyerSignatureUrl] = useState<string | null>(null);
  const [uploadingSignature, setUploadingSignature] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      setError(null);
      if (!refreshing) setLoading(true);

      const { data, error } = await supabase
        .from('admin_settings')
        .select('id, fee_percent, fee_fixed, offer_expiration_days, buyer_signature_url')
        .single();

      if (error) throw error;

      setSettings(data);
      setFeePercent((data.fee_percent * 100).toString());
      setFeeFixed(data.fee_fixed.toString());
      setOfferExpirationDays(data.offer_expiration_days || 30);
      setBuyerSignatureUrl(data.buyer_signature_url || null);
    } catch (err: any) {
      console.error('Error loading settings:', err.message);
      setError('Chyba pri načítavaní nastavení: ' + err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshing]);

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const feePercentValue = parseFloat(feePercent) / 100;
      const feeFixedValue = parseFloat(feeFixed);

      if (isNaN(feePercentValue) || isNaN(feeFixedValue)) {
        throw new Error('Neplatné hodnoty poplatkov');
      }

      if (feePercentValue < 0 || feePercentValue > 1) {
        throw new Error('Percentuálny poplatok musí byť medzi 0% a 100%');
      }

      if (feeFixedValue < 0) {
        throw new Error('Fixný poplatok nemôže byť záporný');
      }

      if (![7, 14, 30].includes(offerExpirationDays)) {
        throw new Error('Doba expirácie ponuky musí byť 7, 14 alebo 30 dní');
      }

      const { error } = await supabase
        .from('admin_settings')
        .update({
          fee_percent: feePercentValue,
          fee_fixed: feeFixedValue,
          offer_expiration_days: offerExpirationDays,
          buyer_signature_url: buyerSignatureUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', settings?.id);

      if (error) throw error;

      setSuccess('Nastavenia boli úspešne uložené!');
      loadSettings();
    } catch (err: any) {
      console.error('Error saving settings:', err.message);
      setError('Chyba pri ukladaní nastavení: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSettings();
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (err: any) {
      console.error('Error signing out:', err.message);
    }
  };

  const handleRetry = () => {
    setError(null);
    loadSettings();
  };

  useEffect(() => {
    loadSettings();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-gray-500 rounded-full animate-spin mx-auto mb-4"></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Načítavajú sa nastavenia</h3>
          <p className="text-sm text-gray-600">Prosím čakajte...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="relative">
                <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-gray-600 via-slate-600 to-gray-800 rounded-2xl shadow-lg">
                  <FaCog className="text-gray-900 text-xl" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-800 animate-pulse"></div>
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900">
                  Nastavenia
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">Správa systémových nastavení</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-1 sm:space-x-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center px-2 py-2 sm:px-4 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all duration-200 disabled:opacity-50"
              >
                <FaSync className={`text-sm sm:mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{refreshing ? 'Obnovuje sa...' : 'Obnoviť'}</span>
              </button>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center px-2 py-2 sm:px-4 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all duration-200 shadow-lg transform hover:scale-105"
              >
                <FaSignOutAlt className="text-sm sm:mr-2" />
                <span className="hidden sm:inline">Odhlásiť</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-3 sm:py-6 lg:py-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <FaExclamationTriangle className="h-5 w-5 text-red-600" />
                <p className="ml-3 text-sm text-red-800">{error}</p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={handleRetry}
                  className="text-red-800 hover:text-red-100 text-sm font-medium"
                >
                  Skúsiť znova
                </button>
                <button
                  onClick={() => setError(null)}
                  className="text-red-600 hover:text-red-800"
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <svg className="h-5 w-5 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <p className="ml-3 text-sm text-green-800">{success}</p>
              </div>
              <button
                onClick={() => setSuccess(null)}
                className="text-green-600 hover:text-green-800"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <AdminNavigation />

        {/* Settings Form */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
          <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-200 bg-white">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900">Systémové nastavenia</h3>
            <p className="text-gray-600 text-xs sm:text-sm mt-1">Konfigurácia poplatkov a systémových parametrov</p>
          </div>

          <div className="p-3 sm:p-4 lg:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-3">
                  <FaPercent className="inline mr-2" />
                  Percentuálny poplatok (%)
                </label>
                <input
                  type="number"
                  value={feePercent}
                  onChange={(e) => setFeePercent(e.target.value)}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-gray-500/50 focus:border-transparent transition-all duration-200 text-base"
                  step="0.1"
                  min="0"
                  max="100"
                  placeholder="20"
                />
                <p className="text-xs text-gray-600 mt-2">Percentuálny poplatok z predajnej ceny</p>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-3">
                  <FaEuroSign className="inline mr-2" />
                  Fixný poplatok (€)
                </label>
                <input
                  type="number"
                  value={feeFixed}
                  onChange={(e) => setFeeFixed(e.target.value)}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-gray-500/50 focus:border-transparent transition-all duration-200 text-base"
                  step="0.01"
                  min="0"
                  placeholder="5.00"
                />
                <p className="text-xs text-gray-600 mt-2">Fixný poplatok za každý predaj</p>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-3">
                  <FaExclamationTriangle className="inline mr-2" />
                  Doba expirácie ponuky (dni)
                </label>
                <select
                  value={offerExpirationDays}
                  onChange={(e) => setOfferExpirationDays(parseInt(e.target.value))}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500/50 focus:border-transparent transition-all duration-200 text-base"
                >
                  <option value={7}>7 dní</option>
                  <option value={14}>14 dní</option>
                  <option value={30}>30 dní</option>
                </select>
                <p className="text-xs text-gray-600 mt-2">Po tomto počte dní sa ponuka automaticky vymaže</p>
              </div>
            </div>

            {/* Buyer Signature Upload */}
            <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-200">
              <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-3">
                <FaSignature className="inline mr-2" />
                Podpis kupujúceho (Buyer Signature)
              </label>
              {buyerSignatureUrl ? (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200 gap-3">
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <img src={buyerSignatureUrl} alt="Buyer Signature" className="h-14 sm:h-16 w-auto object-contain flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">Podpis je nahraný</p>
                        <p className="text-xs text-gray-500">Tento podpis sa použije vo všetkých PDF zmluvách</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setBuyerSignatureUrl(null);
                      }}
                      className="p-2 sm:p-2.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                    >
                      <FaTrash className="text-sm" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="flex flex-col items-center justify-center w-full h-20 sm:h-24 border-2 border-gray-300 border-dashed rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                    <div className="flex flex-col items-center justify-center pt-2 sm:pt-3 pb-3 sm:pb-4">
                      <FaUpload className="text-gray-400 text-lg sm:text-xl mb-1.5 sm:mb-2" />
                      <p className="text-xs text-gray-600 font-medium text-center px-2">Kliknite pre nahranie obrázka podpisu</p>
                      <p className="text-xs text-gray-500 mt-1">PNG, JPG (max 2MB)</p>
                    </div>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        
                        if (file.size > 2 * 1024 * 1024) {
                          setError('Súbor je príliš veľký. Maximálna veľkosť je 2MB');
                          return;
                        }
                        
                        try {
                          setUploadingSignature(true);
                          setError(null);
                          
                          // Convert to base64
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            const base64 = reader.result as string;
                            setBuyerSignatureUrl(base64);
                            setUploadingSignature(false);
                          };
                          reader.onerror = () => {
                            setError('Chyba pri načítavaní súboru');
                            setUploadingSignature(false);
                          };
                          reader.readAsDataURL(file);
                        } catch (err: any) {
                          console.error('Error uploading buyer signature', err);
                          setError('Chyba pri nahrávaní podpisu: ' + (err.message || 'Neznáma chyba'));
                          setUploadingSignature(false);
                        }
                        
                        e.target.value = '';
                      }}
                      disabled={uploadingSignature}
                      className="hidden"
                      id="buyer-signature-upload"
                    />
                  </label>
                  {uploadingSignature && (
                    <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Nahráva sa...</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Preview */}
            {feePercent && feeFixed && (
              <div className="mt-6 bg-gray-50 rounded-xl p-4 border border-gray-200">
                <h4 className="text-xs sm:text-sm font-semibold text-gray-700 mb-3">Náhľad výpočtu</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-sm">
                  {[100, 200, 500].map(price => {
                    const feePercentValue = parseFloat(feePercent) / 100;
                    const feeFixedValue = parseFloat(feeFixed);
                    const payout = price * (1 - feePercentValue) - feeFixedValue;
                    return (
                      <div key={price} className="bg-white rounded-lg p-2 sm:p-3">
                        <div className="text-xs sm:text-sm text-gray-600">Predajná cena: <span className="text-gray-900 font-semibold">{price} €</span></div>
                        <div className="text-xs sm:text-sm text-gray-600">Payout: <span className="text-green-600 font-semibold">{Math.max(0, payout).toFixed(2)} €</span></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSaveSettings}
                disabled={saving || !feePercent || !feeFixed}
                className="inline-flex items-center px-4 sm:px-6 py-2 sm:py-3 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transform hover:scale-105 text-sm sm:text-base"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Ukladá sa...
                  </>
                ) : (
                  <>
                    <FaSave className="mr-2" />
                    <span className="hidden sm:inline">Uložiť nastavenia</span>
                    <span className="sm:hidden">Uložiť</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}