import { supabase } from './supabase';

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export const invoiceStorageReference = (path: string) => `invoice://${path}`;

export function invoiceStoragePathFromReference(value?: string | null): string | null {
  if (!value) return null;
  if (value.startsWith('invoice://')) return value.slice('invoice://'.length);
  if (/^(matched|unmatched)\//.test(value)) return value;

  const marker = '/invoices/';
  const markerIndex = value.indexOf(marker);
  if (markerIndex === -1) return null;

  const encodedPath = value.slice(markerIndex + marker.length).split('?')[0];
  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return encodedPath;
  }
}

export async function createInvoiceSignedUrlMap(paths: string[]): Promise<Map<string, string>> {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  const result = new Map<string, string>();

  for (let offset = 0; offset < uniquePaths.length; offset += 100) {
    const batch = uniquePaths.slice(offset, offset + 100);
    const { data, error } = await supabase.storage
      .from('invoices')
      .createSignedUrls(batch, SIGNED_URL_TTL_SECONDS);

    if (error) throw error;

    (data || []).forEach((item, index) => {
      const path = item.path || batch[index];
      if (path && item.signedUrl) result.set(path, item.signedUrl);
    });
  }

  return result;
}

export async function resolveInvoiceReferences(values: Array<string | null | undefined>): Promise<Map<string, string>> {
  const references = values.filter(Boolean) as string[];
  const pathByReference = new Map<string, string>();
  references.forEach(reference => {
    const path = invoiceStoragePathFromReference(reference);
    if (path) pathByReference.set(reference, path);
  });

  const signedByPath = await createInvoiceSignedUrlMap(Array.from(pathByReference.values()));
  const result = new Map<string, string>();
  pathByReference.forEach((path, reference) => {
    const signedUrl = signedByPath.get(path);
    if (signedUrl) result.set(reference, signedUrl);
  });
  return result;
}
