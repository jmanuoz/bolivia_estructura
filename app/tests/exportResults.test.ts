import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';

import { createResultsWorkbook, createTrimmedWorkbook, downloadFile } from '../src/lib/exportResults.ts';

test('creates a workbook with scores and superposiciones sheets', () => {
  const workbook = createResultsWorkbook({
    labels: ['Unidad A', 'Unidad B'],
    scoreMatrix: [
      [0, 4],
      [4, 0]
    ],
    explanationMatrix: [
      ['', 'Coinciden en atribuciones'],
      ['Coinciden en atribuciones', '']
    ]
  });

  assert.deepEqual(workbook.SheetNames, ['scores', 'superposiciones']);

  const scores = XLSX.utils.sheet_to_json(workbook.Sheets.scores, { header: 1 });
  assert.deepEqual(scores, [
    ['', 'Unidad A', 'Unidad B'],
    ['Unidad A', 0, 4],
    ['Unidad B', 4, 0]
  ]);

  const superposiciones = XLSX.utils.sheet_to_json(workbook.Sheets.superposiciones, { header: 1 });
  assert.deepEqual(superposiciones, [
    ['', 'Unidad A', 'Unidad B'],
    ['Unidad A', '', 'Coinciden en atribuciones'],
    ['Unidad B', 'Coinciden en atribuciones', '']
  ]);
});

test('downloads a static file through an anchor element', () => {
  const clicked: string[] = [];
  const removed: string[] = [];
  const appended: Array<{ href: string; download: string }> = [];
  const link = {
    href: '',
    download: '',
    rel: '',
    click: () => clicked.push(link.href),
    remove: () => removed.push(link.download)
  };
  const doc = {
    createElement: () => link,
    body: {
      appendChild: (element: typeof link) => {
        appended.push({ href: element.href, download: element.download });
        return element;
      }
    }
  };

  downloadFile('/assets/base.xlsx', 'Base completa de unidades Bolivia.xlsx', doc);

  assert.deepEqual(appended, [
    {
      href: '/assets/base.xlsx',
      download: 'Base completa de unidades Bolivia.xlsx'
    }
  ]);
  assert.deepEqual(clicked, ['/assets/base.xlsx']);
  assert.deepEqual(removed, ['Base completa de unidades Bolivia.xlsx']);
  assert.equal(link.rel, 'noopener');
});

test('trims a workbook to the first sheet and columns A through F', () => {
  const source = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    source,
    XLSX.utils.aoa_to_sheet([
      ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1'],
      ['A2', 'B2', 'C2', 'D2', 'E2', 'F2', 'G2']
    ]),
    'base'
  );
  XLSX.utils.book_append_sheet(
    source,
    XLSX.utils.aoa_to_sheet([['otra solapa']]),
    'extra'
  );

  const trimmed = createTrimmedWorkbook(source, 6);

  assert.deepEqual(trimmed.SheetNames, ['base']);
  const rows = XLSX.utils.sheet_to_json(trimmed.Sheets.base, { header: 1 });
  assert.deepEqual(rows, [
    ['A1', 'B1', 'C1', 'D1', 'E1', 'F1'],
    ['A2', 'B2', 'C2', 'D2', 'E2', 'F2']
  ]);
});
