import { FIXTURE_TZ, fixtureMeta, generateDay } from "../../api/fixtures/generator";
import type { Sourced } from "../../api/source";
import { isImbox } from "../../domain/formulas/sessions";
import { minutesToHHMM, unixAt } from "../../domain/time";
import type { CrmEvent, EmployeeSessions } from "../../domain/types";

/** Изолированный пример полного дня; не дописывает события в живые данные. */
export function profilePreview(employeeId: number, dayKey: string, timeZone: string, start: number, end: number) {
  const shift = unixAt(dayKey, start, timeZone) - unixAt(dayKey, start, FIXTURE_TZ);
  const now = unixAt(dayKey, end, timeZone);
  const sample = generateDay(9001, dayKey, now - shift, { from: minutesToHHMM(start), to: minutesToHHMM(end) });
  const date = (s: string) => new Date(Date.parse(s) + shift * 1000).toISOString();
  const events = sample.events.map((e) => ({ ...e, createdBy: employeeId, createdAt: e.createdAt + shift }));
  const sessions: Sourced<EmployeeSessions> = {
    kind: "ok",
    data: {
      employeeId, day: dayKey, meta: fixtureMeta(now, { note: "Тестовый пример полного дня" }),
      items: sample.sessions.map((s) => ({ ...s, startedAt: date(s.startedAt), stoppedAt: s.stoppedAt ? date(s.stoppedAt) : new Date(now * 1000).toISOString(), taskUrl: null })),
    },
  };
  return { events, sessions, now };
}

export function previewNeeds(events: CrmEvent[] | null, sessions: Sourced<EmployeeSessions> | null) {
  const items = sessions?.kind === "ok" ? sessions.data.items : [];
  return {
    analysis: events !== null && !events.some((e) => e.type === "incoming_call" || e.type === "outgoing_call"),
    totals: !items.some((s) => s.kind !== "pause"),
    tasks: !items.some((s) => s.kind !== "pause" && !isImbox(s)),
    imbox: !items.some((s) => isImbox(s)),
  };
}
