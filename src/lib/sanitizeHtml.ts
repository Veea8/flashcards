/**
 * Card HTML comes from files the user drops in, so it is untrusted. We parse it
 * into an inert document, drop everything that isn't on the allowlist, and
 * re-serialise — rather than pattern-matching the string, which never holds.
 */

const ALLOWED_TAGS = new Set([
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'br',
  'sub',
  'sup',
  'p',
  'div',
  'span',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'pre',
  'code',
  'kbd',
  'hr',
  'blockquote',
  'small',
  'mark',
  'h1',
  'h2',
  'h3',
  'h4',
]);

/** Tags whose *contents* must go too, not just the tag itself. */
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template']);

export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  clean(doc.body);
  return doc.body.innerHTML;
}

function clean(root: Element): void {
  for (const node of [...root.children]) {
    const tag = node.tagName.toLowerCase();

    if (DROP_WITH_CONTENT.has(tag)) {
      node.remove();
      continue;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      // Keep the text, lose the element.
      clean(node);
      node.replaceWith(...node.childNodes);
      continue;
    }

    // No attributes survive — that covers on* handlers, href/src payloads and
    // style-based tricks in one rule.
    for (const attr of [...node.attributes]) node.removeAttribute(attr.name);
    clean(node);
  }
}

/** Does this text contain markup we should render rather than print? */
export function looksLikeHtml(text: string): boolean {
  return /<(b|i|u|s|br|sub|sup|div|span|p|ul|ol|li|table|tr|td|th|pre|code|strong|em)\b[^>]*>/i.test(
    text,
  );
}

/** Plain-text fallback: entities decoded, block breaks preserved. */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(
    `<body>${html.replace(/<br\s*\/?>/gi, '\n')}</body>`,
    'text/html',
  );
  return (doc.body.textContent ?? '').trim();
}
