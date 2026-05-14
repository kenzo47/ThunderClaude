import { describe, expect, it } from 'vitest';

import { splitSignature } from '../src/background/signature.js';

describe('signature detection', () => {
  it('splits Thunderbird signature markup from the draft body', () => {
    expect(splitSignature('<p>Hello there</p><div class="moz-signature">-- <br>Ken</div>')).toEqual(
      {
        bodyHtml: '<p>Hello there</p>',
        signatureHtml: '<div class="moz-signature">-- <br>Ken</div>',
      }
    );
  });

  it('splits a standard signature delimiter near the end', () => {
    expect(splitSignature('<p>Hello there</p><br>-- <br>Ken')).toEqual({
      bodyHtml: '<p>Hello there</p><br>',
      signatureHtml: '-- <br>Ken',
    });
  });

  it('keeps a delimiter wrapper with the signature', () => {
    expect(splitSignature('<p>Hello there</p><div>-- <br>Ken</div>')).toEqual({
      bodyHtml: '<p>Hello there</p>',
      signatureHtml: '<div>-- <br>Ken</div>',
    });
  });

  it('detects a trailing HTML contact table signature', () => {
    const signature =
      '<table><tr><td><img src="cid:logo"></td><td>Ken<br><a href="mailto:ken@example.test">Email</a></td></tr></table>';

    expect(splitSignature(`<p>Hello there</p>${signature}`)).toEqual({
      bodyHtml: '<p>Hello there</p>',
      signatureHtml: signature,
    });
  });
});
