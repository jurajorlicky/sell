import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import SalesStatusBadge from './SalesStatusBadge';
import SalesStatusTimeline from './SalesStatusTimeline';
import { sendStatusChangeEmail, sendTrackingEmail } from '../lib/email';
import { logger } from '../lib/logger';
import { generatePurchaseAgreement, uploadContractToStorage } from '../lib/pdfGenerator';
import { FaSave, FaStickyNote, FaTruck, FaBox, FaLink, FaTimes, FaPlus, FaEdit, FaFilePdf, FaUpload, FaTrash, FaClock, FaFileContract } from 'react-icons/fa';

interface AdminSalesStatusManagerProps {
  saleId: string;
  currentStatus: string;
  currentExternalId?: string;
  currentTrackingUrl?: string;
  currentLabelUrl?: string;
  currentDeliveredAt?: string;
  currentPayoutDate?: string;
  currentCreatedAt?: string;
  currentIsManual?: boolean;
  onStatusUpdate: (newStatus: string) => void;
  onExternalIdUpdate: (newExternalId: string) => void;
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

export default function AdminSalesStatusManager({ 
  saleId, 
  currentStatus, 
  currentExternalId = '', 
  currentTrackingUrl = '',
  currentLabelUrl = '',
  currentDeliveredAt = '',
  currentPayoutDate = '',
  currentCreatedAt = '',
  currentIsManual = false,
  onStatusUpdate, 
  onExternalIdUpdate,
  onClose,
  onDelete
}: AdminSalesStatusManagerProps) {
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
  const [sendEmail, setSendEmail] = useState(true); // Default: send email
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [saleData, setSaleData] = useState<{ name: string; user_email: string; sku?: string; price: number; payout: number; external_id?: string; user_id?: string; created_at?: string; size?: string; image_url?: string; is_manual?: boolean; product_id?: string } | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [generatingContract, setGeneratingContract] = useState(false);
  const [contractUrl, setContractUrl] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load existing notes and sale data on mount
  useEffect(() => {
    const loadExistingData = async () => {
      try {
        logger.debug('Loading existing sale data', { saleId });
        const { data, error } = await supabase
          .from('user_sales')
          .select('status_notes, tracking_url, label_url, name, user_id, sku, price, payout, external_id, created_at, contract_url, size, is_manual, image_url, product_id, invoice_date, profiles(email)')
          .eq('id', saleId)
          .single();

        if (!error && data) {
          const loadedNotes = data.status_notes || '';
          setNotes(loadedNotes);
          setOriginalNotes(loadedNotes); // Store original notes for comparison
          if (data.tracking_url) setTrackingUrl(data.tracking_url);
          if (data.label_url) setLabelUrl(data.label_url);
          if (data.contract_url) setContractUrl(data.contract_url);
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
            product_id: data.product_id // Add product_id for invoice sale lookup
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

  const handleFileUpload = async (file: File) => {
    console.log('handleFileUpload called', { file, fileName: file?.name, fileType: file?.type, fileSize: file?.size });
    
    if (!file) {
      console.error('No file provided');
      setError('Žiadny súbor nebol vybraný');
      return;
    }
    
    if (file.type !== 'application/pdf') {
      console.warn('Invalid file type', { fileType: file.type });
      setError('Please upload a PDF file. Selected type: ' + file.type);
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      console.warn('File too large', { fileSize: file.size });
      setError('Súbor je príliš veľký. Maximálna veľkosť je 10MB');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      logger.info('Uploading label PDF', { saleId, fileName: file.name, fileSize: file.size });
      console.log('Starting upload process', { saleId, fileName: file.name, fileSize: file.size });

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

      console.log('Attempting to upload file', { filePath, bucket: 'labels' });
      
      // Try to upload directly - if bucket doesn't exist, we'll get an error
      // Note: listBuckets() might not work due to permissions, so we try upload first
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('labels')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true // Allow overwriting if file exists
        });

      console.log('Upload result', { uploadData, uploadError });

      if (uploadError) {
        logger.error('Upload error details', { uploadError, filePath });
        console.error('Upload failed', { 
          error: uploadError, 
          message: uploadError.message,
          errorDetails: JSON.stringify(uploadError, null, 2)
        });
        
        // Provide more specific error messages
        if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('not found')) {
          throw new Error('Storage bucket "labels" does not exist. Please create it in Supabase Dashboard > Storage > Create Bucket.');
        } else if (uploadError.message?.includes('new row violates row-level security') || uploadError.message?.includes('row-level security')) {
          throw new Error('Nemáte oprávnenie na nahrávanie súborov. Skontrolujte RLS policies v Storage > labels > Policies. Bucket musí byť public alebo musíte mať správne nastavené policies.');
        } else if (uploadError.message?.includes('JWT')) {
          throw new Error('Authentication error. Please sign out and sign in again.');
        } else {
          throw new Error(`Upload error: ${uploadError.message || JSON.stringify(uploadError)}`);
        }
      }
      
      console.log('File uploaded successfully', { uploadData });

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('labels')
        .getPublicUrl(filePath);

      console.log('Public URL generated', { urlData });

      const newLabelUrl = urlData.publicUrl;
      setLabelUrl(newLabelUrl);
      logger.info('Label uploaded successfully', { newLabelUrl, filePath });
      console.log('Label URL set in state', { newLabelUrl });

      // Update database
      console.log('Updating database with label_url', { saleId, newLabelUrl });
      const { error: updateError } = await supabase
        .from('user_sales')
        .update({ label_url: newLabelUrl, updated_at: new Date().toISOString() })
        .eq('id', saleId);

      if (updateError) {
        logger.error('Database update error', updateError);
        console.error('Database update failed', updateError);
        throw new Error('Error saving URL to database: ' + updateError.message);
      }
      logger.info('Label URL saved to database');
      console.log('Database updated successfully');
      
      // Show success message
      setError(null);
      setSuccess(true);
      
    } catch (err: any) {
      logger.error('Error uploading label', err);
      console.error('Upload error caught', { 
        error: err, 
        message: err.message, 
        stack: err.stack,
        errorString: JSON.stringify(err, null, 2)
      });
      const errorMessage = err.message || 'Neznáma chyba pri nahrávaní PDF';
      setError(errorMessage);
    } finally {
      setUploading(false);
      console.log('Upload process finished');
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
    
    if (!confirm(`Naozaj chcete odstrániť tento predaj? Táto akcia je nevratná a odstráni aj všetky súvisiace súbory (label, zmluva).`)) {
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
              console.warn('Failed to delete label from storage:', deleteError);
            }
          }
        } catch (err) {
          console.warn('Error deleting label from storage:', err);
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
            console.warn('Failed to delete contract from storage:', deleteError);
          }
        } catch (err) {
          console.warn('Error deleting contract from storage:', err);
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

      // Extract path from URL - file is stored as contracts/{saleId}.pdf
      let filePath = `contracts/${saleId}.pdf`;
      if (contractUrl.includes('/storage/v1/object/public/contracts/')) {
        // Full public URL - extract the filename
        const urlParts = contractUrl.split('/contracts/');
        if (urlParts.length > 1) {
          filePath = `contracts/${urlParts[1].split('?')[0]}`; // Remove query params if any
        }
      } else if (contractUrl.includes('/contracts/')) {
        // Partial URL
        const urlParts = contractUrl.split('/contracts/');
        if (urlParts.length > 1) {
          filePath = `contracts/${urlParts[1].split('?')[0]}`; // Remove query params if any
        }
      }

      // Delete from storage bucket
      logger.info('Deleting contract from storage', { filePath, bucket: 'contracts' });
      const { error: deleteError } = await supabase.storage
        .from('contracts')
        .remove([filePath]);

      if (deleteError) {
        logger.error('Failed to delete contract from storage', deleteError);
        throw new Error(`Error deleting file from storage: ${deleteError.message}`);
      } else {
        logger.info('Contract deleted from storage successfully', { filePath });
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

  const handleSave = async () => {
    // Compare dates properly - extract date part from both for comparison
    const currentSaleDateStr = currentCreatedAt ? isoToLocalDateString(currentCreatedAt) : '';
    const currentDeliveredAtStr = currentDeliveredAt ? isoToLocalDateString(currentDeliveredAt) : '';
    
    const hasChanges = 
      selectedStatus !== currentStatus || 
      externalId !== currentExternalId || 
      trackingUrl !== currentTrackingUrl ||
      labelUrl !== currentLabelUrl ||
      deliveredAt !== currentDeliveredAtStr ||
      saleDate !== currentSaleDateStr ||
      invoiceDate !== originalInvoiceDate ||
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
      
      // Update original invoice date after successful save
      if (invoiceDate !== originalInvoiceDate) {
        setOriginalInvoiceDate(invoiceDate);
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
      setSuccess(true);
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
              payout: saleData.payout,
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
                payout: saleData.payout,
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
          console.error('Email error details:', emailError);
          // Show error to user but don't fail the save
          setError(`Upozornenie: Email notifikácia sa nepodarila odoslať: ${emailError?.message || 'Neznáma chyba'}. Predaj bol uložený úspešne.`);
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
      setDeleting(false);
    }
  };

  // Check if there are any changes to save
  const currentSaleDateStr = currentCreatedAt ? isoToLocalDateString(currentCreatedAt) : '';
  const currentDeliveredAtStr = currentDeliveredAt ? isoToLocalDateString(currentDeliveredAt) : '';
  
  const hasChanges = 
    selectedStatus !== currentStatus || 
    externalId !== currentExternalId || 
    trackingUrl !== currentTrackingUrl ||
    labelUrl !== currentLabelUrl ||
    deliveredAt !== currentDeliveredAtStr ||
    saleDate !== currentSaleDateStr ||
    invoiceDate !== originalInvoiceDate ||
    notes.trim() !== originalNotes.trim();

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 animate-fade-in">
          <div className="flex items-center">
            <FaTimes className="text-red-500 mr-2" />
            <p className="text-sm text-red-800 font-medium">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 animate-fade-in">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm text-green-800 font-medium">Zmeny boli úspešne uložené!</p>
          </div>
          {emailSuccess && (
            <p className="text-xs text-green-700 mt-2 ml-7">Email notifikácia bola odoslaná.</p>
          )}
        </div>
      )}

      {/* Current Status Display */}
      <div className="bg-gradient-to-r from-slate-50 to-white rounded-xl p-4 border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">Aktuálny status</p>
            <div className="flex items-center space-x-2">
            <SalesStatusBadge status={currentStatus} />
              {currentIsManual && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold bg-blue-500 text-white" title="Manuálna sale">
                  M
                </span>
              )}
            </div>
          </div>
          {currentExternalId && (
            <div className="text-right">
              <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">External ID</p>
              <p className="text-sm font-semibold text-gray-900 font-mono">{currentExternalId}</p>
            </div>
          )}
        </div>
      </div>

      {/* Status Selection */}
      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <label className="block text-sm font-semibold text-gray-900 mb-3">
          Status predaja
        </label>
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="block w-full px-4 py-3 bg-white border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-gray-900"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {selectedStatus !== currentStatus && (
          <div className="mt-3 flex items-center space-x-2 p-3 bg-green-50 rounded-lg border border-green-200">
            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium text-green-800">Zmena statusu:</span>
            <SalesStatusBadge status={selectedStatus} />
          </div>
        )}
      </div>

      {/* Sale Date (always editable) */}
      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <label className="block text-sm font-semibold text-gray-900 mb-3">
          <FaClock className="inline mr-2 text-gray-700" />
          Sale Date
        </label>
        <input
          type="date"
          value={saleDate}
          onChange={(e) => setSaleDate(e.target.value)}
          className="block w-full px-4 py-3 bg-white border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900"
        />
        <p className="text-xs text-gray-600 mt-2">
          Date when the sale was created.
        </p>
      </div>

      {/* Delivery Date & Payout Date */}
      {selectedStatus === 'delivered' && (
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <label className="block text-sm font-semibold text-gray-900 mb-3">
            <FaBox className="inline mr-2 text-gray-700" />
            Delivery Date
          </label>
          <input
            type="date"
            value={deliveredAt}
            onChange={(e) => setDeliveredAt(e.target.value)}
            className="block w-full px-4 py-3 bg-white border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900"
          />
          <p className="text-xs text-gray-600 mt-2">
            Payout will be automatically paid 14 days after delivery (if the item is not returned).
          </p>
          {currentPayoutDate && (
            <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-gray-600 mb-1">Plánovaný dátum vyplatenia:</p>
              <p className="text-sm font-semibold text-blue-900">
                {new Date(currentPayoutDate).toLocaleDateString('sk-SK', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                })}
              </p>
              {new Date(currentPayoutDate) > new Date() && (
                <p className="text-xs text-gray-600 mt-1">
                  {Math.ceil((new Date(currentPayoutDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} days remaining
                </p>
              )}
              {new Date(currentPayoutDate) <= new Date() && (
                <p className="text-xs text-green-600 mt-1 font-medium">
                  Payout is ready for payment
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* External ID */}
      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <label className="block text-sm font-semibold text-gray-900 mb-3">
          <FaBox className="inline mr-2 text-gray-700" />
          External ID / Order Number
        </label>
        <input
          type="text"
          value={externalId}
          onChange={(e) => setExternalId(e.target.value)}
          placeholder="napr. AIR-001, ORD-12345..."
          className="block w-full px-4 py-3 bg-white border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-gray-900 font-mono"
        />
        <p className="mt-2 text-xs text-gray-600">Internal order identification number</p>
      </div>

      {/* Tracking Information */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
        <div className="flex items-center mb-4">
          <FaTruck className="text-blue-600 mr-2" />
          <label className="block text-sm font-semibold text-gray-900">
            Tracking Information
          </label>
        </div>
        
        <div className="space-y-4">
          {/* Tracking URL */}
          <div>
            <label className="block text-xs font-medium text-gray-800 mb-2">
              <FaLink className="inline mr-1" />
              Tracking URL
            </label>
            <input
              type="url"
              value={trackingUrl}
              onChange={(e) => setTrackingUrl(e.target.value)}
              placeholder="https://..."
              className="block w-full px-4 py-3 bg-white border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900"
            />
            {trackingUrl && (
              <a
                href={trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                <FaLink className="mr-1" />
                Open tracking link
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Contract PDF Generation */}
      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <label className="block text-sm font-semibold text-gray-900 mb-3">
          <FaFileContract className="inline mr-2 text-blue-600" />
          PDF Contract (Purchase Agreement)
        </label>
        
        {/* Contract Date Input */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-900 mb-3">
            <FaClock className="inline mr-2 text-gray-700" />
            Contract Date (for PDF/Invoice)
          </label>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            className="block w-full px-4 py-3 bg-white border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900"
          />
          <p className="text-xs text-gray-600 mt-2">
            Date to display in the contract PDF. This will be saved to the invoice sale record.
          </p>
        </div>
        
        {contractUrl ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center space-x-3">
                <FaFileContract className="text-blue-600 text-xl" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Contract is generated</p>
                  <a
                    href={contractUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Open PDF
                  </a>
                </div>
              </div>
              <button
                onClick={handleDeleteContract}
                disabled={uploading}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                title="Delete contract"
              >
                <FaTrash />
              </button>
            </div>
            {uploading && (
              <p className="text-xs text-gray-600">Deleting...</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={async () => {
                if (!saleData || !userProfile) {
                  setError('Error: Sale or user data not loaded');
                  return;
                }
                
                try {
                  setGeneratingContract(true);
                  setError(null);
                  
                  // Format seller address
                  // Format: "Ulica číslo, PSC Mesto, Krajina"
                  // Combine address and popisne_cislo without duplication (ulica číslo)
                  const addressBase = (userProfile.address || '').trim();
                  const houseNumber = (userProfile.popisne_cislo || '').trim();
                  const addressHasNumber =
                    houseNumber.length > 0 &&
                    addressBase.toLowerCase().includes(houseNumber.toLowerCase());
                  const streetAndNumber = [addressBase, addressHasNumber ? '' : houseNumber]
                    .filter(Boolean)
                    .join(' ');
                  
                  // Build address parts: ulica číslo, PSC Mesto, Krajina
                  const addressParts = [];
                  if (streetAndNumber) {
                    addressParts.push(streetAndNumber);
                  }
                  if (userProfile.psc && userProfile.mesto) {
                    addressParts.push(`${userProfile.psc} ${userProfile.mesto}`);
                  } else if (userProfile.mesto) {
                    addressParts.push(userProfile.mesto);
                  }
                  if (userProfile.krajina) {
                    addressParts.push(userProfile.krajina);
                  } else {
                    addressParts.push('Slovakia');
                  }
                  
                  const sellerAddress = addressParts.join(', ');

                  // Format buyer address (AirKicks company info - can be configured)
                  const buyerAddress = 'Lysica 336, 013 05 Lysica, SLOVAKIA';
                  
                  // Use invoice date for PDF, fallback to sale date if not set
                  const contractDateISO = invoiceDate 
                    ? new Date(invoiceDate + 'T12:00:00').toISOString()
                    : (saleData.created_at || new Date().toISOString());
                  
                  // Generate form ID from contract date
                  const contractDateObj = new Date(contractDateISO);
                  const formId = contractDateObj.toISOString().split('T')[0].replace(/-/g, '');
                  
                  // Load buyer signature from admin settings
                  const { data: adminSettings } = await supabase
                    .from('admin_settings')
                    .select('buyer_signature_url')
                    .single();
                  
                  // Generate PDF with new format
                  const pdfBlob = await generatePurchaseAgreement({
                    saleId: saleId,
                    externalId: saleData.external_id || undefined,
                    formId: formId,
                    productName: saleData.name,
                    size: saleData.size || '',
                    price: saleData.price,
                    isManual: saleData.is_manual || false,
                    payout: saleData.payout,
                    // Buyer (Company - AirKicks)
                    buyerName: 'Juraj Orlicky ml.',
                    buyerCIN: '55702660',
                    buyerAddress: buyerAddress,
                    buyerEmail: 'info@airkicks.eu',
                    buyerSignatureUrl: adminSettings?.buyer_signature_url || undefined,
                    // Seller (User/Consignor)
                    sellerName: userProfile.first_name || '',
                    sellerSurname: userProfile.last_name || '',
                    sellerCIN: userProfile.ico || undefined,
                    sellerAddress: sellerAddress,
                    sellerEmail: userProfile.email || saleData.user_email,
                    sellerPhone: userProfile.telephone || undefined,
                    sellerIBAN: userProfile.iban || undefined,
                    sellerSignatureUrl: userProfile.signature_url || undefined,
                    // Location and Date - use invoice date for contract
                    location: userProfile.mesto || 'Slovakia',
                    saleDate: contractDateISO
                  });
                  
                  // Upload to storage
                  const url = await uploadContractToStorage(saleId, pdfBlob);
                  
                  // Update database
                  const { error: updateError } = await supabase
                    .from('user_sales')
                    .update({ contract_url: url })
                    .eq('id', saleId);
                  
                  if (updateError) throw updateError;
                  
                  setContractUrl(url);
                  setSuccess(true);
                  logger.info('Contract PDF generated successfully', { saleId, url });
                } catch (err: any) {
                  logger.error('Error generating contract', err);
                  setError('Error generating contract PDF: ' + (err.message || 'Unknown error'));
                } finally {
                  setGeneratingContract(false);
                }
              }}
              disabled={generatingContract || !saleData || !userProfile}
              className="w-full inline-flex items-center justify-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generatingContract ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generuje sa...
                </>
              ) : (
                <>
                  <FaFileContract className="mr-2" />
                  Vygenerovať PDF zmluvu
                </>
              )}
            </button>
            <p className="text-xs text-gray-500">Vygeneruje PDF zmluvu s informáciami o predaji</p>
          </div>
        )}
      </div>

      {/* Label PDF Upload */}
      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <label className="block text-sm font-semibold text-gray-900 mb-3">
          <FaFilePdf className="inline mr-2 text-red-600" />
          Label PDF
        </label>
        
        {labelUrl ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center space-x-3">
                <FaFilePdf className="text-red-600 text-xl" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Label je nahraný</p>
                  <a
                    href={labelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Otvoriť PDF
                  </a>
                </div>
              </div>
              <button
                onClick={handleDeleteLabel}
                disabled={uploading}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                title="Zmazať label"
              >
                <FaTrash />
              </button>
            </div>
            {uploading && (
              <p className="text-xs text-gray-600">Maže sa...</p>
          )}
        </div>
        ) : (
          <div className="space-y-3">
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <FaUpload className="text-gray-400 text-2xl mb-2" />
                <p className="text-sm text-gray-600 font-medium">Kliknite pre nahranie PDF</p>
                <p className="text-xs text-gray-500 mt-1">alebo presuňte súbor sem</p>
              </div>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  console.log('File input changed', { files: e.target.files, fileCount: e.target.files?.length });
                  const file = e.target.files?.[0];
                  console.log('Selected file', { file, fileName: file?.name, fileType: file?.type, fileSize: file?.size });
                  if (file) {
                    handleFileUpload(file);
                  } else {
                    console.warn('No file selected');
                    setError('Žiadny súbor nebol vybraný');
                  }
                  // Reset input to allow selecting same file again
                  e.target.value = '';
                }}
                disabled={uploading}
                className="hidden"
                id="label-pdf-upload"
              />
            </label>
            {uploading && (
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Nahráva sa...</span>
              </div>
            )}
            <p className="text-xs text-gray-500">Maximálna veľkosť: 10MB</p>
          </div>
        )}
      </div>

      {/* Send Email Toggle */}
      {saleData && saleData.user_email && saleData.user_email !== 'N/A' && (
        <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <input
            type="checkbox"
            id="sendEmail"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 focus:ring-2"
          />
          <label htmlFor="sendEmail" className="text-sm font-medium text-gray-900 cursor-pointer">
            Send email notification to {saleData.user_email}
          </label>
        </div>
      )}

      {/* Notes */}
      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <label className="block text-sm font-semibold text-gray-900 mb-3">
          <FaStickyNote className="inline mr-2 text-gray-700" />
          Poznámka (voliteľné)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Pridajte poznámku k zmene statusu, tracking informáciám alebo ďalšie detaily..."
          rows={4}
          className="block w-full px-4 py-3 bg-white border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none text-gray-900"
        />
        <p className="mt-2 text-xs text-gray-600">{notes.length} znakov</p>
      </div>

      {/* Status History */}
      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
          <FaClock className="mr-2 text-gray-600" />
          História zmien statusu
        </h4>
        <SalesStatusTimeline 
          saleId={saleId} 
          currentStatus={selectedStatus}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between pt-3 sm:pt-4 border-t border-gray-200 gap-2 sm:gap-0">
        {onDelete && (
          <button
            onClick={handleDeleteSale}
            disabled={saving || deleting}
            className="inline-flex items-center justify-center px-3 sm:px-4 py-2 sm:py-2.5 text-red-600 font-medium rounded-lg sm:rounded-xl hover:bg-red-50 transition-colors border border-red-300 disabled:opacity-50 text-sm sm:text-base order-3 sm:order-1"
          >
            {deleting ? (
              <svg className="animate-spin -ml-1 mr-1.5 sm:mr-2 h-4 w-4 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <FaTrash className="mr-1.5 sm:mr-2 text-sm sm:text-base" />
            )}
            <span className="text-xs sm:text-base">Delete Sale</span>
          </button>
        )}
        <div className="flex items-center space-x-2 sm:space-x-3 order-1 sm:order-2 flex-1 sm:flex-initial justify-end sm:ml-auto">
        <button
          onClick={onClose}
            disabled={saving || deleting}
            className="px-3 sm:px-4 py-2 sm:py-2.5 text-gray-800 font-medium rounded-lg sm:rounded-xl hover:bg-gray-100 transition-colors border border-gray-300 disabled:opacity-50 text-sm sm:text-base flex-1 sm:flex-initial"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
            disabled={!hasChanges || saving || deleting}
            className="inline-flex items-center justify-center px-4 sm:px-6 py-2 sm:py-2.5 bg-black text-white font-semibold rounded-lg sm:rounded-xl hover:bg-gray-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transform hover:scale-105 text-sm sm:text-base flex-1 sm:flex-initial"
        >
          {saving ? (
            <>
                <svg className="animate-spin -ml-1 mr-1.5 sm:mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
                <span className="text-xs sm:text-base">Saving...</span>
            </>
          ) : (
            <>
                <FaSave className="mr-1.5 sm:mr-2 text-sm sm:text-base" />
                <span className="text-xs sm:text-base">Save Changes</span>
            </>
          )}
        </button>
        </div>
      </div>
    </div>
  );
}