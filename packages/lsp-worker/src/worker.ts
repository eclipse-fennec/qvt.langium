/**
 * The QVT-O language server as a Web Worker.
 *
 * Speaks LSP over the worker's message port (JSON-RPC via
 * BrowserMessageReader/Writer, as an LSP client expects), and beside it one
 * custom message: `{ type: 'registerPackage', data: '<ecore xmi>' }` puts a
 * metamodel into the language's EMF bridge, so classes and features of that
 * package are known to validation, completion and hover. The same shape as
 * @emfts/ocl.lsp.worker, so a client written for one drives the other.
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

self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object' || !('type' in msg)) return;
  if (msg.type === 'registerPackage' && typeof msg.data === 'string') {
    const pkg = deserializeEPackage(msg.data);
    if (pkg) qvto.emfBridge.registerPackage(pkg);
  } else if (msg.type === 'unregisterPackage' && typeof msg.data === 'string') {
    qvto.emfBridge.unregisterPackage(msg.data);
  }
});

startLanguageServer(shared);
