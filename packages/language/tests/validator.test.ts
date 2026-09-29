import { describe, it, expect, beforeAll } from 'vitest';
import { parseQvto, services } from '../src/index.js';
import { fixture, loadEcore } from './helpers.js';

const messages = (r: Awaited<ReturnType<typeof parseQvto>>, severity?: string) => r.findings.filter((f) => !severity || f.severity === severity).map((f) => f.message);

describe('Validator ohne Modelle', () => {
  it('kennt undeklarierte modeltypes in Modellparametern', async () => {
    const r = await parseQvto(`modeltype M uses 'urn:m';\ntransformation T(in a : X, out b : M);\nmain() { }`);
    expect(messages(r, 'error')).toEqual([expect.stringContaining('X ist kein deklarierter modeltype')]);
  });

  it('kennt doppelte Mappings', async () => {
    const r = await parseQvto(`modeltype M uses 'urn:m';\ntransformation T(in a : M, out b : M);\nmain() { }\nmapping A::toB() : B { }\nmapping A::toB() : B { }`);
    expect(messages(r, 'error')).toEqual([expect.stringContaining('doppelt deklariert')]);
  });

  it('kennt Aufrufe unbekannter Mappings, solange nichts importiert ist', async () => {
    const r = await parseQvto(`modeltype M uses 'urn:m';\ntransformation T(in a : M, out b : M);\nmain() { a.rootObjects()[A]->map toC(); }\nmapping A::toB() : B { }`);
    expect(messages(r, 'error')).toEqual([expect.stringContaining('Kein Mapping namens toC')]);
    const imported = await parseQvto(`modeltype M uses 'urn:m';\nimport lib.X;\ntransformation T(in a : M, out b : M);\nmain() { a.rootObjects()[A]->map toC(); }\nmapping A::toB() : B { }`);
    expect(messages(imported, 'error')).toEqual([]);
  });

  it('warnt vor einer Transformation ohne main', async () => {
    const r = await parseQvto(`modeltype M uses 'urn:m';\ntransformation T(in a : M, out b : M);\nmapping A::toB() : B { }`);
    expect(messages(r, 'warning')).toContainEqual(expect.stringContaining('kein main()'));
  });

  it('meldet keine Klassen, solange kein Modell registriert ist', async () => {
    const r = await parseQvto(fixture('Library2Catalog.qvto'));
    expect(messages(r, 'error')).toEqual([]);
  });
});

describe('Validator mit den Beispielmodellen', () => {
  beforeAll(() => {
    const bridge = services().qvto.emfBridge;
    bridge.registerPackage(loadEcore('library.ecore'));
    bridge.registerPackage(loadEcore('catalog.ecore'));
  });

  it('akzeptiert Library2Catalog gegen library.ecore und catalog.ecore', async () => {
    const r = await parseQvto(fixture('Library2Catalog.qvto'));
    expect(messages(r, 'error')).toEqual([]);
    expect(messages(r, 'warning')).toEqual([]);
  });

  it('meldet unbekannte Klassen im Kontext und im Ergebnis', async () => {
    const r = await parseQvto(`modeltype LIB uses 'http://example.org/fennec/m2x/library/1.0';\ntransformation T(in a : LIB, out b : LIB);\nmain() { }\nmapping Libary::toBook() : Bok { }`);
    expect(messages(r, 'error')).toEqual([expect.stringContaining('Libary'), expect.stringContaining('Bok')]);
    expect(messages(r, 'error')[0]).toContain('Ähnlich: Library');
  });

  it('warnt, wenn kein registriertes Modell zur nsURI eines modeltype passt', async () => {
    const r = await parseQvto(`modeltype X uses 'urn:nirgendwo';\ntransformation T(in a : X, out b : X);\nmain() { }`);
    expect(messages(r, 'warning')).toContainEqual(expect.stringContaining('urn:nirgendwo'));
  });
});
