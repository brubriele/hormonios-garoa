#!/usr/bin/env node
// Acha desvios do padrão do back (docs/agent_docs/backend/). Não substitui a revisão: aponta os
// padrões que a Bea já corrigiu à mão, para o agente corrigir antes de entregar.
//
//   node .claude/skills/code-pattern/scripts/check.cjs                  # api/ e src/serve-utils/
//   node .claude/skills/code-pattern/scripts/check.cjs <arquivo|pasta>…  # só o que você tocou
//
// Exceção justificada: `// check-ignore <regra>: motivo` na linha ou na linha de cima.
// Sai com código 1 se achar algo.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../..");
const DEFAULT_TARGETS = ["api", "src/serve-utils"];

// regra: { doc, test(arquivo relativo) -> aplica?, pattern, message }
const LINE_RULES = [
  {
    id: "console",
    doc: "lib.md L4",
    applies: (file) => file !== "src/serve-utils/lib/logger.ts",
    pattern: /\bconsole\.(log|info|warn|error|debug)\(/,
    message: "use o logger (createLogger), não console.*",
  },
  {
    id: "safe-parse",
    doc: "requests-responses.md RR7",
    applies: (file) =>
      file !== "src/serve-utils/repos/parse-response.ts" && file !== "src/serve-utils/lib/schema.ts",
    pattern: /\.safeParse\(/,
    message: "valide com parseResponse(schema, raw, source, operation)",
  },
  {
    id: "response-fallback",
    doc: "requests-responses.md RR3",
    applies: (file) => /\/(responses|requests)\//.test(file),
    skip: /\.(transform|default)\(/, // dentro do schema é o lugar certo
    pattern: /\?\?\s*(\[\]|""|''|null|\{\}|0\b|false\b)/,
    message: "default/normalização é do schema (.default, .transform), não do toDomain",
  },
  {
    id: "repo-mapping",
    doc: "repos.md R5, requests-responses.md",
    applies: (file) => /^src\/serve-utils\/repos\/[^/]+\/repo\.ts$/.test(file),
    pattern: /\?\?\s*(\[\]|""|''|null|\{\}|0\b|false\b)|\.\.\.\(/,
    message: "montar corpo ou domain é do request/response (fromDomain/toDomain), não do repo",
  },
  {
    id: "domain-manual-validate",
    doc: "domain.md M3",
    applies: (file) => file.startsWith("src/serve-utils/domain/") && file !== "src/serve-utils/lib/schema.ts",
    pattern: /throw new InvalidParameterError\(/,
    message: "o domain se valida pelo schema zod: validateSchema(<Domain>Schema, this, \"<prefixo>\")",
  },
  {
    id: "usecase-manual-validate",
    doc: "usecases.md U10",
    applies: (file) => file.startsWith("src/serve-utils/usecases/"),
    pattern: /\btypeof\s+(input|change)\b/,
    message: "o formato da entrada é um schema zod: validateSchema(<Usecase>InputSchema, input)",
  },
  {
    id: "throw-error",
    doc: "errors.md E6/E7",
    applies: (file) => file.startsWith("src/serve-utils/repos/"),
    pattern: /throw new Error\(/,
    message: "falha de fonte é InfraError (DatabaseError, UpstreamResponseError, InvalidResponseError)",
  },
  {
    id: "string-union",
    doc: "domain.md M6, interfaces.md I6",
    applies: () => true,
    pattern: /["'][\w-]+["']\s*\|\s*["'][\w-]+["']/,
    message: "conjunto fechado de valores é enum de string, não união de textos",
  },
  {
    id: "nullable-optional",
    doc: "requests-responses.md RR4, interfaces.md I7",
    applies: () => true,
    pattern: /\.nullable\(\)\.optional\(\)|\.optional\(\)\.nullable\(\)|\.nullish\(\)|\?:\s*[^;=]*\|\s*null\b/,
    message: "o campo é nullable OU optional, nunca os dois",
  },
  {
    id: "raw-interface",
    doc: "interfaces.md I3",
    applies: (file) => file.startsWith("src/serve-utils/interfaces/"),
    pattern: /export\s+(interface|type)\s+IRaw\w*/,
    message: "formato cru é o schema do response/request, não IRaw* em interfaces/ (legado: migrar)",
  },
  {
    id: "repo-mapper",
    doc: "repos.md R5",
    applies: (file) => /^src\/serve-utils\/repos\/[^/]+\/repo\.ts$/.test(file),
    pattern: /private\s+mapper\w*\(/,
    message: "o mapeamento é do response/request (toDomain/fromDomain), não mapper* no repo",
  },
  {
    id: "const-enum",
    doc: "domain.md M6",
    applies: () => true,
    pattern: /\bconst\s+enum\b/,
    message: "sem const enum (o esbuild não o compila entre arquivos)",
  },
];

function listFiles(target) {
  const full = path.resolve(ROOT, target);

  if (!fs.existsSync(full)) {
    console.error(`não existe: ${target}`);
    return [];
  }

  if (fs.statSync(full).isFile()) {
    return full.endsWith(".ts") ? [full] : [];
  }

  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) {
      return [];
    }

    return listFiles(path.join(full, entry.name));
  });
}

function isIgnored(lines, index, ruleId) {
  const marker = new RegExp(`check-ignore\\s+([\\w-]+,\\s*)*${ruleId}\\b`);

  return marker.test(lines[index]) || (index > 0 && marker.test(lines[index - 1]));
}

// linha só de comentário: o padrão citado no texto não é código
function isComment(line) {
  const trimmed = line.trim();

  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

function checkLines(file, lines) {
  const findings = [];

  lines.forEach((line, index) => {
    if (isComment(line)) {
      return;
    }

    for (const rule of LINE_RULES) {
      if (rule.skip?.test(line)) {
        continue;
      }

      if (rule.applies(file) && rule.pattern.test(line) && !isIgnored(lines, index, rule.id)) {
        findings.push({ file, line: index + 1, rule: rule.id, doc: rule.doc, message: rule.message, code: line.trim() });
      }
    }
  });

  return findings;
}

// helper de topo com o mesmo nome em mais de um arquivo (G8)
function checkDuplicateHelpers(sources) {
  const byName = new Map();

  for (const { file, lines } of sources) {
    lines.forEach((line, index) => {
      const match = /^(?:export\s+)?function\s+(\w+)\s*\(/.exec(line);

      if (match) {
        const list = byName.get(match[1]) ?? [];
        list.push({ file, line: index + 1 });
        byName.set(match[1], list);
      }
    });
  }

  return [...byName.entries()]
    .filter(([, places]) => new Set(places.map((place) => place.file)).size > 1)
    .flatMap(([name, places]) =>
      places.map((place) => ({
        ...place,
        rule: "duplicate-helper",
        doc: "README.md G8, lib.md",
        message: `function ${name} existe em ${places.length} arquivos: mova para lib/`,
        code: `function ${name}(`,
      })),
    );
}

// mapper (*Mapper, to*View) só em usecases/<contexto>/mappers/, um por arquivo <nome>.mapper.ts (usecases.md U9)
const MAPPERS_DIR = /^src\/serve-utils\/usecases\/[^/]+\/mappers\//;
const DOMAIN_MAPPERS_DIR = /^src\/serve-utils\/domain\/mappers\//;
const MAPPER_DOC = "usecases.md U9";
const DOMAIN_MAPPER_DOC = "domain.md M11";
const MAPPER_DECLARATION =
  /^\s*(?:export\s+)?(?:(?:private|public|protected|static|async|abstract)\s+)*(?:class\s+\w*Mapper\b|(?:function\s+)?to[A-Z]\w*View\s*[(<])/;
const EXPORTED_MAPPER = /^export\s+(?:abstract\s+)?(?:class|function)\s+(\w+)/;

function checkMappers(sources) {
  return sources.flatMap(({ file, lines }) => {
    const finding = (line, message, doc = MAPPER_DOC) => ({
      file,
      line,
      rule: "mapper-location",
      doc,
      message,
      code: (lines[line - 1] ?? "").trim(),
    });

    if (DOMAIN_MAPPERS_DIR.test(file)) {
      return /\/[A-Z]\w*Mapper\.ts$/.test(file) ? [] : [finding(1, "arquivo de domain/mappers/ se chama <Nome>Mapper.ts", DOMAIN_MAPPER_DOC)];
    }

    if (!MAPPERS_DIR.test(file)) {
      return lines.flatMap((line, index) =>
        !isComment(line) && MAPPER_DECLARATION.test(line) && !isIgnored(lines, index, "mapper-location")
          ? [finding(index + 1, "mapper (*Mapper, to*View) fica em usecases/<contexto>/mappers/, um por arquivo")]
          : [],
      );
    }

    if (!file.endsWith(".mapper.ts")) {
      return [finding(1, "arquivo de usecases/<contexto>/mappers/ se chama <nome>.mapper.ts")];
    }

    const exported = lines.flatMap((line, index) => (EXPORTED_MAPPER.test(line) ? [index] : []));

    return exported.length > 1
      ? exported.slice(1).map((index) => finding(index + 1, "um mapper por arquivo: só uma classe ou função exportada"))
      : [];
  });
}

// a rota não valida a entrada: todo usecase que recebe input a valida pelo schema (U10)
function checkUsecaseInputs(sources) {
  return sources.flatMap(({ file, lines }) => {
    if (!/^src\/serve-utils\/usecases\/[^/]+\/[^/]+\.ts$/.test(file)) {
      return [];
    }

    const index = lines.findIndex((line) => /async execute\(input\b/.test(line));

    if (index === -1 || lines.some((line) => /validateSchema\(/.test(line)) || isIgnored(lines, index, "usecase-input-schema")) {
      return [];
    }

    return [{
      file,
      line: index + 1,
      rule: "usecase-input-schema",
      doc: "usecases.md U10",
      message: "o usecase recebe input e não o valida: validateInput com validateSchema(<Usecase>InputSchema, input)",
      code: lines[index].trim(),
    }];
  });
}

function main() {
  const targets = process.argv.slice(2);
  const files = [...new Set((targets.length ? targets : DEFAULT_TARGETS).flatMap(listFiles))];
  const sources = files.map((full) => ({
    file: path.relative(ROOT, full).split(path.sep).join("/"),
    lines: fs.readFileSync(full, "utf8").split("\n"),
  }));

  const findings = [
    ...sources.flatMap(({ file, lines }) => checkLines(file, lines)),
    ...checkDuplicateHelpers(sources),
    ...checkMappers(sources),
    ...checkUsecaseInputs(sources),
  ].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  if (findings.length === 0) {
    console.log(`ok: ${files.length} arquivo(s) sem desvio do padrão`);
    return;
  }

  for (const finding of findings) {
    console.log(`${finding.file}:${finding.line} [${finding.rule}] ${finding.message} (${finding.doc})`);
    console.log(`    ${finding.code}`);
  }

  const byRule = findings.reduce((acc, finding) => ({ ...acc, [finding.rule]: (acc[finding.rule] ?? 0) + 1 }), {});
  console.log(`\n${findings.length} desvio(s) em ${new Set(findings.map((f) => f.file)).size} arquivo(s):`, byRule);
  process.exitCode = 1;
}

main();
