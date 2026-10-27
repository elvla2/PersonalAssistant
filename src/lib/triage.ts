import { GoogleGenerativeAI } from '@google/generative-ai';
import type { TriageResult, PriorityLevel, ActionType } from '@/types';

/**
 * Bilingual P1 Priority Keywords dictionary across:
 * - financial (overdue accounts, collections, wire deadlines)
 * - logisticsCustoms (customs holds, demurrage, cargo detentions)
 * - criticalDeadlines (same-day, urgent, emergency)
 * - legal (notices, breach, termination)
 */
export const BILINGUAL_P1_KEYWORDS = {
  financial: [
    // English
    'overdue', 'past due', 'outstanding invoices', 'settle the overdue', 'overdue account',
    'payment today', 'process payment today', 'remit payment', 'balance overdue', 'final notice',
    'collections', 'credit hold', 'credit line suspended', 'wire transfer today', 'immediate payment required',
    // Spanish
    'vencido', 'facturas vencidas', 'saldo vencido', 'cuenta vencida', 'pago hoy', 'procesar pago hoy',
    'aviso de cobro', 'último aviso', 'suspensión de crédito', 'bloqueo de cuenta', 'pago inmediato',
    'transferir hoy', 'cuenta suspendida', 'cobranza urgente'
  ],
  logisticsCustoms: [
    // English
    'customs hold', 'cargo on hold', 'shipment on hold', 'held at customs', 'customs detention',
    'demurrage', 'detention charges', 'customs exam', 'customs seizure', 'port congestion fee',
    'vessel cutoff', 'gate cutoff', 'missed cutoff', 'rollover risk', 'damaged cargo',
    'urgent release', 'telex release', 'stop delivery', 'delivery hold',
    // Spanish
    'carga retenida', 'embarque detenido', 'retenido en aduana', 'detenido por aduana',
    'demora', 'estadías', 'almacenaje', 'reconocimiento aduanero', 'inspección física',
    'corte de guía', 'corte de zarpe', 'liberación urgente', 'no entregar', 'detener entrega', 'retención aduanera'
  ],
  criticalDeadlines: [
    // English
    'urgent', 'asap', 'emergency', 'immediate attention', 'immediately', 'right now',
    'today by', 'end of day today', 'eod today', 'before 5pm', 'within 24 hours',
    // Spanish
    'urgente', 'emergencia', 'de inmediato', 'ahora mismo', 'para hoy', 'hoy mismo',
    'a más tardar hoy', 'antes del cierre', 'en las próximas horas'
  ],
  legal: [
    // English
    'legal notice', 'breach of contract', 'service termination', 'lawsuit', 'fraud alert',
    // Spanish
    'notificación legal', 'incumplimiento', 'cancelación de servicio', 'demanda', 'alerta de fraude'
  ]
};

/**
 * Checks whether text matches any P1 keyword category.
 */
export function matchesP1Keywords(text: string): { matched: boolean; category?: string; keyword?: string } {
  const lower = (text || '').toLowerCase();
  for (const [category, keywords] of Object.entries(BILINGUAL_P1_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return { matched: true, category, keyword: kw };
      }
    }
  }
  return { matched: false };
}

/**
 * Filter 1: Identifies automated corporate broadcasts, terms of service updates,
 * credit alerts, marketing newsletters, promo codes, e-commerce shop links,
 * and unsubscribe footers in both English & Spanish.
 */
export function isAutomatedOrMarketingEmail(
  sender: string,
  subject: string,
  bodyText: string = '',
  snippet: string = ''
): boolean {
  const sLower = (sender || '').toLowerCase();
  const subjLower = (subject || '').toLowerCase();
  const combinedBody = `${bodyText} ${snippet}`.toLowerCase();
  const fullText = `${sLower} ${subjLower} ${combinedBody}`;

  // Safety Exemption: If explicitly referencing active logistics/financial transaction, do NOT purge as marketing
  const safetyKeywords = [
    'bill of lading', 'bl copy', 'hawb', 'mawb', 'demurrage', 'cargo on hold',
    'customs hold', 'shipment on hold', 'held at customs', 'wire transfer confirmation',
    'telex release', 'retención aduanera', 'carga retenida', 'embarque detenido'
  ];
  if (safetyKeywords.some((sk) => fullText.includes(sk))) {
    return false;
  }

  // 1. Unsubscribe footers (EN & ES)
  const unsubscribePatterns = [
    // English
    'unsubscribe', 'opt out', 'manage your preferences', 'update your preferences',
    'view in browser', 'view online', 'no longer want to receive', 'click here to unsubscribe',
    "if you'd rather not receive", 'if you would rather not receive',
    // Spanish
    'darse de baja', 'cancelar suscripción', 'cancelar la suscripción', 'desuscribirme',
    'anular suscripción', 'preferencias de correo', 'si no deseas recibir', 'ver en el navegador'
  ];
  if (unsubscribePatterns.some((pattern) => combinedBody.includes(pattern))) {
    return true;
  }

  // 2. E-Commerce & Retail CTA indicators (EN & ES)
  const retailPatterns = [
    // English
    'shop now', 'buy now', 'order now', 'view collection', 'shop collection',
    'collections/shop', '/shop-all', 'free shipping', '% off', 'discount code',
    'coupon code', 'promo code', 'use code', 'limited time only',
    'these statements have not been evaluated by the food and drug administration',
    // Spanish
    'compra ahora', 'comprar ahora', 'ver catálogo', 'ver colección',
    'envío gratis', '% de descuento', 'código de descuento', 'cupón de descuento',
    'por tiempo limitado', 'hasta agotar existencias'
  ];
  if (retailPatterns.some((pattern) => fullText.includes(pattern))) {
    return true;
  }

  // 3. Marketing & Broadcast sender patterns
  const marketingSenders = [
    'hello@', 'promo@', 'promotions@', 'newsletter@', 'news@',
    'marketing@', 'deals@', 'offers@', 'rewards@', 'store@',
    'shop@', 'digest@', 'campaigns@', 'updates@'
  ];
  if (marketingSenders.some((kw) => sLower.includes(kw))) {
    return true;
  }

  const marketingDomains = [
    'manage.kmail-lists.com', 'list-manage.com', 'mailchimp.com',
    'sendgrid.net', 'hubspot.com', 'klaviyo.com'
  ];
  if (marketingDomains.some((dom) => sLower.includes(dom))) {
    return true;
  }

  // 4. Standard automated system senders
  const automatedSenders = [
    'no-reply', 'noreply', 'donotreply', 'notifications@', 'notification@',
    'mailer-daemon', 'bounce@', 'jira@', 'atlassian', 'calendar-notification@google.com',
    'billing@', 'invoice@', 'invoices@', 'alerts@', 'alert@', 'security@',
    'news@', 'marketing@', 'newsletter@', 'updates@', 'support@github.com',
    'auto-confirm', 'automated', 'system@', 'info@e.atlassian.com', 'developerrelations',
    '@info.ebay.com', '@ebay.com', '@e.ebay.com', 'member@paypal.com', 'service@paypal.com',
    'auto-reply', 'postmaster@',
    '@alerts.experian.com', 'alerts@experian.com', 'noreply@experian.com', 'no-reply@experian.com', 'notifications@experian.com',
    'creditkarma'
  ];
  if (automatedSenders.some((kw) => sLower.includes(kw))) {
    return true;
  }

  // 5. Automated subjects
  const automatedSubjects = [
    '[jira]', 'invitación:', 'invitacion:', 'invitation:', 'accepted:',
    'declined:', 'tentative:', 'automatic reply', 'auto-reply', 'autoreply',
    'auto reply', 'automatic response', 'automated reply', 'automated response',
    'out of office', 'out-of-office', 'ooo:', '[ooo]',
    'respuesta automática', 'respuesta automatica', 'fuera de la oficina', 'fuera de oficina',
    'undeliverable', 'delivery status notification', 'mail delivery failed', 'returned mail',
    'failure notice', 'plugins were automatically updated',
    'your payment has been processed', 'payment processed', 'payment receipt',
    'payment confirmation', 'order confirmation', 'order receipt',
    'one-time code', 'one-time password', 'verification code', 'security code',
    'security alert', 'access request for pa', 'statement of account',
    'fulfillment by amazon', 'stranded fulfillment', 'shipping confirmation',
    'dhl express one-time code', 'fedex delivery', 'ups tracking',
    'digital event', 'webinar', 'join our',
    'terms of use', 'terms of service', 'privacy policy', 'updating our payments terms',
    'updating our terms', 'we’re updating our', "we're updating our",
    'actualización de términos', 'cambio en las políticas', 'resumen de cuenta',
    'fico® score', 'fico score', 'credit score changed', 'score changed'
  ];
  if (automatedSubjects.some((kw) => subjLower.includes(kw))) {
    return true;
  }

  return false;
}

