import * as XLSX from 'xlsx';

export interface ResultsWorkbookInput {
  labels: string[];
  scoreMatrix: number[][];
  explanationMatrix: string[][];
}

interface DownloadDocument {
  createElement(tagName: 'a'): HTMLAnchorElement;
  body: {
    appendChild(element: HTMLAnchorElement): HTMLAnchorElement;
  };
}

function matrixToSheetRows<T>(labels: string[], matrix: T[][]): Array<Array<string | T>> {
  return [
    ['', ...labels],
    ...labels.map((label, rowIdx) => [
      label,
      ...labels.map((_, colIdx) => matrix[rowIdx]?.[colIdx] ?? '')
    ])
  ];
}

export function createResultsWorkbook({
  labels,
  scoreMatrix,
  explanationMatrix
}: ResultsWorkbookInput): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  const scoresSheet = XLSX.utils.aoa_to_sheet(matrixToSheetRows(labels, scoreMatrix));
  const superposicionesSheet = XLSX.utils.aoa_to_sheet(matrixToSheetRows(labels, explanationMatrix));

  XLSX.utils.book_append_sheet(workbook, scoresSheet, 'scores');
  XLSX.utils.book_append_sheet(workbook, superposicionesSheet, 'superposiciones');

  return workbook;
}

export function createTrimmedWorkbook(workbook: XLSX.WorkBook, maxColumns: number): XLSX.WorkBook {
  const firstSheetName = workbook.SheetNames[0];
  const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
  const trimmedWorkbook = XLSX.utils.book_new();

  if (!firstSheetName || !firstSheet) {
    return trimmedWorkbook;
  }

  const range = XLSX.utils.decode_range(firstSheet['!ref'] ?? 'A1:A1');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
    header: 1,
    defval: '',
    range: {
      s: { r: range.s.r, c: range.s.c },
      e: { r: range.e.r, c: Math.min(range.e.c, maxColumns - 1) }
    }
  });
  const trimmedSheet = XLSX.utils.aoa_to_sheet(rows);

  XLSX.utils.book_append_sheet(trimmedWorkbook, trimmedSheet, firstSheetName);

  return trimmedWorkbook;
}

export function downloadFile(
  url: string,
  filename: string,
  doc: DownloadDocument = document
): void {
  const link = doc.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  doc.body.appendChild(link);
  link.click();
  link.remove();
}
