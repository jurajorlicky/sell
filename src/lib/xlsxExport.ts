type ExcelCellValue = string | number | boolean | Date | null;

export interface ExcelColumn<Row> {
  header: string;
  value: (row: Row) => ExcelCellValue;
  width?: number;
  numberFormat?: string;
}

interface DownloadXlsxOptions<Row> {
  fileName: string;
  sheetName: string;
  rows: Row[];
  columns: ExcelColumn<Row>[];
}

export interface AccountingOrderRow {
  orderNumber: string;
  orderDate: Date | null;
  customer: string;
  customerEmail: string;
  currency: string;
  status: string;
  shoptetStatus: string;
  itemCount: number;
  quantity: number;
  itemRevenue: number;
  orderTotal: number;
  extraTotal: number;
  payout: number;
  profit: number;
  matchedItems: number;
  unmatchedItems: number;
  invoiceStatus: string;
  invoiceTotal: number | null;
  invoiceDifference: number | null;
  invoiceUrl: string;
  trackingNumber: string;
  notes: string;
}

export interface AccountingItemRow {
  orderNumber: string;
  originalOrderNumber: string;
  orderDate: Date | null;
  product: string;
  size: string;
  sku: string;
  quantity: number;
  itemRevenue: number;
  currency: string;
  status: string;
  customer: string;
  customerEmail: string;
  linkedSaleId: string;
  consignorEmail: string;
  payout: number;
  profit: number;
  matchStatus: string;
  vatScheme: string;
  vatBase: number | null;
  vatAmount: number | null;
  invoiceUrl: string;
  trackingNumber: string;
  importedAt: Date | null;
  notes: string;
}

export interface InvoiceAuditRow {
  fileName: string;
  orderNumber: string;
  source: string;
  matchStatus: string;
  saleSource: string;
  product: string;
  customerEmail: string;
  saleAmount: number | null;
  extractedAmount: number | null;
  difference: number | null;
  payout: number | null;
  extractionStatus: string;
  extractionError: string;
  importedAt: Date | null;
  invoiceUrl: string;
}

interface AccountingWorkbookOptions {
  fileName: string;
  orders: AccountingOrderRow[];
  items: AccountingItemRow[];
  invoices: InvoiceAuditRow[];
  dateFrom?: string;
  dateTo?: string;
}

const normalizeFileName = (fileName: string) =>
  fileName.toLowerCase().endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;

/**
 * Creates a typed Excel workbook and immediately opens the browser download
 * dialog. SheetJS is loaded only when the user requests an export so it does
 * not increase the initial dashboard bundle.
 */
