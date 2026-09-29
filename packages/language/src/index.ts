/**
 * QVT Operational for EMFTS: a Langium grammar for transformations,
 * libraries, mappings, helpers and the OCL expressions inside them, with
 * validation, completion and hover against EMF metamodels.
 *
 * Parse headlessly with `parseQvto`, or run the language server from
 * `@emfts/qvto.lsp.worker` in the browser.
 */
export { createQvtoServices, createQvtoLspServices } from './language/qvto-module.js';
export type { QvtoServices, QvtoSharedServices, QvtoAddedServices } from './language/qvto-module.js';
export { parseQvto, services } from './parser.js';
export type { QvtoParseResult, QvtoFinding } from './parser.js';
export { QvtoEmfBridge } from './language/qvto-emf-bridge.js';
export type { FeatureInfo } from './language/qvto-emf-bridge.js';
export { QvtoValidator, unitOf, elementsOf, mappingsOf, helpersOf, mappingLabel, mappingName, mappingContext } from './language/qvto-validator.js';
export { QvtoCompletionProvider } from './language/qvto-completion.js';
export { QvtoHoverProvider } from './language/qvto-hover.js';
export * from './generated/ast.js';
export { QvtoLanguageMetaData } from './generated/module.js';
