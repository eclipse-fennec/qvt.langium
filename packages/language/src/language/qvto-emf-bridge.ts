/**
 * The metamodels a transformation is written against, as the language
 * service sees them. Packages are registered by nsURI — the same nsURI a
 * `modeltype` names — and classes are found by simple or qualified name.
 * Nothing here depends on how the packages arrived (XMI over a worker
 * message, an EPackage in the same process).
 */
import type { EClass, EClassifier, EPackage, EStructuralFeature } from '@emfts/core';

export interface FeatureInfo {
  name: string;
  /** The type's name, `String`, `Person`, `Sequence(Book)`… */
  type: string;
  isReference: boolean;
  isMany: boolean;
  documentation?: string;
}

const isEClass = (c: EClassifier): c is EClass => typeof (c as EClass).getEStructuralFeatures === 'function';

/** GenModel documentation of an element, if the model carries it */
function documentationOf(element: unknown): string | undefined {
  try {
    const e = element as { getEAnnotation?(source: string): { getDetails?(): { get(key: string): string | null } } | null };
    const annotation = e.getEAnnotation?.('http://www.eclipse.org/emf/2002/GenModel');
    const value = annotation?.getDetails?.()?.get('documentation');
    return value || undefined;
  } catch {
    return undefined;
  }
}

export class QvtoEmfBridge {
  private readonly packages = new Map<string, EPackage>();
  private readonly classByName = new Map<string, EClass>();

  registerPackage(pkg: EPackage): void {
    const nsURI = pkg.getNsURI();
    if (nsURI) this.packages.set(nsURI, pkg);
    this.index(pkg);
  }

  unregisterPackage(nsURI: string): void {
    const pkg = this.packages.get(nsURI);
    if (!pkg) return;
    this.packages.delete(nsURI);
    this.classByName.clear();
    for (const p of this.packages.values()) this.index(p);
  }

  hasPackage(nsURI: string): boolean {
    return this.packages.has(nsURI);
  }

  get nsURIs(): string[] {
    return [...this.packages.keys()];
  }

  /** The registered package with that nsURI */
  packageOf(nsURI: string): EPackage | undefined {
    return this.packages.get(nsURI);
  }

  /** `Person`, `library::Person` or `library.Person` */
  findClass(name: string): EClass | undefined {
    return this.classByName.get(name) ?? this.classByName.get(name.replace(/\./g, '::'));
  }

  /** Every class the registered packages hold, by simple name */
  allClasses(): EClass[] {
    const seen = new Set<EClass>();
    for (const [key, cls] of this.classByName) if (!key.includes('::')) seen.add(cls);
    return [...seen];
  }

  /** Own and inherited features of a class */
  featuresOf(cls: EClass): FeatureInfo[] {
    const result: FeatureInfo[] = [];
    const all = cls.getEAllStructuralFeatures?.() ?? cls.getEStructuralFeatures();
    for (let i = 0; i < all.size(); i++) {
      const f = all.get(i) as EStructuralFeature;
      const type = f.getEType?.();
      const typeName = type?.getName?.() ?? '?';
      const isMany = (f.getUpperBound?.() ?? 1) !== 1;
      const isReference = typeof (f as { getEReferenceType?: unknown }).getEReferenceType === 'function';
      result.push({ name: f.getName() ?? '', type: isMany ? `Sequence(${typeName})` : typeName, isReference, isMany, documentation: documentationOf(f) });
    }
    return result;
  }

  documentationOf(cls: EClass): string | undefined {
    return documentationOf(cls);
  }

  private index(pkg: EPackage): void {
    const classifiers = pkg.getEClassifiers();
    const pkgName = pkg.getName();
    for (let i = 0; i < classifiers.size(); i++) {
      const c = classifiers.get(i);
      if (!c || !isEClass(c)) continue;
      const name = c.getName();
      if (!name) continue;
      this.classByName.set(name, c);
      if (pkgName) this.classByName.set(`${pkgName}::${name}`, c);
    }
    const subs = pkg.getESubpackages?.();
    if (subs) for (let i = 0; i < subs.size(); i++) { const s = subs.get(i); if (s) this.index(s); }
  }
}
