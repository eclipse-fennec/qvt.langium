# @emfts/qvt.lsp.worker

Der QVT-O-Language-Server aus `@emfts/qvt.langium` als Web Worker — für
CodeMirror (`@codemirror/lsp-client`), Monaco oder jeden LSP-Client im Browser.

```ts
const worker = new Worker(new URL('@emfts/qvt.lsp.worker', import.meta.url), { type: 'module' })
// LSP über den Message-Port, dann die Metamodelle als Notification:
client.notification('emfts/registerPackage', { xmi: ecoreXmi })
client.notification('emfts/unregisterPackage', { nsURI })
```

Lizenz: EPL-2.0
