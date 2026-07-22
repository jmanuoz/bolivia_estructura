import * as XLSX from 'xlsx';

export interface ResultsWorkbookInput {
  labels: string[];
  scoreMatrix: number[][];
  explanationMatrix: string[][];
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
