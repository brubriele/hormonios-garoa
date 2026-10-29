#!/usr/bin/env node
// Uso (de qualquer pasta):
//   node .claude/skills/code-pattern/scripts/contrato.cjs rotas [filtro]
//   node .claude/skills/code-pattern/scripts/contrato.cjs detalhe <fim-do-path> [metodo]
//   node .claude/skills/code-pattern/scripts/contrato.cjs campos <fim-do-path> [metodo]
//   node .claude/skills/code-pattern/scripts/contrato.cjs erros <fim-do-path> [metodo]
const path = require("path");
const contract = require(path.resolve(__dirname, "../../../../docs/transicionais-api.json"));

function listRoutes(filter = "") {
  const term = filter.toLowerCase();
  for (const [route, operations] of Object.entries(contract.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      if (!operation || !operation.tags) continue;
      const line = `${operation.tags[0]} | ${method.toUpperCase()} ${route} | ${operation.summary || ""}`;
      if (line.toLowerCase().includes(term)) console.log(line);
    }
  }
}

// igual primeiro; senão pelo fim do path. Mais de uma candidata: lista e para.
function findOperation(routeEnd, method = "get") {
  const routes = Object.keys(contract.paths);
  const exact = routes.filter((key) => key === routeEnd);
  const found = exact.length ? exact : routes.filter((key) => key.endsWith(routeEnd));

  if (!found.length) {
    console.log(`rota não encontrada: ${routeEnd}`);
    return null;
  }

  if (found.length > 1) {
    console.log(`mais de uma rota termina em ${routeEnd}; use mais do caminho:`);
    found.forEach((key) => console.log(`  ${key}`));
    return null;
  }

  const route = found[0];
  const operation = contract.paths[route][method];

  if (!operation) {
    const methods = Object.keys(contract.paths[route]).filter((key) => contract.paths[route][key]?.responses);
    console.log(`${route} não tem ${method.toUpperCase()}; tem: ${methods.join(", ").toUpperCase()}`);
    return null;
  }

  return { route, operation };
}

function printFields(value, prefix = "") {
  if (Array.isArray(value)) return printFields(value[0], `${prefix}[]`);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    console.log(prefix + key);
    printFields(child, `${prefix}${key}.`);
  }
}

function showDetail(routeEnd, method = "get") {
  const found = findOperation(routeEnd, method);
  if (!found) return;
  const { route, operation } = found;

  console.log(`## ${method.toUpperCase()} ${route}`);
  console.log(`${(operation.tags || [])[0] || ""} | ${operation.summary || ""}`);
  const security = (operation.security || []).flatMap((item) => Object.keys(item));
  console.log(`token: ${security.join(", ") || "nenhum"} | papéis: ${(operation["x-roles"] || []).join(", ") || "—"}`);

  if (operation.description) console.log(`\n${operation.description}`);

  if (operation.parameters?.length) {
    console.log("\n### parâmetros");
    for (const param of operation.parameters) {
      console.log(`${param.name} | ${param.in} | ${param.required ? "obrigatório" : "opcional"} | ${param.description || ""}`);
    }
  }

  const examples = operation.requestBody?.content?.["application/json"]?.examples;
  if (examples) {
    console.log("\n### corpo");
    console.log(JSON.stringify(Object.values(examples)[0].value, null, 2));
  }
}

function listFields(routeEnd, method = "get") {
  const found = findOperation(routeEnd, method);
  if (!found) return;
  const { route, operation } = found;
  for (const [status, response] of Object.entries(operation.responses || {})) {
    const examples = response.content?.["application/json"]?.examples;
    if (!examples) continue;
    console.log(`## ${status} ${method.toUpperCase()} ${route}`);
    printFields(Object.values(examples)[0].value);
  }
}

function listErrors(routeEnd, method = "get") {
  const found = findOperation(routeEnd, method);
  if (!found) return;
  for (const [status, response] of Object.entries(found.operation.responses || {})) {
    if (Number(status) < 400) continue;
    const examples = response.content?.["application/json"]?.examples || {};
    for (const { value } of Object.values(examples)) {
      if (value?.key) console.log(`${status} | ${value.key} | ${value.message || ""}`);
    }
  }
}

const [command, ...args] = process.argv.slice(2);
if (command === "rotas") listRoutes(args[0]);
else if (command === "detalhe") showDetail(args[0], args[1]);
else if (command === "campos") listFields(args[0], args[1]);
else if (command === "erros") listErrors(args[0], args[1]);
else console.log("comandos: rotas [filtro] | detalhe <fim-do-path> [metodo] | campos <fim-do-path> [metodo] | erros <fim-do-path> [metodo]");
