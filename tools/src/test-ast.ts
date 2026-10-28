import ts from 'typescript';

export interface ExpectCall {
  subject: string;
  matcher?: string;
}

export interface TestCase {
  name: string;
  expects: ExpectCall[];
}

const TEST_FUNCTIONS = new Set(['it', 'test']);

function calleeName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return calleeName(expression.expression);
  if (ts.isCallExpression(expression)) return calleeName(expression.expression);
  return undefined;
}

function testName(node: ts.CallExpression, source: ts.SourceFile): string {
  const first = node.arguments[0];
  if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) return first.text;
  return first ? first.getText(source) : '(unnamed)';
}

function collectExpects(body: ts.Node, source: ts.SourceFile): ExpectCall[] {
  const found: ExpectCall[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'expect') {
      let chain: ts.Node = node;
      const names: string[] = [];
      while (ts.isPropertyAccessExpression(chain.parent) && chain.parent.expression === chain) {
        names.push(chain.parent.name.text);
        chain = chain.parent;
      }
      const called = ts.isCallExpression(chain.parent) && chain.parent.expression === chain;
      const matcher = called ? names.filter((name) => !['not', 'resolves', 'rejects'].includes(name)).pop() : undefined;
      found.push({ subject: node.arguments[0]?.getText(source) ?? '', matcher });
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
}

export function findTests(code: string, fileName = 'file.test.tsx'): TestCase[] {
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const tests: TestCase[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression);
      const callback = node.arguments.find((arg) => ts.isArrowFunction(arg) || ts.isFunctionExpression(arg));
      if (name && TEST_FUNCTIONS.has(name) && callback) {
        tests.push({ name: testName(node, source), expects: collectExpects(callback, source) });
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return tests;
}
