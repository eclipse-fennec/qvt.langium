import { describe, it, expect, beforeAll } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { expectCompletion, parseHelper } from 'langium/test';
import { createQvtoLspServices, type Unit } from '../src/index.js';
import { loadEcore } from './helpers.js';

const { qvto } = createQvtoLspServices(EmptyFileSystem);
const completion = expectCompletion(qvto);
const parse = parseHelper<Unit>(qvto);

const HEAD = `modeltype LIB uses 'http://example.org/fennec/m2x/library/1.0';\nmodeltype CAT uses 'http://example.org/fennec/m2x/catalog/1.0';\ntransformation T(in lib : LIB, out cat : CAT);\n`;

describe('Vervollständigung', () => {
  beforeAll(() => {
    qvto.emfBridge.registerPackage(loadEcore('library.ecore'));
    qvto.emfBridge.registerPackage(loadEcore('catalog.ecore'));
  });

  it('bietet die nsURIs der registrierten Modelle nach uses an, mit und ohne begonnenes Anführungszeichen', async () => {
    await completion({ text: `modeltype LIB uses <|>`, index: 0, assert: (list) => {
      const labels = list.items.map((i) => i.label);
      expect(labels).toContain(`'http://example.org/fennec/m2x/library/1.0'`);
      expect(labels).toContain(`'http://example.org/fennec/m2x/catalog/1.0'`);
      expect(list.items.find((i) => i.label.includes('library'))?.detail).toBe('library');
    } });
    await completion({ text: `modeltype LIB uses 'http://example.org/fennec/m2x/lib<|>`, index: 0, assert: (list) => {
      const item = list.items.find((i) => i.label === `'http://example.org/fennec/m2x/library/1.0'`);
      expect(item).toBeDefined();
      // the proposal replaces from the opening quote on
      expect(item?.textEdit && 'range' in item.textEdit ? item.textEdit.range.start.character : -1).toBe('modeltype LIB uses '.length);
    } });
  });

  it('bietet die deklarierten modeltypes nach in/out an', async () => {
    await completion({ text: `modeltype LIB uses 'urn:lib';\nmodeltype CAT uses 'urn:cat';\ntransformation T(in lib : <|>`, index: 0, assert: (list) => {
      const labels = list.items.map((i) => i.label);
      expect(labels).toContain('LIB');
      expect(labels).toContain('CAT');
    } });
  });

  it('bietet die Mappings der Einheit nach ->map an', async () => {
    await completion({
      text: `${HEAD}main() { lib.objectsOfType(Library)->map <|> }\nmapping Library::toCatalog() : Catalog { }\nmapping Book::toEntry() : Entry { }`,
      index: 0,
      assert: (list) => {
        const labels = list.items.map((i) => i.label);
        expect(labels).toContain('toCatalog');
        expect(labels).toContain('toEntry');
      },
    });
  });

  it('bietet die Klassen der registrierten Modelle als Typ an', async () => {
    await completion({ text: `${HEAD}main() { }\nmapping <|>`, index: 0, assert: (list) => {
      const labels = list.items.map((i) => i.label);
      for (const name of ['Book', 'Catalog', 'Entry', 'Library']) expect(labels).toContain(name);
    } });
  });

  it('bietet nach self. die Features der Kontextklasse an', async () => {
    await completion({ text: `${HEAD}main() { }\nmapping Library::toCatalog() : Catalog { title := self.<|> }`, index: 0, assert: (list) => {
      const labels = list.items.map((i) => i.label);
      expect(labels).toContain('name');
      expect(labels).toContain('books');
    } });
  });
});

describe('Hover', () => {
  it('zeigt die Signatur eines Mappings und die Features einer Klasse', async () => {
    const doc = await parse(`${HEAD}main() { }\nmapping Library::toCatalog() : Catalog { }`);
    const hover = qvto.lsp.HoverProvider;
    const mappingLine = 4;
    const atMapping = await hover.getHoverContent(doc, { textDocument: { uri: doc.uri.toString() }, position: { line: mappingLine, character: 21 } });
    expect(JSON.stringify(atMapping?.contents)).toContain('mapping Library::toCatalog() : Catalog');
    const atClass = await hover.getHoverContent(doc, { textDocument: { uri: doc.uri.toString() }, position: { line: mappingLine, character: 34 } });
    expect(JSON.stringify(atClass?.contents)).toContain('**Catalog**');
    expect(JSON.stringify(atClass?.contents)).toContain('entries');
  });
});
