/**
 * Parse a QVT-O unit headlessly — for tests, tools and anything that wants
 * the AST and the findings without a language server.
 */
import { URI, type LangiumDocument } from 'langium';
import type { Diagnostic } from 'vscode-languageserver';
import { createQvtoServices } from './language/qvto-module.js';
import type { Unit } from './generated/ast.js';

export interface QvtoFinding {
  severity: 'error' | 'warning' | 'info';
  message: string;
  /** 1-based, as editors and the m2x compiler count */
  line: number;
  column: number;
}

export interface QvtoParseResult {
  unit: Unit;
  document: LangiumDocument<Unit>;
  findings: QvtoFinding[];
  hasErrors: boolean;
}

let shared: ReturnType<typeof createQvtoServices> | undefined;
let counter = 0;

/** The one service set of this process — register metamodels on `services().qvto.emfBridge` */
export function services(): ReturnType<typeof createQvtoServices> {
  return (shared ??= createQvtoServices());
}

/** Parses and validates; the findings carry lexer, parser and validator results alike */
export async function parseQvto(text: string, uri = `memory:///unit-${++counter}.qvto`): Promise<QvtoParseResult> {
  const { shared: sharedServices } = services();
  const document = sharedServices.workspace.LangiumDocumentFactory.fromString<Unit>(text, URI.parse(uri));
  sharedServices.workspace.LangiumDocuments.addDocument(document);
  try {
    await sharedServices.workspace.DocumentBuilder.build([document], { validation: true });
    const findings = (document.diagnostics ?? []).map(toFinding);
    return { unit: document.parseResult.value, document, findings, hasErrors: findings.some((f) => f.severity === 'error') };
  } finally {
    sharedServices.workspace.LangiumDocuments.deleteDocument(document.uri);
  }
}

function toFinding(d: Diagnostic): QvtoFinding {
  return { severity: d.severity === 1 ? 'error' : d.severity === 2 ? 'warning' : 'info', message: d.message, line: d.range.start.line + 1, column: d.range.start.character + 1 };
}
