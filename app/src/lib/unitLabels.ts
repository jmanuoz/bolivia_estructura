export interface ScoredUnit {
  label: string;
  score?: number;
}

export interface UnitPair {
  rowLabel: string;
  colLabel: string;
}

const MINISTRY_PREFIXES = ['ministerio de', 'ministerio del', 'viceministerio de', 'viceministerio del'];

const ENTERPRISE_LABELS = new Set([
  'papelbol',
  'ecebol',
  'eepaf',
  'eeps',
  'envibol',
  'kokabol',
  'ibae',
  'ibq',
  'lifab',
  'cartonbol',
  'ypfb corporacion',
  'ende corporacion',
  'comibol',
  'emh',
  'emcorocoro',
  'emk',
  'emc',
  'epcoro',
  'emv',
  'tab',
  'bolivia tv',
  'cofadena',
  'enabol',
  'emapa',
  'mutun',
  'boa',
  'dab',
  'ebih',
  'abe',
  'easba',
  'ebc',
  'quipus',
  'mi teleferico',
  'yacana',
  'asp b',
  'gestora',
  'tam',
  'ylb',
  'editorial del estado',
  'eba',
  'esabol',
  'b agro',
  'misicuni'
]);

const ACRONYMS = new Set([
  'abc',
  'abe',
  'aben',
  'abt',
  'adecine',
  'adsib',
  'aemp',
  'aetn',
  'afcoop',
  'agetic',
  'ait',
  'aj',
  'ajam',
  'aisem',
  'anc',
  'anh',
  'an',
  'aaps',
  'apmt',
  'aps',
  'asfi',
  'asuss',
  'asp',
  'b',
  'boa',
  'ceass',
  'ciaaat',
  'ciq',
  'cbb',
  'chu',
  'cobol',
  'cofadena',
  'comibol',
  'coplumu',
  'covipol',
  'dab',
  'dde',
  'dgac',
  'dirnoplu',
  'eba',
  'ebc',
  'ebid',
  'ebih',
  'ebim',
  'ecebol',
  'eepaf',
  'eeps',
  'egpp',
  'eje',
  'emagua',
  'emapa',
  'emc',
  'emcorocoro',
  'emh',
  'emk',
  'emv',
  'enabol',
  'ende',
  'envibol',
  'epcoro',
  'esabol',
  'fc',
  'fdi',
  'fndr',
  'fofim',
  'fonabosque',
  'fondesif',
  'fps',
  'ibae',
  'ibc',
  'ibq',
  'igb',
  'inbol',
  'ine',
  'iniaf',
  'inra',
  'insa',
  'inso',
  'ipalc',
  'ipelc',
  'lifab',
  'lonabol',
  'lpz',
  'mnhn',
  'muserpol',
  'naabol',
  'opce',
  'oru',
  'osn',
  'ofep',
  'otn',
  'papelbol',
  'pan',
  'pscu',
  'pts',
  'quipus',
  'ruat',
  'rpb',
  'scz',
  'sea',
  'sedem',
  'sederi',
  'segeomap',
  'segelic',
  'segip',
  'senamhi',
  'senarecom',
  'senari',
  'senasba',
  'senatex',
  'semana',
  'semena',
  'sepdep',
  'sepdavi',
  'sepmud',
  'seprec',
  'sergeomin',
  'sin',
  'snaf',
  'snhn',
  'tab',
  'tam',
  'tar',
  'tja',
  'tv',
  'udape',
  'uif',
  'ylb',
  'ypfb',
  'zofracobija'
]);

const LOWERCASE_WORDS = new Set([
  'a',
  'al',
  'con',
  'contra',
  'de',
  'del',
  'e',
  'el',
  'en',
  'la',
  'las',
  'los',
  'para',
  'por',
  'sin',
  'su',
  'sus',
  'y'
]);

export function normalizeUnitLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[\u0096\u2010-\u2015]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function formatWord(word: string, position: number): string {
  const normalized = normalizeUnitLabel(word);
  if (!normalized) return word;
  if (ACRONYMS.has(normalized)) return word.toLocaleUpperCase('es-BO');
  if (position > 0 && LOWERCASE_WORDS.has(normalized)) return normalized;

  const lower = word.toLocaleLowerCase('es-BO');
  return lower.charAt(0).toLocaleUpperCase('es-BO') + lower.slice(1);
}

export function formatUnitLabel(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[\u0096\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ');

  let wordPosition = 0;
  return cleaned.replace(/[\p{L}\p{N}]+/gu, (word) => formatWord(word, wordPosition++));
}

export function isEnterpriseUnit(label: string): boolean {
  return ENTERPRISE_LABELS.has(normalizeUnitLabel(label));
}

export function isMinistryOrViceministry(label: string): boolean {
  const normalized = normalizeUnitLabel(label);
  return MINISTRY_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function isDecentralizedUnit(label: string): boolean {
  return !isMinistryOrViceministry(label) && !isEnterpriseUnit(label);
}

export function decentralizedPriority(label: string): number {
  return isDecentralizedUnit(label) ? 0 : 1;
}

export function compareDecentralizedFirst<T extends ScoredUnit>(a: T, b: T): number {
  return (
    decentralizedPriority(a.label) - decentralizedPriority(b.label) ||
    (b.score ?? 0) - (a.score ?? 0) ||
    a.label.localeCompare(b.label, 'es')
  );
}

function pairDependencyPriority(pair: UnitPair, unitDependencies: Map<string, string>): number {
  const rowDependency = unitDependencies.get(normalizeUnitLabel(pair.rowLabel));
  const colDependency = unitDependencies.get(normalizeUnitLabel(pair.colLabel));

  if (!rowDependency || !colDependency) return 1;
  return normalizeUnitLabel(rowDependency) === normalizeUnitLabel(colDependency) ? 1 : 0;
}

export function compareDifferentDependenciesFirst<T extends UnitPair>(
  a: T,
  b: T,
  unitDependencies: Map<string, string>
): number {
  return (
    pairDependencyPriority(a, unitDependencies) - pairDependencyPriority(b, unitDependencies) ||
    a.rowLabel.localeCompare(b.rowLabel, 'es') ||
    a.colLabel.localeCompare(b.colLabel, 'es')
  );
}
