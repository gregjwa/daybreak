/**
 * Email content extraction utilities
 * Extracts meaningful content from email bodies for AI enrichment
 */

// Common greeting patterns to strip from the start
const GREETING_PATTERNS = [
  /^(Hi|Hello|Dear|Hey|Good\s*morning|Good\s*afternoon|Good\s*evening|Greetings)[,\s]*[^,\n]{0,50}[,\s]*/i,
  /^(To whom it may concern)[,:\s]*/i,
  /^(I hope this (email|message) finds you well)[.\s]*/i,
  /^(Thank you for (your|reaching out|contacting))[^.]*[.\s]*/i,
  /^(Just following up|Following up on)[^.]*[.\s]*/i,
  /^(I('m| am) (just\s+)?writing to)[^.]*[.\s]*/i,
  /^(I wanted to)[^.]*[.\s]*/i,
];

// Common signature patterns to strip from the end
const SIGNATURE_PATTERNS = [
  // Closing lines
  /\n(Best|Thanks|Thank you|Regards|Cheers|Sincerely|Warmly|Kind regards|Best regards|Many thanks|With thanks|Yours|Respectfully)[,\s]*.*/is,
  // Signature separator
  /\n--\s*.*/s,
  // Sent from device
  /\n(Sent from my|Sent via|Get Outlook for).*/is,
  // Forwarded/replied content
  /\n(On\s+.+\s+wrote:|From:\s+.+|------\s*Forwarded\s+message).*/is,
  // Unsubscribe links
  /\n.*unsubscribe.*/is,
];

// HTML entities to decode
const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&ndash;': '–',
  '&mdash;': '—',
  '&hellip;': '…',
  '&copy;': '©',
  '&reg;': '®',
  '&trade;': '™',
};

/**
 * Extract meaningful text from email body
 * - Strip HTML tags
 * - Decode HTML entities
 * - Remove common greetings ("Hi X,", "Dear X,")
 * - Remove signature blocks ("Best,", "Thanks," and below)
 * - Normalize whitespace
 * - Return up to maxLength chars of meaningful content
 */
export function extractMeaningfulContent(
  body: string,
  maxLength: number = 400
): string {
  let text = body;

  // Step 1: Strip HTML tags
  text = stripHtml(text);

  // Step 2: Decode HTML entities
  text = decodeHtmlEntities(text);

  // Step 3: Normalize whitespace (but preserve paragraph breaks)
  text = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();

  // Step 4: Remove signature blocks from the end (do this first!)
  for (const pattern of SIGNATURE_PATTERNS) {
    text = text.replace(pattern, '');
  }
  text = text.trim();

  // Step 5: Remove greeting patterns from the start
  for (const pattern of GREETING_PATTERNS) {
    text = text.replace(pattern, '');
  }
  text = text.trim();

  // Step 6: Collapse remaining multiple newlines to single
  text = text.replace(/\n{2,}/g, '\n');

  // Step 7: Truncate to maxLength at word boundary
  if (text.length > maxLength) {
    text = truncateAtWordBoundary(text, maxLength);
  }

  return text.trim();
}

/**
 * Strip HTML tags from text
 */
function stripHtml(html: string): string {
  // Remove script and style elements entirely
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Replace block elements with newlines
  text = text.replace(/<\/?(div|p|br|tr|li|h[1-6])[^>]*>/gi, '\n');

  // Remove all other HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  return text;
}

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(text: string): string {
  // Replace known entities
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    text = text.replace(new RegExp(entity, 'gi'), char);
  }

  // Decode numeric entities (&#123; or &#x7B;)
  text = text.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(parseInt(code, 10))
  );
  text = text.replace(/&#x([0-9a-f]+);/gi, (_, code) =>
    String.fromCharCode(parseInt(code, 16))
  );

  // Remove any remaining HTML entities
  text = text.replace(/&[a-z]+;/gi, ' ');

  return text;
}

/**
 * Truncate text at word boundary, adding ellipsis
 */
function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  // Find the last space before maxLength
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.7) {
    return truncated.slice(0, lastSpace) + '...';
  }

  return truncated + '...';
}

/**
 * Extract email subject, stripping common prefixes
 */
export function cleanSubject(subject: string): string {
  return subject
    .replace(/^(Re:|Fwd:|Fw:)\s*/gi, '')
    .replace(/^(Re:|Fwd:|Fw:)\s*/gi, '') // Handle multiple levels
    .trim();
}

/**
 * Combine subject and body into a single context string
 * Format: "Subject: <clean subject> | <body content>"
 */
export function formatEmailContext(
  subject: string,
  body: string,
  maxBodyLength: number = 350
): string {
  const cleanedSubject = cleanSubject(subject);
  const cleanedBody = extractMeaningfulContent(body, maxBodyLength);

  if (cleanedBody) {
    return `"${cleanedSubject}" - "${cleanedBody}"`;
  }

  return `"${cleanedSubject}"`;
}

/**
 * Email context object stored in emailContextJson
 */
export interface EmailContext {
  subject: string;
  content: string;
  date: string;
}

/**
 * Build email context array from raw messages
 * Keeps the most recent N messages, sorted newest first
 */
export function buildEmailContextArray(
  emails: Array<{ subject: string; body: string; date: Date }>,
  maxEmails: number = 5,
  maxContentLength: number = 400
): EmailContext[] {
  return emails
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, maxEmails)
    .map((email) => ({
      subject: cleanSubject(email.subject),
      content: extractMeaningfulContent(email.body, maxContentLength),
      date: email.date.toISOString(),
    }));
}

