const PALETTE = [
  '#3b82f6', // Blue
  '#10b981', // Emerald Green
  '#eab308', // Yellow / Gold
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#6366f1', // Indigo
  '#14b8a6', // Teal
  '#84cc16', // Lime
  '#f43f5e', // Rose
  '#0ea5e9', // Sky Blue
] as const;

/**
 * Returns a consistent, vibrant hex color for any Polish school subject name.
 * - English (Język angielski) -> Green (#10b981)
 * - Math (Matematyka) -> Yellow (#eab308)
 * - Polish (Język polski) -> Rose (#f43f5e)
 * - PE (Wychowanie fizyczne) -> Cyan (#06b6d4)
 * - German/Foreign languages -> Teal (#14b8a6)
 * - IT / Vocational INF -> Indigo (#6366f1)
 * - Physics -> Purple (#a855f7)
 * - Chemistry -> Pink (#ec4899)
 * - Biology -> Lime (#84cc16)
 * - History / WOS / HiT -> Orange (#f97316)
 * - Geography -> Sky Blue (#0ea5e9)
 */
export function getSubjectColor(rawSubject: string): string {
  const s = (rawSubject || '').trim().toLowerCase();
  if (!s) return '#3b82f6';

  if (s.includes('angielski')) return '#10b981'; // Green
  if (s.includes('matematyk')) return '#eab308'; // Yellow
  if (s.includes('polski')) return '#f43f5e'; // Rose Red
  if (s.includes('wychowanie fizyczne') || s === 'wf' || s.startsWith('wf ')) return '#06b6d4'; // Cyan
  if (
    s.includes('niemiecki') ||
    s.includes('hiszpański') ||
    s.includes('francuski') ||
    s.includes('rosyjski')
  ) {
    return '#14b8a6'; // Teal
  }
  if (s.includes('fizyk')) return '#a855f7'; // Purple
  if (s.includes('chemi')) return '#ec4899'; // Pink
  if (s.includes('biologi') || s.includes('przyrod')) return '#84cc16'; // Lime
  if (
    s.includes('histori') ||
    s.includes('społeczeństw') ||
    s.includes('teraźniejszo') ||
    s === 'wos' ||
    s === 'hit'
  ) {
    return '#f97316'; // Orange
  }
  if (s.includes('geografi')) return '#0ea5e9'; // Sky Blue
  if (
    s.includes('informatyk') ||
    s.includes('programowan') ||
    s.includes('zawodow') ||
    s.includes('bazy danych') ||
    s.includes('sieci') ||
    s.includes('systemy') ||
    s.includes('witryny') ||
    s.includes('aplikacj') ||
    /\binf\b/.test(s)
  ) {
    return '#6366f1'; // Indigo
  }
  if (s.includes('biznes') || s.includes('przedsiębiorczo') || s.includes('ekonomi')) {
    return '#38bdf8'; // Light Blue
  }
  if (s.includes('bezpieczeństw') || s === 'edb') return '#fb7185'; // Coral
  if (s.includes('religi') || s.includes('etyk')) return '#f59e0b'; // Amber
  if (s.includes('wychowawc')) return '#2dd4bf'; // Mint

  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
