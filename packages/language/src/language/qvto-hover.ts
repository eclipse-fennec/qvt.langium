/**
 * What a hover says: for a class name its documentation and features, for a
 * mapping or helper its signature, for a modeltype its nsURIs.
 */
import { type AstNode, type LangiumDocument, type MaybePromise, CstUtils } from 'langium';
import { AstNodeHoverProvider, type LangiumServices } from 'langium/lsp';
import type { Hover, HoverParams } from 'vscode-languageserver';
import type { QvtoServices } from './qvto-module.js';
import type { QvtoEmfBridge } from './qvto-emf-bridge.js';
import { isMappingDeclaration, isHelperDeclaration, isModeltypeDeclaration, isSimpleType, isObjectExpression, isNewExpression, isMapCallExpression } from '../generated/ast.js';
import { mappingLabel, mappingName, mappingsOf, unitOf } from './qvto-validator.js';

export class QvtoHoverProvider extends AstNodeHoverProvider {
  private readonly bridge: QvtoEmfBridge;

  constructor(services: QvtoServices) {
    super(services as unknown as LangiumServices);
    this.bridge = services.emfBridge;
  }

  /**
   * The default looks for a declaration behind the word under the cursor; this
   * grammar has no cross-references, so the word's own node and its containers
   * are asked instead — a type name answers as a class, a mapping head as a mapping.
   */
  override async getHoverContent(document: LangiumDocument, params: HoverParams): Promise<Hover | undefined> {
    const root = document.parseResult?.value?.$cstNode;
    if (!root) return undefined;
    const offset = document.textDocument.offsetAt(params.position);
    const leaf = CstUtils.findLeafNodeAtOffset(root, offset);
    let node: AstNode | undefined = leaf?.astNode;
    while (node) {
      const content = await this.getAstNodeHoverContent(node);
      if (content) return content;
      node = node.$container;
    }
    return undefined;
  }

  protected override getAstNodeHoverContent(node: AstNode): MaybePromise<Hover | undefined> {
    const markdown = (value: string): Hover => ({ contents: { kind: 'markdown', value } });
    if (isMappingDeclaration(node)) {
      const params = node.parameters.map((p) => `${p.name} : ${p.type.$type === 'SimpleType' ? p.type.name : p.type.$type}`).join(', ');
      const results = node.results.map((r) => (r.type.$type === 'SimpleType' ? r.type.name : r.type.$type)).join(', ');
      return markdown(`\`\`\`qvto\nmapping ${mappingLabel(node)}(${params})${results ? ' : ' + results : ''}\n\`\`\``);
    }
    if (isHelperDeclaration(node)) {
      const params = node.parameters.map((p) => `${p.name} : ${p.type.$type === 'SimpleType' ? p.type.name : p.type.$type}`).join(', ');
      return markdown(`\`\`\`qvto\n${node.kind} ${mappingLabel(node)}(${params})${node.returnType && node.returnType.$type === 'SimpleType' ? ' : ' + node.returnType.name : ''}\n\`\`\``);
    }
    if (isModeltypeDeclaration(node)) {
      const known = node.uris.map((u) => u.replace(/^['"]|['"]$/g, '')).map((u) => `${u}${this.bridge.hasPackage(u) ? ' ✓' : ''}`);
      return markdown(`**modeltype ${node.name}**\n\n${known.join('\n\n')}`);
    }
    if (isMapCallExpression(node)) {
      const unit = unitOf(node);
      const simple = node.mapping.split(/::|\./).pop();
      const target = unit ? mappingsOf(unit).find((m) => mappingName(m) === simple || mappingLabel(m) === node.mapping) : undefined;
      return target ? this.getAstNodeHoverContent(target) : undefined;
    }
    const className = isSimpleType(node) ? node.name : isObjectExpression(node) || isNewExpression(node) ? node.type : undefined;
    if (className) {
      const cls = this.bridge.findClass(className);
      if (!cls) return undefined;
      const features = this.bridge.featuresOf(cls).map((f) => `- \`${f.name}\` : ${f.type}${f.documentation ? ' — ' + f.documentation.split('\n')[0] : ''}`);
      const doc = this.bridge.documentationOf(cls);
      return markdown(`**${cls.getName()}**${doc ? `\n\n${doc}` : ''}${features.length ? `\n\n${features.join('\n')}` : ''}`);
    }
    return undefined;
  }
}
