// Saved versions of a portfolio / scenario set share a name; a "family" is one name with all its versions.
export interface VersionFamily<T extends { id: number; name: string; version: number; created_at: string }> {
  name: string;
  versions: T[];
  latest: T;
}

export function groupVersions<T extends { id: number; name: string; version: number; created_at: string }>(items: T[]): VersionFamily<T>[] {
  const byName = new Map<string, T[]>();
  for (const i of items) byName.set(i.name, [...(byName.get(i.name) ?? []), i]);
  return [...byName.entries()]
    .map(([name, versions]) => {
      const sorted = [...versions].sort((a, b) => a.version - b.version);
      return { name, versions: sorted, latest: sorted.at(-1)! };
    })
    .sort((a, b) => a.latest.created_at.localeCompare(b.latest.created_at));
}

const FIELD_LABELS: Record<string, string> = {
  nominal_power: "power",
  capacity: "capacity",
  max_power: "max power",
  max_trading_volume_per_step: "max volume",
};

/** Short human-readable list of what changed between two asset lists, matched by asset name. */
export function diffAssets(prev: { name: string; kind: string }[], next: { name: string; kind: string }[]): string[] {
  const before = new Map(prev.map((a) => [a.name, a as Record<string, any>]));
  const after = new Map(next.map((a) => [a.name, a as Record<string, any>]));
  const out: string[] = [];
  for (const [name] of after) if (!before.has(name)) out.push(`+ ${name}`);
  for (const [name] of before) if (!after.has(name)) out.push(`− ${name}`);
  for (const [name, a] of after) {
    const b = before.get(name);
    if (!b) continue;
    const changed = Object.keys({ ...a, ...b }).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    if (!changed.length) continue;
    const parts = changed.slice(0, 2).map((k) => {
      const label = FIELD_LABELS[k] ?? k.replace(/_/g, " ");
      return typeof a[k] === "number" && typeof b[k] === "number" ? `${label} ${b[k]} → ${a[k]}` : label;
    });
    out.push(`${name}: ${parts.join(", ")}${changed.length > 2 ? ` +${changed.length - 2}` : ""}`);
  }
  return out;
}
