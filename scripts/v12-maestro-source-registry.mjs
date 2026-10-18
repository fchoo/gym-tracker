import { readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";

export const V12_MAESTRO_FUNCTIONAL_REGISTRIES = Object.freeze({
  "multi-plan": Object.freeze({
    source: "src/testing/contracts/multiPlanRunning.contract.ts",
    prefix: "phase13-",
    expected_count: 13,
    declarations: Object.freeze([
      Object.freeze({ name: "MULTI_PLAN_RUNNING_CONTRACT_CASES", shape: "strings" }),
    ]),
  }),
  workout: Object.freeze({
    source: "src/testing/contracts/phase15Workout.contract.ts",
    prefix: "workout.",
    expected_count: 42,
    declarations: Object.freeze([
      Object.freeze({ name: "requirementCases", shape: "tuples" }),
      Object.freeze({ name: "crossCuttingCases", shape: "tuples" }),
    ]),
  }),
  "library-running": Object.freeze({
    source: "src/testing/contracts/phase17LibraryRunning.contract.ts",
    prefix: "library.",
    expected_count: 46,
    declarations: Object.freeze([
      Object.freeze({ name: "rows", shape: "tuples" }),
      Object.freeze({ name: "matrixOnlyContracts", shape: "tuples" }),
    ]),
  }),
});

function fail(code) {
  throw new Error(`v12_maestro_registry_${code}`);
}

function unwrapExpression(node) {
  let current = node;
  while (ts.isAsExpression(current) || ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

function declarationInitializers(sourceFile) {
  const declarations = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer !== undefined) {
        declarations.set(declaration.name.text, declaration.initializer);
      }
    }
  }
  return declarations;
}

function stringLiteral(node) {
  const value = unwrapExpression(node);
  return ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)
    ? value.text
    : undefined;
}

function idsFromDeclaration(initializers, descriptor) {
  const initializer = initializers.get(descriptor.name);
  const array = initializer === undefined ? undefined : unwrapExpression(initializer);
  if (array === undefined || !ts.isArrayLiteralExpression(array)) fail("declaration_invalid");
  return array.elements.map((element) => {
    if (descriptor.shape === "strings") return stringLiteral(element);
    const tuple = unwrapExpression(element);
    return ts.isArrayLiteralExpression(tuple) && tuple.elements.length > 0
      ? stringLiteral(tuple.elements[0])
      : undefined;
  });
}

export function deriveV12MaestroCaseIdsFromSource(shard, sourceText) {
  const registry = V12_MAESTRO_FUNCTIONAL_REGISTRIES[shard];
  if (registry === undefined || typeof sourceText !== "string" || sourceText.length === 0) fail("arguments_invalid");
  const sourceFile = ts.createSourceFile(registry.source, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (sourceFile.parseDiagnostics.length > 0) fail("source_invalid");
  const initializers = declarationInitializers(sourceFile);
  const ids = registry.declarations.flatMap((descriptor) => idsFromDeclaration(initializers, descriptor));
  if (ids.some((id) => typeof id !== "string" || !id.startsWith(registry.prefix))
    || ids.length !== registry.expected_count || new Set(ids).size !== ids.length) fail("registry_drift");
  return Object.freeze([...ids]);
}

export function deriveV12MaestroCaseIds(shard, root = process.cwd()) {
  const registry = V12_MAESTRO_FUNCTIONAL_REGISTRIES[shard];
  if (registry === undefined) fail("arguments_invalid");
  return deriveV12MaestroCaseIdsFromSource(
    shard,
    readFileSync(path.join(root, registry.source), "utf8"),
  );
}
