import { pathToFileURL } from "node:url";

export function exactKeys(value, keys) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

export function regexMatch(expression, value) {
  return expression.test(typeof value === "string" ? value : "");
}

export function cliArgValue(args, index) {
  return typeof args[index] === "string" ? args[index] : "";
}

export function choose(primary, fallback) {
  return primary === undefined ? fallback : primary;
}

export function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined) return value;
  }
  return undefined;
}

export function errorMessage(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}

export function runCliIfMain(moduleUrl, argv1, callback) {
  if (argv1 && moduleUrl === pathToFileURL(argv1).href) {
    callback();
  }
}
