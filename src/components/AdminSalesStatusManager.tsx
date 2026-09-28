import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import SalesStatusBadge from './SalesStatusBadge';
import SalesStatusTimeline from './SalesStatusTimeline';
import { sendStatusChangeEmail, sendTrackingEmail } from '../lib/email';
import { logger } from '../lib/logger';
import { generatePurchaseAgreement, uploadContractToStorage } from '../lib/pdfGenerator';
import { useToast } from './Toast';
import { resolveInvoiceReferences } from '../lib/storageUrls';
import { 
  FaSave, FaStickyNote, FaTruck, FaBox, FaLink, FaTimes, FaPlus, FaEdit, 
  FaFilePdf, FaUpload, FaTrash, FaClock, FaFileContract, FaFileInvoice,
  FaChevronDown, FaChevronUp, FaArrowRight, FaExternalLinkAlt, FaCheckCircle, 
  FaEnvelope, FaCheck, FaDownload
} from 'react-icons/fa';

interface ManualSaleItem {
  productName: string;
  size: string;
  price: number;
  payout?: number;
}

interface AdminSalesStatusManagerProps {
  saleId: string;
  currentStatus: string;
  currentExternalId?: string;
  currentTrackingUrl?: string;
  currentLabelUrl?: string;
  currentFaUrl?: string;
  currentDeliveredAt?: string;
  currentPayoutDate?: string;
  currentCreatedAt?: string;
  currentIsManual?: boolean;
  onStatusUpdate: (newStatus: string) => void;
  onExternalIdUpdate: (newExternalId: string) => void;
  onSaleUpdate?: () => void;
  onClose: () => void;
  onDelete?: () => void;
}

const statusOptions = [
  { value: 'accepted', label: 'Accepted' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'returned', label: 'Returned' }
];

