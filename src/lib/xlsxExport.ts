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
