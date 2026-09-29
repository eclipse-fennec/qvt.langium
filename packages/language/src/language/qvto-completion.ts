/**
 * What the editor offers while typing: the keywords Langium derives from the
 * grammar, and on top the names the unit and the models know — modeltypes,
 * mappings and helpers of the unit, classes of the registered packages, and
 * after a dot the features of a class that can be told from the text.
 */
import { type AstNode, type MaybePromise, AstUtils, GrammarAST } from 'langium';
import { DefaultCompletionProvider, type CompletionAcceptor, type CompletionContext, type LangiumServices, type NextFeature } from 'langium/lsp';
import { CompletionItemKind } from 'vscode-languageserver';
import type { QvtoServices } from './qvto-module.js';
import type { QvtoEmfBridge } from './qvto-emf-bridge.js';
import { isMappingDeclaration, isHelperDeclaration } from '../generated/ast.js';
import { helpersOf, mappingContext, mappingLabel, mappingName, mappingsOf, unitOf } from './qvto-validator.js';

export class QvtoCompletionProvider extends DefaultCompletionProvider {
  private readonly bridge: QvtoEmfBridge;

  constructor(services: QvtoServices) {
    super(services as unknown as LangiumServices);
    this.bridge = services.emfBridge;
  }

  protected override completionFor(context: CompletionContext, next: NextFeature, acceptor: CompletionAcceptor): MaybePromise<void> {
    const node = context.node;
    const unit = node ? unitOf(node) : undefined;
    // the assignment the expected token belongs to, and the parser rule it stands in;
    // inside a data type rule (QualifiedName, ScopedName) the assignment is out of
    // sight, then the node at the cursor tells whose name is being written
    const assignment = AstUtils.getContainerOfType(next.feature, GrammarAST.isAssignment);
    const rule = AstUtils.getContainerOfType(next.feature, GrammarAST.isParserRule)?.name ?? '';
    const property = assignment?.feature ?? '';
    const inName = rule === 'QualifiedName' || rule === 'ScopedName';
    const owner = next.type ?? node?.$type ?? '';
    const typeOwners = ['SimpleType', 'ObjectExpression', 'NewExpression', 'TypeFilterExpression', 'ResolveTarget'];
    const inType = (inName && typeOwners.includes(owner)) || (property === 'names' && (rule === 'MappingDeclaration' || rule === 'HelperDeclaration'));

    // a modeltype alias after `in`/`out` in a model parameter
    if (unit && property === 'modeltype' && rule === 'ModelParameter') {
      for (const m of unit.modeltypes) acceptor(context, { label: m.name, kind: CompletionItemKind.Module, detail: m.uris.join(', '), sortText: '0' + m.name });
    }
    // a mapping after ->map / .map
    if (unit && ((property === 'mapping' && rule === 'NavigationExpression') || (inName && owner === 'MapCallExpression'))) {
      for (const m of mappingsOf(unit)) acceptor(context, { label: mappingName(m), kind: CompletionItemKind.Method, detail: `mapping ${mappingLabel(m)}(${m.parameters.map((p) => p.name).join(', ')})`, sortText: '0' + mappingName(m) });
    }
    // classes where a type is expected
    if (inType) {
      for (const cls of this.bridge.allClasses()) {
        const name = cls.getName() ?? '';
        acceptor(context, { label: name, kind: CompletionItemKind.Class, detail: this.bridge.documentationOf(cls)?.split('\n')[0], sortText: '1' + name });
      }
    }
    // after a dot: the features of the receiver's class, when the receiver is `self` in a context mapping
    if (property === 'feature' && rule === 'NavigationExpression' && node && /\bself\s*\.\s*[A-Za-z_]*$/.test(context.textDocument.getText().slice(0, context.offset))) {
      const contextClass = this.contextClassOf(node);
      if (contextClass) for (const f of this.bridge.featuresOf(contextClass)) acceptor(context, { label: f.name, kind: f.isReference ? CompletionItemKind.Reference : CompletionItemKind.Field, detail: f.type, documentation: f.documentation, sortText: '0' + f.name });
    }
    // names in expression position: helpers and queries of the unit, classes for allInstances/objectsOfType
    if (unit && inName && owner === 'VariableExpression') {
      for (const h of helpersOf(unit)) acceptor(context, { label: mappingName(h), kind: CompletionItemKind.Function, detail: `${h.kind} ${mappingLabel(h)}(${h.parameters.map((p) => p.name).join(', ')})${h.returnType ? ' : ' + typeText(h.returnType) : ''}`, sortText: '0' + mappingName(h) });
      for (const cls of this.bridge.allClasses()) { const name = cls.getName() ?? ''; acceptor(context, { label: name, kind: CompletionItemKind.Class, sortText: '2' + name }); }
    }
    return super.completionFor(context, next, acceptor);
  }

  /** The class `self` has inside the enclosing context mapping or helper */
  private contextClassOf(node: AstNode) {
    let current: AstNode | undefined = node;
    while (current && !isMappingDeclaration(current) && !isHelperDeclaration(current)) current = current.$container;
    const context = current && (isMappingDeclaration(current) || isHelperDeclaration(current)) ? mappingContext(current) : undefined;
    return context ? this.bridge.findClass(context) : undefined;
  }

  // The default provider looks the document up for cross-references; the grammar has none, so nothing to add.
  protected override completionForCrossReference(_context: CompletionContext, _next: NextFeature, _acceptor: CompletionAcceptor): MaybePromise<void> {
    return undefined;
  }
}

function typeText(t: { $type: string; name?: string; kind?: string }): string {
  return t.$type === 'SimpleType' ? (t.name ?? '') : t.$type === 'CollectionType' ? `${t.kind}(…)` : 'Tuple(…)';
}
