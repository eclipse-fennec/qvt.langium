import {
  type Module,
  type LangiumCoreServices,
  type LangiumSharedCoreServices,
  type PartialLangiumCoreServices,
  type DefaultSharedCoreModuleContext,
  inject,
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  EmptyFileSystem,
} from 'langium';
import { createDefaultSharedModule, type DefaultSharedModuleContext, type LangiumSharedServices } from 'langium/lsp';
import { QvtoGeneratedModule, QvtoLangiumGeneratedSharedModule } from '../generated/module.js';
import { QvtoValidator, registerQvtoValidationChecks } from './qvto-validator.js';
import { QvtoHoverProvider } from './qvto-hover.js';
import { QvtoCompletionProvider } from './qvto-completion.js';
import { QvtoEmfBridge } from './qvto-emf-bridge.js';

export type QvtoAddedServices = {
  validation: { QvtoValidator: QvtoValidator };
  lsp: { HoverProvider: QvtoHoverProvider; CompletionProvider: QvtoCompletionProvider };
  emfBridge: QvtoEmfBridge;
};

export type QvtoServices = LangiumCoreServices & QvtoAddedServices;
export type QvtoSharedServices = LangiumSharedCoreServices;

export const QvtoModule: Module<QvtoServices, PartialLangiumCoreServices & QvtoAddedServices> = {
  validation: { QvtoValidator: (services) => new QvtoValidator(services) },
  lsp: {
    HoverProvider: (services) => new QvtoHoverProvider(services),
    CompletionProvider: (services) => new QvtoCompletionProvider(services),
  },
  emfBridge: () => new QvtoEmfBridge(),
};

/** Headless services: parsing and validation without a language server */
export function createQvtoServices(context?: DefaultSharedCoreModuleContext): { shared: QvtoSharedServices; qvto: QvtoServices } {
  const shared = inject(createDefaultSharedCoreModule(context ?? EmptyFileSystem), QvtoLangiumGeneratedSharedModule);
  const qvto = inject(createDefaultCoreModule({ shared }), QvtoGeneratedModule, QvtoModule);
  shared.ServiceRegistry.register(qvto);
  registerQvtoValidationChecks(qvto);
  return { shared, qvto };
}

/** Services with the language server, for a Web Worker or a Node process */
export function createQvtoLspServices(context: DefaultSharedModuleContext): { shared: LangiumSharedServices; qvto: QvtoServices } {
  const shared = inject(createDefaultSharedModule(context), QvtoLangiumGeneratedSharedModule);
  const qvto = inject(createDefaultCoreModule({ shared }), QvtoGeneratedModule, QvtoModule);
  shared.ServiceRegistry.register(qvto);
  registerQvtoValidationChecks(qvto);
  return { shared, qvto };
}