/**
 * Backward compatibility alias for isAutomatedOrMarketingEmail.
 */
export function isAutomatedEmail(sender: string, subject: string, bodyText: string = '', snippet: string = ''): boolean {
  return isAutomatedOrMarketingEmail(sender, subject, bodyText, snippet);
}

/**
 * Routine delivery / informational customs attachment check (P3 de-escalation).
 */
export function isRoutineDeliveryP3(text: string): boolean {
  const lower = (text || '').toLowerCase();
  const deliveryPatterns = [
    '[entry-pty', 'please find attached', 'adjunto el archivo', 'adjunto copia',
    'for your reference', 'para su referencia', 'for your records', 'para sus registros'
  ];
  const hasDeliveryPattern = deliveryPatterns.some((p) => lower.includes(p));
  if (!hasDeliveryPattern) return false;

  // Must not have questions
  if (text.includes('?') || text.includes('¿')) return false;

  // Must not have financial demands or urgent keywords
  const p1Check = matchesP1Keywords(text);
  if (p1Check.matched) return false;

  const urgentOrDemand = [
    'payment', 'pago', 'overdue', 'vencido', 'urgent', 'urgente',
    'asap', 'action required', 'se requiere', 'remit payment', 'past due'
  ];
  if (urgentOrDemand.some((w) => lower.includes(w))) return false;

  return true;
}

/**
 * Generates 3 distinct tone suggested replies in the exact detected language:
 * Index 0: ⚡ Decisive / Action
 * Index 1: 📋 Detailed / Inquire
 * Index 2: 🤝 Courteous / Holding
 */
export function generateSuggestedReplies(
  isSpanish: boolean,
  category?: string,
  isRoutineDelivery?: boolean
): { suggested_reply: string; suggested_replies: string[] } {
  if (isRoutineDelivery) {
    if (isSpanish) {
      const replies = [
        'Hola, recibido debidamente. Queda archivado para nuestros registros.',
        'Hola, muchas gracias por enviarlo. ¿Podrías confirmarme si se requiere alguna acción adicional de nuestra parte?',
        'Hola, recibido. Muchas gracias por la información.'
      ];
      return { suggested_reply: replies[0], suggested_replies: replies };
    } else {
      const replies = [
        'Hi, received with thanks. We have filed this for our records.',
        'Hi, thank you for sending this over. Could you confirm if any further action is required on our end?',
        'Hi, received. Thank you for the update.'
      ];
      return { suggested_reply: replies[0], suggested_replies: replies };
    }
  }

  if (category === 'financial') {
    if (isSpanish) {
      const replies = [
        'Hola, revisé el estado de cuenta. El pago se estará procesando hoy mismo y compartiremos el comprobante correspondiente.',
        'Hola, muchas gracias por los detalles. ¿Podrías confirmarme el estatus actual y compartir la documentación de respaldo?',
        'Hola, muchas gracias por el mensaje. Recibido debidamente, lo reviso con atención y te respondo a la brevedad.'
      ];
      return { suggested_reply: replies[0], suggested_replies: replies };
    } else {
      const replies = [
        'Hi, I reviewed the statement. Payment is being processed today, and we will send the confirmation receipt shortly.',
        'Hi, thank you for the details. Could you please confirm the current status and share any related documentation?',
        'Hi, thank you for reaching out. I have received your message and will review it in detail shortly.'
      ];
      return { suggested_reply: replies[0], suggested_replies: replies };
    }
  }

  // Default / General (Decisive, Detailed, Holding)
  if (isSpanish) {
    const replies = [
      'Hola, enterado y confirmado. Por favor proceder de inmediato con esto y mantenerme al tanto.',
      'Hola, muchas gracias por los detalles. ¿Podrías confirmarme el estatus actual y compartir la documentación de respaldo?',
      'Hola, muchas gracias por el mensaje. Recibido debidamente, lo reviso con atención y te respondo a la brevedad.'
    ];
    return { suggested_reply: replies[0], suggested_replies: replies };
  } else {
    const replies = [
      'Hi, confirmed and sounds good. Let\'s proceed with this right away.',
      'Hi, thank you for the details. Could you please share more information or confirmation on this?',
      'Hi, thanks for reaching out. Received and noted, I\'m reviewing this and will get back to you shortly.'
    ];
    return { suggested_reply: replies[0], suggested_replies: replies };
  }
}

