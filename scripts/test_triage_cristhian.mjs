function extractEmailCoreBody(text) {
  if (!text) return '';
  let str = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Cut off quoted email chains
  const quoteSplitters = [
    /\n\s*from:\s+[^\n]+<[^\n]+>/i,
    /\n\s*from:\s+[^\n]+/i,
    /\n\s*de:\s+[^\n]+/i,
    /\n\s*on\s+.{5,100}\s+wrote:\s*$/im,
    /\n\s*el\s+.{5,100}\s+escribi[oó]:\s*$/im,
    /\n\s*-----original message-----/i,
    /\n\s*-----mensaje original-----/i,
    /\n\s*_{10,}/,
    /\n\s*-{10,}/,
  ];

  for (const splitter of quoteSplitters) {
    const idx = str.search(splitter);
    if (idx !== -1) {
      str = str.substring(0, idx);
    }
  }

  // Remove common disclaimers / security banners
  str = str.replace(/external email:?\s*be careful with links and attachments/gi, '');
  str = str.replace(/be careful with links and attachments/gi, '');

  // Cut off sign-offs & signatures
  const signOffSplitters = [
    /\n\s*(?:best regards|warm regards|kind regards|regards|sincerely|cheers)\b/i,
    /\n\s*(?:saludos cordiales|cordialmente|atentamente|saludos)\b/i,
  ];

  for (const splitter of signOffSplitters) {
    const idx = str.search(splitter);
    if (idx !== -1) {
      str = str.substring(0, idx);
    }
  }

  // Remove leading greetings (e.g. "Hi Vladimir,", "Hola Vladimir:", "Dear Vladimir,")
  str = str.replace(/^\s*(?:hi|hello|dear|hola|estimad[oa]|buen(?:os)?\s*d[ií]as?|buenas\s*tardes|buenas\s*noches)\s+[^\n,!:]{1,40}[,.:!]*\s*\n*/i, '');

  return str.trim();
}

function upgradedIsCourtesyOrClosed(text, userAliases) {
  if (!text || !text.trim()) return false;

  // Extract core message before signatures and quotes
  const core = extractEmailCoreBody(text);
  const targetText = core || text;

  const clean = targetText
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return true;

  const acknowledgments = [
    'ah ya', 'ah ok', 'ah bueno', 'ah ya veo', 'ah dale', 'ya veo', 'ya lo vi',
    'ok', 'okay', 'oki', 'okk', 'vale', 'dale', 'dale pues', 'listo', 'listo pues',
    'perfecto', 'genial', 'excelente', 'buenisimo', 'de nada', 'a la orden',
    'con gusto', 'con mucho gusto', 'un placer', 'el placer es mio', 'el gusto es mio',
    'a tus ordenes', 'a sus ordenes', 'para servirte', 'para servirle',
    'gracias', 'muchas gracias', 'mil gracias', 'saludos', 'buenas noches', 'buen dia', 'buenos dias',
    'hasta manana', 'hasta luego', 'nos vemos', 'cuidate',
    'thanks', 'thank you', 'thx', 'got it', 'sounds good', 'will do',
    'no problem', 'no problem at all', 'no worries', 'sure thing', 'of course',
    'youre welcome', 'you are welcome', 'your welcome', 'you welcome', 'welcome', 'most welcome',
    'anytime', 'my pleasure', 'pleasure', 'glad to help', 'happy to help',
    'cool', 'noted', 'all good', 'all set', 'np', 'k',
    'tranquila no te preocupes', 'no te preocupes', 'sin problema', 'todo bien',
    'well received', 'recibido', 'muchas gracias recibido', 'enterado', 'copiado',
    'asi es', 'si', 'no', 'claro', 'seguro',
    'jaja', 'jajaja', 'jajajaja', 'jeje', 'jejeje', 'xd', 'lol', 'haha', 'hahaha',
    'have a good day', 'have a great day', 'have a nice day', 'have a good weekend',
    'i dont have asl', 'dont have asl', 'no tengo asl'
  ];

  if (acknowledgments.includes(clean)) return true;

  const aliases = userAliases && userAliases.length > 0
    ? userAliases.map(a => a.toLowerCase())
    : ['vlad', 'vladimir', 'vlady'];

  for (const alias of aliases) {
    if (
      clean === `gracias ${alias}` ||
      clean === `muchas gracias ${alias}` ||
      clean === `mil gracias ${alias}` ||
      clean === `thanks ${alias}` ||
      clean === `you welcome ${alias}` ||
      clean === `youre welcome ${alias}` ||
      clean === `de nada ${alias}`
    ) {
      return true;
    }
  }

  // Closures starting with closure tokens followed by <= 4 words
  if (
    /^(ok|okay|dale|listo|gracias|perfecto|recibido|you welcome|youre welcome|you are welcome|de nada|con gusto|a la orden)\b/i.test(clean) &&
    clean.split(' ').length <= 6
  ) {
    return true;
  }

  const words = clean.split(' ').filter(Boolean);
  const pleasantryTokens = new Set([
    'ah', 'ya', 'veo', 'ok', 'okay', 'gracias', 'muchas', 'mil', 'dale', 'pues',
    'listo', 'amigo', 'bro', 'perfecto', 'vale', 'thanks', 'thank', 'you',
    'welcome', 'got', 'it', 'cool', 'saludos', 'buenas', 'well', 'received', 'recibido',
    'enterado', 'copiado', 'de', 'nada', 'con', 'gusto', 'placer', 'orden',
    'jaja', 'jajaja', 'lol', 'xd', 'claro', 'seguro',
    ...aliases
  ]);

  if (words.length <= 6 && words.every((w) => pleasantryTokens.has(w))) {
    return true;
  }

  return false;
}

const text = `Hi Vladimir,

You welcome.

Best regards,

Cristhian Carpio, Freight Forwarder, Air Import, Miami, Air & Sea US

cristhian.carpio1@dsv.com<mailto:cristhian.carpio1@dsv.com>  |  Office +130547768005982  |  www.dsv.com<https://www.dsv.com/>

From: ACS <vladimir.lopez@advcomser.com>
Sent: Thursday, October 22, 2026 3:17 PM
To: Cristhian Carpio - DSV <cristhian.carpio1@dsv.com>
Subject: Re: RE: DSV Air & Sea, Inc. (EWR) Miami - - PTY0049679 - ADVANCE COMMERCIAL SERVICE INC.

External email:Be careful with links and attachments

Thanks Cristhian

 [Logo]

Vladimir Lopez
System Administrator
Phone: (305)906-8685
`;

console.log('Upgraded logic result:', upgradedIsCourtesyOrClosed(text));
