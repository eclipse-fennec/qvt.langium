grammar Qvto

// ============================================================
// QVT Operational (OMG QVT 1.3, operational mappings) — the structure of a
// unit and the imperative body of mappings; expressions are OCL, embedded
// below in the same form as ocl.langium so both parsers agree on them.
//
// Two unit styles are accepted, because both are in use: the module form
// `transformation T(...) { main() {...} mapping ... }` and the Eclipse form
// `transformation T(...); main() {...} mapping ...` with the elements at
// top level after the signature.
// ============================================================

entry Unit:
    (imports+=ImportDeclaration | modeltypes+=ModeltypeDeclaration)*
    (module=TransformationDeclaration | module=LibraryDeclaration)?
    (elements+=ModuleElement)*;

ImportDeclaration:
    'import' name=QualifiedName ';';

// modeltype ALIAS "strict"? uses 'nsURI' (, 'nsURI')* ;
ModeltypeDeclaration:
    'modeltype' name=ID (strictness=STRING)? 'uses' uris+=STRING (',' uris+=STRING)* ';';

TransformationDeclaration:
    'transformation' name=QualifiedName
    '(' (parameters+=ModelParameter (',' parameters+=ModelParameter)*)? ')'
    ('extends' extends+=QualifiedName (',' extends+=QualifiedName)*)?
    ('access' accesses+=QualifiedName (',' accesses+=QualifiedName)*)?
    (';' | '{' (elements+=ModuleElement)* '}');

LibraryDeclaration:
    'library' name=QualifiedName
    ('(' (parameters+=ModelParameter (',' parameters+=ModelParameter)*)? ')')?
    (';' | '{' (elements+=ModuleElement)* '}');

// in src : LIB   |   out tgt : CAT   |   inout m : M
ModelParameter:
    direction=Direction name=ID ':' modeltype=ID;

Direction returns string:
    'in' | 'out' | 'inout';

ModuleElement:
    MainDeclaration | MappingDeclaration | HelperDeclaration | PropertyDeclaration;

MainDeclaration:
    {infer MainDeclaration} 'main' '(' ')' body=Block;

// mapping Class::name(params) : Result [when {..}] [where {..}] { init{} statements end{} }
// The head is one `::`-separated name: the last segment is the mapping's name,
// what stands before it the context type. Splitting it in the grammar is ambiguous
// for the parser (a qualified type name also holds `::`), so the AST keeps the
// segments and `mappingName`/`mappingContext` in qvto-validator.ts read them.
MappingDeclaration:
    (abstract?='abstract')? 'mapping' names+=ID ('::' names+=ID)*
    '(' (parameters+=Parameter (',' parameters+=Parameter)*)? ')'
    (':' results+=ResultParameter (',' results+=ResultParameter)*)?
    (('inherits' | 'merges' | 'disjuncts') extensions+=QualifiedName (',' extensions+=QualifiedName)*)*
    ('when' when=Guard)?
    ('where' where=Guard)?
    (';' | body=MappingBody);

// when { expr }  — a boolean guard, not a block: no semicolon after the expression
Guard:
    '{' condition=Expression ';'? '}';

// a result is a type, or a named result: `result : Type`
ResultParameter:
    (name=ID ':')? type=TypeExpression;

MappingBody:
    {infer MappingBody} '{'
        ('init' init=Block)?
        (statements+=Statement)*
        ('end' end=Block)?
    '}';

// helper / query, optionally with a context class: helper Class::name(...) : Type { ... }
HelperDeclaration:
    kind=HelperKind names+=ID ('::' names+=ID)*
    '(' (parameters+=Parameter (',' parameters+=Parameter)*)? ')'
    (':' returnType=TypeExpression)?
    (';' | body=Block);

HelperKind returns string:
    'helper' | 'query' | 'constructor';

// property name : Type = expr ;   (module-level, also `configuration property`)
PropertyDeclaration:
    (configuration?='configuration')? 'property' name=ID ':' type=TypeExpression ('=' value=Expression)? ';';

Parameter:
    (direction=Direction)? name=ID ':' type=TypeExpression;

// ============================================================
// Statements
// ============================================================

Block:
    {infer Block} '{' (statements+=Statement)* '}';

Statement:
    VariableDeclaration
    | ReturnStatement
    | IfStatement
    | WhileStatement
    | LogStatement
    | AssertStatement
    | AssignmentOrExpressionStatement;

// var x : Type := expr ;   |   var x := expr ;
VariableDeclaration:
    'var' name=ID (':' type=TypeExpression)? (':=' value=Expression)? ';';

