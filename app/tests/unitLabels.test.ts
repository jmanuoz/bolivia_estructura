import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareDecentralizedFirst,
  compareDifferentDependenciesFirst,
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

test('sorts pairs from different dependencies before pairs from the same dependency', () => {
  const unitDependencies = new Map([
    ['unidad a', 'dependencia uno'],
    ['unidad b', 'dependencia uno'],
    ['unidad c', 'dependencia dos'],
    ['unidad d', 'dependencia tres']
  ]);
  const pairs = [
    { rowLabel: 'unidad a', colLabel: 'unidad b' },
    { rowLabel: 'unidad c', colLabel: 'unidad d' },
    { rowLabel: 'unidad a', colLabel: 'unidad c' }
  ];

  pairs.sort((a, b) => compareDifferentDependenciesFirst(a, b, unitDependencies));

  assert.deepEqual(pairs, [
    { rowLabel: 'unidad a', colLabel: 'unidad c' },
    { rowLabel: 'unidad c', colLabel: 'unidad d' },
    { rowLabel: 'unidad a', colLabel: 'unidad b' }
  ]);
});
