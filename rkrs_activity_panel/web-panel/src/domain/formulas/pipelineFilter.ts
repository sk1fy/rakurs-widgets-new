// Фильтр по воронкам панели (utils/pipelineFilter.js).
// Событие без признаков воронки сохраняется; с признаками — если хотя бы
// одна воронка входит в выбранные. Пустой выбор — без фильтра.

import type { CrmEvent } from "../types";

const PIPELINE_ID_KEYS = ["pipeline_id", "pipelineId", "lead_pipeline_id", "entity_pipeline_id"] as const;

function add(ids: Set<string>, value: unknown) {
  if (value === null || value === undefined || value === "") return;
  ids.add(String(value));
}

function collect(ids: Set<string>, source: unknown) {
  if (!source || typeof source !== "object") return;
  const o = source as Record<string, unknown>;
  for (const key of PIPELINE_ID_KEYS) add(ids, o[key]);
  const nested = (v: unknown, k: string) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined);
  add(ids, nested(o.pipeline, "id"));
  add(ids, nested(o.pipeline, "pipeline_id"));
  add(ids, nested(nested(o.options, "pipeline"), "id"));
  add(ids, nested(nested(o.options, "pipeline"), "pipeline_id"));
  add(ids, nested(o.status, "pipeline_id"));
  add(ids, nested(o.lead_status, "pipeline_id"));
}

/** Извлечение ID воронок из сырого события (value_before/value_after). */
export function extractPipelineIds(raw: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  collect(ids, raw);
  for (const key of ["value_after", "value_before"]) {
    const values = raw[key];
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      collect(ids, value);
      if (value && typeof value === "object") {
        const v = value as Record<string, unknown>;
        collect(ids, v.lead_status);
        collect(ids, v.status);
        collect(ids, v.pipeline);
      }
    }
  }
  return [...ids];
}

export function filterByPipelines(events: CrmEvent[], pipelines: (string | number)[]): CrmEvent[] {
  const selected = new Set(pipelines.map(String).filter(Boolean));
  if (!selected.size) return events;
  return events.filter((e) => !e.pipelineIds.length || e.pipelineIds.some((id) => selected.has(id)));
}
