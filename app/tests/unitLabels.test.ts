import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareDecentralizedFirst,
  formatUnitLabel,
  isDecentralizedUnit
} from '../src/lib/unitLabels.ts';

test('formats unit names in title case and acronyms in uppercase', () => {
  assert.equal(formatUnitLabel('unidad de proyectos especiales'), 'Unidad de Proyectos Especiales');
  assert.equal(formatUnitLabel('tab'), 'TAB');
  assert.equal(formatUnitLabel('ypfb corporacion'), 'YPFB Corporacion');
});

test('classifies decentralized units separately from ministries and public enterprises', () => {
  assert.equal(isDecentralizedUnit('unidad de proyectos especiales'), true);
  assert.equal(isDecentralizedUnit('ministerio de economia y finanzas publicas'), false);
  assert.equal(isDecentralizedUnit('tab'), false);
});

test('sorts decentralized units first, then by score descending', () => {
  const peers = [
    { label: 'tab', score: 5 },
    { label: 'unidad de proyectos especiales', score: 4 },
    { label: 'servicio general de identificacion personal', score: 5 }
  ];

  peers.sort(compareDecentralizedFirst);

  assert.deepEqual(
    peers.map((peer) => peer.label),
    [
      'servicio general de identificacion personal',
      'unidad de proyectos especiales',
      'tab'
    ]
  );
});
