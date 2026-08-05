// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { htmlToText, looksLikeHtml, sanitizeHtml } from './sanitizeHtml';

describe('sanitizeHtml', () => {
  it('keeps the formatting Anki cards actually use', () => {
    const html = 'a<sub>1</sub> &middot; a<sup>n&minus;1</sup> is <b>bold</b> and <i>italic</i>';
    const clean = sanitizeHtml(html);
    expect(clean).toContain('<sub>1</sub>');
    expect(clean).toContain('<sup>');
    expect(clean).toContain('<b>bold</b>');
    expect(clean).toContain('<i>italic</i>');
  });

  it('keeps tables, lists, pre and line breaks', () => {
    const clean = sanitizeHtml(
      '<table><tr><td>x</td></tr></table><ul><li>one</li></ul><pre>code</pre>a<br>b',
    );
    expect(clean).toContain('<td>x</td>');
    expect(clean).toContain('<li>one</li>');
    expect(clean).toContain('<pre>code</pre>');
    expect(clean).toContain('<br>');
  });

  it('drops scripts along with their contents', () => {
    const clean = sanitizeHtml('safe<script>alert(1)</script>text');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('alert');
    expect(clean).toContain('safe');
    expect(clean).toContain('text');
  });

  it('strips every attribute, including event handlers and urls', () => {
    const clean = sanitizeHtml('<b onclick="steal()" style="position:fixed">hi</b>');
    expect(clean).toBe('<b>hi</b>');
  });

  it('unwraps disallowed tags but keeps their text', () => {
    const clean = sanitizeHtml('<a href="http://evil.test">click <b>me</b></a>');
    expect(clean).not.toContain('<a');
    expect(clean).not.toContain('evil.test');
    expect(clean).toContain('click <b>me</b>');
  });

  it('removes an img payload entirely', () => {
    const clean = sanitizeHtml('<img src=x onerror="alert(1)">caption');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('<img');
    expect(clean).toContain('caption');
  });
});

describe('looksLikeHtml', () => {
  it('spots markup and ignores plain maths', () => {
    expect(looksLikeHtml('a <b>bold</b> claim')).toBe(true);
    expect(looksLikeHtml('is 3 < 5 and 7 > 2?')).toBe(false);
  });
});

describe('htmlToText', () => {
  it('decodes entities and turns <br> into newlines', () => {
    expect(htmlToText('A &cap; B = &empty;<br>next')).toBe('A ∩ B = ∅\nnext');
  });
});
