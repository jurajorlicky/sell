/**
 * Shared utility functions used across the application.
 */

/**
 * Format a date string to a localized date with time.
 * Handles timezone issues by parsing date parts directly.
 */
export function formatDate(dateString: string, includeTime = true): string {
  if (!dateString) return 'N/A';

  const dateMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    const [, yearStr, monthStr, dayStr] = dateMatch;
    const year = Number(yearStr);
    const month = Number(monthStr) - 1;
    const day = Number(dayStr);
    const date = new Date(year, month, day);

    const timeMatch = dateString.match(/T(\d{2}):(\d{2})/);
    if (timeMatch && includeTime) {
      date.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
    } else {
      date.setHours(12, 0, 0, 0);
    }

    const opts: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    };
    if (includeTime && timeMatch) {
      opts.hour = '2-digit';
      opts.minute = '2-digit';
    }
    return date.toLocaleDateString('sk-SK', opts);
  }

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'N/A';

  const opts: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  };
  if (includeTime) {
    opts.hour = '2-digit';
    opts.minute = '2-digit';
  }
  return date.toLocaleDateString('sk-SK', opts);
}

/**
 * Format a date string to DD.MM.YYYY (no time).
 */
export function formatDateShort(dateString: string): string {
  return formatDate(dateString, false);
}

/**
 * Format a number as EUR currency.
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('sk-SK', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

/**
 * Format a date string as relative time (e.g. "5 minutes ago").
 */
export function formatTimeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
}
