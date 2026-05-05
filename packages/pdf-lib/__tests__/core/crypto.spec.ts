import * as fs from 'fs';
import * as nodeCrypto from 'node:crypto';

import PDFDocument from '../../src/api/PDFDocument';
import { AES256Cipher } from '../../src/core/crypto';

const aes256EncryptedPdfBytes = fs.readFileSync('assets/pdfs/encrypted_aes256.pdf');
const normalPdfBytes = fs.readFileSync('assets/pdfs/normal.pdf');

const nistAes256Key = new Uint8Array([
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
  0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
  0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17,
  0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
]);

const nistAes256Plaintext = new Uint8Array([
  0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77,
  0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
]);

const nistAes256Ciphertext = new Uint8Array([
  0x8e, 0xa2, 0xb7, 0xca, 0x51, 0x67, 0x45, 0xbf,
  0xea, 0xfc, 0x49, 0x90, 0x4b, 0x49, 0x60, 0x89,
]);

const decryptWithPdfLib = (key: Uint8Array, ciphertext: Uint8Array) => {
  const cipher = new AES256Cipher(key);
  return cipher._decrypt(ciphertext, cipher._key);
};

const encryptWithNodeAes256Ecb = (key: Uint8Array, plaintext: Uint8Array) => {
  const cipher = nodeCrypto.createCipheriv('aes-256-ecb', key, null);
  cipher.setAutoPadding(false);
  return new Uint8Array(cipher.update(plaintext));
};

describe('AES256Cipher', () => {
  test('decrypts the NIST FIPS 197 C.3 AES-256 ECB vector', () => {
    const decrypted = decryptWithPdfLib(nistAes256Key, nistAes256Ciphertext);

    expect(Array.from(decrypted)).toEqual(Array.from(nistAes256Plaintext));
  });

  test('matches Node.js crypto for a deterministic AES-256 ECB block', () => {
    const key = Uint8Array.from({ length: 32 }, (_, index) => (index * 7 + 3) & 0xff);
    const plaintext = Uint8Array.from({ length: 16 }, (_, index) => (index * 11 + 5) & 0xff);
    const encrypted = encryptWithNodeAes256Ecb(key, plaintext);
    const decrypted = decryptWithPdfLib(key, encrypted);

    expect(Array.from(decrypted)).toEqual(Array.from(plaintext));
  });

  // Regression test for https://github.com/pdfme/pdfme/issues/1348:
  // round-tripping an AES-256 (V=5/R=5) encrypted PDF with the empty user
  // password used to silently corrupt the decrypted content streams.
  test('round-trips a V=5/R=5 AES-256 encrypted PDF with the empty password', async () => {
    const decrypted = await PDFDocument.load(aes256EncryptedPdfBytes, {
      password: '',
    });

    // The encrypted fixture is built from `normal.pdf`, which has 2 pages.
    expect(decrypted.getPageCount()).toBe(2);

    // Saving must succeed (with the buggy decrypt path the saved bytes were
    // structurally valid but content streams were garbled).
    const reSaved = await decrypted.save({ updateFieldAppearances: false });
    expect(reSaved.length).toBeGreaterThan(0);

    // Loading the re-saved bytes must yield the same page count.
    const reLoaded = await PDFDocument.load(reSaved);
    expect(reLoaded.getPageCount()).toBe(2);

    // Sanity: the re-loaded document is no longer encrypted.
    expect(reLoaded.isEncrypted).toBe(false);
  });

  test('decrypted page count matches the unencrypted source PDF', async () => {
    const source = await PDFDocument.load(normalPdfBytes);
    const encrypted = await PDFDocument.load(aes256EncryptedPdfBytes, {
      password: '',
    });
    expect(encrypted.getPageCount()).toBe(source.getPageCount());
  });

  // The Node-native override and the pure-JS fallback must agree on every
  // single AES-256 block decryption performed while opening the fixture, or
  // the round-trip above would not be a meaningful guarantee. Patching the
  // override out at runtime lets us compare both implementations against the
  // exact same ciphertexts that a real V=5/R=5 PDF produces.
  test('native AES-256 override agrees with the JS fallback for every block in the fixture', async () => {
    const proto = AES256Cipher.prototype as unknown as {
      _decrypt: (input: Uint8Array, key: Uint8Array) => Uint8Array;
    };
    const baseProto = Object.getPrototypeOf(proto) as {
      _decrypt: (input: Uint8Array, key: Uint8Array) => Uint8Array;
    };
    const overrideDecrypt = proto._decrypt;
    expect(overrideDecrypt).not.toBe(baseProto._decrypt);

    let mismatches = 0;
    let comparisons = 0;
    proto._decrypt = function patched(input, key) {
      comparisons++;
      const native = overrideDecrypt.call(this, input, key);
      const fallback = baseProto._decrypt.call(this, input, key);
      if (Buffer.compare(Buffer.from(native), Buffer.from(fallback)) !== 0) {
        mismatches++;
      }
      return native;
    };
    try {
      await PDFDocument.load(aes256EncryptedPdfBytes, { password: '' });
    } finally {
      proto._decrypt = overrideDecrypt;
    }

    expect(comparisons).toBeGreaterThan(0);
    expect(mismatches).toBe(0);
  });
});
