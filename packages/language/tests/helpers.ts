import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BasicResourceSet, XMIResourceFactory, URI, type EPackage, type XMIResource } from '@emfts/core';

const here = dirname(fileURLToPath(import.meta.url));

export function fixture(name: string): string {
  return readFileSync(join(here, 'fixtures', name), 'utf8');
}

let counter = 0;

/** The EPackage of an .ecore fixture */
export function loadEcore(name: string): EPackage {
  const rs = new BasicResourceSet();
  rs.getResourceFactoryRegistry().getExtensionToFactoryMap().set('ecore', new XMIResourceFactory());
  const resource = rs.createResource(URI.createURI(`test-${++counter}-${name}`)) as XMIResource;
  resource.loadFromString(fixture(name));
  const pkg = resource.getContents().get(0) as unknown as EPackage | undefined;
  if (!pkg) throw new Error(`${name} konnte nicht geladen werden`);
  return pkg;
}

export const SKELETON = `-- Eine QVT-O-Transformation: eine Klasse rein, eine raus, ein Ergebnis je Objekt.
modeltype MODEL uses 'http://example.org/model/1.0';

transformation Beispiel(in src : MODEL, out tgt : MODEL);

main() {
    src.rootObjects()[Quelle]->map toZiel();
}

mapping Quelle::toZiel() : Ziel {
    id := self.id;
}
`;
