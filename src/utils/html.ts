const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  ndash: '–',
  mdash: '—',
  bdquo: '„',
  rdquo: '”',
  ldquo: '“',
  lsquo: '‘',
  rsquo: '’',
  laquo: '«',
  raquo: '»',
  hellip: '…',
  bull: '•',
  middot: '·',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
  euro: '€',
  sect: '§',
  copy: '©',
  reg: '®',
  // Polish & European diacritics
  oacute: 'ó',
  Oacute: 'Ó',
  aogon: 'ą',
  Aogon: 'Ą',
  eogon: 'ę',
  Eogon: 'Ę',
  sacute: 'ś',
  Sacute: 'Ś',
  cacute: 'ć',
  Cacute: 'Ć',
  zacute: 'ź',
  Zacute: 'Ź',
  zdot: 'ż',
  Zdot: 'Ż',
  nacute: 'ń',
  Nacute: 'Ń',
  lstrok: 'ł',
  Lstrok: 'Ł',
  eacute: 'é',
  Eacute: 'É',
  aacute: 'á',
  Aacute: 'Á',
  iacute: 'í',
  Iacute: 'Í',
  uacute: 'ú',
  Uacute: 'Ú',
  yacute: 'ý',
  Yacute: 'Ý',
  auml: 'ä',
  Auml: 'Ä',
  ouml: 'ö',
  Ouml: 'Ö',
  uuml: 'ü',
  Uuml: 'Ü',
  szlig: 'ß',
};

function decodeEntitiesPass(input: string): string {
  return input
    .replace(/&#(\d+);?/g, (match, dec) => {
      const code = parseInt(dec, 10);
      if (!isNaN(code) && code > 0 && code <= 0x10ffff) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return match;
    })
    .replace(/&#x([0-9a-fA-F]+);?/gi, (match, hex) => {
      const code = parseInt(hex, 16);
      if (!isNaN(code) && code > 0 && code <= 0x10ffff) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return match;
    })
    .replace(/&([a-zA-Z]+);?/g, (match, name) => {
      if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name)) {
        return NAMED_ENTITIES[name];
      }
      const lower = name.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, lower)) {
        return NAMED_ENTITIES[lower];
      }
      return match;
    });
}

export interface DecodeHtmlOptions {
  stripTags?: boolean;
  preserveNewlines?: boolean;
}

/**
 * Decodes HTML named, decimal, and hex entities (including double-encoded entities
 * like `&amp;oacute;` in Synergia tooltips/topics) and optionally strips HTML tags.
 */
export function decodeHtmlEntities(
  raw: string | undefined | null,
  options: DecodeHtmlOptions | boolean = true
): string {
  if (!raw) return '';

  const stripTags = typeof options === 'boolean' ? options : (options.stripTags ?? true);
  const preserveNewlines =
    typeof options === 'boolean' ? false : (options.preserveNewlines ?? false);

  let text = raw;

  // First pass: decode entities that might wrap HTML tags inside attributes (e.g. title="Rodzaj: &lt;b&gt;...")
  if (preserveNewlines) {
    text = text
      .replace(/&lt;\s*br\s*\/?\s*&gt;/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p\s*>/gi, '\n\n')
      .replace(/<\/div\s*>/gi, '\n');
  }

  if (stripTags) {
    text = text
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, preserveNewlines ? '' : ' ');
  }

  // Run entity decoding (2 passes to handle double-encoded `&amp;oacute;` or `&lt;b&gt;`)
  text = decodeEntitiesPass(text);
  if (text.includes('&') || (stripTags && text.includes('<'))) {
    if (preserveNewlines) {
      text = text.replace(/<br\s*\/?>/gi, '\n');
    }
    if (stripTags) {
      text = text.replace(/<[^>]+>/g, preserveNewlines ? '' : ' ');
    }
    text = decodeEntitiesPass(text);
  }

  if (preserveNewlines) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return text.replace(/\s+/g, ' ').trim();
}