ReturnStatement:
    {infer ReturnStatement} 'return' (value=Expression)? ';';

// if (cond) { } else { };   — QVT-O also allows the OCL spelling with then/endif around the blocks
IfStatement:
    'if' '(' condition=Expression ')' 'then'? then=Block ('else' (elseIf=IfStatement | else=Block))? 'endif'? ';'?;

WhileStatement:
    'while' '(' condition=Expression ')' body=Block ';'?;

LogStatement:
    'log' '(' arguments+=Expression (',' arguments+=Expression)* ')' ';';

AssertStatement:
    'assert' (severity=('fatal' | 'error' | 'warning'))? '(' condition=Expression ')' ('with' 'log' '(' message=Expression ')')? ';';

// target := expr ;   target += expr ;   or just an expression with side effects (a mapping call)
AssignmentOrExpressionStatement:
    target=Expression (op=(':=' | '+=' | '::=') value=Expression)? ';';

// ============================================================
// Types — OCL types plus QVT-O's List and Dict
// ============================================================

TypeExpression:
    CollectionType | TupleType | SimpleType;

SimpleType:
    name=QualifiedName;

CollectionType:
    kind=CollectionKind '(' elementType=TypeExpression (',' valueType=TypeExpression)? ')';

TupleType:
    'Tuple' '(' (parts+=TupleTypePart (',' parts+=TupleTypePart)*)? ')';

TupleTypePart:
    name=ID ':' type=TypeExpression;

CollectionKind returns string:
    'Set' | 'OrderedSet' | 'Bag' | 'Sequence' | 'Collection' | 'List' | 'Dict';

// ============================================================
// Expressions (precedence: low to high) — as in ocl.langium
// ============================================================

Expression:
    LetExpression | IfExpression | ObjectExpression | ImpliesExpression;

LetExpression:
    'let' name=ID (':' type=TypeExpression)? '=' value=Expression 'in' body=Expression;

IfExpression:
    'if' condition=Expression 'then' thenExpression=Expression
    'else' elseExpression=Expression 'endif';

// object Type { statements }   |   object name : Type { statements }
ObjectExpression:
    'object' (name=ID ':')? type=QualifiedName ('@' extent=ID)? body=Block;

ImpliesExpression infers Expression:
    OrExpression ({infer BinaryExpression.left=current} op=('implies' | 'xor') right=OrExpression)*;

OrExpression infers Expression:
    AndExpression ({infer BinaryExpression.left=current} op='or' right=AndExpression)*;

AndExpression infers Expression:
    NotExpression ({infer BinaryExpression.left=current} op='and' right=NotExpression)*;

NotExpression infers Expression:
    {infer UnaryExpression} op='not' operand=NotExpression
    | ComparisonExpression;

ComparisonExpression infers Expression:
    AdditiveExpression ({infer BinaryExpression.left=current} op=('=' | '<>' | '<' | '>' | '<=' | '>=') right=AdditiveExpression)*;

AdditiveExpression infers Expression:
    MultiplicativeExpression ({infer BinaryExpression.left=current} op=('+' | '-') right=MultiplicativeExpression)*;

MultiplicativeExpression infers Expression:
    UnaryMinusExpression ({infer BinaryExpression.left=current} op=('*' | '/' | 'div' | 'mod') right=UnaryMinusExpression)*;

UnaryMinusExpression infers Expression:
    {infer UnaryExpression} op='-' operand=UnaryMinusExpression
    | NavigationExpression;

// ============================================================
// Navigation, calls — and QVT-O's mapping calls and resolves
// ============================================================

