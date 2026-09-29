/**
 * What the parser cannot say: the checks that hold a unit together.
 *
 * Structure — a transformation needs a `main`, names must be unique, a
 * model parameter names a declared modeltype, a mapping call names a
 * mapping of the unit. Models — a class in a mapping's context or result
 * must exist in a registered package, when packages are registered at all.
 * Everything the Model Atlas compiler will refuse anyway is reported here
 * first, at the place it stands.
 */
import type { AstNode, ValidationAcceptor, ValidationChecks } from 'langium';
import type { QvtoLangiumAstType, MappingDeclaration, MapCallExpression, ModelParameter, TransformationDeclaration, Unit, SimpleType, HelperDeclaration, ObjectExpression, NewExpression } from '../generated/ast.js';
import { isMappingDeclaration, isHelperDeclaration, isMainDeclaration, isUnit } from '../generated/ast.js';
import type { QvtoServices } from './qvto-module.js';
import type { QvtoEmfBridge } from './qvto-emf-bridge.js';

const PRIMITIVES = new Set(['String', 'Integer', 'Real', 'Boolean', 'UnlimitedNatural', 'OclAny', 'OclVoid', 'OclInvalid', 'Element', 'Object', 'Set', 'OrderedSet', 'Bag', 'Sequence', 'Collection', 'List', 'Dict', 'Tuple']);

/** The unit a node belongs to */
export function unitOf(node: AstNode): Unit | undefined {
  let current: AstNode | undefined = node;
  while (current && !isUnit(current)) current = current.$container;
  return current as Unit | undefined;
}

/** Every module element of the unit, whichever form it was written in */
export function elementsOf(unit: Unit): Array<MappingDeclaration | HelperDeclaration | AstNode> {
  return [...(unit.module?.elements ?? []), ...unit.elements];
}

export function mappingsOf(unit: Unit): MappingDeclaration[] {
  return elementsOf(unit).filter(isMappingDeclaration);
}

export function helpersOf(unit: Unit): HelperDeclaration[] {
  return elementsOf(unit).filter(isHelperDeclaration);
}

/** The name of a mapping or helper: the last segment of its head */
export const mappingName = (m: MappingDeclaration | HelperDeclaration): string => m.names[m.names.length - 1] ?? '';

/** The context type of a mapping or helper: `Library` in `Library::toCatalog`, `LIB::Library` in `LIB::Library::toCatalog`, undefined without one */
export const mappingContext = (m: MappingDeclaration | HelperDeclaration): string | undefined => (m.names.length > 1 ? m.names.slice(0, -1).join('::') : undefined);

/** `Class::name` for a context mapping, `name` otherwise */
export const mappingLabel = (m: MappingDeclaration | HelperDeclaration) => m.names.join('::');

export function registerQvtoValidationChecks(services: QvtoServices): void {
  const registry = services.validation.ValidationRegistry;
  const validator = services.validation.QvtoValidator;
  const checks: ValidationChecks<QvtoLangiumAstType> = {
    Unit: validator.checkUnit,
    TransformationDeclaration: validator.checkTransformation,
    ModelParameter: validator.checkModelParameter,
    MappingDeclaration: validator.checkMapping,
    MapCallExpression: validator.checkMapCall,
    SimpleType: validator.checkType,
    ObjectExpression: validator.checkObjectType,
    NewExpression: validator.checkNewType,
  };
  registry.register(checks, validator);
}

export class QvtoValidator {
  private readonly bridge: QvtoEmfBridge;

  constructor(services: QvtoServices) {
    this.bridge = services.emfBridge;
  }

  checkUnit = (unit: Unit, accept: ValidationAcceptor): void => {
    if (!unit.module && unit.elements.length > 0) {
      accept('error', 'Ein Skript beginnt mit `transformation Name(…)` oder `library Name` — davor stehen nur modeltype und import.', { node: unit.elements[0] });
    }
    const seen = new Map<string, AstNode>();
    for (const element of elementsOf(unit)) {
      const key = isMappingDeclaration(element) ? `mapping ${mappingLabel(element)}/${element.parameters.length}` : isHelperDeclaration(element) ? `${element.kind} ${mappingLabel(element)}/${element.parameters.length}` : isMainDeclaration(element) ? 'main' : '';
      if (!key) continue;
      const first = seen.get(key);
      if (first) accept('error', `${key} ist doppelt deklariert.`, { node: element, property: 'names' as never });
      else seen.set(key, element);
    }
    for (const modeltype of unit.modeltypes) {
      if (this.bridge.nsURIs.length > 0 && !modeltype.uris.some((u) => this.bridge.hasPackage(unquote(u)))) {
        accept('warning', `Kein registriertes Modell hat die nsURI ${modeltype.uris.map(unquote).join(', ')}.`, { node: modeltype, property: 'uris' });
      }
    }
  };

