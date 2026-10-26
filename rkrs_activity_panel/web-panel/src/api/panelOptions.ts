import { defaultExtensions, type PanelExtensions } from "../settings/models";

export interface RawThresholds { dialing_seconds: number; conversation_seconds: number; exceeding_seconds: number }
export interface RawPanelOptions {
  pipeline_ids: number[] | null;
  operators: { employee_id: number; enabled: boolean; plan: number; thresholds: RawThresholds }[] | null;
  departments: { group_id: number; thresholds: RawThresholds }[] | null;
}
const thresholds = (t: RawThresholds) => ({ dialingSeconds: t.dialing_seconds, conversationSeconds: t.conversation_seconds, exceedingSeconds: t.exceeding_seconds });
const rawThresholds = (t: { dialingSeconds: number; conversationSeconds: number; exceedingSeconds: number }): RawThresholds => ({ dialing_seconds: t.dialingSeconds, conversation_seconds: t.conversationSeconds, exceeding_seconds: t.exceedingSeconds });
export function panelOptionsFromAPI(o?: RawPanelOptions): PanelExtensions | null {
  if (!o) return null;
  return { ...defaultExtensions(), pipelines: (o.pipeline_ids ?? []).map(String), operators: (o.operators ?? []).map((v) => ({ employeeId: v.employee_id, enabled: v.enabled, plan: v.plan, ...thresholds(v.thresholds) })), departmentThresholds: Object.fromEntries((o.departments ?? []).map((v) => [String(v.group_id), thresholds(v.thresholds)])) };
}
export function panelOptionsToAPI(o: PanelExtensions): RawPanelOptions {
  return { pipeline_ids: o.pipelines.map(Number), operators: o.operators.map((v) => ({ employee_id: v.employeeId, enabled: v.enabled, plan: v.plan, thresholds: rawThresholds(v) })), departments: Object.entries(o.departmentThresholds).map(([id, t]) => ({ group_id: Number(id), thresholds: rawThresholds(t) })) };
}
