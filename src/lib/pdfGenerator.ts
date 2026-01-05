import jsPDF from 'jspdf';

export interface PurchaseAgreementData {
  saleId: string;
  externalId?: string; // SALE ID to display
  formId: string; // Format: YYYYMMDD
  productName: string;
  size: string;
  price: number;
  isManual?: boolean; // If true, use payout instead of price and show "Payout" label
  payout?: number; // Payout amount for manual sales
  // Buyer (Company - AirKicks)
  buyerName: string;
  buyerCIN?: string;
  buyerAddress: string;
  buyerEmail: string;
  // Seller (User/Consignor)
  sellerName: string;
  sellerSurname: string;
  sellerCIN?: string;
  sellerAddress: string;
  sellerEmail: string;
  sellerPhone?: string;
  sellerIBAN?: string;
  // Date and Location
  location: string;
  saleDate: string;
  // Signature URLs (optional)
  sellerSignatureUrl?: string;
  buyerSignatureUrl?: string;
}

export async function generatePurchaseAgreement(data: PurchaseAgreementData): Promise<Blob> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      let yPos = margin;

      // Helper function to add text with word wrap
      const addText = (text: string, x: number, y: number, maxWidth: number, fontSize: number = 10, align: 'left' | 'center' | 'right' = 'left', fontStyle: 'normal' | 'bold' | 'italic' = 'normal') => {
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', fontStyle);
        const lines = doc.splitTextToSize(text, maxWidth);
        doc.text(lines, x, y, { align });
        return y + (lines.length * fontSize * 0.35);
      };

      // Helper to draw a simple swoosh/logo (text-based)
      const drawLogo = (x: number, y: number) => {
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('AirKicks', x, y);
        // Draw a simple swoosh line
        doc.setLineWidth(0.5);
        doc.setDrawColor(0, 0, 0);
        doc.line(x, y + 2, x + 30, y + 2);
        doc.line(x + 30, y + 2, x + 35, y - 1);
      };

      // Helper to load and add image
      const loadImage = (url: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = url;
        });
      };

      // Logo and Title
      drawLogo(margin, yPos);
      yPos += 15;

      // Title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      yPos = addText('PURCHASE AGREEMENT', pageWidth / 2, yPos, pageWidth - 2 * margin, 18, 'center', 'bold');
      yPos += 5;

      // Form ID (external ID)
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const formIdText = data.externalId ? `FORM ID: ${data.externalId}` : `FORM ID: ${data.formId}`;
      yPos = addText(formIdText, pageWidth / 2, yPos, pageWidth - 2 * margin, 10, 'center', 'normal');
      yPos += 15;

      // BUYER Section
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      yPos = addText('BUYER:', margin, yPos, pageWidth - 2 * margin, 12, 'left', 'bold');
      yPos += 4;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      yPos = addText(`Name: ${data.buyerName}`, margin + 5, yPos, pageWidth - 2 * margin, 10, 'left', 'normal');
      yPos += 4;

      if (data.buyerCIN) {
        yPos = addText(`CIN: ${data.buyerCIN}`, margin + 5, yPos, pageWidth - 2 * margin, 10, 'left', 'normal');
        yPos += 4;
        yPos = addText(`VAT ID: SK1129259846`, margin + 5, yPos, pageWidth - 2 * margin, 10, 'left', 'normal');
        yPos += 4;
      } else {
        yPos = addText(`VAT ID: SK1129259846`, margin + 5, yPos, pageWidth - 2 * margin, 10, 'left', 'normal');
        yPos += 4;
      }

      yPos = addText(`Address: ${data.buyerAddress}`, margin + 5, yPos, pageWidth - 2 * margin, 10, 'left', 'normal');
      yPos += 4;

      yPos = addText(`Email: ${data.buyerEmail}`, margin + 5, yPos, pageWidth - 2 * margin, 10, 'left', 'normal');
      yPos += 10;

      // SELLER Section
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      yPos = addText('SELLER:', margin, yPos, pageWidth - 2 * margin, 12, 'left', 'bold');
      yPos += 4;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      yPos = addText(`Name and Surname: ${data.sellerName} ${data.sellerSurname}`.trim(), margin + 5, yPos, pageWidth - 2 * margin, 10, 'left', 'normal');
      yPos += 4;

      if (data.sellerCIN) {
        yPos = addText(`CIN: ${data.sellerCIN}`, margin + 5, yPos, pageWidth - 2 * margin, 10, 'left', 'normal');
        yPos += 4;
      }

      yPos = addText(`Address: ${data.sellerAddress}`, margin + 5, yPos, pageWidth - 2 * margin, 10, 'left', 'normal');
      yPos += 4;

      yPos = addText(`Email: ${data.sellerEmail}`, margin + 5, yPos, pageWidth - 2 * margin, 10, 'left', 'normal');
      yPos += 4;

      if (data.sellerPhone) {
        yPos = addText(`Phone: ${data.sellerPhone}`, margin + 5, yPos, pageWidth - 2 * margin, 10, 'left', 'normal');
        yPos += 4;
      }

      if (data.sellerIBAN) {
        yPos = addText(`IBAN: ${data.sellerIBAN}`, margin + 5, yPos, pageWidth - 2 * margin, 10, 'left', 'normal');
        yPos += 4;
      }

      yPos += 8;

      // SUBJECT OF THE PURCHASE AGREEMENT
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      yPos = addText('SUBJECT OF THE PURCHASE AGREEMENT:', margin, yPos, pageWidth - 2 * margin, 12, 'left', 'bold');
      yPos += 6;

      // Table
      const tableStartY = yPos;
      const col1X = margin + 5;
      const col2X = pageWidth / 2;
      const col3X = pageWidth - margin - 30;
      const rowHeight = 8;

      // Table headers
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('THE GOODS', col1X, yPos);
      doc.text('SIZE', col2X, yPos);
      // Always use "PRICE IN €" label, but use payout value for manual sales
      doc.text('PRICE IN €', col3X, yPos);
      yPos += rowHeight;

      // Table line
      doc.setLineWidth(0.5);
      doc.setDrawColor(0, 0, 0);
      doc.line(margin, yPos - 2, pageWidth - margin, yPos - 2);
      yPos += 2;

      // Table data
      doc.setFont('helvetica', 'normal');
      doc.text(data.productName, col1X, yPos);
      doc.text(data.size, col2X, yPos);
      // Always use payout value (what consignor receives), fallback to price if payout not available
      // Round to 2 decimal places: if decimal part >= 0.50, round up, otherwise round down
      let displayAmount = data.payout !== undefined ? data.payout : data.price;
      displayAmount = Math.round(displayAmount * 100) / 100;
      doc.text(displayAmount.toFixed(2), col3X, yPos);
      yPos += rowHeight + 5;

      // Terms
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      yPos = addText('By signing, you agree to the terms of the purchase agreement and acknowledge the processing of personal data.', margin, yPos, pageWidth - 2 * margin, 9, 'left', 'normal');
      yPos += 4;

      yPos = addText('The goods are invoiced under the special VAT regime - used goods (Section 74(1)(n) of the VAT Act).', margin, yPos, pageWidth - 2 * margin, 9, 'left', 'normal');
      yPos += 8;

      // Location and Date
      const saleDateObj = new Date(data.saleDate);
      const formattedDate = saleDateObj.toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const locationDate = `${data.location}, ${formattedDate}`;
      yPos = addText(locationDate, margin, yPos, pageWidth - 2 * margin, 10, 'left', 'normal');
      yPos += 12;

      // Signature lines
      yPos += 3; // Add small space before signatures
      const signatureY = yPos;
      const signatureWidth = (pageWidth - 2 * margin) / 2 - 10;
      const signatureHeight = 50; // Increased height to show full signature

      // SELLER SIGNATURE
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('SELLER SIGNATURE:', margin, signatureY, { align: 'left' });
      const signatureLineY = signatureY + 28; // Increased space from label to line to avoid overlap

      // Signature line
      doc.setLineWidth(0.5);
      doc.line(margin, signatureLineY, margin + signatureWidth, signatureLineY);
      
      // Add seller signature image if available
      let sellerSignatureY = signatureLineY;
      if (data.sellerSignatureUrl) {
        try {
          const img = await loadImage(data.sellerSignatureUrl);
          const imgWidth = signatureWidth - 2;
          const imgHeight = (img.height / img.width) * imgWidth;
          const maxHeight = signatureHeight;
          const finalHeight = Math.min(imgHeight, maxHeight);
          const finalWidth = (img.width / img.height) * finalHeight;
          
          // Place image on the line (image bottom aligns with the line)
          doc.addImage(img, 'PNG', margin + 1, signatureLineY - finalHeight + 2, finalWidth, finalHeight);
          sellerSignatureY = signatureLineY + 3; // Small space after image
        } catch (err) {
          console.error('Error loading seller signature:', err);
          sellerSignatureY = signatureLineY + 5;
        }
      } else {
        sellerSignatureY = signatureLineY + 3; // Small space if no signature
      }

      // BUYER SIGNATURE (on the right)
      const buyerSignatureX = pageWidth / 2 + 10;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('BUYER SIGNATURE:', buyerSignatureX, signatureY, { align: 'left' });
      const buyerSignatureLineY = signatureY + 28; // Same increased space from label to line to avoid overlap

      // Signature line
      doc.line(buyerSignatureX, buyerSignatureLineY, buyerSignatureX + signatureWidth, buyerSignatureLineY);

      // Add buyer signature image if available
      let buyerSignatureY = buyerSignatureLineY;
      if (data.buyerSignatureUrl) {
        try {
          const img = await loadImage(data.buyerSignatureUrl);
          const imgWidth = signatureWidth - 2;
          const imgHeight = (img.height / img.width) * imgWidth;
          const maxHeight = signatureHeight;
          const finalHeight = Math.min(imgHeight, maxHeight);
          const finalWidth = (img.width / img.height) * finalHeight;
          
          // Place image on the line (image bottom aligns with the line)
          doc.addImage(img, 'PNG', buyerSignatureX + 1, buyerSignatureLineY - finalHeight + 2, finalWidth, finalHeight);
          buyerSignatureY = buyerSignatureLineY + 3; // Small space after image
        } catch (err) {
          console.error('Error loading buyer signature:', err);
          buyerSignatureY = buyerSignatureLineY + 5;
        }
      } else {
        buyerSignatureY = buyerSignatureLineY + 3; // Small space if no signature
      }

      yPos = Math.max(sellerSignatureY, buyerSignatureY) + 8; // Reduced spacing after signatures

      // Footer contact
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      const footerText = `In case of problems or questions, contact us by e-mail: ${data.buyerEmail}`;
      yPos = addText(footerText, pageWidth / 2, yPos, pageWidth - 2 * margin, 8, 'center', 'italic');

      // Generate blob
      const pdfBlob = doc.output('blob');
      resolve(pdfBlob);
    } catch (err) {
      reject(err);
    }
  });
}

export async function uploadContractToStorage(saleId: string, pdfBlob: Blob): Promise<string> {
  const { supabase } = await import('./supabase');
  
  // Use sale ID as the filename
  const fileName = `contracts/${saleId}.pdf`;
  
  const { data, error } = await supabase.storage
    .from('contracts')
    .upload(fileName, pdfBlob, {
      contentType: 'application/pdf',
      upsert: true
    });

  if (error) {
    throw new Error(`Chyba pri nahrávaní PDF: ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('contracts')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}
