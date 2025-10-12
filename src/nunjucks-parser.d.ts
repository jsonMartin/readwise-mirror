/** biome-ignore-all lint/suspicious/noExplicitAny: These are just types of a badly defined JS class */
/** biome-ignore-all lint/complexity/noBannedTypes: These are just types of a badly defined JS class */
export interface Token {
  type: string;
  value: string;
  lineno: number;
  colno: number;
}

export interface TokenizerOptions {
  tags?: {
    blockStart?: string;
    blockEnd?: string;
    variableStart?: string;
    variableEnd?: string;
    commentStart?: string;
    commentEnd?: string;
  };
  trimBlocks?: boolean;
  lstripBlocks?: boolean;
}

export class Tokenizer {
  constructor(str: string, opts?: TokenizerOptions);
  str: string;
  index: number;
  len: number;
  lineno: number;
  colno: number;
  in_code: boolean;
  tags: Required<TokenizerOptions['tags']>;

  nextToken(): Token | null;
  forward(): void;
  back(): void;
  current(): string;
  isFinished(): boolean;
}

export class Node {
  lineno: number;
  colno: number;
  fields: string[];

  init(lineno: number, colno: number, ...args: any[]): void;
  findAll(type: typeof Node, results?: Node[]): Node[];
  iterFields(func: (val: any, field: string) => void): void;
}

export class NodeList extends Node {
  children: Node[];
  addChild(node: Node): void;
}

export interface ParserOptions {
  tags?: {
    blockStart?: string;
    blockEnd?: string;
    variableStart?: string;
    variableEnd?: string;
    commentStart?: string;
    commentEnd?: string;
  };
  trimBlocks?: boolean;
  lstripBlocks?: boolean;
}

export interface Extension {
  tags?: string[];
  parse(parser: Parser, nodes: typeof Node, lexer: typeof Tokenizer): Node;
  run(context: Context, ...args: any[]): any;
}

export class Parser {
  constructor(tokens: Tokenizer);
  tokens: Tokenizer;
  peeked: Token | null;
  breakOnBlocks: string[] | null;
  dropLeadingWhitespace: boolean;
  extensions: Extension[];

  init(tokens: Tokenizer): void;

  // Core parsing methods
  parse(): NodeList;
  parseAsRoot(): Node;
  parseNodes(): Node[];
  parseStatement(): Node | null;
  parseExpression(): Node;

  // Statement parsing methods
  parseFor(): Node;
  parseIf(): Node;
  parseBlock(): Node;
  parseExtends(): Node;
  parseInclude(): Node;
  parseSet(): Node;
  parseMacro(): Node;
  parseImport(): Node;
  parseFrom(): Node;
  parseFilter(node: Node): Node;
  parseFilterStatement(): Node;
  parseCall(): Node;
  parseSwitch(): Node;
  parseWithContext(): boolean | null;

  // Expression parsing methods
  parseAggregate(): Node | null;
  parseUnary(noFilters?: boolean): Node;
  parsePrimary(noPostfix?: boolean): Node;
  parsePostfix(node: Node): Node;
  parseInlineIf(): Node;
  parseOr(): Node;
  parseAnd(): Node;
  parseNot(): Node;
  parseIn(): Node;
  parseIs(): Node;
  parseCompare(): Node;
  parseConcat(): Node;
  parseAdd(): Node;
  parseSub(): Node;
  parseMul(): Node;
  parseDiv(): Node;
  parseFloorDiv(): Node;
  parseMod(): Node;
  parsePow(): Node;

  // Token handling methods
  nextToken(withWhitespace?: boolean): Token | null;
  peekToken(): Token | null;
  pushToken(tok: Token): void;

  // Utility methods
  error(msg: string, lineno?: number, colno?: number): Error;
  fail(msg: string, lineno?: number, colno?: number): never;
  skip(type: string): boolean;
  expect(type: string): Token;
  skipValue(type: string, val: string): boolean;
  skipSymbol(val: string): boolean;
  advanceAfterBlockEnd(name?: string): Token;
  advanceAfterVariableEnd(): void;
  parseUntilBlocks(...blockNames: string[]): Node;
  parseRaw(tagName?: string): Node;
  parseFilterName(): Node;
  parseFilterArgs(node: Node): Node[];
  parseSignature(tolerant?: boolean, noParens?: boolean): NodeList | null;
  iterateFields(func: (val: any, field: string) => void): void;
}

export class CallExtension extends Node {
  extName: string;
  prop: string;
  args: NodeList;
  contentArgs: Node[];
  autoescape: boolean;

  constructor(ext: any, prop: string, args?: NodeList, contentArgs?: Node[]);
}

export interface Environment {
  opts: {
    dev: boolean;
    autoescape: boolean;
    throwOnUndefined: boolean;
    trimBlocks: boolean;
    lstripBlocks: boolean;
  };
  globals: Record<string, any>;
  filters: Record<string, Function>;
  tests: Record<string, Function>;
  asyncFilters: string[];
  extensions: Record<string, Extension>;
  extensionsList: Extension[];
}

export class Context {
  constructor(ctx: Record<string, any>, blocks: Record<string, Function[]>, env?: Environment);

  env: Environment;
  ctx: Record<string, any>;
  blocks: Record<string, Function[]>;
  exported: string[];

  init(ctx: Record<string, any>, blocks: Record<string, Function[]>, env?: Environment): void;
  lookup(name: string): any;
  setVariable(name: string, val: any): void;
  getVariables(): Record<string, any>;
  addBlock(name: string, block: Function): this;
  getBlock(name: string): Function;
  getSuper(env: Environment, name: string, block: Function, frame: Frame, runtime: Runtime, cb: Function): void;
  addExport(name: string): void;
  getExported(): Record<string, any>;
}

export interface Runtime {
  handleError(error: Error, lineno?: number, colno?: number): Error;
}

export class Frame {
  push(isolated?: boolean): Frame;
  topLevel: boolean;
}
