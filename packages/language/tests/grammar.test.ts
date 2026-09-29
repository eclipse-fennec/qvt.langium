import { describe, it, expect } from 'vitest';
import { parseQvto, mappingsOf, helpersOf, mappingLabel, mappingName, mappingContext, isTransformationDeclaration, isLibraryDeclaration } from '../src/index.js';
import { fixture, SKELETON } from './helpers.js';

describe('Grammatik', () => {
  it('liest Library2Catalog.qvto mit Block-Kommentar, Import und Guard', async () => {
    const r = await parseQvto(fixture('Library2Catalog.qvto'));
    expect(r.findings.filter((f) => f.severity === 'error')).toEqual([]);
    const unit = r.unit;
    expect(unit.modeltypes.map((m) => m.name)).toEqual(['LIB', 'CAT']);
    expect(unit.imports.map((i) => i.name)).toEqual(['catalog.Format']);
    expect(isTransformationDeclaration(unit.module!)).toBe(true);
    const t = unit.module!;
    expect(t.name).toBe('Library2Catalog');
    expect(isTransformationDeclaration(t) && t.parameters.map((p) => `${p.direction} ${p.name}:${p.modeltype}`)).toEqual(['in lib:LIB', 'out cat:CAT']);
    const mappings = mappingsOf(unit);
    expect(mappings.map(mappingLabel)).toEqual(['Library::toCatalog', 'Book::toEntry']);
    expect(mappingContext(mappings[0])).toBe('Library');
    expect(mappingName(mappings[0])).toBe('toCatalog');
    expect(mappings[1].when).toBeDefined();
    expect(mappings[1].results[0].type.$type === 'SimpleType' && mappings[1].results[0].type.name).toBe('Entry');
  });

  it('liest die Library CatalogFormat.qvto mit einem Helper', async () => {
    const r = await parseQvto(fixture('CatalogFormat.qvto'));
    expect(r.hasErrors).toBe(false);
    expect(isLibraryDeclaration(r.unit.module!)).toBe(true);
    expect(r.unit.module!.name).toBe('catalog.Format');
    const helpers = helpersOf(r.unit);
    expect(helpers.map(mappingName)).toEqual(['formatLabel']);
    expect(mappingContext(helpers[0])).toBeUndefined();
    expect(helpers[0].parameters.map((p) => p.name)).toEqual(['title', 'author']);
  });

  it('liest das Skelett des Assistenten mit main und Mapping außerhalb der Klammern', async () => {
    const r = await parseQvto(SKELETON);
    expect(r.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(r.unit.elements.length).toBe(2);
    expect(mappingsOf(r.unit).map(mappingName)).toEqual(['toZiel']);
  });

  it('liest Anweisungen, Objekt-Ausdrücke, resolve und Collections', async () => {
    const r = await parseQvto(`
      modeltype M uses 'urn:m';
      transformation T(in a : M, out b : M);
      main() {
        var xs : Sequence(String) := a.rootObjects()[Node].name;
        xs->forEach(x) { log('name', x); };
        if (xs->isEmpty()) then { assert fatal (false) with log('leer'); } endif;
        var n := object Node { name := 'x'; children += a.objectsOfType(Node)->map toNode(1); };
        var back := n.late resolveone(Node);
        return n;
      }
      mapping Node::toNode(depth : Integer) : Node {
        init { var d := depth + 1; }
        name := self.name; end { log('done'); }
      }
      query Node::isRoot() : Boolean { return self.parent.oclIsUndefined(); }
    `);
    expect(r.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(helpersOf(r.unit).map((h) => `${h.kind} ${mappingLabel(h)}`)).toEqual(['query Node::isRoot']);
  });

  it('meldet Syntaxfehler mit Zeile und Spalte', async () => {
    const r = await parseQvto(`modeltype M uses 'urn:m';\ntransformation T(in a : M)\nmain() { }`);
    expect(r.hasErrors).toBe(true);
    const error = r.findings.find((f) => f.severity === 'error')!;
    expect(error.line).toBe(3);
    expect(error.column).toBeGreaterThan(0);
  });
});
