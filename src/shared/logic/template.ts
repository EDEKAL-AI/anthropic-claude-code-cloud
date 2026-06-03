// Pure template rendering. {{var}} placeholders are replaced from a variables map.
// Unknown placeholders are left blank (never leak a raw "{{name}}" to a recipient).

export type TemplateVars = Record<string, string | null | undefined>

const PLACEHOLDER = /\{\{\s*([\w.-]+)\s*\}\}/g

export function renderTemplate(body: string, vars: TemplateVars): string {
  return body.replace(PLACEHOLDER, (_match, key: string) => {
    const value = vars[key]
    return value == null ? '' : String(value)
  })
}

/** Returns the distinct variable names referenced by a template body. */
export function extractVars(body: string): string[] {
  const names = new Set<string>()
  for (const match of body.matchAll(PLACEHOLDER)) {
    names.add(match[1])
  }
  return [...names]
}
