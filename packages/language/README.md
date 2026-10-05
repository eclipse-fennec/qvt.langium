# @emfts/qvto.langium

QVT Operational (QVT-O) als Langium-Sprache für EMFTS: Parser, Validierung,
Vervollständigung und Hover gegen EMF-Metamodelle.

```ts
import { parseQvto, services } from '@emfts/qvto.langium'

services().qvto.emfBridge.registerPackage(libraryPackage) // ein EPackage aus @emfts/core
const { unit, findings, hasErrors } = await parseQvto(text)
```

Für den Browser gibt es den Language Server als Web Worker: `@emfts/qvto.lsp.worker`.

Lizenz: EPL-2.0