/**
 * Isolates the actual message content from signatures, quoted reply history,
 * corporate disclaimers, and greetings in email bodies.
 */
export function extractEmailCoreBody(text: string): string {
  if (!text) return '';
  let str = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 1. Cut off quoted email chains
  const quoteSplitters = [
    /\n\s*from:\s+[^\n]+<[^\n]+>/i,
    /\n\s*from:\s+[^\n]+/i,
    /\n\s*de:\s+[^\n]+/i,
    /\n\s*on\s+.{5,120}\s+wrote:\s*$/im,
    /\n\s*el\s+.{5,120}\s+escribi[oó]:\s*$/im,
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

  // 2. Remove common disclaimers / security banners
  str = str.replace(/external email:?\s*be careful with links and attachments/gi, '');
  str = str.replace(/be careful with links and attachments/gi, '');

  // 3. Cut off sign-offs & signatures
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

  // 4. Remove leading greetings
  str = str.replace(/^\s*(?:hi|hello|dear|hola|estimad[oa]|buen(?:os)?\s*d[ií]as?|buenas\s*tardes|buenas\s*noches)\s+[^\n,!:]{1,40}[,.:!]*\s*\n*/i, '');

  return str.trim();
}

/**
 * Filter 2: Identifies conversational closures, pleasantries, acknowledgments,
 * and low-signal messages (e.g. "Ah ya", "ok", "jajaja", "sounds good", "listo", "ok ya le paso", "you welcome").
 */
export function isCourtesyOrClosed(text: string, userAliases?: string[]): boolean {
  if (!text || !text.trim()) return false;

  // Extract core message before signatures, quoted chains, and greetings
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
    // Spanish
    'ah ya', 'ah ok', 'ah bueno', 'ah ya veo', 'ah dale', 'ya veo', 'ya lo vi',
    'ok', 'okay', 'oki', 'okk', 'vale', 'dale', 'dale pues', 'listo', 'listo pues',
    'perfecto', 'genial', 'excelente', 'buenisimo', 'de nada', 'a la orden',
    'con gusto', 'con mucho gusto', 'un placer', 'el placer es mio', 'el placer es mío',
    'el gusto es mio', 'el gusto es mío', 'a tus ordenes', 'a tus órdenes',
    'a sus ordenes', 'a sus órdenes', 'para servirte', 'para servirle',
    'feliz dia', 'feliz día', 'que tengas buen dia', 'que tengas buen día',
    'gracias', 'muchas gracias', 'mil gracias', 'saludos', 'buenas noches', 'buen dia', 'buenos dias',
    'hasta manana', 'hasta mañana', 'hasta luego', 'nos vemos', 'cuidate',
    'tranquila no te preocupes', 'no te preocupes', 'sin problema', 'todo bien',
    'recibido', 'muchas gracias recibido', 'enterado', 'copiado', 'asi es', 'si', 'no', 'claro', 'seguro',
    'jaja', 'jajaja', 'jajajaja', 'jeje', 'jejeje', 'xd', 'lol', 'haha', 'hahaha',
    'no tengo asl',
    // English
    'thanks', 'thank you', 'thx', 'got it', 'sounds good', 'will do',
    'no problem', 'no problem at all', 'no worries', 'sure thing', 'of course',
    'youre welcome', 'you are welcome', 'your welcome', 'you welcome', 'welcome', 'most welcome',
    'anytime', 'my pleasure', 'pleasure', 'glad to help', 'happy to help',
    'cool', 'noted', 'all good', 'all set', 'np', 'k',
    'well received', 'have a good day', 'have a great day', 'have a nice day', 'have a good weekend',
    'i dont have asl', 'dont have asl'
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
      clean === `your welcome ${alias}` ||
      clean === `de nada ${alias}` ||
      clean === `con gusto ${alias}`
    ) {
      return true;
    }
  }

  // Closures starting with "ok", "dale", "gracias", "listo", "you welcome", etc. followed by brief handling remarks (<= 8 words)
  if (
    /^(ok|okay|dale|listo|gracias|perfecto|recibido|you welcome|youre welcome|you are welcome|your welcome|de nada|con gusto|a la orden|un placer)\b/i.test(clean) &&
    clean.split(' ').length <= 8
  ) {
    return true;
  }

  const words = clean.split(' ').filter(Boolean);
  const pleasantryTokens = new Set([
    'ah', 'ya', 'veo', 'ok', 'okay', 'gracias', 'muchas', 'mil', 'dale', 'pues',
    'listo', 'amigo', 'bro', 'perfecto', 'vale', 'thanks', 'thank', 'you',
    'welcome', 'got', 'it', 'cool', 'saludos', 'buenas', 'well', 'received', 'recibido',
    'enterado', 'copiado', 'de', 'nada', 'con', 'gusto', 'placer', 'orden', 'ordenes', 'órdenes',
    'jaja', 'jajaja', 'lol', 'xd', 'claro', 'seguro',
    ...aliases
  ]);

  if (words.length <= 6 && words.every((w) => pleasantryTokens.has(w))) {
    return true;
  }

  return false;
}

/**
 * Accurately detects whether a conversation is primarily in Spanish or English.
 * Evaluates the full transcript and recent messages with token-based scoring.
 */