NavigationExpression infers Expression:
    PrimaryExpression (
        // ->map name(args)   ->xmap name(args)   — the mapping call, on a collection
        {infer MapCallExpression.source=current} '->' kind=MapKind mapping=QualifiedName '(' (arguments+=Expression (',' arguments+=Expression)*)? ')'
        // .map name(args)  — the mapping call on a single object
        | {infer MapCallExpression.source=current} '.' kind=MapKind mapping=QualifiedName '(' (arguments+=Expression (',' arguments+=Expression)*)? ')'
        // .resolve(...) .resolveone(...) .invresolve(...) .late resolve(...) — trace lookups
        | {infer ResolveExpression.source=current} '.' (late?='late')? kind=ResolveKind '(' (target=ResolveTarget)? ')'
        // ->forEach(e) { … }   ->forOne(e | cond) { … }  — the imperative loops
        | {infer ImperativeLoopExpression.source=current} '->' kind=LoopKind '(' iterator=ID (':' iteratorType=TypeExpression)? (',' iterator2=ID (':' iteratorType2=TypeExpression)?)? ('|' condition=Expression)? ')' body=Block
        // ->op(...)  — collection operation, possibly with an iterator body
        | {infer ArrowExpression.source=current} '->' operation=ID '(' (arguments+=IteratorBody | arguments+=Expression (',' arguments+=Expression)*)? ')'
        // .feature  or  .operation(...)  or  .operation(iterator | body)
        | {infer DotExpression.source=current} '.' feature=ID ('(' (arguments+=IteratorBody | arguments+=Expression (',' arguments+=Expression)*)? ')')?
        // expr[Type]  — the type filter, `select(e | e.oclIsKindOf(Type))` in short; `expr[Type | cond]` too
        | {infer TypeFilterExpression.source=current} '[' type=QualifiedName ('|' condition=Expression)? ']'
    )*;

MapKind returns string:
    'map' | 'xmap';

LoopKind returns string:
    'forEach' | 'forOne';

ResolveKind returns string:
    'resolve' | 'resolveone' | 'invresolve' | 'invresolveone' | 'resolveIn' | 'resolveoneIn' | 'invresolveIn' | 'invresolveoneIn';

// resolve(Type)  resolve(v : Type | cond)  resolveIn(Class::mapping, Type)
ResolveTarget:
    (mapping=QualifiedName ',')? ((name=ID ':')? type=QualifiedName ('|' condition=Expression)?);

IteratorBody:
    iteratorName=ID (':' iteratorType=TypeExpression)? (',' iteratorName2=ID (':' iteratorType2=TypeExpression)?)? '|' body=Expression;

// ============================================================
// Primary Expressions
// ============================================================

PrimaryExpression infers Expression:
    ParenthesizedExpression
    | CollectionLiteral
    | TupleLiteral
    | NewExpression
    | TypeExpLiteral
    | SelfExpression
    | ResultExpression
    | VariableExpression
    | IntegerLiteral
    | RealLiteral
    | StringLiteral
    | BooleanLiteral
    | NullLiteral
    | InvalidLiteral;

ParenthesizedExpression infers Expression:
    '(' Expression ')';

SelfExpression:
    {infer SelfExpression} 'self';

// `result` names the mapping's result inside its body
ResultExpression:
    {infer ResultExpression} 'result';

// new Type(args)
NewExpression:
    'new' type=QualifiedName ('@' extent=ID)? '(' (arguments+=Expression (',' arguments+=Expression)*)? ')';

// a variable, a helper or query call `formatLabel(a, b)`, a `::`-qualified enum
// literal or static call `Color::red`, `LIB::Library.allInstances()`. A dot is
// never part of the name here: `lib.books` is navigation.
VariableExpression:
    name=ScopedName ('(' (arguments+=IteratorBody | arguments+=Expression (',' arguments+=Expression)*)? ')')?;

ScopedName returns string:
    ID ('::' ID)*;

IntegerLiteral:
    value=INT;

RealLiteral:
    value=REAL;

StringLiteral:
    value=STRING;

BooleanLiteral:
    value=('true' | 'false');

NullLiteral:
    {infer NullLiteral} 'null';

InvalidLiteral:
    {infer InvalidLiteral} 'invalid';

CollectionLiteral:
    kind=CollectionKind '{' (items+=CollectionItem (',' items+=CollectionItem)*)? '}';

CollectionItem:
    first=Expression ('..' last=Expression)?;

TupleLiteral:
    'Tuple' '{' (parts+=TuplePart (',' parts+=TuplePart)*)? '}';

TuplePart:
    name=ID ('=' | ':') value=Expression;

// Type::feature — enum literals, static features, allInstances on a type path
TypeExpLiteral:
    type=QualifiedName '::' feature=ID;

QualifiedName returns string:
    ID ('::' ID | '.' ID)*;

// ============================================================
// Terminals
// ============================================================

hidden terminal WS: /\s+/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /--[^\n\r]*/;
hidden terminal SL_COMMENT2: /\/\/[^\n\r]*/;

terminal REAL returns number: /[0-9]+\.[0-9]+([eE][+-]?[0-9]+)?/;
terminal INT returns number: /[0-9]+/;
terminal STRING: /'[^']*'|"[^"]*"/;
terminal ID: /[a-zA-Z_][a-zA-Z0-9_]*/;
