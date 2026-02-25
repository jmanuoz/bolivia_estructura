interface ExplanationUnits {
  unit1: string;
  unit2: string;
}

function cleanUnitName(value: string): string {
  return value.trim().replace(/^["'`]+|["'`]+$/g, '').replace(/\s+/g, ' ');
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferUnitsFromCatalog(text: string, catalog: string[]): ExplanationUnits | null {
  const normalizedText = normalizeText(text);
  if (!normalizedText) return null;

  const mentions = catalog
    .map((label) => {
      const normalizedLabel = normalizeText(label);
      if (!normalizedLabel) return null;
      if (normalizedLabel.length < 4) return null;
      const idx = normalizedText.indexOf(normalizedLabel);
      if (idx < 0) return null;
      return { label, idx, length: normalizedLabel.length };
    })
    .filter((item): item is { label: string; idx: number; length: number } => item !== null)
    .sort((a, b) => a.idx - b.idx || b.length - a.length);

  if (mentions.length < 2) return null;

  const unique: string[] = [];
  for (const mention of mentions) {
    if (!unique.includes(mention.label)) {
      unique.push(mention.label);
    }
    if (unique.length >= 2) break;
  }

  if (unique.length < 2) return null;

  return {
    unit1: unique[0],
    unit2: unique[1]
  };
}

export function extractUnitsFromExplanation(text: string): ExplanationUnits | null {
  if (!text) return null;

  const normalized = text.replace(/\r/g, ' ');
  const unit1Match = normalized.match(/UNIDAD\s*1\s*:\s*([^\n|.;]+)/i);
  const unit2Match = normalized.match(/UNIDAD\s*2\s*:\s*([^\n|.;]+)/i);

  if (!unit1Match?.[1] || !unit2Match?.[1]) return null;

  const unit1 = cleanUnitName(unit1Match[1]);
  const unit2 = cleanUnitName(unit2Match[1]);
  if (!unit1 || !unit2) return null;

  return { unit1, unit2 };
}

export function getPairLabelsFromExplanation(
  defaultRowLabel: string,
  defaultColLabel: string,
  explanation: string,
  catalog?: string[]
): { rowLabel: string; colLabel: string } {
  const parsed = extractUnitsFromExplanation(explanation);
  const inferred = parsed ?? (catalog ? inferUnitsFromCatalog(explanation, catalog) : null);

  if (!inferred) {
    return {
      rowLabel: defaultRowLabel,
      colLabel: defaultColLabel
    };
  }

  return {
    rowLabel: inferred.unit1,
    colLabel: inferred.unit2
  };
}
