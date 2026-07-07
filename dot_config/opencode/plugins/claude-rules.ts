import { existsSync, readdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

type Rule = {
  key: string
  file: string
  body: string
  patterns: string[]
  always: boolean
}

export const ClaudeRulesPlugin = async ({ worktree, directory }: { worktree?: string; directory: string }) => {
  if (process.env.OPENCODE_DISABLE_CLAUDE_CODE || process.env.OPENCODE_DISABLE_CLAUDE_CODE_RULES) {
    return {}
  }

  const root = worktree || directory
  const rules = loadRules(root)
  const active = new Set(rules.filter((rule) => rule.always).map((rule) => rule.key))

  return {
    "tool.execute.before": async (_input: unknown, output: { args?: unknown }) => {
      for (const touched of collectPaths(output.args)) {
        activateMatchingRules(rules, active, root, touched)
      }
    },
    "experimental.chat.system.transform": async (_input: unknown, output: { system: string[] }) => {
      const selected = rules.filter((rule) => active.has(rule.key))
      if (selected.length === 0) return

      output.system.push(formatRules(selected))
    },
  }
}

function loadRules(root: string): Rule[] {
  const dirs = [
    path.join(homedir(), ".claude", "rules"),
    path.join(root, ".claude", "rules"),
  ]

  const byKey = new Map<string, Rule>()
  for (const dir of dirs) {
    if (!existsSync(dir)) continue

    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".md")) continue

      const file = path.join(dir, name)
      const rule = parseRule(file, readFileSync(file, "utf8"))
      byKey.set(rule.key, rule)
    }
  }

  return [...byKey.values()]
}

function parseRule(file: string, raw: string): Rule {
  const content = raw.replace(/\r\n/g, "\n")
  const key = path.basename(file, ".md")
  if (!content.startsWith("---\n")) {
    return { key, file, body: content.trim(), patterns: [], always: true }
  }

  const end = content.indexOf("\n---", 4)
  if (end === -1) {
    return { key, file, body: content.trim(), patterns: [], always: true }
  }

  const frontmatter = content.slice(4, end)
  const body = content.slice(end + 4).trim()
  const patterns = parsePatterns(frontmatter)
  const always = patterns.length === 0 || /^alwaysApply:\s*true\s*$/m.test(frontmatter)

  return { key, file, body, patterns, always }
}

function parsePatterns(frontmatter: string): string[] {
  const lines = frontmatter.split("\n")
  const patterns: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(paths|globs|patterns):\s*(.*)$/)
    if (!match) continue

    const inline = match[2].trim()
    if (inline) {
      patterns.push(...splitInlinePatterns(inline))
      continue
    }

    for (let j = i + 1; j < lines.length; j++) {
      const item = lines[j].match(/^\s*-\s*(.+?)\s*$/)
      if (!item) break
      patterns.push(cleanPattern(item[1]))
      i = j
    }
  }

  return patterns.filter(Boolean)
}

function splitInlinePatterns(value: string): string[] {
  return value
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map(cleanPattern)
    .filter(Boolean)
}

function cleanPattern(value: string): string {
  return value.trim().replace(/^['"]/, "").replace(/['"]$/, "")
}

function collectPaths(value: unknown): string[] {
  if (!value || typeof value !== "object") return []

  const result: string[] = []
  const record = value as Record<string, unknown>
  for (const key of ["filePath", "path", "oldPath", "newPath"]) {
    const candidate = record[key]
    if (typeof candidate === "string") result.push(candidate)
  }

  return result
}

function activateMatchingRules(rules: Rule[], active: Set<string>, root: string, touched: string) {
  const relative = normalizePath(path.isAbsolute(touched) ? path.relative(root, touched) : touched)

  for (const rule of rules) {
    if (rule.always || active.has(rule.key)) continue
    if (rule.patterns.some((pattern) => globToRegExp(pattern).test(relative))) {
      active.add(rule.key)
    }
  }
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "")
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizePath(pattern).replace(/^\//, "")
  let source = ""

  for (let i = 0; i < normalized.length; i++) {
    if (normalized.startsWith("**/", i)) {
      source += "(?:.*/)?"
      i += 2
      continue
    }
    if (normalized.startsWith("**", i)) {
      source += ".*"
      i += 1
      continue
    }

    const char = normalized[i]
    if (char === "*") source += "[^/]*"
    else if (char === "?") source += "[^/]"
    else source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
  }

  return new RegExp(`^${source}$`)
}

function formatRules(rules: Rule[]): string {
  const body = rules
    .map((rule) => `## ${rule.key}\nSource: ${rule.file}\n\n${rule.body}`)
    .join("\n\n---\n\n")

  return `Claude Code rules loaded from ~/.claude/rules and project .claude/rules. Treat them as user instructions.\n\n${body}`
}
