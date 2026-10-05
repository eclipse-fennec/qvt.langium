# qvt.langium

QVT Operational (QVT-O) als Langium-Sprache für EMFTS: Parser, Validierung,
Vervollständigung und Hover gegen EMF-Metamodelle, und der Language Server als
Web Worker für Editoren im Browser.

Das Gegenstück zu [ocl-langium](../ocl-langium) und [ocl-lsp-worker](../ocl-lsp-worker):
derselbe Aufbau, dieselben Schnittstellen, eine andere Sprache. Wer den
OCL-Worker anbindet, bindet diesen genauso an.

## Pakete

| Paket | Inhalt |
|---|---|
| `packages/language` — `@emfts/qvto.langium` | Grammatik (`src/grammar/qvto.langium`), Dienste (`src/language`), Parser-Einstieg (`parseQvto`), TextMate-Grammatik (`syntaxes/`) |
| `packages/lsp-worker` — `@emfts/qvto.lsp.worker` | Der Language Server als Web Worker (`dist/worker.js`) |

## Was die Sprache abdeckt

Die Einheit einer Datei: `modeltype`, `import`, dann `transformation Name(in a : A, out b : B)`
oder `library Name`, mit den Elementen in geschweiften Klammern oder dahinter —
`main()`, `mapping Kontext::name(…) : Ergebnis` mit `when`/`where`, `init`/`end`,
`inherits`/`merges`/`disjuncts`, `helper`/`query`/`constructor`, `property`.
Anweisungen: `var`, `return`, `if`, `while`, `log`, `assert`, Zuweisungen mit
`:=`, `+=` und `::=`. Ausdrücke: OCL wie in ocl-langium, dazu `->map`/`->xmap`,
`.map`, `resolve`/`resolveone`/`invresolve` (auch `late`), `object Typ { … }`,
`new Typ(…)`, der Typfilter `ausdruck[Typ]`, `->forEach`/`->forOne`, `result`.

Das ist die Sprache, die der Model-Atlas-Compiler (`emf.m2x`) annimmt; die
Beispiele unter `packages/language/tests/fixtures` stammen von dort.

## Validierung

Ohne registrierte Metamodelle prüft der Validator die Struktur: Modellparameter
nennen einen deklarierten `modeltype`, Namen sind eindeutig, ein `->map` nennt
ein Mapping der Einheit (solange nichts importiert ist), eine Transformation
ohne `main()` und ein Mapping ohne Ergebnis bekommen eine Warnung.

Mit registrierten Metamodellen kommen die Klassen dazu: Kontext und Ergebnis
eines Mappings, Typen in `object`, `new`, Parametern und Filtern müssen es geben,
sonst gibt es einen Fehler mit ähnlich geschriebenen Vorschlägen. Ein `modeltype`,
dessen nsURI zu keinem Modell passt, wird angemerkt.

## Vervollständigung und Hover

Nach `uses` die nsURIs der registrierten Metamodelle mit Paketnamen, auch wenn das
Anführungszeichen schon getippt ist; nach `in`/`out` die deklarierten modeltypes;
nach `->map` die Mappings der Einheit; an Typstellen die Klassen; nach `self.` die
Features der Kontextklasse; in Ausdrücken Helper und Klassen. Hover zeigt
Mapping- und Helper-Signaturen, Klassen mit Features und Dokumentation, modeltypes
mit ihren nsURIs.

## Benutzen

```ts
import { parseQvto, services } from '@emfts/qvto.langium';

services().qvto.emfBridge.registerPackage(libraryPackage); // ein EPackage aus @emfts/core
const { unit, findings, hasErrors } = await parseQvto(text);
```

Im Browser läuft der Worker als Language Server; Metamodelle kommen als
LSP-Notification hinein:

```ts
const worker = new Worker(new URL('@emfts/qvto.lsp.worker', import.meta.url), { type: 'module' });
// LSP über den Message-Port, z. B. mit @codemirror/lsp-client oder monaco-languageclient, dann:
client.notification('emfts/registerPackage', { xmi: ecoreXmi });
client.notification('emfts/unregisterPackage', { nsURI });
```

Die rohe Nachricht `{ type: 'registerPackage', data: ecoreXmi }` des
OCL-Workers wird ebenfalls verstanden; sie landet aber auch beim
JSON-RPC-Leser und wird dort als fehlerhaft protokolliert.

## Entwickeln

```sh
npm install
npm run generate     # Grammatik → src/generated, syntaxes/
npm run build
npm test
npm run type-check
```

Die Grammatik hält Mapping- und Helper-Köpfe als Segmentliste (`names`), weil
`Kontext::name` und ein qualifizierter Typname für den Parser nicht zu trennen
sind; `mappingName`, `mappingContext` und `mappingLabel` lesen sie.

## Lizenz

EPL-2.0
