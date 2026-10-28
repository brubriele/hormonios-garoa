#!/usr/bin/env node
// Acha desvios do padrão do back (docs/agent_docs/backend/). Não substitui a revisão: aponta os
// padrões que a Bea já corrigiu à mão, para o agente corrigir antes de entregar.
//
//   node .claude/skills/code-pattern/scripts/check.cjs                  # api/ e src/bff/
//   node .claude/skills/code-pattern/scripts/check.cjs <arquivo|pasta>…  # só o que você tocou
//
// Exceção justificada: `// check-ignore <regra>: motivo` na linha ou na linha de cima.
// Sai com código 1 se achar algo.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../..");
const DEFAULT_TARGETS = ["api", "src/bff"];

// regra: { doc, test(arquivo relativo) -> aplica?, pattern, message }
const LINE_RULES = [
  {
    id: "console",
    doc: "lib.md L4",
    applies: (file) => file !== "src/bff/lib/logger.ts",
    pattern: /\bconsole\.(log|info|warn|error|debug)\(/,
    message: "use o logger (createLogger), não console.*",
  },
  {
    id: "safe-parse",
    doc: "requests-responses.md RR7",
    applies: (file) =>
      file !== "src/bff/repos/parse-response.ts" && file !== "src/bff/lib/schema.ts",
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
    applies: (file) => /^src\/bff\/repos\/[^/]+\/repo\.ts$/.test(file),
    pattern: /\?\?\s*(\[\]|""|''|null|\{\}|0\b|false\b)|\.\.\.\(/,
    message: "montar corpo ou domain é do request/response (fromDomain/toDomain), não do repo",
  },
  {
    id: "domain-manual-validate",
    doc: "domain.md M3",
    applies: (file) => file.startsWith("src/bff/domain/") && file !== "src/bff/lib/schema.ts",
    pattern: /throw new InvalidParameterError\(/,
    message: "o domain se valida pelo schema zod: validateSchema(<Domain>Schema, this, \"<prefixo>\")",
  },
  {
    id: "usecase-manual-validate",
    doc: "usecases.md U10",
    applies: (file) => file.startsWith("src/bff/usecases/"),
    pattern: /\btypeof\s+(input|change)\b/,
    message: "o formato da entrada é um schema zod: validateSchema(<Usecase>InputSchema, input)",
  },
  {
    id: "throw-error",
    doc: "errors.md E6/E7",
    applies: (file) => file.startsWith("src/bff/repos/"),
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
    applies: (file) => file.startsWith("src/bff/interfaces/"),
    pattern: /export\s+(interface|type)\s+IRaw\w*/,
    message: "formato cru é o schema do response/request, não IRaw* em interfaces/ (legado: migrar)",
  },
  {
    id: "repo-mapper",
    doc: "repos.md R5",
    applies: (file) => /^src\/bff\/repos\/[^/]+\/repo\.ts$/.test(file),
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
  {
    id: "return-await",
    doc: "README.md G11",
    applies: () => true,
    pattern: /\breturn\s+await\b/,
    message: "sem return await: const <nome> = await …; e, na linha de baixo, return <nome>;",
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
const MAPPERS_DIR = /^src\/bff\/usecases\/[^/]+\/mappers\//;
const DOMAIN_MAPPERS_DIR = /^src\/bff\/domain\/mappers\//;
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
    if (!/^src\/bff\/usecases\/[^/]+\/[^/]+\.ts$/.test(file)) {
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

// o código sem strings, template e comentários (trocados por espaço), com as quebras de linha no lugar
function stripCode(text) {
  return text.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|(["'`])(?:\\[\s\S]|(?!\1)[^\\])*\1/g, (match) =>
    match.replace(/[^\n]/g, " "),
  );
}

function lineAt(code, index) {
  return code.slice(0, index).split("\n").length;
}

const OPEN = "([{";
const CLOSE = ")]}";
const CHAIN_LINK = /^\s*[!?]?\??\.\s*\w+\s*(?:<[^()]*?>)?\s*\(/;
const CHAIN_RESET = /^(?:=>|===?|!==?|&&|\|\||\?\?|[,;=:?])/;
const BUILD_HEAD = /^(?:(?:return|await|export|const|let|yield|throw)\s+)*(?:z|sdk|\w+Schema)\s*\./;

// cadeia com mais de 2 métodos (G9); o build (z., sdk., *Schema.) é a exceção
function checkChains(sources) {
  return sources.flatMap(({ file, lines, text }) => {
    const code = stripCode(text);
    const links = [0];
    const starts = [0];
    const findings = [];

    for (let i = 0; i < code.length; i += 1) {
      const char = code[i];
      const depth = links.length - 1;

      if (OPEN.includes(char)) {
        links.push(0);
        starts.push(i + 1);
        continue;
      }

      if (CLOSE.includes(char)) {
        if (links.length > 1) {
          links.pop();
          starts.pop();
        }

        const outer = links.length - 1;
        const rest = code.slice(i + 1, i + 200);

        if (char !== ")") {
          continue;
        }

        if (!CHAIN_LINK.test(rest)) {
          continue;
        }

        links[outer] += 1;

        if (links[outer] !== 2) {
          continue;
        }

        const head = code.slice(starts[outer], i).trimStart();
        const line = lineAt(code, i);

        if (BUILD_HEAD.test(head) || isIgnored(lines, line - 1, "chained-calls")) {
          continue;
        }

        findings.push({
          file,
          line,
          rule: "chained-calls",
          doc: "README.md G9",
          message: "no máximo 2 métodos encadeados: guarde o meio num const (o build é a exceção)",
          code: (lines[line - 1] ?? "").trim(),
        });
        continue;
      }

      const reset = CHAIN_RESET.exec(code.slice(i, i + 3));

      if (reset) {
        links[depth] = 0;
        starts[depth] = i + reset[0].length;
        i += reset[0].length - 1;
      }
    }

    return findings;
  });
}

const NEW_EXPRESSION = /\bnew\s+[\w.]+/g;

// classe instanciada num const (G10): nada de new dentro de argumento nem método direto no new
function checkInlineNew(sources) {
  return sources.flatMap(({ file, lines, text }) => {
    const code = stripCode(text);
    const stack = [];
    const findings = [];
    const flagged = new Set();

    const report = (index, message) => {
      const line = lineAt(code, index);

      if (flagged.has(line) || isIgnored(lines, line - 1, "inline-new")) {
        return;
      }

      flagged.add(line);
      findings.push({ file, line, rule: "inline-new", doc: "README.md G10", message, code: (lines[line - 1] ?? "").trim() });
    };

    const news = [...code.matchAll(NEW_EXPRESSION)].map((match) => match.index);
    let next = 0;

    for (let i = 0; i < code.length; i += 1) {
      const char = code[i];

      if (news[next] === i) {
        const before = code.slice(0, i).trimEnd();

        if (stack[stack.length - 1] === "(" && !before.endsWith("=>")) {
          report(i, "classe instanciada num const, não dentro de um argumento");
        }

        next += 1;
      }

      if (OPEN.includes(char)) {
        stack.push(char);
        continue;
      }

      if (CLOSE.includes(char)) {
        stack.pop();
      }
    }

    for (const index of news) {
      const after = code.slice(index);
      const call = /^new\s+[\w.]+\s*(?:<[^()]*?>)?\s*\(/.exec(after);

      if (!call) {
        continue;
      }

      let depth = 0;
      let end = call[0].length - 1;

      for (; end < after.length; end += 1) {
        if (after[end] === "(") depth += 1;
        if (after[end] === ")") depth -= 1;
        if (depth === 0) break;
      }

      if (/^\s*[!?]?\??\.\s*\w/.test(after.slice(end + 1, end + 50))) {
        report(index, "classe instanciada num const; o método é chamado na linha de baixo");
      }
    }

    return findings;
  });
}

function main() {
  const targets = process.argv.slice(2);
  const files = [...new Set((targets.length ? targets : DEFAULT_TARGETS).flatMap(listFiles))];
  const sources = files.map((full) => {
    const text = fs.readFileSync(full, "utf8");

    return { file: path.relative(ROOT, full).split(path.sep).join("/"), text, lines: text.split("\n") };
  });

  const findings = [
    ...sources.flatMap(({ file, lines }) => checkLines(file, lines)),
    ...checkDuplicateHelpers(sources),
    ...checkMappers(sources),
    ...checkUsecaseInputs(sources),
    ...checkChains(sources),
    ...checkInlineNew(sources),
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