const parseMoneyInput = (value: string): number | null => {
  const normalized = value.trim().replace(/\s+/g, '').replace(',', '.');
  if (!normalized) return null;

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
};

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export default function AdminSalesStatusManager({ 
  saleId, 
  currentStatus, 
  currentExternalId = '', 
  currentTrackingUrl = '',
  currentLabelUrl = '',
  currentFaUrl = '',
  currentDeliveredAt = '',
  currentPayoutDate = '',
  currentCreatedAt = '',
  currentIsManual = false,
  onStatusUpdate, 
  onExternalIdUpdate,
  onSaleUpdate,
  onClose,
  onDelete
}: AdminSalesStatusManagerProps) {
  const { showToast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState(currentStatus);
  const [externalId, setExternalId] = useState(currentExternalId);
  const [trackingUrl, setTrackingUrl] = useState(currentTrackingUrl);
  const [labelUrl, setLabelUrl] = useState(currentLabelUrl);
  // Helper function to convert ISO date string to local date string (YYYY-MM-DD) for date input
  // Creates a date object at noon local time to avoid timezone shift issues
  const isoToLocalDateString = (isoString: string): string => {
    if (!isoString) return '';
    try {
      // Parse the ISO string and create a date object
      const date = new Date(isoString);
      // Get local date components (this handles timezone correctly)
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (e) {
      // Fallback: extract date part directly
      const dateMatch = isoString.match(/^(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        return dateMatch[1];
      }
      return isoString.split('T')[0];
    }
  };

  const [deliveredAt, setDeliveredAt] = useState(currentDeliveredAt ? isoToLocalDateString(currentDeliveredAt) : '');
  const [saleDate, setSaleDate] = useState(currentCreatedAt ? isoToLocalDateString(currentCreatedAt) : '');
  const [invoiceDate, setInvoiceDate] = useState(''); // Date for invoice sale (used in PDF contract)
  const [originalInvoiceDate, setOriginalInvoiceDate] = useState(''); // Store original invoice date for comparison
  const [notes, setNotes] = useState('');
  const [originalNotes, setOriginalNotes] = useState(''); // Store original notes for comparison
  const [payoutInput, setPayoutInput] = useState('');
  const [originalPayout, setOriginalPayout] = useState<number | null>(null);
  const [sendEmail, setSendEmail] = useState(true); // Default: send email
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [saleData, setSaleData] = useState<{ name: string; user_email: string; sku?: string; price: number; payout: number; external_id?: string; user_id?: string; created_at?: string; size?: string; image_url?: string; is_manual?: boolean; product_id?: string; manual_sale_items?: ManualSaleItem[] } | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [generatingContract, setGeneratingContract] = useState(false);
  const [contractUrl, setContractUrl] = useState<string | null>(null);
  const [faUrl, setFaUrl] = useState<string | null>(currentFaUrl || null);
  const [documentMode, setDocumentMode] = useState<'contract' | 'fa'>(currentFaUrl ? 'fa' : 'contract');
  const [docTab, setDocTab] = useState<'contract' | 'fa' | 'label'>(currentFaUrl ? 'fa' : 'contract');
  const [showTimeline, setShowTimeline] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load existing notes and sale data on mount
  useEffect(() => {
    const loadExistingData = async () => {
      try {
        logger.debug('Loading existing sale data', { saleId });
        const { data, error } = await supabase
          .from('user_sales')
          .select('status_notes, tracking_url, label_url, fa_url, name, user_id, sku, price, payout, external_id, created_at, contract_url, size, is_manual, image_url, product_id, invoice_date, manual_sale_items, profiles(email)')
          .eq('id', saleId)
          .single();

        if (!error && data) {
          const loadedNotes = data.status_notes || '';
          setNotes(loadedNotes);
          setOriginalNotes(loadedNotes); // Store original notes for comparison
          if (data.tracking_url) setTrackingUrl(data.tracking_url);
          if (data.label_url) setLabelUrl(data.label_url);
          if (data.fa_url) {
            const signedInvoiceUrls = await resolveInvoiceReferences([data.fa_url]);
            setFaUrl(signedInvoiceUrls.get(data.fa_url) || data.fa_url);
            setDocumentMode('fa');
            setDocTab('fa');
          }
          if (data.contract_url) {
            setContractUrl(data.contract_url);
            if (!data.fa_url) {
              setDocumentMode('contract');
              setDocTab('contract');
            }
          }
          if (data.created_at) setSaleDate(isoToLocalDateString(data.created_at));
          
          // Load invoice_date from the same sale record
          // If invoice_date doesn't exist, use created_at as fallback
          let loadedInvoiceDate = '';
          if (data.invoice_date) {
            loadedInvoiceDate = isoToLocalDateString(data.invoice_date);
          } else {
            // Fallback: use created_at if invoice_date is not set
            loadedInvoiceDate = data.created_at ? isoToLocalDateString(data.created_at) : '';
          }
          setInvoiceDate(loadedInvoiceDate);
          setOriginalInvoiceDate(loadedInvoiceDate); // Store original for comparison

          const loadedPayout = Number(data.payout ?? 0);
          setPayoutInput(String(loadedPayout));
          setOriginalPayout(loadedPayout);
          
          // Store sale data for email notifications and PDF generation
          setSaleData({
            name: data.name || '',
            user_email: (data.profiles as any)?.email || '',
            sku: data.sku,
            price: data.price,
            payout: data.payout,
            external_id: data.external_id,
            user_id: data.user_id,
            created_at: data.created_at,
            size: data.size || '',
            image_url: data.image_url || undefined,
            is_manual: data.is_manual || false,
            product_id: data.product_id, // Add product_id for invoice sale lookup
            manual_sale_items: Array.isArray(data.manual_sale_items) ? data.manual_sale_items : undefined
          });

          // Load user profile for PDF generation
          if (data.user_id) {
            const { data: profileData, error: profileError } = await supabase
              .from('profiles')
              .select('first_name, last_name, ico, address, popisne_cislo, psc, mesto, krajina, email, telephone, iban, signature_url')
              .eq('id', data.user_id)
              .single();
            
            if (!profileError && profileData) {
              setUserProfile(profileData);
            } else if (profileError) {
              logger.error('Error loading user profile', profileError);
            }
          }
          
          logger.debug('Sale data loaded successfully');
        } else if (error) {
          logger.error('Error loading sale data', error);
        }
      } catch (err) {
        logger.error('Error loading existing data', err);
      }
    };
    loadExistingData();
  }, [saleId]);

  const getContractsBucketPath = (url: string | null | undefined, prefix: string) => {
    if (!url) return '';
    if (url.includes('/storage/v1/object/public/contracts/')) {
      return url.split('/storage/v1/object/public/contracts/')[1].split('?')[0];
    }
    if (url.includes('/contracts/')) {
      return url.split('/contracts/')[1].split('?')[0];
    }
    if (url.startsWith(`${prefix}/`)) {
      return url;
    }
    return url.split('?')[0];
  };

  const handleFileUpload = async (file: File) => {
    if (!file) {
      logger.error('No file provided');
      setError('No file selected');
      return;
    }
    
    if (file.type !== 'application/pdf') {
      logger.warn('Invalid file type', { fileType: file.type });
      setError('Please upload a PDF file. Selected type: ' + file.type);
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      logger.warn('File too large', { fileSize: file.size });
      setError('File is too large. Maximum size is 10MB');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      logger.info('Uploading label PDF', { saleId, fileName: file.name, fileSize: file.size });

      // Delete old file if exists
      if (labelUrl) {
        try {
          // Extract path from URL - handle both full URLs and paths
          let oldPath = '';
          if (labelUrl.includes('/storage/v1/object/public/labels/')) {
            // Full public URL
            oldPath = labelUrl.split('/storage/v1/object/public/labels/')[1];
          } else if (labelUrl.includes('/labels/')) {
            // Partial URL
            oldPath = labelUrl.split('/labels/')[1];
          } else {
            // Assume it's already a path
            oldPath = labelUrl;
          }
          
          if (oldPath) {
            const { error: deleteError } = await supabase.storage.from('labels').remove([oldPath]);
            if (deleteError) {
              logger.warn('Failed to delete old label', deleteError);
            } else {
              logger.debug('Deleted old label file', { oldPath });
            }
          }
        } catch (err) {
          logger.warn('Failed to delete old label', err);
          // Continue with upload even if delete fails
        }
      }

      // Upload new file
      const fileExt = file.name.split('.').pop() || 'pdf';
      const fileName = `${saleId}-${Date.now()}.${fileExt}`;
      const filePath = `sales/${fileName}`;
      
      // Try to upload directly - if bucket doesn't exist, we'll get an error
      // Note: listBuckets() might not work due to permissions, so we try upload first
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('labels')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true // Allow overwriting if file exists
        });

      if (uploadError) {
        logger.error('Upload error details', { uploadError, filePath });
        logger.error('Upload failed', { 
          error: uploadError, 
          message: uploadError.message,
          errorDetails: JSON.stringify(uploadError, null, 2)
        });
        
        // Provide more specific error messages
        if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('not found')) {
          throw new Error('Storage bucket "labels" does not exist. Please create it in Supabase Dashboard > Storage > Create Bucket.');
        } else if (uploadError.message?.includes('new row violates row-level security') || uploadError.message?.includes('row-level security')) {
          throw new Error('You do not have permission to upload files. Check RLS policies in Storage > labels > Policies. Bucket must be public or have correct policies.');
        } else if (uploadError.message?.includes('JWT')) {
          throw new Error('Authentication error. Please sign out and sign in again.');
        } else {
          throw new Error(`Upload error: ${uploadError.message || JSON.stringify(uploadError)}`);
        }
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('labels')
        .getPublicUrl(filePath);

      const newLabelUrl = urlData.publicUrl;
      setLabelUrl(newLabelUrl);
      logger.info('Label uploaded successfully', { newLabelUrl, filePath });

      // Update database
      const { error: updateError } = await supabase
        .from('user_sales')
        .update({ label_url: newLabelUrl, updated_at: new Date().toISOString() })
        .eq('id', saleId);

      if (updateError) {
        logger.error('Database update error', updateError);
        logger.error('Database update failed', updateError);
        throw new Error('Error saving URL to database: ' + updateError.message);
      }
      logger.info('Label URL saved to database');
      
      setError(null);
      setSuccess(true);
      showToast('Label uploaded successfully', 'success');
      
    } catch (err: any) {
      logger.error('Error uploading label', err);
      logger.error('Upload error caught', { 
        error: err, 
        message: err.message, 
        stack: err.stack,
        errorString: JSON.stringify(err, null, 2)
      });
      const errorMessage = err.message || 'Unknown error uploading PDF';
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteLabel = async () => {
    if (!labelUrl) return;

    try {
      setUploading(true);
      setError(null);
      logger.info('Deleting label', { saleId, labelUrl });

      // Extract path from URL - handle both full URLs and paths
      let filePath = '';
      if (labelUrl.includes('/storage/v1/object/public/labels/')) {
        // Full public URL
        filePath = labelUrl.split('/storage/v1/object/public/labels/')[1];
      } else if (labelUrl.includes('/labels/')) {
        // Partial URL
        filePath = labelUrl.split('/labels/')[1];
      } else {
        // Assume it's already a path
        filePath = labelUrl;
      }

      if (filePath) {
        const { error: deleteError } = await supabase.storage
          .from('labels')
          .remove([filePath]);

        if (deleteError) {
          logger.warn('Failed to delete from storage', deleteError);
          // Continue to update database even if storage delete fails
        } else {
          logger.debug('Deleted from storage', { filePath });
        }
      }

      // Update database
      const { error: updateError } = await supabase
        .from('user_sales')
        .update({ label_url: null, updated_at: new Date().toISOString() })
        .eq('id', saleId);

      if (updateError) throw updateError;

      setLabelUrl('');
      logger.info('Label deleted successfully');
      
    } catch (err: any) {
      logger.error('Error deleting label', err);
      setError('Error deleting PDF: ' + (err.message || 'Unknown error'));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteSale = async () => {
    if (!onDelete) return;
    
    if (!confirm(`Are you sure you want to delete this sale? This action cannot be undone and will remove all related files (label, contract).`)) {
      return;
    }

    try {
      setError(null);
      setDeleting(true);

      // Delete label from storage if exists
      if (currentLabelUrl) {
        try {
          let filePath = '';
          if (currentLabelUrl.includes('/storage/v1/object/public/labels/')) {
            filePath = currentLabelUrl.split('/storage/v1/object/public/labels/')[1].split('?')[0];
          } else if (currentLabelUrl.includes('/labels/')) {
            filePath = currentLabelUrl.split('/labels/')[1].split('?')[0];
          }
          
          if (filePath) {
            const { error: deleteError } = await supabase.storage
              .from('labels')
              .remove([filePath]);
            if (deleteError) {
              logger.warn('Failed to delete label from storage:', deleteError);
            }
          }
        } catch (err) {
          logger.warn('Error deleting label from storage:', err);
        }
      }

      // Delete contract from storage if exists
      if (contractUrl) {
        try {
          const filePath = `contracts/${saleId}.pdf`;
          const { error: deleteError } = await supabase.storage
            .from('contracts')
            .remove([filePath]);
          if (deleteError) {
            logger.warn('Failed to delete contract from storage:', deleteError);
          }
        } catch (err) {
          logger.warn('Error deleting contract from storage:', err);
        }
      }

      // Delete FA from storage if exists
      if (faUrl) {
        try {
          const filePath = getContractsBucketPath(faUrl, 'fa');
          if (filePath) {
            const { error: deleteError } = await supabase.storage
              .from('contracts')
              .remove([filePath]);
            if (deleteError) {
              logger.warn('Failed to delete FA from storage:', deleteError);
            }
          }
        } catch (err) {
          logger.warn('Error deleting FA from storage:', err);
        }
      }

      // Delete sale from database
      const { error: deleteError } = await supabase
        .from('user_sales')
        .delete()
        .eq('id', saleId);

      if (deleteError) throw deleteError;

      // Call onDelete callback to refresh the sales list
      onDelete();
    } catch (err: any) {
      logger.error('Error deleting sale', err);
      setError('Error deleting sale: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteContract = async () => {
    if (!contractUrl) return;

    try {
      setUploading(true);
      setError(null);
      logger.info('Deleting contract', { saleId, contractUrl });

      // Extract path from URL - file is stored in 'contracts' bucket as contracts/{fileId}.pdf
      const cleanUrl = contractUrl.split('?')[0];
      const match = cleanUrl.match(/\/contracts\/(.+)$/);
      const extractedPath = match?.[1] ? (match[1].startsWith('contracts/') ? match[1] : `contracts/${match[1]}`) : `contracts/${saleId}.pdf`;

      const filePathsToDelete = Array.from(new Set([
        extractedPath,
        extractedPath.replace(/^contracts\//, ''),
        `contracts/${saleId}.pdf`,
        saleData?.external_id ? `contracts/${saleData.external_id}.pdf` : null,
      ].filter(Boolean) as string[]));

      // Delete from storage bucket
      logger.info('Deleting contract from storage', { filePathsToDelete, bucket: 'contracts' });
      const { error: deleteError } = await supabase.storage
        .from('contracts')
        .remove(filePathsToDelete);

      if (deleteError) {
        logger.error('Failed to delete contract from storage', deleteError);
        throw new Error(`Error deleting file from storage: ${deleteError.message}`);
      } else {
        logger.info('Contract deleted from storage successfully', { filePathsToDelete });
      }

      // Update database
      const { error: updateError } = await supabase
        .from('user_sales')
        .update({ contract_url: null, updated_at: new Date().toISOString() })
        .eq('id', saleId);

      if (updateError) throw updateError;

      setContractUrl(null);
      logger.info('Contract deleted successfully');
      
    } catch (err: any) {
      logger.error('Error deleting contract', err);
      setError('Error deleting contract PDF: ' + (err.message || 'Unknown error'));
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadFile = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(link);
    } catch {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleFaUpload = async (file: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File is too large. Maximum size is 10MB');
      return;
    }

    try {
      setUploading(true);
      setError(null);

      if (faUrl) {
        const oldPath = getContractsBucketPath(faUrl, 'fa');
        if (oldPath) {
          await supabase.storage.from('contracts').remove([oldPath]);
        }
      }

      const filePath = `fa/${saleId}-${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('contracts')
        .upload(filePath, file, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('contracts').getPublicUrl(filePath);
      const newFaUrl = urlData.publicUrl;

      const { error: updateError } = await supabase
        .from('user_sales')
        .update({ fa_url: newFaUrl, updated_at: new Date().toISOString() })
        .eq('id', saleId);

      if (updateError) throw updateError;

      setFaUrl(newFaUrl);
      setDocumentMode('fa');
      showToast('FA uploaded successfully', 'success');
    } catch (err: any) {
      setError('Error uploading FA: ' + (err.message || 'Unknown error'));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFa = async () => {
    if (!faUrl) return;

    try {
      setUploading(true);
      setError(null);

      const filePath = getContractsBucketPath(faUrl, 'fa');
      if (filePath) {
        await supabase.storage.from('contracts').remove([filePath]);
      }

      const { error: updateError } = await supabase
        .from('user_sales')
        .update({ fa_url: null, updated_at: new Date().toISOString() })
        .eq('id', saleId);

      if (updateError) throw updateError;

      setFaUrl(null);
      setDocumentMode('fa');
      showToast('FA deleted successfully', 'success');
    } catch (err: any) {
      setError('Error deleting FA: ' + (err.message || 'Unknown error'));
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateContract = async () => {
    if (!saleData || !userProfile) {
      setError('Error: Sale or user data not loaded');
      return;
    }
    
    try {
      setGeneratingContract(true);
      setError(null);

      // If user typed a new payout in the input, persist it first so the generated contract uses the fresh payout!
      const parsedPayout = parseMoneyInput(payoutInput);
      const payoutChanged = originalPayout !== null && (
        (parsedPayout === null && originalPayout !== null) ||
        (parsedPayout !== null && Math.abs(parsedPayout - originalPayout) > 0.001)
      );

      if (payoutChanged && parsedPayout !== null) {
        const updatePayload: any = { payout: parsedPayout, updated_at: new Date().toISOString() };
        if (Array.isArray(saleData?.manual_sale_items) && saleData.manual_sale_items.length > 0) {
          updatePayload.manual_sale_items = saleData.manual_sale_items.map((item, idx) =>
            idx === 0 || saleData.manual_sale_items!.length === 1 ? { ...item, payout: parsedPayout } : item
          );
        }
        await supabase.from('user_sales').update(updatePayload).eq('id', saleId);
        setOriginalPayout(parsedPayout);
        setSaleData(prev => prev ? { ...prev, payout: parsedPayout, manual_sale_items: updatePayload.manual_sale_items || prev.manual_sale_items } : prev);
      }

      // Always load latest sale + profile data from DB so contract uses fresh values
      const { data: freshSale, error: freshSaleError } = await supabase
        .from('user_sales')
        .select('id, user_id, name, size, price, is_manual, payout, created_at, external_id, invoice_date, manual_sale_items')
        .eq('id', saleId)
        .single();

      if (freshSaleError || !freshSale) {
        throw new Error(freshSaleError?.message || 'Failed to load latest sale data');
      }

      const { data: freshProfile, error: freshProfileError } = await supabase
        .from('profiles')
        .select('first_name, last_name, ico, address, popisne_cislo, psc, mesto, krajina, email, telephone, iban, signature_url')
        .eq('id', freshSale.user_id)
        .single();

      if (freshProfileError || !freshProfile) {
        throw new Error(freshProfileError?.message || 'Failed to load latest user profile');
      }
      
      const addressBase = (freshProfile.address || '').trim();
      const houseNumber = (freshProfile.popisne_cislo || '').trim();
      const addressHasNumber =
        houseNumber.length > 0 &&
        addressBase.toLowerCase().includes(houseNumber.toLowerCase());
      const streetAndNumber = [addressBase, addressHasNumber ? '' : houseNumber]
        .filter(Boolean)
        .join(' ');
      
      const addressParts = [];
      if (streetAndNumber) {
        addressParts.push(streetAndNumber);
      }
      if (freshProfile.psc && freshProfile.mesto) {
        addressParts.push(`${freshProfile.psc} ${freshProfile.mesto}`);
      } else if (freshProfile.mesto) {
        addressParts.push(freshProfile.mesto);
      }
      if (freshProfile.krajina) {
        addressParts.push(freshProfile.krajina);
      } else {
        addressParts.push('Slovakia');
      }
      
      const sellerAddress = addressParts.join(', ');
      const buyerAddress = 'Lysica 336, 013 05 Lysica, SLOVAKIA';
      
      const contractDateISO = invoiceDate 
        ? new Date(invoiceDate + 'T12:00:00').toISOString()
        : (freshSale.invoice_date || freshSale.created_at || new Date().toISOString());
      
      const { data: adminSettings } = await supabase
        .from('admin_settings')
        .select('buyer_signature_url')
        .single();
      
      const pdfBlob = await generatePurchaseAgreement({
        saleId: saleId,
        externalId: freshSale.external_id || undefined,
        formId: saleId,
        productName: freshSale.name,
        size: freshSale.size || '',
        price: freshSale.price,
        isManual: freshSale.is_manual || false,
        payout: freshSale.payout,
        items: Array.isArray(freshSale.manual_sale_items) ? freshSale.manual_sale_items : undefined,
        buyerName: 'Juraj Orlicky ml.',
        buyerCIN: '55702660',
        buyerAddress: buyerAddress,
        buyerEmail: 'info@airkicks.eu',
        buyerSignatureUrl: adminSettings?.buyer_signature_url || undefined,
        sellerName: freshProfile.first_name || '',
        sellerSurname: freshProfile.last_name || '',
        sellerCIN: freshProfile.ico || undefined,
        sellerAddress: sellerAddress,
        sellerEmail: freshProfile.email || saleData.user_email,
        sellerPhone: freshProfile.telephone || undefined,
        sellerIBAN: freshProfile.iban || undefined,
        sellerSignatureUrl: freshProfile.signature_url || undefined,
        location: freshProfile.mesto || 'Slovakia',
        saleDate: contractDateISO
      });
      
      const storageFileId = freshSale.external_id || saleId;
      const url = await uploadContractToStorage(storageFileId, pdfBlob);
      
      const { error: updateError } = await supabase
        .from('user_sales')
        .update({ contract_url: url })
        .eq('id', saleId);
      
      if (updateError) throw updateError;
      
      setContractUrl(url);
      setDocumentMode('contract');
      setDocTab('contract');
      setSuccess(true);
      showToast('Contract PDF generated', 'success');
      logger.info('Contract PDF generated successfully', { saleId, url });
    } catch (err: any) {
      logger.error('Error generating contract', err);
      setError('Error generating contract PDF: ' + (err.message || 'Unknown error'));
    } finally {
      setGeneratingContract(false);
    }
  };


  const handleSave = async () => {
    // Compare dates properly - extract date part from both for comparison
    const currentSaleDateStr = currentCreatedAt ? isoToLocalDateString(currentCreatedAt) : '';
    const currentDeliveredAtStr = currentDeliveredAt ? isoToLocalDateString(currentDeliveredAt) : '';
    const parsedPayout = parseMoneyInput(payoutInput);
    const payoutChanged = originalPayout !== null && (
      parsedPayout === null || Math.abs(roundMoney(parsedPayout) - originalPayout) > 0.0001
    );
    
    const hasChanges = 
      selectedStatus !== currentStatus || 
      externalId !== currentExternalId || 
      trackingUrl !== currentTrackingUrl ||
      labelUrl !== currentLabelUrl ||
      deliveredAt !== currentDeliveredAtStr ||
      saleDate !== currentSaleDateStr ||
      invoiceDate !== originalInvoiceDate ||
      payoutChanged ||
      notes.trim() !== originalNotes.trim();

    if (!hasChanges) {
      logger.debug('No changes detected', {
        selectedStatus,
        currentStatus,
        saleDate,
        currentSaleDateStr,
        deliveredAt,
        currentDeliveredAtStr
      });
      return; // No changes to save
    }

    if (parsedPayout === null || parsedPayout < 0) {
      setError('Payout must be a valid amount greater than or equal to 0.');
      return;
    }

    const effectivePayout = roundMoney(parsedPayout);

    // Confirm before cancelling or returning a sale
    if (selectedStatus !== currentStatus && (selectedStatus === 'cancelled' || selectedStatus === 'returned')) {
      if (!confirm('Naozaj zrušiť tento predaj? Táto zmena je nevratná.')) {
        return;
      }
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(false);
      logger.info('Saving sale changes', { saleId });

      // Build update object with only changed fields
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (selectedStatus !== currentStatus) {
        updateData.status = selectedStatus;
      }
      if (externalId !== currentExternalId) {
        updateData.external_id = externalId || null;
      }
      if (trackingUrl !== currentTrackingUrl) {
        updateData.tracking_url = trackingUrl || null;
      }
      if (labelUrl !== currentLabelUrl) {
        updateData.label_url = labelUrl || null;
      }
      if (payoutChanged) {
        updateData.payout = effectivePayout;
        if (Array.isArray(saleData?.manual_sale_items) && saleData.manual_sale_items.length > 0) {
          updateData.manual_sale_items = saleData.manual_sale_items.map((item, idx) =>
            idx === 0 || saleData.manual_sale_items!.length === 1 ? { ...item, payout: effectivePayout } : item
          );
        }
      }
      // Handle saleDate (created_at) - if manually changed
      const currentSaleDateStr = currentCreatedAt ? isoToLocalDateString(currentCreatedAt) : '';
      if (saleDate !== currentSaleDateStr) {
        if (saleDate) {
          // Create date at noon local time to avoid timezone shift
          const [year, month, day] = saleDate.split('-').map(Number);
          const saleDateObj = new Date(year, month - 1, day, 12, 0, 0);
          updateData.created_at = saleDateObj.toISOString();
          logger.debug('Updating sale date', {
            oldDate: currentCreatedAt,
            newDate: saleDate,
            isoDate: saleDateObj.toISOString()
          });
        }
      }
      // Handle delivered_at - if status is 'delivered' and deliveredAt is set
      if (selectedStatus === 'delivered' && deliveredAt) {
        // Create date at noon local time to avoid timezone shift
        const [year, month, day] = deliveredAt.split('-').map(Number);
        const deliveredDateObj = new Date(year, month - 1, day, 12, 0, 0);
        updateData.delivered_at = deliveredDateObj.toISOString();
      } else if (selectedStatus !== 'delivered' && currentDeliveredAt) {
        // Clear delivered_at if status is not 'delivered'
        updateData.delivered_at = null;
      } else if (deliveredAt !== currentDeliveredAtStr) {
        // If delivered_at is manually changed
        if (deliveredAt) {
          // Create date at noon local time to avoid timezone shift
          const [year, month, day] = deliveredAt.split('-').map(Number);
          const deliveredDateObj = new Date(year, month - 1, day, 12, 0, 0);
          updateData.delivered_at = deliveredDateObj.toISOString();
        } else {
          updateData.delivered_at = null;
        }
      }
      // Always update notes if they changed (even if empty - to clear notes)
      if (notes.trim() !== originalNotes.trim()) {
        updateData.status_notes = notes.trim() || null;
      }
      
      // Handle invoiceDate - update invoice_date column in the same sale record
      if (invoiceDate !== originalInvoiceDate) {
        if (invoiceDate) {
          // Update invoice_date column
          const [year, month, day] = invoiceDate.split('-').map(Number);
          const invoiceDateObj = new Date(year, month - 1, day, 12, 0, 0);
          const invoiceDateISO = invoiceDateObj.toISOString();
          
          logger.debug('Updating invoice_date', {
            invoiceDate,
            originalInvoiceDate,
            saleId,
            isoDate: invoiceDateISO
          });
          
          updateData.invoice_date = invoiceDateISO;
        } else {
          // Clear invoice_date if empty
          updateData.invoice_date = null;
        }
      }

      const { error: updateError } = await supabase
        .from('user_sales')
        .update(updateData)
        .eq('id', saleId);

      if (updateError) throw updateError;

      if (selectedStatus !== currentStatus && (selectedStatus === 'cancelled' || selectedStatus === 'returned') && saleData) {
        const sourceMarker = `sale:${saleId}`;
        const { data: existingWarehouseItem, error: existingWarehouseError } = await supabase
          .from('warehouse_items')
          .select('id')
          .ilike('notes', `%${sourceMarker}%`)
          .limit(1)
          .maybeSingle();

        if (existingWarehouseError && existingWarehouseError.code !== 'PGRST116') {
          logger.warn('Failed to check warehouse duplicate for returned sale', existingWarehouseError);
        }

        if (!existingWarehouseItem) {
          const { error: warehouseError } = await supabase
            .from('warehouse_items')
            .insert([{
              name: saleData.name,
              size: saleData.size || null,
              sku: saleData.sku || null,
              image_url: saleData.image_url || null,
              source_type: 'unclaimed_order',
              purchase_price: effectivePayout,
              document_type: faUrl ? 'fa' : 'zmluva',
              status: 'available',
              notes: `Auto-added from ${selectedStatus} sale ${saleData.external_id || saleId} (${sourceMarker})`,
              updated_at: new Date().toISOString(),
            }]);

          if (warehouseError) {
            logger.warn('Failed to auto-add returned sale to warehouse', warehouseError);
            showToast('Sale saved, but warehouse auto-add failed', 'info');
          } else {
            showToast('Sale saved and item added to warehouse', 'success');
          }
        }
      }
      
      // Update original invoice date after successful save
      if (invoiceDate !== originalInvoiceDate) {
        setOriginalInvoiceDate(invoiceDate);
      }
      if (payoutChanged) {
        setOriginalPayout(effectivePayout);
        setPayoutInput(String(effectivePayout));
        setSaleData((previous) => previous ? { ...previous, payout: effectivePayout } : previous);
      }
      
      logger.info('Sale updated successfully');

      // Update original notes after successful save
      setOriginalNotes(notes.trim());

      // Only call callbacks if status or externalId changed (not for invoice date only)
      if (selectedStatus !== currentStatus) {
        onStatusUpdate(selectedStatus);
      }
      if (externalId !== currentExternalId) {
        onExternalIdUpdate(externalId);
      }
      onSaleUpdate?.();
      setSuccess(true);
      showToast('Changes saved successfully', 'success');
      setEmailSuccess(false);

      // Send email notifications if enabled
      if (sendEmail && saleData && saleData.user_email && saleData.user_email !== 'N/A') {
        try {
          // Send status change email if status changed
          if (selectedStatus !== currentStatus) {
            logger.info('Attempting to send status change email', {
              email: saleData.user_email,
              saleId: saleId,
              oldStatus: currentStatus,
              newStatus: selectedStatus
            });
            await sendStatusChangeEmail({
              email: saleData.user_email,
              saleId: saleId,
              productName: saleData.name,
              oldStatus: currentStatus,
              newStatus: selectedStatus,
              notes: notes.trim() || undefined,
              size: saleData.size,
              sku: saleData.sku,
              image_url: saleData.image_url,
              price: saleData.price,
              payout: effectivePayout,
              external_id: saleData.external_id,
              trackingUrl: trackingUrl || undefined,
              label_url: labelUrl || undefined,
              contract_url: contractUrl || undefined
            });
            logger.info('Status change email sent successfully');
            setEmailSuccess(true);
          }

          // Send tracking email if tracking URL was added or changed
          const trackingAdded = !currentTrackingUrl && trackingUrl;
          const trackingChanged = currentTrackingUrl !== trackingUrl;
          if (trackingAdded || trackingChanged) {
            if (trackingUrl) {
              logger.info('Attempting to send tracking email', {
                email: saleData.user_email,
                saleId: saleId,
                trackingUrl: trackingUrl
              });
              await sendTrackingEmail({
                email: saleData.user_email,
                saleId: saleId,
                productName: saleData.name,
                trackingNumber: '', // Not used anymore, but kept for compatibility
                carrier: '', // Not used anymore, but kept for compatibility
                trackingUrl: trackingUrl,
                label_url: labelUrl || undefined,
                notes: notes.trim() || undefined,
                size: saleData.size,
                sku: saleData.sku,
                image_url: saleData.image_url,
                price: saleData.price,
                payout: effectivePayout,
                external_id: saleData.external_id,
                contract_url: contractUrl || undefined
              });
              logger.info('Tracking email sent successfully');
              setEmailSuccess(true);
            }
          }
        } catch (emailError: any) {
          logger.error('Failed to send email notification', {
            error: emailError,
            message: emailError?.message,
            stack: emailError?.stack,
            email: saleData.user_email,
            saleId: saleId
          });
          logger.error('Email error details:', emailError);
          // Show error to user but don't fail the save
          setError(`Warning: Email notification could not be sent: ${emailError?.message || 'Unknown error'}. Sale was saved successfully.`);
        }
      }
      
      // Auto close after 1.5 seconds on success
      setTimeout(() => {
        onClose();
      }, 1500);
      
    } catch (err: any) {
      logger.error('Error updating sales status', err);
      setError('Error updating: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Check if there are any changes to save
  const currentSaleDateStr = currentCreatedAt ? isoToLocalDateString(currentCreatedAt) : '';
  const currentDeliveredAtStr = currentDeliveredAt ? isoToLocalDateString(currentDeliveredAt) : '';
  const parsedPayout = parseMoneyInput(payoutInput);
  const payoutChanged = originalPayout !== null && (
    parsedPayout === null || Math.abs(roundMoney(parsedPayout) - originalPayout) > 0.0001
  );
  
  const hasChanges = 
    selectedStatus !== currentStatus || 
    externalId !== currentExternalId || 
    trackingUrl !== currentTrackingUrl ||
    labelUrl !== currentLabelUrl ||
    deliveredAt !== currentDeliveredAtStr ||
    saleDate !== currentSaleDateStr ||
    invoiceDate !== originalInvoiceDate ||
    payoutChanged ||
    notes.trim() !== originalNotes.trim();

  const primaryStatusFlow = ['accepted', 'processing', 'shipped', 'delivered', 'completed'];
  const exceptionStatuses = ['cancelled', 'returned'];

  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200/80 rounded-2xl p-4 animate-fade-in">
          <div className="flex items-center">
            <FaTimes className="text-red-500 mr-2.5 flex-shrink-0" />
            <p className="text-xs sm:text-sm text-red-800 font-medium">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 animate-fade-in">
          <div className="flex items-center">
            <FaCheckCircle className="text-emerald-500 mr-2.5 flex-shrink-0 text-base" />
            <p className="text-xs sm:text-sm text-emerald-800 font-semibold">Changes have been saved successfully!</p>
          </div>
          {emailSuccess && (
            <p className="text-xs text-emerald-700 mt-1.5 ml-6">Email notification has been sent to seller.</p>
          )}
        </div>
      )}

      {/* 1. Status Pipeline Flow */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/80 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Lifecycle Status</label>
            <p className="text-xs text-gray-400 mt-0.5">Click to advance sale stage</p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-500">Current:</span>
            <SalesStatusBadge status={currentStatus} />
            {currentIsManual && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-blue-500 text-white" title="Manual sale">
                M
              </span>
            )}
          </div>
        </div>

        {/* Primary Lifecycle Pipeline */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2 mb-3">
          {primaryStatusFlow.map((statusKey) => {
            const isSelected = selectedStatus === statusKey;
            const isCurrent = currentStatus === statusKey;
            return (
              <button
                key={statusKey}
                type="button"
                onClick={() => setSelectedStatus(statusKey)}
                className={`relative flex flex-col items-center justify-center py-2.5 px-2 rounded-xl border text-xs font-bold transition-all duration-150 ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-900/10'
                    : isCurrent
                    ? 'bg-slate-100 text-slate-900 border-slate-300'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                }`}
              >
                <span className="capitalize">{statusKey}</span>
                {isCurrent && (
                  <span className={`text-[9px] font-medium mt-0.5 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                    Active
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Exceptions & Terminal Statuses */}
        <div className="flex items-center justify-between pt-2.5 border-t border-gray-100">
          <span className="text-[11px] font-medium text-gray-400">Exceptions:</span>
          <div className="flex items-center gap-2">
            {exceptionStatuses.map((statusKey) => {
              const isSelected = selectedStatus === statusKey;
              return (
                <button
                  key={statusKey}
                  type="button"
                  onClick={() => setSelectedStatus(statusKey)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                    isSelected
                      ? statusKey === 'cancelled'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : 'bg-amber-600 text-white border-amber-600 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span className="capitalize">{statusKey}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Status Change Notice */}
        {selectedStatus !== currentStatus && (
          <div className="mt-3.5 flex items-center justify-between p-3 bg-amber-50 rounded-xl border border-amber-200/80">
            <div className="flex items-center space-x-2 text-xs font-semibold text-amber-900">
              <span>Status change pending:</span>
              <SalesStatusBadge status={currentStatus} />
              <FaArrowRight className="text-[10px] text-amber-600" />
              <SalesStatusBadge status={selectedStatus} />
            </div>
            <button
              type="button"
              onClick={() => setSelectedStatus(currentStatus)}
              className="text-[11px] font-medium text-amber-700 hover:underline"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* 2. Order & Financial Details */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/80 shadow-xs">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Order & Financial Details</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* External ID */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              External ID / Order Number
            </label>
            <input
              type="text"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder="e.g. AIR-001, ORD-12345..."
              className="block w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all text-sm font-mono text-gray-900"
            />
            <p className="mt-1 text-[11px] text-gray-400">Unique identifier for order synchronization</p>
          </div>

          {/* Consignor Payout */}
          <div>
            <label htmlFor={`sale-payout-${saleId}`} className="block text-xs font-semibold text-gray-700 mb-1.5">
              Consignor Payout
            </label>
            <div className="relative">
              <input
                id={`sale-payout-${saleId}`}
                type="text"
                inputMode="decimal"
                value={payoutInput}
                onChange={(event) => setPayoutInput(event.target.value)}
                placeholder="0.00"
                className="block w-full px-3.5 py-2.5 pr-14 bg-gray-50/50 border border-gray-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-sm font-bold text-gray-900"
              />
              <span className="absolute inset-y-0 right-3.5 flex items-center text-xs font-bold text-gray-400">EUR</span>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">Exact payout amount payable to the seller</p>
          </div>

          {/* Sale Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              <FaClock className="inline mr-1 text-gray-400" />
              Sale Date
            </label>
            <input
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              className="block w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all text-sm text-gray-900"
            />
            <p className="mt-1 text-[11px] text-gray-400">Date when the sale occurred</p>
          </div>

          {/* Delivery Date */}
          <div className={selectedStatus === 'delivered' ? 'p-3 bg-blue-50/60 rounded-xl border border-blue-200' : ''}>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              <FaBox className="inline mr-1 text-blue-500" />
              Delivery Date
            </label>
            <input
              type="date"
              value={deliveredAt}
              onChange={(e) => setDeliveredAt(e.target.value)}
              className="block w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm text-gray-900"
            />
            {currentPayoutDate ? (
              <div className="mt-2 text-[11px] text-blue-800 font-medium flex items-center justify-between">
                <span>Planned payout: {new Date(currentPayoutDate).toLocaleDateString('sk-SK')}</span>
                {new Date(currentPayoutDate) <= new Date() ? (
                  <span className="text-emerald-700 font-bold">Ready for payout</span>
                ) : (
                  <span className="text-blue-600">
                    {Math.ceil((new Date(currentPayoutDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))}d left
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-1 text-[11px] text-gray-400">14-day return period countdown starts upon delivery</p>
            )}
          </div>
        </div>
      </div>

      {/* 3. Shipping & Tracking */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/80 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <FaTruck className="text-xs" />
            </div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Shipping & Tracking</label>
          </div>
          {trackingUrl && (
            <a
              href={trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              <FaExternalLinkAlt className="mr-1 text-[10px]" />
              Open tracking link
            </a>
          )}
        </div>

        <div>
          <input
            type="url"
            value={trackingUrl}
            onChange={(e) => setTrackingUrl(e.target.value)}
            placeholder="https://tracking.dpd.de/... or https://posta.sk/..."
            className="block w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm text-gray-900"
          />
          <p className="mt-1 text-[11px] text-gray-400">Carrier package tracking URL for buyer & seller notifications</p>
        </div>
      </div>

      {/* 4. Documents Hub (Contract, Invoice FA, Shipping Label) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/80 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Documents Hub</label>
        </div>

        {/* Document Segmented Tabs */}
        <div className="flex items-center p-1 bg-gray-100 rounded-xl mb-4 gap-1">
          <button
            type="button"
            onClick={() => setDocTab('contract')}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 ${
              docTab === 'contract'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <FaFileContract className="text-[11px] text-blue-600" />
            <span>Contract PDF</span>
            {contractUrl && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>}
          </button>

          <button
            type="button"
            onClick={() => setDocTab('fa')}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 ${
              docTab === 'fa'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <FaFileInvoice className="text-[11px] text-emerald-600" />
            <span>Invoice (FA)</span>
            {faUrl && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>}
          </button>

          <button
            type="button"
            onClick={() => setDocTab('label')}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 ${
              docTab === 'label'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <FaFilePdf className="text-[11px] text-red-600" />
            <span>Shipping Label</span>
            {labelUrl && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>}
          </button>
        </div>

        {/* Tab 1: Contract PDF */}
        {docTab === 'contract' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Contract Date (for PDF)</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="block w-full sm:w-64 px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {contractUrl ? (
              <div className="flex items-center justify-between p-3.5 bg-blue-50/60 rounded-xl border border-blue-200">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <FaFileContract />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900">Purchase Agreement Generated</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <a
                        href={contractUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-blue-600 hover:underline inline-flex items-center"
                      >
                        <FaExternalLinkAlt className="mr-1 text-[9px]" /> Open PDF
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDownloadFile(contractUrl, `zmluva-${saleData?.external_id || saleId}.pdf`)}
                        className="text-xs font-semibold text-blue-600 hover:underline inline-flex items-center"
                      >
                        <FaDownload className="mr-1 text-[9px]" /> Download
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDeleteContract}
                  disabled={uploading}
                  className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  title="Delete contract"
                >
                  <FaTrash className="text-xs" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGenerateContract}
                disabled={generatingContract || !saleData || !userProfile}
                className="w-full inline-flex items-center justify-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
              >
                {generatingContract ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Generating PDF Contract...</span>
                  </>
                ) : (
                  <>
                    <FaFileContract className="mr-2" />
                    <span>Generate Purchase Agreement PDF</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Tab 2: FA Invoice */}
        {docTab === 'fa' && (
          <div>
            {faUrl ? (
              <div className="flex items-center justify-between p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-200">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
                    <FaFileInvoice />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900">FA Invoice Uploaded</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <a
                        href={faUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-emerald-700 hover:underline inline-flex items-center"
                      >
                        <FaExternalLinkAlt className="mr-1 text-[9px]" /> Open PDF
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDownloadFile(faUrl, `faktura-${saleData?.external_id || saleId}.pdf`)}
                        className="text-xs font-semibold text-emerald-700 hover:underline inline-flex items-center"
                      >
                        <FaDownload className="mr-1 text-[9px]" /> Download
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDeleteFa}
                  disabled={uploading}
                  className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  title="Delete FA"
                >
                  <FaTrash className="text-xs" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-gray-200 border-dashed rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                <FaUpload className="text-gray-400 text-xl mb-1.5" />
                <p className="text-xs text-gray-700 font-semibold">Click to upload FA Invoice PDF</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Maximum file size: 10MB</p>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFaUpload(file);
                    e.target.value = '';
                  }}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            )}
          </div>
        )}

        {/* Tab 3: Shipping Label */}
        {docTab === 'label' && (
          <div>
            {labelUrl ? (
              <div className="flex items-center justify-between p-3.5 bg-red-50/60 rounded-xl border border-red-200">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0">
                    <FaFilePdf />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900">Shipping Label Uploaded</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <a
                        href={labelUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-red-700 hover:underline inline-flex items-center"
                      >
                        <FaExternalLinkAlt className="mr-1 text-[9px]" /> Open PDF
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDownloadFile(labelUrl, `label-${saleData?.external_id || saleId}.pdf`)}
                        className="text-xs font-semibold text-red-700 hover:underline inline-flex items-center"
                      >
                        <FaDownload className="mr-1 text-[9px]" /> Download
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDeleteLabel}
                  disabled={uploading}
                  className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  title="Delete Label"
                >
                  <FaTrash className="text-xs" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-gray-200 border-dashed rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                <FaUpload className="text-gray-400 text-xl mb-1.5" />
                <p className="text-xs text-gray-700 font-semibold">Click to upload Shipping Label PDF</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Maximum file size: 10MB</p>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                    e.target.value = '';
                  }}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            )}
          </div>
        )}
      </div>

      {/* 5. Notification & Internal Notes */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/80 shadow-xs space-y-4">
        {/* Send Email Toggle */}
        {saleData && saleData.user_email && saleData.user_email !== 'N/A' && (
          <label className="flex items-center space-x-3 cursor-pointer select-none">
            <input
              type="checkbox"
              id="sendEmail"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="w-4 h-4 text-slate-900 border-gray-300 rounded focus:ring-slate-900 cursor-pointer"
            />
            <span className="text-xs sm:text-sm font-medium text-gray-800 flex items-center">
              <FaEnvelope className="mr-1.5 text-gray-400 text-xs" />
              Send automated email notification to <span className="font-semibold ml-1 text-gray-900">{saleData.user_email}</span>
            </span>
          </label>
        )}

        {/* Note textarea */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
            <FaStickyNote className="inline mr-1 text-gray-400" />
            Internal Note / Status Comment
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add internal note or specifics about this status change..."
            rows={3}
            className="block w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 text-xs sm:text-sm text-gray-900 resize-none"
          />
          <div className="flex justify-between items-center mt-1 text-[11px] text-gray-400">
            <span>Visible to administrators in the operation log</span>
            <span>{notes.length} characters</span>
          </div>
        </div>
      </div>

      {/* 6. Status History (Collapsible Accordion) */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => setShowTimeline(!showTimeline)}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
        >
          <div className="flex items-center space-x-2">
            <FaClock className="text-xs text-gray-400" />
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Status Change History</span>
          </div>
          {showTimeline ? <FaChevronUp className="text-xs text-gray-400" /> : <FaChevronDown className="text-xs text-gray-400" />}
        </button>

        {showTimeline && (
          <div className="p-4 pt-0 border-t border-gray-100">
            <SalesStatusTimeline 
              saleId={saleId} 
              currentStatus={selectedStatus}
              saleCreatedAt={saleData?.created_at || currentCreatedAt}
            />
          </div>
        )}
      </div>

      {/* 7. Action Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-200 gap-3">
        {onDelete ? (
          <button
            type="button"
            onClick={handleDeleteSale}
            disabled={saving || deleting}
            className="inline-flex items-center px-3.5 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-semibold rounded-xl transition text-xs border border-rose-200 disabled:opacity-50"
          >
            <FaTrash className="mr-1.5 text-xs" />
            <span>{deleting ? 'Deleting...' : 'Delete Sale'}</span>
          </button>
        ) : <div />}

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving || deleting}
            className="px-4 py-2.5 text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || saving || deleting}
            className={`inline-flex items-center justify-center px-5 py-2.5 text-xs font-bold rounded-xl transition-all shadow-sm ${
              hasChanges && !saving
                ? 'bg-slate-900 text-white hover:bg-slate-800'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {saving ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <FaSave className="mr-1.5 text-xs" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
