/**
 * The QVT-O language server as a Web Worker.
 *
 * Speaks LSP over the worker's message port (JSON-RPC via
 * BrowserMessageReader/Writer, as an LSP client expects). Metamodels come in
 * as the notification `emfts/registerPackage` with `{ xmi: '<ecore xmi>' }`,
 * and leave with `emfts/unregisterPackage` and `{ nsURI }`: the classes and
 * features of a registered package are then known to validation, completion
 * and hover, and open documents are validated again.
 *
 * The raw message `{ type: 'registerPackage', data: '<ecore xmi>' }` of
 * @emfts/ocl.lsp.worker is understood too, so a client written for one
 * drives the other — but the JSON-RPC reader sees that message as well and
 * logs it as malformed, which the notification avoids.
 */
import { EmptyFileSystem } from 'langium';
import { startLanguageServer } from 'langium/lsp';
import { BrowserMessageReader, BrowserMessageWriter, createConnection } from 'vscode-languageserver/browser.js';
import { createQvtoLspServices } from '@emfts/qvto.langium';
import { BasicResourceSet, URI, XMIResourceFactory, registerEcorePackage, type EPackage, type XMIResource } from '@emfts/core';

declare const self: DedicatedWorkerGlobalScope;

export interface WorkerMessage {
  type: 'registerPackage' | 'unregisterPackage';
  data?: unknown;
}

const connection = createConnection(new BrowserMessageReader(self), new BrowserMessageWriter(self));
const { shared, qvto } = createQvtoLspServices({ connection, ...EmptyFileSystem });

registerEcorePackage();
let counter = 0;

function deserializeEPackage(xmi: string): EPackage | undefined {
  try {
    const set = new BasicResourceSet();
    set.getResourceFactoryRegistry().getExtensionToFactoryMap().set('ecore', new XMIResourceFactory());
    const resource = set.createResource(URI.createURI(`worker-${++counter}.ecore`)) as XMIResource;
    resource.loadFromString(xmi);
    return resource.getContents().get(0) as EPackage | undefined;
  } catch (e) {
    console.error('[qvto-lsp-worker] EPackage konnte nicht gelesen werden:', e);
    return undefined;
  }
}

/** Open documents are validated again — with the classes the new package brought, or without those it took */
function revalidate(): void {
  const uris = shared.workspace.LangiumDocuments.all.map((d) => d.uri).toArray();
  if (uris.length) void shared.workspace.DocumentBuilder.update(uris, []);
}

function register(xmi: string): void {
  const pkg = deserializeEPackage(xmi);
  if (pkg) { qvto.emfBridge.registerPackage(pkg); revalidate(); }
}

function unregister(nsURI: string): void {
  qvto.emfBridge.unregisterPackage(nsURI);
  revalidate();
}

connection.onNotification('emfts/registerPackage', (params: { xmi?: unknown }) => {
  if (typeof params?.xmi === 'string') register(params.xmi);
});
connection.onNotification('emfts/unregisterPackage', (params: { nsURI?: unknown }) => {
  if (typeof params?.nsURI === 'string') unregister(params.nsURI);
});

self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object' || !('type' in msg)) return;
  if (msg.type === 'registerPackage' && typeof msg.data === 'string') register(msg.data);
  else if (msg.type === 'unregisterPackage' && typeof msg.data === 'string') unregister(msg.data);
});

startLanguageServer(shared);