export function isSpanishContent(...texts: Array<string | null | undefined>): boolean {
  const combined = texts.filter(Boolean).join(' ').toLowerCase();
  if (!combined.trim()) return false;

  // 1. Accents and distinctive Spanish punctuation (+3 points)
  const spanishAccents = (combined.match(/[áéíóúñ¿¡]/g) || []).length * 3;

  // 2. High-confidence Spanish stopwords and markers (+1 point each)
  const spanishWords = (
    combined.match(
      /\b(el|la|los|las|un|una|unos|unas|de|del|en|para|por|con|sin|que|pero|hola|buenos|buenas|dias|dia|tardes|noches|gracias|muchas|saludos|favor|por favor|estimado|estimada|estimados|factura|facturas|adjunto|adjuntamos|recibido|enterado|amigo|amiga|hermano|pedido|precio|cuanto|revisar|revisamos|avisame|estoy|esta|este|esto|bien|todo|nada|claro|dale|listo|entonces|ahora|hoy|mañana|ayer|usted|ustedes|nosotros|tienes|tienen|puedes|puedo|vamos|voy)\b/gi
    ) || []
  ).length;

  // 3. High-confidence English stopwords and markers (+1 point each)
  const englishWords = (
    combined.match(
      /\b(the|is|are|was|were|have|has|had|do|does|did|will|would|can|could|should|what|when|where|why|how|who|which|this|that|these|those|and|but|or|if|not|yes|no|hi|hello|hey|good|morning|afternoon|evening|thanks|thank|thank you|please|dear|regards|need|want|order|price|cost|how much|ship|shipping|fast|quality|movement|come|package|packaging|watch|watches|catalog|dhgate|seller|satisfied|video|confirmation|refund|looking|for|with|there|here|some|more|than|box|honey|full|give|style|remake)\b/gi
    ) || []
  ).length;

  const spanishScore = spanishAccents + spanishWords;
  const englishScore = englishWords;

  // Only classify as Spanish if Spanish tokens clearly outweigh English tokens
  return spanishScore > englishScore;
}

export function isAddressedToOtherOrHandledByColleague(
  text: string,
  sender: string,
  userAliases?: string[],
  isCcOnly?: boolean
): boolean {
  const raw = extractEmailCoreBody(text || '');
  if (!raw) return false;

  const stripped = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/@/g, '')
    .replace(/^[¿¡]+/g, '')
    .trim();
  if (!stripped) return false;

  const lower = stripped.toLowerCase();
  const normalized = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Never purge commercial invoices, billing statements, or customs documents
  const businessDocKeywords = /\b(factura|facturas|invoice|invoices|billing|licencia|knox|payment|pago|cobro|estado de cuenta|bl\b|awb|dua|customs|aduana|embarque)\b/i;
  if (businessDocKeywords.test(normalized)) {
    return false;
  }

  // 1. Short team acknowledgment check (ONLY if the entire core message is <= 12 words)
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (
    wordCount <= 12 &&
    /^(hello|hi|buen(?:os|as)?\s*(?:dia(?:s)?|tardes|noches)|saludos|gracias|perfecto|listo)?\s*[,!.\s]*(well received|recibido|enterado|muchas gracias|copiado)\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  const aliases = new Set(
    (userAliases && userAliases.length > 0 ? userAliases : ['vlad', 'vladimir', 'vlady', 'vladi']).map((a) =>
      a.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    )
  );

  // If user's name/alias appears anywhere in the normalized text, it is NOT addressed solely to someone else
  for (const alias of aliases) {
    if (new RegExp(`\\b${alias}\\b`, 'i').test(normalized)) {
      return false;
    }
  }

  // 2. Check the first non-empty line for a direct greeting to another specific person's name
  // IMPORTANT: Use horizontal whitespace [ \t]+ only so we NEVER cross a newline!
  const firstLine = normalized.split('\n')[0].trim();

  // If it's a general greeting ("buenas tardes", "buenos dias", "hola", "estimados", "good afternoon", etc.) with no name on the first line, it's addressed to all recipients!
  if (
    /^(?:buen(?:os|as)?[ \t]+(?:dia(?:s)?|tardes|noches)|hola|hi|hello|dear[ \t]+(?:all|team|client|customer|friends)|estimad(?:os|as|o[ \t]+cliente)|saludos|good[ \t]+(?:morning|afternoon|evening))[ \t,!.:;]*$/i.test(
      firstLine
    )
  ) {
    return false;
  }

  const greetingMatch = firstLine.match(
    /^(?:buen(?:os|as)?[ \t]+(?:dia(?:s)?|tardes|noches)|hola|hi|hello|dear|estimad[oa]|gracias|saludos)(?:[ \t]+(?:estimad[oa]|sr[a]?|don|dona|ing|lic|dr[a]?))?[ \t]+([a-z]{3,20})\b/i
  );

  const nonPersonWords = new Set([
    'todos', 'todas', 'all', 'team', 'equipo', 'senores', 'senoras', 'sres', 'sras',
    'cliente', 'clientes', 'proveedor', 'proveedores', 'companeros', 'colegas', 'amigos',
    'grupo', 'departamento', 'administracion', 'contabilidad', 'logistica', 'compras', 'ventas',
    'tardes', 'noches', 'dias', 'dia', 'buenas', 'buenos', 'buen', 'saludo', 'saludos',
    'cordial', 'atento', 'estimados', 'estimadas', 'estimado', 'estimada',
    'adjunto', 'adjuntamos', 'anexo', 'envio', 'enviamos', 'comparto', 'compartimos', 'remito',
    'por', 'para', 'con', 'sin', 'sobre', 'este', 'esta', 'estos', 'estas', 'ese', 'esa',
    'les', 'le', 'te', 'me', 'nos', 'se', 'lo', 'la', 'los', 'las', 'un', 'una',
    'espero', 'favor', 'muchas', 'mil', 'gracias', 'recibido', 'enterado', 'confirmado',
    'como', 'cuando', 'donde', 'quien', 'cual', 'que', 'ya', 'hoy', 'ayer', 'manana',
    'factura', 'facturas', 'licencia', 'licencias', 'pedido', 'orden', 'cotizacion', 'pago',
    'there', 'everyone', 'folks', 'guys', 'partner', 'partners', 'customer', 'customers',
    'attached', 'please', 'find', 'here', 'sending', 'sharing', 'following', 'hope', 'thank', 'thanks'
  ]);

  if (greetingMatch) {
    const addressee = greetingMatch[1].toLowerCase();
    if (!aliases.has(addressee) && !nonPersonWords.has(addressee)) {
      // Only purge if explicitly addressed to another colleague's name
      return true;
    }
  }

  return false;
}