  checkTransformation = (t: TransformationDeclaration, accept: ValidationAcceptor): void => {
    const unit = unitOf(t);
    const hasMain = unit ? elementsOf(unit).some(isMainDeclaration) : false;
    if (!hasMain) accept('warning', `Die Transformation ${t.name} hat kein main() — ohne Einstieg ist sie nicht startbar und wird als Library behandelt.`, { node: t, property: 'name' });
    if (t.parameters.length === 0) accept('warning', 'Eine Transformation ohne Modellparameter kann nichts lesen oder schreiben.', { node: t, property: 'name' });
  };

  checkModelParameter = (p: ModelParameter, accept: ValidationAcceptor): void => {
    const unit = unitOf(p);
    if (unit && !unit.modeltypes.some((m) => m.name === p.modeltype)) {
      accept('error', `${p.modeltype} ist kein deklarierter modeltype. Deklariert: ${unit.modeltypes.map((m) => m.name).join(', ') || 'keiner'}.`, { node: p, property: 'modeltype' });
    }
  };

  checkMapping = (m: MappingDeclaration, accept: ValidationAcceptor): void => {
    const context = mappingContext(m);
    if (context) this.checkClassName(context, m, 'names', accept, 0);
    if (!m.abstract && !m.body && !m.extensions.length) accept('warning', `Das Mapping ${mappingLabel(m)} hat keinen Rumpf.`, { node: m, property: 'names', index: m.names.length - 1 });
    if (m.results.length === 0 && !m.abstract) accept('warning', `Das Mapping ${mappingLabel(m)} liefert kein Ergebnis — meist fehlt \`: Zielklasse\`.`, { node: m, property: 'names', index: m.names.length - 1 });
  };

  checkMapCall = (call: MapCallExpression, accept: ValidationAcceptor): void => {
    const unit = unitOf(call);
    if (!unit) return;
    const simple = call.mapping.split(/::|\./).pop() ?? call.mapping;
    const known = mappingsOf(unit).some((m) => mappingName(m) === simple || mappingLabel(m) === call.mapping);
    // An imported library may carry it; without imports the unit is all there is.
    if (!known && unit.imports.length === 0) {
      accept('error', `Kein Mapping namens ${call.mapping} in dieser Einheit. Vorhanden: ${mappingsOf(unit).map(mappingLabel).join(', ') || 'keins'}.`, { node: call, property: 'mapping' });
    }
  };

  checkType = (type: SimpleType, accept: ValidationAcceptor): void => {
    this.checkClassName(type.name, type, 'name', accept);
  };

  checkObjectType = (o: ObjectExpression, accept: ValidationAcceptor): void => {
    this.checkClassName(o.type, o, 'type', accept);
  };

  checkNewType = (n: NewExpression, accept: ValidationAcceptor): void => {
    this.checkClassName(n.type, n, 'type', accept);
  };

  /** Only with registered packages: an unknown class is then a real finding, not a missing model */
  private checkClassName(name: string, node: AstNode, property: string, accept: ValidationAcceptor, index?: number): void {
    if (this.bridge.nsURIs.length === 0) return;
    const simple = name.split(/::|\./).pop() ?? name;
    if (PRIMITIVES.has(simple)) return;
    if (!this.bridge.findClass(name)) {
      const near = this.bridge.allClasses().map((c) => c.getName() ?? '').filter((n) => n.toLowerCase().startsWith(simple.slice(0, 2).toLowerCase())).slice(0, 5);
      accept('error', `Die Klasse ${name} gibt es in den registrierten Modellen nicht.${near.length ? ` Ähnlich: ${near.join(', ')}.` : ''}`, { node, property: property as never, index });
    }
  }
}

const unquote = (s: string) => s.replace(/^['"]|['"]$/g, '');
