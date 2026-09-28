import JSZip from 'jszip';

export interface ZipFileItem {
  url: string;
  filename: string;
}

export async function downloadFilesAsZip(
  items: ZipFileItem[],
  zipFilename: string,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  if (!items.length) {
    throw new Error('Žiadne súbory na stiahnutie');
  }

  const zip = new JSZip();
  const validItems = items.filter(item => Boolean(item.url && item.filename));
  const total = validItems.length;
  let completed = 0;

  // Concurrency batch size
  const BATCH_SIZE = 5;
  for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
    const batch = validItems.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (item) => {
        try {
          const response = await fetch(item.url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          
          // Ensure unique filename inside zip
          let finalName = item.filename;
          if (!finalName.toLowerCase().endsWith('.pdf')) {
            finalName += '.pdf';
          }
          zip.file(finalName, blob);
        } catch (err) {
          console.warn(`Failed to add file ${item.filename} to zip:`, err);
        } finally {
          completed++;
          onProgress?.(completed, total);
        }
      })
    );
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const downloadUrl = window.URL.createObjectURL(zipBlob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = zipFilename.endsWith('.zip') ? zipFilename : `${zipFilename}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  window.URL.revokeObjectURL(downloadUrl);
  document.body.removeChild(anchor);
}