export async function downloadXlsx<Row>({
  fileName,
  sheetName,
  rows,
  columns,
}: DownloadXlsxOptions<Row>): Promise<void> {
  if (rows.length === 0) return;

  const XLSX = await import('xlsx');
  const data: ExcelCellValue[][] = [
    columns.map(column => column.header),
    ...rows.map(row => columns.map(column => column.value(row))),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(data, { cellDates: true });
  const lastColumn = XLSX.utils.encode_col(columns.length - 1);
  const lastRow = rows.length + 1;

  worksheet['!autofilter'] = { ref: `A1:${lastColumn}${lastRow}` };
  worksheet['!cols'] = columns.map(column => ({ wch: column.width ?? 16 }));

  columns.forEach((column, columnIndex) => {
    if (!column.numberFormat) return;

    for (let rowIndex = 1; rowIndex <= rows.length; rowIndex += 1) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
      if (cell) cell.z = column.numberFormat;
    }
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, normalizeFileName(fileName), {
    bookType: 'xlsx',
    compression: true,
    cellDates: true,
  });
}

const currencyFormat = '#,##0.00 [$€-1];[Red](#,##0.00 [$€-1]);-';
const integerFormat = '#,##0;[Red](#,##0);-';
const percentFormat = '0.0%';
const dateFormat = 'yyyy-mm-dd';
const dateTimeFormat = 'yyyy-mm-dd hh:mm';

const applyHeaderStyle = (worksheet: any, columnCount: number, rowIndex = 0) => {
  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    const address = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`;
    const cell = worksheet[address];
    if (!cell) continue;
    cell.s = {
      fill: { patternType: 'solid', fgColor: { rgb: '111827' } },
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { vertical: 'center', horizontal: 'left' },
    };
  }
};

const addLink = (cell: any) => {
  if (cell?.v && typeof cell.v === 'string' && /^https?:\/\//i.test(cell.v)) {
    cell.l = { Target: cell.v, Tooltip: 'Open document' };
    cell.s = {
      ...(cell.s || {}),
      font: { color: { rgb: '2563EB' }, underline: true },
    };
  }
};

const setColumnFormat = (XLSX: any, worksheet: any, columnIndex: number, rowCount: number, format: string) => {
  for (let rowIndex = 1; rowIndex <= rowCount; rowIndex += 1) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
    if (cell) cell.z = format;
  }
};

const createTableSheet = (
  XLSX: any,
  rows: ExcelCellValue[][],
  widths: number[],
  formats: Record<number, string> = {},
  linkColumns: number[] = [],
) => {
  const worksheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
  const columnCount = rows[0]?.length || 1;
  const dataRowCount = Math.max(0, rows.length - 1);
  const lastColumn = XLSX.utils.encode_col(columnCount - 1);

  worksheet['!autofilter'] = { ref: `A1:${lastColumn}${Math.max(1, rows.length)}` };
  worksheet['!cols'] = widths.map(width => ({ wch: width }));
  worksheet['!rows'] = [{ hpt: 24 }];
  worksheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  applyHeaderStyle(worksheet, columnCount);

  Object.entries(formats).forEach(([columnIndex, format]) => {
    setColumnFormat(XLSX, worksheet, Number(columnIndex), dataRowCount, format);
  });

  linkColumns.forEach(columnIndex => {
    for (let rowIndex = 1; rowIndex <= dataRowCount; rowIndex += 1) {
      addLink(worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })]);
    }
  });

  return worksheet;
};

export async function downloadAccountingWorkbook({
  fileName,
  orders,
  items,
  invoices,
  dateFrom,
  dateTo,
}: AccountingWorkbookOptions): Promise<void> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const generatedAt = new Date();
  const totalRevenue = orders.reduce((sum, order) => sum + order.orderTotal, 0);
  const totalPayout = orders.reduce((sum, order) => sum + order.payout, 0);
  const totalProfit = orders.reduce((sum, order) => sum + order.profit, 0);
  const matchedItems = items.filter(item => item.matchStatus === 'matched').length;
  const missingInvoices = orders.filter(order => order.invoiceStatus === 'missing').length;
  const invoiceMismatches = invoices.filter(invoice => invoice.difference !== null && Math.abs(invoice.difference) > 0.01).length;
  const extractionErrors = invoices.filter(invoice => invoice.extractionStatus === 'error').length;

  const monthly = Array.from(orders.reduce((result, order) => {
    const key = order.orderDate
      ? `${order.orderDate.getFullYear()}-${String(order.orderDate.getMonth() + 1).padStart(2, '0')}`
      : 'Unknown';
    const current = result.get(key) || { orders: 0, revenue: 0, payout: 0, profit: 0 };
    current.orders += 1;
    current.revenue += order.orderTotal;
    current.payout += order.payout;
    current.profit += order.profit;
    result.set(key, current);
    return result;
  }, new Map<string, { orders: number; revenue: number; payout: number; profit: number }>()).entries())
    .sort(([a], [b]) => a.localeCompare(b));

  const summaryRows: ExcelCellValue[][] = [
    ['ACCOUNTING SALES REPORT', null, null, null, null],
    ['Generated', generatedAt, 'Period', dateFrom || 'All', dateTo || 'All'],
    [null, null, null, null, null],
    ['KPI', 'Value', 'Unit', 'Status', 'Note'],
    ['Orders', orders.length, 'count', 'OK', 'One row per unique order'],
    ['Items', items.length, 'count', 'OK', 'One row per sold item'],
    ['Revenue', totalRevenue, 'EUR', 'OK', 'Order total counted once per order'],
    ['Payout', totalPayout, 'EUR', 'OK', 'Matched consign payouts'],
    ['Gross profit', totalProfit, 'EUR', totalProfit < 0 ? 'CHECK' : 'OK', 'Revenue minus payout'],
    ['Gross margin', totalRevenue ? totalProfit / totalRevenue : 0, '%', 'OK', 'Gross profit / revenue'],
    ['Matched items', matchedItems, 'count', matchedItems === items.length ? 'OK' : 'CHECK', `${items.length - matchedItems} unmatched`],
    ['Missing invoices', missingInvoices, 'count', missingInvoices ? 'CHECK' : 'OK', 'Orders without an invoice URL'],
    ['Invoice mismatches', invoiceMismatches, 'count', invoiceMismatches ? 'CHECK' : 'OK', 'Tolerance €0.01'],
    ['PDF extraction errors', extractionErrors, 'count', extractionErrors ? 'CHECK' : 'OK', 'Review Invoice Audit'],
    [null, null, null, null, null],
    ['MONTH', 'ORDERS', 'REVENUE', 'PAYOUT', 'PROFIT'],
    ...monthly.map(([month, values]) => [month, values.orders, values.revenue, values.payout, values.profit]),
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows, { cellDates: true });
  summarySheet['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 16 }, { wch: 13 }, { wch: 38 }];
  summarySheet['!rows'] = [{ hpt: 30 }, { hpt: 22 }];
  summarySheet['!merges'] = [XLSX.utils.decode_range('A1:E1')];
  summarySheet['!freeze'] = { xSplit: 0, ySplit: 3, topLeftCell: 'A4', activePane: 'bottomLeft', state: 'frozen' };
  if (summarySheet.A1) {
    summarySheet.A1.s = {
      fill: { patternType: 'solid', fgColor: { rgb: '111827' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 18 },
      alignment: { vertical: 'center' },
    };
  }
  applyHeaderStyle(summarySheet, 5, 3);
  applyHeaderStyle(summarySheet, 5, 15);
  [6, 7, 8].forEach(row => {
    const cell = summarySheet[`B${row + 1}`];
    if (cell) cell.z = currencyFormat;
  });
  if (summarySheet.B10) summarySheet.B10.z = percentFormat;
  for (let rowIndex = 16; rowIndex < summaryRows.length; rowIndex += 1) {
    ['C', 'D', 'E'].forEach(column => {
      const cell = summarySheet[`${column}${rowIndex + 1}`];
      if (cell) cell.z = currencyFormat;
    });
  }
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  const orderRows: ExcelCellValue[][] = [
    ['Order Number', 'Order Date', 'Customer', 'Customer Email', 'Currency', 'Status', 'Shoptet Status', 'Items', 'Quantity', 'Item Revenue', 'Order Total', 'Extra Total', 'Payout', 'Profit', 'Margin', 'Matched', 'Unmatched', 'Invoice', 'Invoice Total', 'Invoice Difference', 'Invoice URL', 'Tracking', 'Notes'],
    ...orders.map(order => [
      order.orderNumber, order.orderDate, order.customer, order.customerEmail, order.currency, order.status,
      order.shoptetStatus, order.itemCount, order.quantity, order.itemRevenue, order.orderTotal, order.extraTotal,
      order.payout, order.profit, order.orderTotal ? order.profit / order.orderTotal : 0, order.matchedItems,
      order.unmatchedItems, order.invoiceStatus, order.invoiceTotal, order.invoiceDifference, order.invoiceUrl,
      order.trackingNumber, order.notes,
    ]),
  ];
  XLSX.utils.book_append_sheet(workbook, createTableSheet(
    XLSX,
    orderRows,
    [18, 13, 24, 28, 10, 15, 18, 9, 9, 14, 14, 14, 14, 14, 12, 10, 11, 13, 14, 16, 34, 20, 34],
    { 1: dateFormat, 7: integerFormat, 8: integerFormat, 9: currencyFormat, 10: currencyFormat, 11: currencyFormat, 12: currencyFormat, 13: currencyFormat, 14: percentFormat, 15: integerFormat, 16: integerFormat, 18: currencyFormat, 19: currencyFormat },
    [20],
  ), 'Orders');

  const itemRows: ExcelCellValue[][] = [
    ['Order Number', 'Original Order', 'Order Date', 'Product', 'Size', 'SKU', 'Qty', 'Revenue', 'Currency', 'Status', 'Customer', 'Customer Email', 'Linked Sale ID', 'Consignor Email', 'Payout', 'Profit', 'Match', 'VAT Scheme', 'VAT Base', 'VAT Amount', 'Invoice URL', 'Tracking', 'Imported', 'Notes'],
    ...items.map(item => [
      item.orderNumber, item.originalOrderNumber, item.orderDate, item.product, item.size, item.sku, item.quantity,
      item.itemRevenue, item.currency, item.status, item.customer, item.customerEmail, item.linkedSaleId,
      item.consignorEmail, item.payout, item.profit, item.matchStatus, item.vatScheme, item.vatBase,
      item.vatAmount, item.invoiceUrl, item.trackingNumber, item.importedAt, item.notes,
    ]),
  ];
  XLSX.utils.book_append_sheet(workbook, createTableSheet(
    XLSX,
    itemRows,
    [18, 18, 13, 38, 10, 18, 8, 14, 10, 15, 24, 28, 38, 28, 14, 14, 12, 13, 14, 14, 34, 20, 18, 34],
    { 2: dateFormat, 6: integerFormat, 7: currencyFormat, 14: currencyFormat, 15: currencyFormat, 18: currencyFormat, 19: currencyFormat, 22: dateTimeFormat },
    [20],
  ), 'Items');

  const invoiceRows: ExcelCellValue[][] = [
    ['File', 'Order Number', 'Source', 'Match', 'Sale Source', 'Product', 'Customer Email', 'Sale Amount', 'PDF Amount', 'Difference', 'Payout', 'Extraction', 'Extraction Error', 'Imported', 'Invoice URL'],
    ...invoices.map(invoice => [
      invoice.fileName, invoice.orderNumber, invoice.source, invoice.matchStatus, invoice.saleSource, invoice.product,
      invoice.customerEmail, invoice.saleAmount, invoice.extractedAmount, invoice.difference, invoice.payout,
      invoice.extractionStatus, invoice.extractionError, invoice.importedAt, invoice.invoiceUrl,
    ]),
  ];
  XLSX.utils.book_append_sheet(workbook, createTableSheet(
    XLSX,
    invoiceRows,
    [32, 18, 18, 12, 14, 38, 28, 14, 14, 14, 14, 14, 38, 18, 34],
    { 7: currencyFormat, 8: currencyFormat, 9: currencyFormat, 10: currencyFormat, 13: dateTimeFormat },
    [14],
  ), 'Invoice Audit');

  const checksRows: ExcelCellValue[][] = [
    ['Check', 'Actual', 'Expected', 'Difference', 'Tolerance', 'Status', 'Where to fix', 'Notes'],
    ['Order total counted once', totalRevenue, totalRevenue, 0, 0.01, 'OK', 'Orders', 'Revenue uses one row per order'],
    ['Matched item coverage', matchedItems, items.length, matchedItems - items.length, 0, matchedItems === items.length ? 'OK' : 'CHECK', 'Items', 'Resolve unmatched rows'],
    ['Invoice amount mismatches', invoiceMismatches, 0, invoiceMismatches, 0, invoiceMismatches ? 'CHECK' : 'OK', 'Invoice Audit', 'Tolerance €0.01'],
    ['PDF extraction errors', extractionErrors, 0, extractionErrors, 0, extractionErrors ? 'CHECK' : 'OK', 'Invoice Audit', 'Review extraction error text'],
    ['Negative gross profit', orders.filter(order => order.profit < -0.01).length, 0, orders.filter(order => order.profit < -0.01).length, 0, orders.some(order => order.profit < -0.01) ? 'CHECK' : 'OK', 'Orders', 'Check payout or sales amount'],
  ];
  XLSX.utils.book_append_sheet(workbook, createTableSheet(
    XLSX,
    checksRows,
    [30, 14, 14, 14, 12, 12, 22, 38],
    { 1: integerFormat, 2: integerFormat, 3: integerFormat, 4: integerFormat },
  ), 'Checks');

  (workbook as any).CalcPr = { calcMode: 'auto' };
  XLSX.writeFile(workbook, normalizeFileName(fileName), {
    bookType: 'xlsx',
    compression: true,
    cellDates: true,
    cellStyles: true,
  });
}

export const excelDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const exportDateStamp = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
