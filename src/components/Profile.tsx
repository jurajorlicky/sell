import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, Link } from 'react-router-dom';
import { FaArrowLeft, FaChartLine, FaEdit, FaTrash, FaSignOutAlt, FaUser, FaEnvelope, FaPhone, FaMapMarkerAlt, FaBuilding, FaCreditCard, FaSignature, FaUpload, FaTimes } from 'react-icons/fa';
import type { User } from '@supabase/supabase-js';

interface IProfile {
  first_name: string;
  last_name: string;
  profile_type: 'Personal' | 'Business';
  vat_type: string;
  company_name?: string;
  ico?: string;
  vat_number?: string;
  address: string;
  popisne_cislo: string;
  psc: string;
  mesto: string;
  krajina: string;
  email: string;
  telephone: string;
  iban: string;
  discord: string;
}

export default function Profile() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');

  const [profile, setProfile] = useState<IProfile>({
    first_name: '',
    last_name: '',
    profile_type: 'Personal',
    vat_type: '',
    company_name: '',
    ico: '',
    vat_number: '',
    address: '',
    popisne_cislo: '',
    psc: '',
    mesto: '',
    krajina: 'Slovensko',
    email: '',
    telephone: '',
    iban: '',
    discord: ''

  });

  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const getProfile = async () => {
      try {
        setLoading(true);
        setError(null);

        // Timeout pre profile loading
        timeoutId = setTimeout(() => {
          if (isMounted) {
            setError('Loading profile is taking too long. Please refresh the page.');
            setLoading(false);
          }
        }, 8000);

        const userPromise = supabase.auth.getUser();
        const userTimeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('User fetch timeout')), 3000)
        );

        const { data: { user }, error: authError } = await Promise.race([
          userPromise,
          userTimeoutPromise
        ]) as any;
        
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (authError) {
          throw new Error('Authentication error: ' + authError.message);
        }

        if (!user) {
          navigate('/');
          return;
        }

        if (!isMounted) return;

        setUser(user);
        setEmail(user.email || '');

        // Rýchle načítanie profilu s timeout
        const profilePromise = supabase
          .from('profiles')
          .select('*, signature_url')
          .eq('id', user.id)
          .single();

        const profileTimeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
        );

        try {
          const { data: profileData, error: profileError } = await Promise.race([
            profilePromise,
            profileTimeoutPromise
          ]) as any;

          if (profileData && isMounted) {
            setProfile({
              first_name: profileData.first_name || '',
              last_name: profileData.last_name || '',
              profile_type: profileData.profile_type || 'Personal',
              vat_type: profileData.vat_type || '',
              company_name: profileData.company_name || '',
              ico: profileData.ico || '',
              vat_number: profileData.vat_number || '',
              address: profileData.address || '',
              popisne_cislo: profileData.popisne_cislo || '',
              psc: profileData.psc || '',
              mesto: profileData.mesto || '',
              krajina: profileData.krajina || 'Slovakia',
              email: profileData.email || user.email,
              telephone: profileData.telephone || '',
              iban: profileData.iban || '',
              discord: profileData.discord || ''

            });
            // Load signature URL and refresh if needed (for signed URLs)
            const sigUrl = profileData.signature_url || null;
            setSignatureUrl(sigUrl);
            
            // If signature URL exists and might be expired, refresh it
            if (sigUrl && sigUrl.includes('signatures')) {
              // Extract file path from URL
              const urlParts = sigUrl.split('/');
              const filePath = urlParts.slice(-2).join('/');
              
              // Try to get fresh signed URL if it's a signed URL
              if (sigUrl.includes('token=')) {
                supabase.storage
                  .from('signatures')
                  .createSignedUrl(filePath, 31536000)
                  .then(({ data, error }) => {
                    if (!error && data?.signedUrl) {
                      setSignatureUrl(data.signedUrl);
                    }
                  })
                  .catch(err => console.warn('Error refreshing signature URL:', err));
              }
            }
          } else if (isMounted) {
            setProfile((prev) => ({ ...prev, email: user.email || '' }));
            setSignatureUrl(null);
          }

          if (profileError && profileError.code !== 'PGRST116') {
            console.warn('Profile error:', profileError.message);
          }
        } catch (profileErr: any) {
          console.warn('Profile loading failed:', profileErr.message);
          if (isMounted) {
            setProfile((prev) => ({ ...prev, email: user.email || '' }));
          }
        }

      } catch (error: any) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        console.error('Error loading user data:', error.message);
        if (isMounted) {
          setError('Nepodarilo sa načítať profil. Skúste znova.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    getProfile();

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [navigate]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/');
    } catch (error: any) {
      console.error('Error signing out:', error.message);
      setError('Error signing out.');
    }
  };

  const handleOpenModal = () => {
    setShowModal(true);
    setError(null);
    setSuccessMessage(null);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const handleSubmitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (profile.profile_type === 'Business' && !profile.company_name) {
      setError('When selecting Business, company name is required.');
      return;
    }
    if (profile.profile_type === 'Business') {
      if (profile.vat_type === 'MARGIN' && !profile.ico) {
        setError('When selecting MARGIN, company registration number (IČO) is required.');
        return;
      }
      if (profile.vat_type === 'VAT 0%' && (!profile.ico || !profile.vat_number)) {
        setError('When selecting VAT 0%, company registration number (IČO) and VAT number are required.');
        return;
      }
    }

    try {
      if (!user) {
        setError('Používateľ nie je prihlásený.');
        return;
      }

      const updates = {
        id: user.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        profile_type: profile.profile_type,
        vat_type: profile.vat_type,
        company_name: profile.profile_type === 'Business' ? profile.company_name : null,
        ico: profile.profile_type === 'Business' ? profile.ico : null,
        vat_number: profile.vat_type === 'VAT 0%' ? profile.vat_number : null,
        address: profile.address,
        popisne_cislo: profile.popisne_cislo,
        psc: profile.psc,
        mesto: profile.mesto,
        krajina: profile.krajina,
        email: profile.email,
        telephone: profile.telephone,
        iban: profile.iban,
        discord: profile.discord,
        signature_url: signatureUrl

      };

      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert(updates, { onConflict: 'id' });

      if (upsertError) {
        throw new Error('Error saving profile: ' + upsertError.message);
      }

      setSuccessMessage('Profile has been saved successfully!');
      setShowModal(false);
    } catch (err: any) {
      setError('Unexpected error saving profile: ' + err.message);
      console.error(err);
    }
  };

  // Initialize canvas when modal opens
  useEffect(() => {
    if (showSignatureModal && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        // Clear canvas when modal opens
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [showSignatureModal]);

  const handleSignatureStart = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    isDrawingRef.current = true;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handleSignatureMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handleSignatureEnd = () => {
    isDrawingRef.current = false;
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.beginPath();
    }
  };

  const clearSignature = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const saveSignature = async () => {
    if (!canvasRef.current || !user) {
      setError('Canvas or user is not available');
      return;
    }

    try {
      setUploadingSignature(true);
      setError(null);

      // Delete old signature if exists
      if (signatureUrl) {
        try {
          const urlParts = signatureUrl.split('/');
          const oldFilePath = urlParts.slice(-2).join('/');
          await supabase.storage
            .from('signatures')
            .remove([oldFilePath]);
        } catch (deleteErr) {
          console.warn('Error deleting old signature:', deleteErr);
          // Continue anyway
        }
      }

      // Convert canvas to blob
      canvasRef.current.toBlob(async (blob) => {
        if (!blob) {
          setError('Error creating signature image');
          setUploadingSignature(false);
          return;
        }

        const fileExt = 'png';
        const fileName = `${user.id}-${Date.now()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('signatures')
          .upload(filePath, blob, {
            cacheControl: '3600',
            upsert: true
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw new Error('Error uploading signature: ' + uploadError.message);
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('signatures')
          .getPublicUrl(filePath);

        console.log('URL data:', urlData);
        console.log('File path:', filePath);

        if (!urlData?.publicUrl) {
          throw new Error('Failed to get signature URL');
        }

        const newSignatureUrl = urlData.publicUrl;
        console.log('New signature URL:', newSignatureUrl);
        
        // Save to profile using upsert to ensure it's saved
        const { data: updateData, error: updateError } = await supabase
          .from('profiles')
          .upsert({ 
            id: user.id,
            signature_url: newSignatureUrl
          }, { 
            onConflict: 'id' 
          });

        if (updateError) {
          console.error('Update error:', updateError);
          throw new Error('Error saving signature to profile: ' + updateError.message);
        }

        // Update state
        setSignatureUrl(newSignatureUrl);
        setShowSignatureModal(false);
        setSuccessMessage('Signature has been saved successfully!');
        setUploadingSignature(false);
      }, 'image/png', 0.95);
    } catch (err: any) {
      console.error('Error saving signature:', err);
      setError('Error saving signature: ' + (err.message || 'Unknown error'));
      setUploadingSignature(false);
    }
  };

  const deleteSignature = async () => {
    if (!signatureUrl || !user) return;

    try {
      // Extract file path from URL
      const urlParts = signatureUrl.split('/');
      const filePath = urlParts.slice(-2).join('/');

      // Delete from storage
      const { error: deleteError } = await supabase.storage
        .from('signatures')
        .remove([filePath]);

      if (deleteError) {
        console.warn('Error deleting signature file:', deleteError);
      }

      // Remove from profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ signature_url: null })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setSignatureUrl(null);
      setSuccessMessage('Signature has been removed');
    } catch (err: any) {
      setError('Error deleting signature: ' + err.message);
    }
  };

  const handleDeleteProfile = async () => {
    const confirmDelete = window.confirm(
      'Do you really want to delete your profile? This action is irreversible.'
    );
    if (!confirmDelete) return;

    try {
      if (!user) {
        setError('Používateľ nie je prihlásený.');
        return;
      }

      const { error: deleteError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', user.id);

      if (deleteError) {
        throw new Error('Error deleting profile: ' + deleteError.message);
      }

      setProfile({
        first_name: '',
        last_name: '',
        profile_type: 'Personal',
        vat_type: '',
        company_name: '',
        ico: '',
        vat_number: '',
        address: '',
        popisne_cislo: '',
        psc: '',
        mesto: '',
        krajina: 'Slovakia',
        email: user.email || '',
        telephone: '',
        iban: '',
        discord: '',
      });

      setSuccessMessage('Profile has been deleted successfully.');
    } catch (error: any) {
      setError('Unexpected error deleting profile: ' + error.message);
      console.error(error);
    }
  };

  // Enhanced loading
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse-slow"></div>
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse-slow" style={{ animationDelay: '1s' }}></div>
        </div>
        <div className="text-center relative z-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-xl mb-6">
            <svg className="animate-spin h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <p className="text-xl font-semibold text-slate-700 mb-2">Loading profile...</p>
          {error && (
            <div className="mt-6 p-4 bg-red-50 border-2 border-red-200 rounded-xl max-w-md mx-auto animate-scale-in">
              <p className="text-red-800 text-sm mb-3">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl hover:from-red-700 hover:to-red-800 transition-all duration-200 shadow-lg transform hover:scale-105"
              >
                Refresh Page
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200/50 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-slate-900 to-slate-700 rounded-xl">
                <FaUser className="text-white text-lg" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-slate-900">My Profile</h1>
                <p className="text-xs sm:text-sm text-slate-600 hidden sm:block">Personal and billing information</p>
              </div>
            </div>

            <div className="flex items-center space-x-1 sm:space-x-3">
              <Link
                to="/dashboard"
                className="inline-flex items-center px-3 py-2 sm:px-4 bg-white text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all duration-200 border border-slate-200 shadow-sm"
              >
                <FaArrowLeft className="text-sm sm:mr-2" />
                <span className="hidden sm:inline">Back to Dashboard</span>
              </Link>

              <Link
                to="/sales"
                className="inline-flex items-center px-3 py-2 sm:px-4 bg-white text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all duration-200 border border-slate-200 shadow-sm"
              >
                <FaChartLine className="text-sm sm:mr-2" />
                <span className="hidden sm:inline">Sales</span>
              </Link>

              <button
                onClick={handleSignOut}
                className="inline-flex items-center px-3 py-2 sm:px-4 bg-red-50 text-red-600 font-semibold rounded-xl hover:bg-red-100 transition-all duration-200 border border-red-200"
              >
                <FaSignOutAlt className="text-sm sm:mr-2" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>


      <div className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Success/Error Messages */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-600"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-green-800">{successMessage}</p>
                </div>
              </div>
              <button
                onClick={() => setSuccessMessage(null)}
                className="text-green-400 hover:text-green-600"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Enhanced Account Information */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/50 shadow-xl mb-8 animate-fade-in hover:shadow-2xl transition-shadow duration-300">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200/50 bg-gradient-to-r from-blue-50/50 to-white">
            <div className="flex items-center">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mr-3 shadow-lg">
                <FaUser className="text-white text-lg" />
              </div>
              <h3 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent">Account</h3>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-center">
                <FaEnvelope className="text-slate-400 mr-2 sm:mr-3 flex-shrink-0" />
                <div>
                  <p className="text-xs sm:text-sm font-medium text-slate-600">Email</p>
                  <p className="text-sm sm:text-base text-slate-900 font-semibold break-all">{email}</p>
                </div>
              </div>
              
              <div className="flex items-center">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 mr-2 sm:mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                <div>
                  <p className="text-xs sm:text-sm font-medium text-slate-600">Discord</p>
                  <p className="text-sm sm:text-base text-slate-900 font-semibold">{profile.discord || '—'}</p>
                </div>
              </div>
              
              <div className="flex items-center">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 mr-2 sm:mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3a4 4 0 118 0v4m-4 6v6m-4-6h8m-8 0V9a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
                <div>
                  <p className="text-xs sm:text-sm font-medium text-slate-600">Account created</p>
                  <p className="text-sm sm:text-base text-slate-900 font-semibold">{user?.created_at ? new Date(user.created_at).toLocaleDateString('sk-SK') : 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Personal Information */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/50 shadow-xl animate-fade-in hover:shadow-2xl transition-shadow duration-300">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200/50 bg-gradient-to-r from-green-50/50 to-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center mr-3 shadow-lg">
                  <FaUser className="text-white text-lg" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">Personal Information</h3>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={handleOpenModal}
                  className="inline-flex items-center px-3 sm:px-4 py-2 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all duration-200 transform hover:scale-105 shadow-lg"
                >
                  <FaEdit className="text-sm sm:mr-2" />
                  <span className="hidden sm:inline">Edit</span>
                </button>
                <button
                  onClick={handleDeleteProfile}
                  className="inline-flex items-center px-3 sm:px-4 py-2 bg-red-50 text-red-600 font-semibold rounded-xl hover:bg-red-100 transition-all duration-200 border border-red-200 hover:border-red-300"
                >
                  <FaTrash className="text-sm sm:mr-2" />
                  <span className="hidden sm:inline">Delete</span>
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div className="flex items-center">
                <FaUser className="text-slate-400 mr-2 sm:mr-3 flex-shrink-0" />
                <div>
                  <p className="text-xs sm:text-sm font-medium text-slate-600">First Name</p>
                  <p className="text-sm sm:text-base text-slate-900 font-semibold">{profile.first_name || '—'}</p>
                </div>
              </div>
              
              <div className="flex items-center">
                <FaUser className="text-slate-400 mr-2 sm:mr-3 flex-shrink-0" />
                <div>
                  <p className="text-xs sm:text-sm font-medium text-slate-600">Last Name</p>
                  <p className="text-sm sm:text-base text-slate-900 font-semibold">{profile.last_name || '—'}</p>
                </div>
              </div>

              <div className="flex items-center">
                <FaBuilding className="text-slate-400 mr-2 sm:mr-3 flex-shrink-0" />
                <div>
                  <p className="text-xs sm:text-sm font-medium text-slate-600">Profile Type</p>
                  <p className="text-sm sm:text-base text-slate-900 font-semibold">{profile.profile_type || '—'}</p>
                </div>
              </div>

              {profile.profile_type === 'Business' && (
                <>
                  <div className="flex items-center">
                    <FaBuilding className="text-slate-400 mr-2 sm:mr-3 flex-shrink-0" />
                    <div>
                      <p className="text-xs sm:text-sm font-medium text-slate-600">Company Name</p>
                      <p className="text-sm sm:text-base text-slate-900 font-semibold">{profile.company_name || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <FaBuilding className="text-slate-400 mr-2 sm:mr-3 flex-shrink-0" />
                    <div>
                      <p className="text-xs sm:text-sm font-medium text-slate-600">VAT Type</p>
                      <p className="text-sm sm:text-base text-slate-900 font-semibold">{profile.vat_type || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <FaBuilding className="text-slate-400 mr-2 sm:mr-3 flex-shrink-0" />
                    <div>
                      <p className="text-xs sm:text-sm font-medium text-slate-600">IČO</p>
                      <p className="text-sm sm:text-base text-slate-900 font-semibold">{profile.ico || '—'}</p>
                    </div>
                  </div>
                  {profile.vat_type === 'VAT 0%' && (
                    <div className="flex items-center">
                      <FaBuilding className="text-slate-400 mr-2 sm:mr-3 flex-shrink-0" />
                      <div>
                        <p className="text-xs sm:text-sm font-medium text-slate-600">VAT Number</p>
                        <p className="text-sm sm:text-base text-slate-900 font-semibold">{profile.vat_number || '—'}</p>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center">
                <FaPhone className="text-slate-400 mr-2 sm:mr-3 flex-shrink-0" />
                <div>
                  <p className="text-xs sm:text-sm font-medium text-slate-600">Phone</p>
                  <p className="text-sm sm:text-base text-slate-900 font-semibold">{profile.telephone || '—'}</p>
                </div>
              </div>

              <div className="flex items-center">
                <FaMapMarkerAlt className="text-slate-400 mr-2 sm:mr-3 flex-shrink-0" />
                <div>
                  <p className="text-xs sm:text-sm font-medium text-slate-600">Address</p>
                  <p className="text-sm sm:text-base text-slate-900 font-semibold">
                    {profile.address || profile.popisne_cislo ? 
                      `${profile.address || ''} ${profile.popisne_cislo || ''}`.trim() : '—'}
                  </p>
                </div>
              </div>

              <div className="flex items-center">
                <FaMapMarkerAlt className="text-slate-400 mr-2 sm:mr-3 flex-shrink-0" />
                <div>
                  <p className="text-xs sm:text-sm font-medium text-slate-600">City</p>
                  <p className="text-sm sm:text-base text-slate-900 font-semibold">{profile.mesto || '—'}</p>
                </div>
              </div>

              <div className="flex items-center">
                <FaMapMarkerAlt className="text-slate-400 mr-2 sm:mr-3 flex-shrink-0" />
                <div>
                  <p className="text-xs sm:text-sm font-medium text-slate-600">Postal Code</p>
                  <p className="text-sm sm:text-base text-slate-900 font-semibold">{profile.psc || '—'}</p>
                </div>
              </div>

              <div className="flex items-center">
                <FaMapMarkerAlt className="text-slate-400 mr-2 sm:mr-3 flex-shrink-0" />
                <div>
                  <p className="text-xs sm:text-sm font-medium text-slate-600">Country</p>
                  <p className="text-sm sm:text-base text-slate-900 font-semibold">{profile.krajina || '—'}</p>
                </div>
              </div>

              <div className="flex items-center sm:col-span-2">
                <FaCreditCard className="text-slate-400 mr-2 sm:mr-3 flex-shrink-0" />
                <div>
                  <p className="text-xs sm:text-sm font-medium text-slate-600">IBAN</p>
                  <p className="text-sm sm:text-base text-slate-900 font-semibold break-all">{profile.iban || '—'}</p>
                </div>
              </div>

              {/* Signature */}
              <div className="flex items-start sm:col-span-2">
                <FaSignature className="text-slate-400 mr-2 sm:mr-3 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <p className="text-xs sm:text-sm font-medium text-slate-600 mb-2">Signature</p>
                  {signatureUrl ? (
                    <div className="border border-slate-300 rounded-xl p-3 bg-white">
                      <img 
                        src={signatureUrl} 
                        alt="Podpis" 
                        className="max-w-full h-24 object-contain"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          console.error('Error loading signature image:', signatureUrl);
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            parent.innerHTML = '<p class="text-sm text-red-600">Chyba pri načítaní obrázka podpisu</p>';
                          }
                        }}
                        onLoad={() => {
                          console.log('Signature image loaded successfully:', signatureUrl);
                        }}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 italic">Signature is not uploaded</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200">
              <h2 className="text-lg sm:text-2xl font-bold text-slate-900">Edit Profile</h2>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(95vh-120px)] sm:max-h-[calc(90vh-140px)]">
              <form onSubmit={handleSubmitProfile} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <label htmlFor="first_name" className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
                      First Name
                    </label>
                    <input
                      type="text"
                      id="first_name"
                      value={profile.first_name}
                      onChange={(e) => setProfile({ ...profile, first_name: e.target.value })}
                      className="block w-full px-3 sm:px-4 py-2 sm:py-3 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm sm:text-base"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="last_name" className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
                      Last Name
                    </label>
                    <input
                      type="text"
                      id="last_name"
                      value={profile.last_name}
                      onChange={(e) => setProfile({ ...profile, last_name: e.target.value })}
                      className="block w-full px-3 sm:px-4 py-2 sm:py-3 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm sm:text-base"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="profile_type" className="block text-sm font-semibold text-slate-700 mb-2">
                      Profile Type
                    </label>
                    <select
                      id="profile_type"
                      value={profile.profile_type}
                      onChange={(e) => setProfile({ ...profile, profile_type: e.target.value as 'Personal' | 'Business', vat_type: e.target.value === 'Personal' ? 'PRIVATE' : '' })}
                      className="block w-full px-4 py-3 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                    >
                      <option value="Personal">Personal</option>
                      <option value="Business">Business</option>
                    </select>
                  </div>

                  {profile.profile_type === 'Business' && (
                    <div>
                      <label htmlFor="company_name" className="block text-sm font-semibold text-slate-700 mb-2">
                        Company Name
                      </label>
                      <input
                        type="text"
                        id="company_name"
                        value={profile.company_name || ''}
                        onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
                        className="block w-full px-4 py-3 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                        required={profile.profile_type === 'Business'}
                      />
                    </div>
                  )}

                  {profile.profile_type === 'Business' && (
                    <div>
                      <label htmlFor="vat_type" className="block text-sm font-semibold text-slate-700 mb-2">
                        VAT Type
                      </label>
                      <select
                        id="vat_type"
                        value={profile.vat_type}
                        onChange={(e) => setProfile({ ...profile, vat_type: e.target.value })}
                        className="block w-full px-4 py-3 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                      >
                        <option value="">Select type</option>
                        <option value="MARGIN">MARGIN</option>
                        <option value="VAT 0%">VAT 0%</option>
                      </select>
                    </div>
                  )}

                  {profile.profile_type === 'Business' && (
                    <div>
                      <label htmlFor="ico" className="block text-sm font-semibold text-slate-700 mb-2">
                        IČO
                      </label>
                      <input
                        type="text"
                        id="ico"
                        value={profile.ico || ''}
                        onChange={(e) => setProfile({ ...profile, ico: e.target.value })}
                        className="block w-full px-4 py-3 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                        required={profile.profile_type === 'Business'}
                      />
                    </div>
                  )}

                  {profile.profile_type === 'Business' && profile.vat_type === 'VAT 0%' && (
                    <div>
                      <label htmlFor="vat_number" className="block text-sm font-semibold text-slate-700 mb-2">
                        VAT Number
                      </label>
                      <input
                        type="text"
                        id="vat_number"
                        value={profile.vat_number || ''}
                        onChange={(e) => setProfile({ ...profile, vat_number: e.target.value })}
                        className="block w-full px-4 py-3 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                        required={profile.vat_type === 'VAT 0%'}
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="address" className="block text-sm font-semibold text-slate-700 mb-2">
                      Adresa
                    </label>
                    <input
                      type="text"
                      id="address"
                      value={profile.address}
                      onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                      className="block w-full px-4 py-3 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="popisne_cislo" className="block text-sm font-semibold text-slate-700 mb-2">
                      Street Number
                    </label>
                    <input
                      type="text"
                      id="popisne_cislo"
                      value={profile.popisne_cislo}
                      onChange={(e) => setProfile({ ...profile, popisne_cislo: e.target.value })}
                      className="block w-full px-4 py-3 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="psc" className="block text-sm font-semibold text-slate-700 mb-2">
                      PSČ
                    </label>
                    <input
                      type="text"
                      id="psc"
                      value={profile.psc}
                      onChange={(e) => setProfile({ ...profile, psc: e.target.value })}
                      className="block w-full px-4 py-3 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="mesto" className="block text-sm font-semibold text-slate-700 mb-2">
                      Mesto
                    </label>
                    <input
                      type="text"
                      id="mesto"
                      value={profile.mesto}
                      onChange={(e) => setProfile({ ...profile, mesto: e.target.value })}
                      className="block w-full px-4 py-3 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="krajina" className="block text-sm font-semibold text-slate-700 mb-2">
                      Country
                    </label>
                    <select
                      id="krajina"
                      value={profile.krajina}
                      onChange={(e) => setProfile({ ...profile, krajina: e.target.value })}
                      className="block w-full px-4 py-3 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                      required
                    >
                      <option value="Slovakia">Slovakia</option>
                      <option value="Czech Republic">Czech Republic</option>
                      <option value="Hungary">Hungary</option>
                      <option value="Romania">Romania</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      id="email"
                      value={profile.email}
                      readOnly
                      className="block w-full px-4 py-3 border border-slate-300 rounded-xl shadow-sm bg-slate-50 text-slate-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="discord" className="block text-sm font-semibold text-slate-700 mb-2">
                      Discord
                    </label>
                    <input
                      type="text"
                      id="discord"
                      value={profile.discord}
                      onChange={(e) => setProfile({ ...profile, discord: e.target.value })}
                      className="block w-full px-4 py-3 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                      placeholder="e.g. username#1234"
                    />
                  </div>
                  <div>
                    <label htmlFor="telephone" className="block text-sm font-semibold text-slate-700 mb-2">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      id="telephone"
                      value={profile.telephone}
                      onChange={(e) => setProfile({ ...profile, telephone: e.target.value })}
                      className="block w-full px-4 py-3 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="iban" className="block text-sm font-semibold text-slate-700 mb-2">
                    IBAN
                  </label>
                  <input
                    type="text"
                    id="iban"
                    value={profile.iban}
                    onChange={(e) => setProfile({ ...profile, iban: e.target.value })}
                    className="block w-full px-4 py-3 border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>

                {/* Signature */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    <FaSignature className="inline mr-2" />
                    Signature
                  </label>
                  <div className="space-y-3">
                    {signatureUrl ? (
                      <div className="border border-slate-300 rounded-xl p-4 bg-white">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm text-slate-600">Signature is uploaded</p>
                          <button
                            type="button"
                            onClick={deleteSignature}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            <FaTrash />
                          </button>
                        </div>
                        <img 
                          src={signatureUrl} 
                          alt="Signature" 
                          className="max-w-full h-24 object-contain border border-slate-200 rounded"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            console.error('Error loading signature image in modal:', signatureUrl);
                            target.style.display = 'none';
                            const parent = target.parentElement;
                            if (parent) {
                              parent.innerHTML = '<p class="text-sm text-red-600">Error loading signature image</p>';
                            }
                          }}
                          onLoad={() => {
                            console.log('Signature image loaded successfully in modal:', signatureUrl);
                          }}
                        />
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 bg-slate-50">
                        <p className="text-sm text-slate-600 mb-2">Signature is not uploaded</p>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowSignatureModal(true)}
                      className="w-full px-4 py-2 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all"
                    >
                      <FaSignature className="inline mr-2" />
                      {signatureUrl ? 'Change Signature' : 'Add Signature'}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-6 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-4 sm:px-6 py-2 sm:py-3 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 sm:px-6 py-2 sm:py-3 text-sm font-semibold text-white bg-black hover:bg-gray-800 rounded-xl transition-all duration-200"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Signature Modal */}
      {showSignatureModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Signature</h2>
              <button
                onClick={() => {
                  setShowSignatureModal(false);
                  clearSignature();
                }}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <FaTimes className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <div className="p-6">
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-3">Draw your signature below:</p>
                <div className="flex justify-center bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <canvas
                    ref={canvasRef}
                    width={300}
                    height={150}
                    onMouseDown={handleSignatureStart}
                    onMouseMove={handleSignatureMove}
                    onMouseUp={handleSignatureEnd}
                    onMouseLeave={handleSignatureEnd}
                    onTouchStart={handleSignatureStart}
                    onTouchMove={handleSignatureMove}
                    onTouchEnd={handleSignatureEnd}
                    className="border-2 border-gray-300 rounded-lg cursor-crosshair"
                    style={{ touchAction: 'none' }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between space-x-3">
                <button
                  type="button"
                  onClick={clearSignature}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Clear
                </button>
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSignatureModal(false);
                      clearSignature();
                    }}
                    className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveSignature}
                    disabled={uploadingSignature}
                    className="px-4 py-2 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50"
                  >
                    {uploadingSignature ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}