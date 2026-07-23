import assert from 'node:assert/strict';
import test from 'node:test';

import { DASHBOARD_CONFIG } from '../src/lib/dashboardConfig.ts';

test('configures the dashboard for Mexico without ranking', () => {
  assert.equal(DASHBOARD_CONFIG.countryName, 'Mexico');
  assert.equal(DASHBOARD_CONFIG.showRanking, false);
  assert.equal(DASHBOARD_CONFIG.scoreWorkbook, 'superposiciones_mexico_scores.xlsx');
  assert.equal(DASHBOARD_CONFIG.explanationWorkbook, 'superposiciones_mexico_explicaciones.xlsx');
});