export function isGroupMessageRelevantToUser(
  messages: Array<{
    sender: string;
    text?: string;
    body?: string;
    isFromMe?: boolean;
    mentions?: string[];
    quotedParticipant?: string;
  }>,
  userAliases: string[],
  myPhone = '17867686267',
  myLid = '136790446968843'
): boolean {
  if (!messages || messages.length === 0) return false;

  // Find messages after the user's last outgoing message (or inspect the last 5 messages if user hasn't spoken)
  let lastOwnIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].isFromMe) {
      lastOwnIdx = i;
      break;
    }
  }

  const unreadSlice =
    lastOwnIdx !== -1 ? messages.slice(lastOwnIdx + 1) : messages.slice(-5);

  if (unreadSlice.length === 0) return false;

  const cleanPhone = myPhone.replace(/\D/g, '');
  const cleanLid = myLid.replace(/\D/g, '');
  const aliasList = (userAliases && userAliases.length > 0 ? userAliases : ['vlad', 'vladimir', 'vlady', 'vladi'])
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.length >= 3);

  for (const msg of unreadSlice) {
    if (msg.isFromMe) continue;
    const text = (msg.text || msg.body || '').trim();
    const lower = text.toLowerCase();

    // 1. Check Baileys mentionedJid array
    if (Array.isArray(msg.mentions) && msg.mentions.length > 0) {
      for (const mJid of msg.mentions) {
        const mClean = String(mJid).split('@')[0].split(':')[0].replace(/\D/g, '');
        if ((cleanPhone && mClean === cleanPhone) || (cleanLid && mClean === cleanLid)) {
          return true;
        }
      }
    }

    // 2. Check quotedParticipant (replying directly to a message sent by user)
    if (msg.quotedParticipant) {
      const qClean = String(msg.quotedParticipant).split('@')[0].split(':')[0].replace(/\D/g, '');
      if ((cleanPhone && qClean === cleanPhone) || (cleanLid && qClean === cleanLid)) {
        return true;
      }
    }

    // 3. Check @phone or @lid in text
    if (
      (cleanPhone && lower.includes(`@${cleanPhone}`)) ||
      (cleanLid && lower.includes(`@${cleanLid}`))
    ) {
      return true;
    }

    // 4. Check explicit word-boundary mention of user's name/alias in text
    for (const alias of aliasList) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) {
        return true;
      }
    }
  }

  return false;
}

export const FALLBACK_GEMINI_MODELS: Array<{ model: string; apiVersion: 'v1' | 'v1beta' }> = [
  { model: 'gemini-2.5-flash', apiVersion: 'v1beta' },
  { model: 'gemini-2.5-flash-lite', apiVersion: 'v1beta' },
  { model: 'gemini-2.0-flash', apiVersion: 'v1beta' },
  { model: 'gemini-1.5-flash', apiVersion: 'v1beta' },
  { model: 'gemini-1.5-pro', apiVersion: 'v1beta' },
];

let geminiCooldownUntil = 0;

export async function callGemini(
  prompt: string,
  apiKey: string,
  preferredModel?: string
): Promise<TriageResult | null> {
  const cleanKey = (apiKey || '').trim().replace(/^["']|["']$/g, '');
  if (!cleanKey) return null;

  if (Date.now() < geminiCooldownUntil) {
    return null;
  }

  try {
    const genAI = new GoogleGenerativeAI(cleanKey);

    const candidates = preferredModel
      ? [
          { model: preferredModel, apiVersion: 'v1beta' as const },
          ...FALLBACK_GEMINI_MODELS.filter((m) => m.model !== preferredModel),
        ]
      : FALLBACK_GEMINI_MODELS;

    for (const candidate of candidates) {
      try {
        const model = genAI.getGenerativeModel(
          {
            model: candidate.model,
            generationConfig: { responseMimeType: 'application/json' },
          },
          { apiVersion: candidate.apiVersion }
        );

        const res = await model.generateContent(prompt);
        const text = res.response.text();
        const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed: TriageResult = JSON.parse(cleanText);

        geminiCooldownUntil = 0;

        if (parsed.has_action_item && parsed.priority !== 'NONE') {
          const replies = Array.isArray(parsed.suggested_replies)
            ? parsed.suggested_replies.map((s: any) => String(s).trim()).filter(Boolean)
            : undefined;
          return {
            ...parsed,
            suggested_reply: parsed.suggested_reply?.trim() || (replies && replies[0] ? replies[0] : undefined),
            suggested_replies: replies,
          };
        }

        return {
          has_action_item: false,
          action_type: 'NONE',
          priority: 'NONE',
          title: '',
          summary: '',
          purge_reason: parsed.purge_reason?.trim() || 'AI classified as non-actionable communication',
        };
      } catch (err: any) {
        const errMsg = err?.message || '';
        if (errMsg.includes('API_KEY_INVALID') || errMsg.toLowerCase().includes('api key not valid')) {
          console.error('[Gemini] Invalid API key:', errMsg);
          break;
        }
        if (errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429')) {
          console.warn('[Gemini] Quota limit, cooling down for 60s');
          geminiCooldownUntil = Date.now() + 60000;
          break;
        }
        continue;
      }
    }
  } catch (e: any) {
    console.error('[Gemini] Triage error:', e.message);
  }

  return null;
}

/**
 * Universal OpenAI-compatible Chat Completion caller with JSON-mode enforcement.
 * Compatible with Groq, DeepSeek, Local Ollama, and OpenAI-compatible gateways.
 */
export async function callOpenAICompatible(
  prompt: string,
  apiKey: string,
  baseUrl: string,
  model: string
): Promise<TriageResult | null> {
  const cleanKey = (apiKey || '').trim().replace(/^["']|["']$/g, '');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s maximum timeout

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cleanKey}`,
      },
      body: JSON.stringify({
        model: model || 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[AI Provider: ${model}] Error ${res.status}:`, errText);
      return null;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    const cleanText = content.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed: TriageResult = JSON.parse(cleanText);

    if (parsed.has_action_item && parsed.priority !== 'NONE') {
      const replies = Array.isArray(parsed.suggested_replies)
        ? parsed.suggested_replies.map((s: any) => String(s).trim()).filter(Boolean)
        : undefined;
      return {
        ...parsed,
        suggested_reply: parsed.suggested_reply?.trim() || (replies && replies[0] ? replies[0] : undefined),
        suggested_replies: replies,
      };
    }

    return {
      has_action_item: false,
      action_type: 'NONE',
      priority: 'NONE',
      title: '',
      summary: '',
      purge_reason: parsed.purge_reason?.trim() || 'AI classified as non-actionable communication',
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.warn(`[AI Provider: ${model}] Timed out after 10s. Falling back to heuristic triage.`);
    } else {
      console.error(`[AI Provider: ${model}] Request failed:`, err.message);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Universal Multi-Provider AI Router.
 * Prioritizes Local Ollama (100% Offline & Private), with fallback to Groq, DeepSeek, or Gemini if explicitly configured.
 */
export async function callAI(
  prompt: string,
  options: {
    model?: string;
    apiKey?: string | null;
  }
): Promise<TriageResult | null> {
  const selectedModel = (options.model || 'ollama/llama3.2').toLowerCase();
  const rawKey = (options.apiKey || '').trim();

  // 1. Ollama (Local GPU or Ollama Cloud)
  if (
    selectedModel.includes('ollama') ||
    selectedModel.includes('localhost') ||
    selectedModel.includes('beam') ||
    (!rawKey && !selectedModel.includes('gemini') && !selectedModel.includes('groq') && !selectedModel.includes('deepseek'))
  ) {
    let customEndpoint = process.env.OLLAMA_BASE_URL || '';
    let authKey = process.env.OLLAMA_API_KEY || '';

    if (rawKey) {
      if (rawKey.startsWith('{') && rawKey.endsWith('}')) {
        try {
          const parsed = JSON.parse(rawKey);
          if (parsed.endpoint) customEndpoint = parsed.endpoint;
          if (parsed.apiKey || parsed.key) authKey = parsed.apiKey || parsed.key;
        } catch {}
      } else if (rawKey.startsWith('http')) {
        customEndpoint = rawKey;
      } else {
        authKey = rawKey;
      }
    }

    // Ignore cross-provider keys (AIza... for Gemini, gsk_... for Groq)
    if (authKey.startsWith('AIza') || authKey.startsWith('gsk_')) {
      authKey = '';
    }

    let modelClean = selectedModel.replace(/^ollama\//, '').replace(/^ollama:/, '') || 'llama3.2';
    if (modelClean === 'beam' || modelClean === 'beam:cloud') {
      modelClean = 'beam:cloud';
    }

    const isOllamaCloudModel =
      selectedModel.includes('beam') ||
      selectedModel.includes('gpt-oss') ||
      selectedModel.includes('gemma4') ||
      selectedModel.includes('nemotron');

    if (isOllamaCloudModel && authKey) {
      const cloudEndpoint = customEndpoint || 'https://ollama.com/v1';
      const cleanEndpoint = cloudEndpoint.endsWith('/v1') ? cloudEndpoint : cloudEndpoint.replace(/\/+$/, '') + '/v1';
      const result = await callOpenAICompatible(
        prompt,
        authKey,
        cleanEndpoint,
        modelClean
      );
      if (result) return result;

      // Clean fallback to Local Ollama
      const localEndpoint = 'http://127.0.0.1:11434/v1';
      for (const fallbackModel of ['llama3.2:latest', 'llama3.1:8b']) {
        const localResult = await callOpenAICompatible(
          prompt,
          'ollama',
          localEndpoint,
          fallbackModel
        );
        if (localResult) return localResult;
      }
      return null;
    }

    // Local Ollama
    let localBaseUrl = customEndpoint || 'http://127.0.0.1:11434/v1';
    if (!localBaseUrl.endsWith('/v1')) {
      localBaseUrl = localBaseUrl.replace(/\/+$/, '') + '/v1';
    }

    const localCandidates = Array.from(new Set([
      isOllamaCloudModel ? 'llama3.2:latest' : modelClean,
      'llama3.2:latest',
      'llama3.1:8b',
    ]));

    for (const cand of localCandidates) {
      const result = await callOpenAICompatible(
        prompt,
        'ollama',
        localBaseUrl,
        cand
      );
      if (result) return result;
    }

    return null;
  }

  const key = rawKey || process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || '';

  // 2. Groq - if model contains groq or key starts with gsk_
  if (selectedModel.includes('groq') || selectedModel.includes('llama') || selectedModel.includes('gpt-oss') || selectedModel.includes('qwen') || key.startsWith('gsk_')) {
    const groqKey = key.startsWith('gsk_') ? key : (process.env.GROQ_API_KEY || key);
    if (groqKey) {
      let preferred = 'openai/gpt-oss-120b';
      if (selectedModel.includes('3.3') || selectedModel.includes('70b')) preferred = 'llama-3.3-70b-versatile';
      else if (selectedModel.includes('gpt-oss-20b')) preferred = 'openai/gpt-oss-20b';
      else if (selectedModel.includes('qwen')) preferred = 'qwen/qwen3.8-27b';
      else if (selectedModel.includes('120b')) preferred = 'openai/gpt-oss-120b';

      const candidates = Array.from(new Set([
        preferred,
        'openai/gpt-oss-120b',
        'openai/gpt-oss-20b',
        'qwen/qwen3.8-27b',
        'llama-3.3-70b-versatile',
      ]));

      for (const cand of candidates) {
        const result = await callOpenAICompatible(
          prompt,
          groqKey,
          'https://api.groq.com/openai/v1',
          cand
        );
        if (result) return result;
      }
    }
  }

  // 3. DeepSeek - if model contains deepseek or key starts with sk-
  if (selectedModel.includes('deepseek')) {
    const dsKey = key || process.env.DEEPSEEK_API_KEY || '';
    if (dsKey) {
      const result = await callOpenAICompatible(
        prompt,
        dsKey,
        'https://api.deepseek.com',
        'deepseek-chat'
      );
      if (result) return result;
    }
  }

  // 4. Default / Fallback: Google Gemini
  if (key && !key.startsWith('gsk_')) {
    const geminiModel = selectedModel.startsWith('gemini/')
      ? selectedModel.replace('gemini/', '')
      : selectedModel.startsWith('gemini')
      ? selectedModel
      : undefined;
    return callGemini(prompt, key, geminiModel);
  }

  return null;
}

export async function analyzeThread(
  thread: {
    subject: string;
    channel: string;
    account_name?: string;
    contact_name?: string;
    last_message_sender: string;
    is_outgoing_last: boolean;
    isGroup?: boolean;
    is_cc_only?: boolean;
    external_id?: string;
    messages: Array<{
      sender: string;
      text?: string;
      body?: string;
      isFromMe?: boolean;
      myReaction?: string;
      mentions?: string[];
      quotedParticipant?: string;
    }>;
    snippet?: string;
    body_text?: string;
  },
  context: {
    displayName?: string;
    userAliases?: string[];
    userEmails?: string[];
    geminiApiKey?: string | null;
    llmModel?: string;
    myPhone?: string;
    myLid?: string;
  }
): Promise<TriageResult> {
  const messages = thread.messages || [];
  if (messages.length === 0) {
    return {
      has_action_item: false,
      action_type: 'NONE',
      priority: 'NONE',
      title: '',
      summary: '',
      purge_reason: 'No message content in thread',
    };
  }

  const recipientName = context.displayName || 'You';
  const aliases = context.userAliases && context.userAliases.length > 0
    ? context.userAliases
    : ['vlad', 'vladimir', 'vlady', 'vladi'];
  const userEmails = context.userEmails || [];

  const lastMsg = messages[messages.length - 1];
  const lastText = (lastMsg.text || lastMsg.body || '').trim();
  const allText = `${messages.map((m) => m.text || m.body || '').join('\n')} ${thread.body_text || ''} ${thread.snippet || ''}`;

  // Filter: Outgoing Message or Reaction (Strict Auto-Resolution — BEFORE any other filter or commitment check)
  if (lastMsg.myReaction) {
    return {
      has_action_item: false,
      action_type: 'NONE',
      priority: 'NONE',
      title: '',
      summary: `${thread.subject} — Acknowledged with reaction (${lastMsg.myReaction})`,
      deadline_text: 'No action needed',
      purge_reason: `User acknowledged conversation with reaction: ${lastMsg.myReaction}`,
    };
  }

  const lowerSender = (thread.last_message_sender || '').toLowerCase();
  let isUserSpeaking = Boolean(thread.is_outgoing_last) || Boolean(lastMsg.isFromMe);
  if (!isUserSpeaking && thread.channel === 'email') {
    isUserSpeaking =
      aliases.some((a) => lowerSender.includes(a.toLowerCase())) ||
      userEmails.some((e) => lowerSender.includes(e.toLowerCase()));
  }

  if (isUserSpeaking) {
    return {
      has_action_item: false,
      action_type: 'NONE',
      priority: 'NONE',
      title: '',
      summary: '',
      purge_reason: 'User sent the last message / conversation already answered',
    };
  }

  // Filter: WhatsApp Group Chat Relevance Filter
  const isWhatsAppGroup =
    thread.channel === 'whatsapp' &&
    (Boolean(thread.isGroup) || Boolean(thread.external_id?.endsWith('@g.us')));

  if (isWhatsAppGroup) {
    const isRelevant = isGroupMessageRelevantToUser(
      messages,
      aliases,
      context.myPhone || '17867686267',
      context.myLid || '136790446968843'
    );
    if (!isRelevant) {
      return {
        has_action_item: false,
        action_type: 'NONE',
        priority: 'NONE',
        title: '',
        summary: '',
        purge_reason: 'Group chat message where user was not mentioned or replied to',
      };
    }
  }

  // Filter 1: Automated Broadcasts / Corporate terms / receipts / credit alerts / marketing newsletters
  if (thread.channel === 'email' && isAutomatedOrMarketingEmail(thread.last_message_sender, thread.subject, allText, thread.snippet)) {
    return {
      has_action_item: false,
      action_type: 'NONE',
      priority: 'NONE',
      title: '',
      summary: '',
      purge_reason: 'Automated newsletter, receipt, marketing, or system notification',
    };
  }

  // Filter 2: Courtesy, acknowledgments, closings ("Ah ya", "ok", "dale", "jajaja", etc.)
  if (isCourtesyOrClosed(lastText, aliases)) {
    return {
      has_action_item: false,
      action_type: 'NONE',
      priority: 'NONE',
      title: '',
      summary: '',
      purge_reason: 'Conversational acknowledgment / courtesy closure',
    };
  }

  // Filter 3: Team threads addressed to another colleague or already acknowledged
  if (
    thread.channel === 'email' &&
    isAddressedToOtherOrHandledByColleague(lastText, thread.last_message_sender, aliases, thread.is_cc_only)
  ) {
    return {
      has_action_item: false,
      action_type: 'NONE',
      priority: 'NONE',
      title: '',
      summary: '',
      purge_reason: 'Thread addressed to another colleague or already acknowledged by team',
    };
  }

  // Dedicated voice note / audio clip handler for incoming voice messages
  const isVoice = lastText.includes('[Voice Note]') || lastText.includes('[Audio Clip]');
  const isSpanish = isSpanishContent(lastText, allText, thread.subject, thread.contact_name);

  if (isVoice && !isUserSpeaking) {
    const contact = thread.contact_name || thread.last_message_sender || 'Contact';
    const isLangSpanish = isSpanish;
    const defaultVoiceReplies = isLangSpanish
      ? [
          'Hola, ya escuché tu audio. Dame unos minutos y te respondo.',
          'Hola, perfecto, enterado de lo que me comentas en el audio.',
          'Hola, voy conduciendo/en reunión. En cuanto me desocupe escucho tu audio y te contesto.',
        ]
      : [
          'Hi, I listened to your voice message. Will reply in a few minutes.',
          'Hi, noted on your voice message.',
          'Hi, currently in a meeting. Will listen to your voice note and get back to you shortly.',
        ];

    return {
      has_action_item: true,
      action_type: 'REPLY_NEEDED',
      priority: 'P2_MEDIUM',
      title: isLangSpanish ? `Nota de voz de ${contact}` : `Voice message from ${contact}`,
      summary: isLangSpanish
        ? `${contact} envió un mensaje de voz que requiere tu atención y respuesta.`
        : `${contact} sent a voice clip requiring your attention and reply.`,
      deadline_text: 'Listen & reply',
      suggested_reply: defaultVoiceReplies[0],
      suggested_replies: defaultVoiceReplies,
    };
  }

  // Deterministic Keyword Evaluation: P1 Bilingual match vs P3 Routine Delivery
  const combinedContextText = `${thread.subject} ${lastText} ${thread.snippet || ''}`;
  const p1Check = matchesP1Keywords(combinedContextText);
  const isRoutineDelivery = isRoutineDeliveryP3(combinedContextText);

  const effectiveKey = (context.geminiApiKey || '').trim() || process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || '';
  const isOllama = !context.llmModel || (context.llmModel || '').toLowerCase().includes('ollama');

  // If AI Provider key or Ollama is available, prompt AI for deep reasoning
  if (effectiveKey || isOllama) {
    const prompt = `You are the elite Chief of Staff and Executive Assistant to ${recipientName} (aliases: ${aliases.join(', ')}).
Evaluate this communication with human-grade executive discretion: surface ONLY items that genuinely require ${recipientName}'s personal attention, decision, or reply.

Thread Details:
- Channel: ${thread.channel} (${thread.account_name || ''})
- Subject: ${thread.subject}
- Contact / Sender: ${thread.contact_name || thread.last_message_sender}
- Conversation Transcript:
${messages.map((m) => `[${m.sender}]: ${m.text || m.body || ''}`).join('\n')}

RECIPIENT & GREETING RULES:
- If the email starts with a general greeting like "Buenas tardes", "Buenos días", "Buenas noches", "Good afternoon", "Good morning", "Hello", or "Estimados", it is addressed to ALL recipients in the To: field including ${recipientName}. Do NOT classify it as addressed to another colleague.
- Commercial invoices, billing statements, and license invoices (e.g. "FACTURA", "Adjunto facturas", "Invoice", "Billing") sent to ${recipientName} MUST be marked has_action_item: true (at least P2_MEDIUM).

VOICE NOTES & MEDIA:
- If incoming message has '[Voice Note]' or '[Audio Clip]', ALWAYS classify as has_action_item: true with priority P2_MEDIUM.

STRICT LANGUAGE DIRECTIVE & 3-TONE STRUCTURE:
- The incoming communication is in ${isSpanish ? 'SPANISH' : 'ENGLISH'}.
- CRITICAL: ALL 3 suggested replies in 'suggested_replies' MUST be in the EXACT SAME LANGUAGE as the sender (${isSpanish ? 'SPANISH' : 'ENGLISH'}).
- If the sender wrote in English, ALL 3 replies MUST be in natural, professional English. Never reply in Spanish to an English inquiry!
- If the sender wrote in Spanish, ALL 3 replies MUST be in Spanish.
- Provide EXACTLY 3 distinct replies adhering to these tones:
  - Index 0: ⚡ Decisive / Action (direct decision or immediate authorization)
  - Index 1: 📋 Detailed / Inquire (asking for status, clarification, or supporting documents)
  - Index 2: 🤝 Courteous / Holding (acknowledgment buying time to review)
- 'suggested_reply' MUST match Index 0.

PRIORITY CRITERIA:
- 'P1_HIGH': Urgent / Critical deadline (within 24 hours, customs hold, demurrage, overdue account, immediate payment required).
- 'P2_MEDIUM': Normal action needed, reply required, decision needed (2-3 days).
- 'P3_LOW': Routine attachment deliveries, informational updates with no questions or payment requests.

Respond strictly in valid JSON format:
{
  "has_action_item": boolean,
  "action_type": "REPLY_NEEDED" | "PROMISED_TO_SEND" | "AWAITING_THEIR_REPLY" | "NONE",
  "priority": "P1_HIGH" | "P2_MEDIUM" | "P3_LOW" | "NONE",
  "title": "Concise executive title",
  "summary": "1-2 sentence contextual briefing",
  "deadline_text": "Always in English (e.g. 'Reply needed', 'Needs reply today', 'Informational', 'Follow-up promised')",
  "suggested_reply": "Primary suggested reply (matches message language)",
  "suggested_replies": [
    "Tone 1 (⚡ Decisive): ...",
    "Tone 2 (📋 Detailed): ...",
    "Tone 3 (🤝 Holding): ..."
  ],
  "purge_reason": "Reason if has_action_item is false"
}`;

    const aiResult = await callAI(prompt, {
      model: context.llmModel || 'ollama/llama3.2',
      apiKey: isOllama ? context.geminiApiKey : effectiveKey,
    });
    if (aiResult) {
      // Enforce deterministic priority boundaries on AI response
      if (p1Check.matched) {
        aiResult.has_action_item = true;
        aiResult.priority = 'P1_HIGH';
        aiResult.deadline_text = 'Needs reply today';
      } else if (isRoutineDelivery) {
        aiResult.priority = 'P3_LOW';
        aiResult.deadline_text = 'Informational';
      }

      // Ensure 3 tones in proper language if AI gave invalid array
      if (!aiResult.suggested_replies || aiResult.suggested_replies.length < 3) {
        const fallbacks = generateSuggestedReplies(isSpanish, p1Check.category, isRoutineDelivery);
        aiResult.suggested_reply = fallbacks.suggested_reply;
        aiResult.suggested_replies = fallbacks.suggested_replies;
      }

      return aiResult;
    }
  }

  // Resilient heuristic fallback if AI is unconfigured or rate limited
  const contact = thread.contact_name || thread.last_message_sender || 'Contact';

  if (isRoutineDelivery) {
    const { suggested_reply, suggested_replies } = generateSuggestedReplies(isSpanish, undefined, true);
    return {
      has_action_item: true,
      action_type: 'REPLY_NEEDED',
      priority: 'P3_LOW',
      title: thread.subject || `Delivery from ${contact}`,
      summary: `Routine delivery: "${lastText.slice(0, 120)}"`,
      deadline_text: 'Informational',
      suggested_reply,
      suggested_replies,
    };
  }

  if (p1Check.matched) {
    const { suggested_reply, suggested_replies } = generateSuggestedReplies(isSpanish, p1Check.category);
    return {
      has_action_item: true,
      action_type: 'REPLY_NEEDED',
      priority: 'P1_HIGH',
      title: thread.subject || `Urgent: ${contact}`,
      summary: `Action required (${p1Check.keyword}): "${lastText.slice(0, 120)}"`,
      deadline_text: 'Needs reply today',
      suggested_reply,
      suggested_replies,
    };
  }

  const { suggested_reply, suggested_replies } = generateSuggestedReplies(isSpanish);
  return {
    has_action_item: true,
    action_type: 'REPLY_NEEDED',
    priority: 'P2_MEDIUM',
    title: thread.subject || `Reply needed from ${contact}`,
    summary: `Unanswered message: "${lastText.slice(0, 120)}"`,
    deadline_text: 'Reply needed',
    suggested_reply,
    suggested_replies,
  };
}
