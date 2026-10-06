import {
  buildPlan,
  formatClock,
  formatDayLabel,
  formatHm,
  formatMinutes,
  parseHm,
  parseInstant,
  zonedParts,
} from "./schedule.js";
import {
  DEFAULT_NOW,
  FRIDAY_NOW,
  QUOTA_LIMIT,
  TAGS,
  SOURCES,
  dealTitle,
  demoContacts,
  demoPipelines,
  demoUsers,
  firstWorkingStage,
  taskLabel,
} from "./demo-data.js";

const contactById = new Map(demoContacts.map((contact) => [contact.id, contact]));
const userById = new Map(demoUsers.map((user) => [user.id, user]));
const pipelineById = new Map(demoPipelines.map((pipeline) => [pipeline.id, pipeline]));

export function defaultSchedule() {
  return {
    workingDays: [1, 2, 3, 4, 5],
    startMinutes: 9 * 60,
    endMinutes: 18 * 60,
    timezone: "Europe/Moscow",
    offsetMinutes: 180,
    holidays: [],
  };
}

function defaultPersisted() {
  return {
    version: 1,
    unlimited: false,
    quotaUsedByDay: {},
    schedule: defaultSchedule(),
    nowIso: DEFAULT_NOW,
    deals: [],
    tasks: [],
    batches: [],
    seq: 1,
  };
}

function defaultSession() {
  return {
    phase: "list",
    selectedIds: [],
    snapshotIds: [],
    excludedIds: [],
    pipelineId: "pipe-sales",
    managerIds: [],
    durationMinutes: "15",
    dailyLimit: "25",
    tag: "",
    taskText: "",
    phoneByContact: {},
    activeBatchId: null,
    running: false,
    processed: 0,
    query: "",
    filterTag: "",
    filterSource: "",
    filterDeal: "any",
    page: 1,
    batchFilterId: null,
    forceEmpty: false,
    forceError: false,
    loading: true,
    openDealId: null,
    partialFailure: false,
  };
}

function positiveNumber(value) {
  const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function plural(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function hasCreatedDeal(contactId, deals) {
  return deals.some((deal) => deal.contactId === contactId);
}

function contactOpenDeal(contact, deals) {
  return Boolean(contact.activeDeal || hasCreatedDeal(contact.id, deals));
}

export function createMassLeadsController({ storage, storageKey } = {}) {
  let persisted = load();
  let session = defaultSession();
  let disposed = false;
  let loadToken = 0;
  let loadTimer = 0;
  const listeners = new Set();

  function load() {
    try {
      const raw = storage?.getItem(storageKey);
      if (!raw) return defaultPersisted();
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1) return defaultPersisted();
      const schedule = { ...defaultSchedule(), ...(parsed.schedule || {}) };
      schedule.workingDays = Array.isArray(schedule.workingDays)
        ? schedule.workingDays.map(Number).filter((day) => day >= 1 && day <= 7)
        : defaultSchedule().workingDays;
      schedule.holidays = Array.isArray(schedule.holidays)
        ? schedule.holidays.filter((day) => typeof day === "string")
        : [];
      const nowIso = typeof parsed.nowIso === "string" && Number.isFinite(Date.parse(parsed.nowIso))
        ? parsed.nowIso
        : DEFAULT_NOW;
      return {
        ...defaultPersisted(),
        unlimited: Boolean(parsed.unlimited),
        quotaUsedByDay:
          parsed.quotaUsedByDay && typeof parsed.quotaUsedByDay === "object" ? parsed.quotaUsedByDay : {},
        schedule,
        nowIso,
        deals: Array.isArray(parsed.deals) ? parsed.deals : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        batches: Array.isArray(parsed.batches) ? parsed.batches : [],
        seq: Number.isFinite(parsed.seq) ? parsed.seq : 1,
      };
    } catch {
      return defaultPersisted();
    }
  }

  function persist() {
    try {
      storage?.setItem(storageKey, JSON.stringify(persisted));
    } catch {
      /* Демо остаётся в памяти, если хранилище недоступно. */
    }
  }

  function emit({ save = false } = {}) {
    if (disposed) return;
    if (save) persist();
    const snapshot = getSnapshot();
    for (const listener of listeners) listener(snapshot);
  }

  function finishLoadingSoon(ms = 350) {
    const token = ++loadToken;
    session.loading = true;
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => {
      if (disposed || token !== loadToken) return;
      session.loading = false;
      emit();
    }, ms);
  }

  finishLoadingSoon();

  function cabinetToday() {
    return zonedParts(parseInstant(persisted.nowIso), persisted.schedule.offsetMinutes).dateKey;
  }

  function filteredContacts() {
    if (session.forceEmpty) return [];
    const query = session.query.trim().toLowerCase();
    const batch = persisted.batches.find((item) => item.id === session.batchFilterId);
    const batchIds = batch ? new Set(batch.items.map((item) => item.contactId)) : null;
    return demoContacts.filter((contact) => {
      if (batchIds && !batchIds.has(contact.id)) return false;
      if (session.filterTag && !contact.tags.includes(session.filterTag)) return false;
      if (session.filterSource && contact.source !== session.filterSource) return false;
      const open = contactOpenDeal(contact, persisted.deals);
      if (session.filterDeal === "yes" && !open) return false;
      if (session.filterDeal === "no" && open) return false;
      if (!query) return true;
      const haystack = `${contact.name} ${contact.company} ${contact.phones.join(" ")} ${contact.tags.join(" ")}`.toLowerCase();
      return haystack.includes(query);
    });
  }

  function pageIds() {
    const filtered = filteredContacts();
    const pages = Math.max(1, Math.ceil(filtered.length / 20));
    const page = Math.min(session.page, pages);
    return filtered.slice((page - 1) * 20, page * 20).map((contact) => contact.id);
  }

  function chosenPhone(contact) {
    const picked = session.phoneByContact[contact.id];
    if (picked && contact.phones.includes(picked)) return picked;
    return contact.phones[0] || "";
  }

  function processableIds() {
    return session.snapshotIds.filter((id) => {
      if (session.excludedIds.includes(id)) return false;
      const contact = contactById.get(id);
      if (!contact || contact.phones.length === 0) return false;
      return Boolean(chosenPhone(contact));
    });
  }

  function settingsBlockers() {
    const blockers = [];
    if (!session.snapshotIds.length) blockers.push("Выберите хотя бы один контакт.");
    if (!session.managerIds.length) blockers.push("Выберите хотя бы одного менеджера.");
    if (!pipelineById.has(session.pipelineId)) blockers.push("Выберите воронку.");
    if (positiveNumber(session.durationMinutes) == null) {
      blockers.push("Укажите длительность задачи больше нуля.");
    }
    if (positiveNumber(session.dailyLimit) == null) {
      blockers.push("Укажите дневной лимит больше нуля.");
    }
    if (!(persisted.schedule.endMinutes > persisted.schedule.startMinutes)) {
      blockers.push("В графике кабинета конец дня должен быть позже начала.");
    }
    if (!persisted.schedule.workingDays.length) {
      blockers.push("В графике кабинета не отмечен ни один рабочий день.");
    }
    return blockers;
  }

  function quotaState() {
    const day = cabinetToday();
    const used = persisted.quotaUsedByDay[day] || 0;
    const remaining = persisted.unlimited ? null : Math.max(0, QUOTA_LIMIT - used);
    return { day, used, remaining, limit: QUOTA_LIMIT, unlimited: persisted.unlimited };
  }

  function livePlan() {
    const blockers = settingsBlockers();
    const ids = processableIds();
    const fixIds = session.snapshotIds.filter((id) => {
      if (session.excludedIds.includes(id)) return false;
      const contact = contactById.get(id);
      return !contact || contact.phones.length === 0;
    });
    const quota = quotaState();
    const pipeline = pipelineById.get(session.pipelineId);
    const stage = firstWorkingStage(pipeline);
    const base = {
      selectedCount: session.snapshotIds.length,
      processableCount: ids.length,
      fixCount: fixIds.length,
      excludedCount: session.excludedIds.length,
      pipelineName: pipeline?.name || "",
      stageName: stage?.name || "",
      noTag: !String(session.tag || "").trim(),
      noTaskText: !String(session.taskText || "").trim(),
      openDealCount: 0,
      rows: [],
      managers: [],
      dayGroups: [],
      lastTaskLabel: "",
      overload: [],
      duplicateIgnored: 0,
      forbidden: false,
      message: "",
      quota,
    };
    const launchBlockers = [...blockers];
    if (fixIds.length) {
      launchBlockers.push(
        "Есть контакты без телефона. Исключите их из партии: номер не придумывается и часть партии молча не создаётся."
      );
    }
    if (!ids.length && session.snapshotIds.length) {
      launchBlockers.push("Нет контактов, которых можно обработать.");
    }
    if (!persisted.unlimited && quota.remaining != null && ids.length > quota.remaining) {
      launchBlockers.push(
        `К обработке ${ids.length} ${plural(ids.length, "контакт", "контакта", "контактов")}, а в квоте на ${formatDayLabel(quota.day)} осталось ${quota.remaining} из ${QUOTA_LIMIT}. Сократите выбор. Прототип не создаёт только часть партии.`
      );
    }
    if (blockers.length || !ids.length) {
      base.rows = session.snapshotIds.map((id) => rowWithoutSlot(id));
      base.openDealCount = base.rows.filter((row) => row.hasActiveDeal && !row.excluded).length;
      return { plan: base, launchBlockers, settingsBlockers: blockers };
    }
    let raw;
    try {
      raw = buildPlan({
        contacts: ids.map((id) => ({ id })),
        managers: session.managerIds.map((id) => ({ id })),
        durationMinutes: positiveNumber(session.durationMinutes),
        dailyLimit: positiveNumber(session.dailyLimit),
        now: persisted.nowIso,
        cabinet: persisted.schedule,
      });
    } catch (error) {
      launchBlockers.push(error.message || "Не удалось рассчитать план.");
      return { plan: base, launchBlockers, settingsBlockers: blockers };
    }
    if (!raw.ok) {
      base.forbidden = raw.forbidden;
      base.message = raw.message || "";
      if (raw.message) launchBlockers.push(raw.message);
      base.rows = session.snapshotIds.map((id) => rowWithoutSlot(id));
      return { plan: base, launchBlockers, settingsBlockers: blockers };
    }
    const byContact = new Map(raw.items.map((item) => [item.contactId, item]));
    const offset = persisted.schedule.offsetMinutes;
    base.rows = session.snapshotIds.map((id) => {
      const contact = contactById.get(id);
      const item = byContact.get(id);
      const phone = contact ? chosenPhone(contact) : "";
      const excluded = session.excludedIds.includes(id);
      const needsPhone = !excluded && (!contact || contact.phones.length === 0);
      const manager = item ? userById.get(item.managerId) : null;
      return {
        contactId: id,
        contactName: contact?.name || id,
        company: contact?.company || "",
        phones: contact?.phones || [],
        chosenPhone: phone,
        hasActiveDeal: contact ? contactOpenDeal(contact, persisted.deals) : false,
        excluded,
        needsPhone,
        dealName: item ? dealTitle(contact.name, session.tag) : "",
        managerId: item?.managerId || "",
        managerName: manager?.name || "",
        taskText: item ? taskLabel(session.taskText, phone) : "",
        day: item?.day || "",
        dayLabel: item ? formatDayLabel(item.day) : "",
        startLabel: item ? formatClock(item.startMs, offset) : "",
        dueLabel: item ? formatClock(item.dueMs, offset) : "",
        stepLabel: item ? formatMinutes(item.stepMinutes) : "",
        overloaded: Boolean(item?.overloaded),
        startMs: item?.startMs || 0,
        dueMs: item?.dueMs || 0,
      };
    });
    base.openDealCount = base.rows.filter((row) => row.hasActiveDeal && !row.excluded && !row.needsPhone).length;
    base.duplicateIgnored = raw.duplicateIgnored;
    base.managers = session.managerIds.map((id, index) => {
      const user = userById.get(id);
      return {
        id,
        order: index + 1,
        name: user?.name || id,
        vacation: user?.vacation || "",
        count: raw.countsByManager[id] || 0,
      };
    });
    const groups = new Map();
    for (const row of base.rows) {
      if (!row.day) continue;
      if (!groups.has(row.day)) groups.set(row.day, new Map());
      const bucket = groups.get(row.day);
      if (!bucket.has(row.managerId)) {
        bucket.set(row.managerId, {
          id: row.managerId,
          name: row.managerName,
          count: 0,
          stepLabel: row.stepLabel,
          firstStart: row.startLabel,
        });
      }
      bucket.get(row.managerId).count += 1;
    }
    base.dayGroups = [...groups.entries()].map(([day, managers]) => ({
      day,
      label: formatDayLabel(day),
      managers: [...managers.values()],
    }));
    const last = raw.items.reduce((best, item) => (item.dueMs > best.dueMs ? item : best), raw.items[0]);
    base.lastTaskLabel = last ? `${formatDayLabel(last.day)}, срок ${formatClock(last.dueMs, offset)}` : "";
    base.overload = raw.warnings.map((warning) => ({
      ...warning,
      managerName: userById.get(warning.managerId)?.name || warning.managerId,
      dayLabel: formatDayLabel(warning.day),
      stepLabel: formatMinutes(warning.stepMinutes),
    }));
    base.message = raw.message || "";
    return { plan: base, launchBlockers, settingsBlockers: blockers };
  }

  function rowWithoutSlot(id) {
    const contact = contactById.get(id);
    const excluded = session.excludedIds.includes(id);
    return {
      contactId: id,
      contactName: contact?.name || id,
      company: contact?.company || "",
      phones: contact?.phones || [],
      chosenPhone: contact ? chosenPhone(contact) : "",
      hasActiveDeal: contact ? contactOpenDeal(contact, persisted.deals) : false,
      excluded,
      needsPhone: !excluded && (!contact || contact.phones.length === 0),
      dealName: "",
      managerId: "",
      managerName: "",
      taskText: "",
      day: "",
      dayLabel: "",
      startLabel: "",
      dueLabel: "",
      stepLabel: "",
      overloaded: false,
      startMs: 0,
      dueMs: 0,
    };
  }

  function statusText(item) {
    if (item.dealId && item.taskId) return "сделка и задача созданы";
    if (item.dealId) return "сделка создана, задача не создана";
    return "сделка не создана";
  }

  function viewBatch(batch) {
    if (!batch) return null;
    const offset = persisted.schedule.offsetMinutes;
    const items = batch.items.map((item) => {
      const contact = contactById.get(item.contactId);
      const manager = userById.get(item.managerId);
      return {
        ...item,
        contactName: contact?.name || item.contactId,
        managerName: manager?.name || item.managerId,
        status: statusText(item),
        startLabel: formatClock(item.startMs, offset),
        dueLabel: formatClock(item.dueMs, offset),
        dayLabel: formatDayLabel(item.day),
        canRetry: !(item.dealId && item.taskId),
      };
    });
    const groups = new Map();
    for (const item of items) {
      if (!groups.has(item.day)) groups.set(item.day, new Map());
      const bucket = groups.get(item.day);
      if (!bucket.has(item.managerId)) bucket.set(item.managerId, { name: item.managerName, items: [] });
      bucket.get(item.managerId).items.push(item);
    }
    return {
      id: batch.id,
      label: batch.label,
      quotaDay: batch.quotaDay,
      selectedCount: batch.selectedCount,
      items,
      groups: [...groups.entries()].map(([day, managers]) => ({
        day,
        label: formatDayLabel(day),
        managers: [...managers.values()],
      })),
      counts: {
        ok: items.filter((item) => item.status === "сделка и задача созданы").length,
        partial: items.filter((item) => item.status === "сделка создана, задача не создана").length,
        failed: items.filter((item) => item.status === "сделка не создана").length,
      },
    };
  }

  function getSnapshot() {
    const filtered = filteredContacts();
    const pageCount = Math.max(1, Math.ceil(filtered.length / 20) || 1);
    const page = Math.min(Math.max(session.page, 1), pageCount);
    const pageRows = filtered.slice((page - 1) * 20, page * 20).map((contact) => ({
      ...contact,
      hasActiveDeal: contactOpenDeal(contact, persisted.deals),
      selected: session.selectedIds.includes(contact.id),
    }));
    const visibleIds = pageRows.map((row) => row.id);
    const pageAllSelected = visibleIds.length > 0 && visibleIds.every((id) => session.selectedIds.includes(id));
    const pageSomeSelected = visibleIds.some((id) => session.selectedIds.includes(id));
    const filteredIds = filtered.map((contact) => contact.id);
    const allFilteredSelected =
      filteredIds.length > 0 &&
      filteredIds.length === session.selectedIds.length &&
      filteredIds.every((id) => session.selectedIds.includes(id));
    const quota = quotaState();
    const planning = session.phase === "plan" || session.phase === "settings" || session.phase === "processing";
    const planned = planning ? livePlan() : { plan: null, launchBlockers: [], settingsBlockers: settingsBlockers() };
    const active = persisted.batches.find((batch) => batch.id === session.activeBatchId) || null;
    const deal = persisted.deals.find((item) => item.id === session.openDealId) || null;
    const dealTask = deal ? persisted.tasks.find((task) => task.dealId === deal.id) : null;
    const dealContact = deal ? contactById.get(deal.contactId) : null;
    const count = planned.plan?.processableCount || 0;
    const launchLabel =
      count > 0
        ? `Создать ${count} ${plural(count, "сделку", "сделки", "сделок")} и ${count} ${plural(count, "задачу", "задачи", "задач")}`
        : "Создать сделки и задачи";
    return {
      view: session.loading ? "loading" : session.forceError ? "error" : pageRows.length ? "table" : "empty",
      pageRows,
      filteredCount: filtered.length,
      page,
      pageCount,
      pageSize: 20,
      selectedIds: session.selectedIds.slice(),
      selectedCount: session.selectedIds.length,
      pageAllSelected,
      pageSomeSelected,
      allFilteredSelected,
      selectionLargerThanPage: session.selectedIds.length > visibleIds.length && session.selectedIds.length > 0,
      quota: {
        ...quota,
        dayLabel: formatDayLabel(quota.day),
      },
      filters: {
        query: session.query,
        tag: session.filterTag,
        source: session.filterSource,
        deal: session.filterDeal,
        tags: TAGS,
        sources: SOURCES,
      },
      phase: session.phase,
      schedule: {
        ...persisted.schedule,
        holidays: persisted.schedule.holidays.slice(),
        workingDays: persisted.schedule.workingDays.slice(),
        startLabel: formatHm(persisted.schedule.startMinutes),
        endLabel: formatHm(persisted.schedule.endMinutes),
        windowMinutes: Math.max(0, persisted.schedule.endMinutes - persisted.schedule.startMinutes),
      },
      settings: {
        pipelineId: session.pipelineId,
        pipelines: demoPipelines,
        managerIds: session.managerIds.slice(),
        users: demoUsers,
        durationMinutes: session.durationMinutes,
        dailyLimit: session.dailyLimit,
        tag: session.tag,
        taskText: session.taskText,
        stageName: firstWorkingStage(pipelineById.get(session.pipelineId))?.name || "",
      },
      settingsBlockers: planned.settingsBlockers,
      launchBlockers: planned.launchBlockers,
      launchLabel,
      plan: planned.plan,
      running: session.running,
      processed: session.processed,
      batch: viewBatch(active),
      lastBatchId: persisted.batches.at(-1)?.id || null,
      batchFilterId: session.batchFilterId,
      dealCard: deal
        ? {
            ...deal,
            contactName: dealContact?.name || "",
            company: dealContact?.company || "",
            taskText: dealTask?.text || "Задача не создана",
            dueLabel: dealTask ? `${formatDayLabel(dealTask.day)}, ${formatClock(dealTask.dueMs, persisted.schedule.offsetMinutes)}` : "",
            managerName: userById.get(deal.managerId)?.name || "",
          }
        : null,
      nowIso: persisted.nowIso,
      partialFailure: session.partialFailure,
      forceEmpty: session.forceEmpty,
      forceError: session.forceError,
      previewDeals: persisted.deals.map((item) => ({
        id: item.id,
        name: item.name,
        managerName: userById.get(item.managerId)?.name || "",
        contactName: contactById.get(item.contactId)?.name || "",
        pipelineName: item.pipelineName,
        stageName: item.stageName,
      })),
      previewTasks: persisted.tasks.map((item) => ({
        id: item.id,
        text: item.text,
        managerName: userById.get(item.managerId)?.name || "",
        day: item.day,
        dueLabel: formatClock(item.dueMs, persisted.schedule.offsetMinutes),
      })),
    };
  }

  function setPage(page) {
    session.page = page;
    emit();
  }

  function toggleContact(id) {
    const index = session.selectedIds.indexOf(id);
    if (index >= 0) session.selectedIds.splice(index, 1);
    else session.selectedIds.push(id);
    emit();
  }

  function togglePage() {
    const ids = pageIds();
    const all = ids.length > 0 && ids.every((id) => session.selectedIds.includes(id));
    if (all) session.selectedIds = session.selectedIds.filter((id) => !ids.includes(id));
    else {
      for (const id of ids) if (!session.selectedIds.includes(id)) session.selectedIds.push(id);
    }
    emit();
  }

  function selectAllFiltered() {
    session.selectedIds = filteredContacts().map((contact) => contact.id);
    emit();
  }

  function clearSelection() {
    session.selectedIds = [];
    emit();
  }

  function armSnapshot(ids) {
    session.selectedIds = [...ids];
    session.snapshotIds = [...ids];
    session.excludedIds = [];
    session.phoneByContact = {};
    for (const id of ids) {
      const contact = contactById.get(id);
      if (contact?.phones.length) session.phoneByContact[id] = contact.phones[0];
    }
  }

  function openWizard() {
    if (!session.selectedIds.length || session.running) return;
    armSnapshot(session.selectedIds);
    session.phase = "settings";
    session.activeBatchId = null;
    emit();
  }

  function closeWizard() {
    if (session.running) return;
    session.phase = "list";
    emit();
  }

  function showPlan() {
    if (settingsBlockers().length || session.running) return;
    session.phase = "plan";
    emit();
  }

  function showSettings() {
    if (session.running) return;
    session.phase = "settings";
    emit();
  }

  function setPipeline(id) {
    if (!pipelineById.has(id)) return;
    session.pipelineId = id;
    emit();
  }

  function toggleManager(id) {
    const user = userById.get(id);
    if (!user?.active) return;
    const index = session.managerIds.indexOf(id);
    if (index >= 0) session.managerIds.splice(index, 1);
    else session.managerIds.push(id);
    emit();
  }

  function moveManager(id, direction) {
    const index = session.managerIds.indexOf(id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= session.managerIds.length) return;
    const copy = session.managerIds.slice();
    const [item] = copy.splice(index, 1);
    copy.splice(next, 0, item);
    session.managerIds = copy;
    emit();
  }

  function setDuration(value) {
    session.durationMinutes = value;
    emit();
  }

  function setDailyLimit(value) {
    session.dailyLimit = value;
    emit();
  }

  function setTag(value) {
    session.tag = value;
    emit();
  }

  function setTaskText(value) {
    session.taskText = value;
    emit();
  }

  function setPhone(contactId, phone) {
    const contact = contactById.get(contactId);
    if (!contact?.phones.includes(phone)) return;
    session.phoneByContact = { ...session.phoneByContact, [contactId]: phone };
    emit();
  }

  function excludeContact(contactId) {
    if (!session.snapshotIds.includes(contactId) || session.excludedIds.includes(contactId)) return;
    session.excludedIds = [...session.excludedIds, contactId];
    emit();
  }

  function includeContact(contactId) {
    session.excludedIds = session.excludedIds.filter((id) => id !== contactId);
    emit();
  }

  function failurePlan(index, enabled) {
    if (!enabled) return null;
    if (index % 5 === 1) return "deal";
    if (index % 5 === 3) return "task";
    return null;
  }

  function applyStep(batch, item, { allowFailure }) {
    const failDeal = allowFailure && !item.dealId && item.failPlan === "deal" && !item.dealRetried;
    const failTask = allowFailure && item.failPlan === "task" && !item.taskRetried && !item.taskId;
    if (!item.dealId && !failDeal) {
      const dealId = `deal:${batch.id}:${item.contactId}`;
      if (!persisted.deals.some((deal) => deal.id === dealId)) {
        persisted.deals.push({
          id: dealId,
          name: item.dealName,
          contactId: item.contactId,
          managerId: item.managerId,
          pipelineId: item.pipelineId,
          pipelineName: item.pipelineName,
          stageId: item.stageId,
          stageName: item.stageName,
          tag: item.tag,
          phone: item.phone,
          batchId: batch.id,
        });
        persisted.quotaUsedByDay[batch.quotaDay] = (persisted.quotaUsedByDay[batch.quotaDay] || 0) + 1;
      }
      item.dealId = dealId;
    } else if (failDeal) item.dealRetried = false;
    if (item.dealId && !item.taskId && !failTask) {
      const taskId = `task:${batch.id}:${item.contactId}`;
      if (!persisted.tasks.some((task) => task.id === taskId)) {
        persisted.tasks.push({
          id: taskId,
          dealId: item.dealId,
          contactId: item.contactId,
          managerId: item.managerId,
          text: item.taskText,
          day: item.day,
          startMs: item.startMs,
          dueMs: item.dueMs,
          batchId: batch.id,
        });
      }
      item.taskId = taskId;
    }
    if (!item.dealId) item.error = "Демосбой: сделка не создана. Повтор создаст сделку и задачу, без второй копии.";
    else if (!item.taskId) item.error = "Демосбой: задача не создана. Сделка уже есть и повторно не создаётся.";
    else item.error = "";
  }

  async function launch() {
    if (session.running || session.phase === "processing") return;
    const { plan, launchBlockers } = livePlan();
    if (launchBlockers.length || !plan?.rows) return;
    const rows = plan.rows.filter((row) => row.dealName);
    if (!rows.length || rows.length !== plan.processableCount) return;
    session.running = true;
    session.phase = "processing";
    session.processed = 0;
    const id = `b${persisted.seq}`;
    persisted.seq += 1;
    const pipeline = pipelineById.get(session.pipelineId);
    const stage = firstWorkingStage(pipeline);
    const batch = {
      id,
      label: `Партия ${id.slice(1)}`,
      quotaDay: quotaState().day,
      selectedCount: session.snapshotIds.length,
      tag: session.tag,
      items: rows.map((row, index) => ({
        contactId: row.contactId,
        managerId: row.managerId,
        dealName: row.dealName,
        taskText: row.taskText,
        phone: row.chosenPhone,
        day: row.day,
        startMs: row.startMs,
        dueMs: row.dueMs,
        pipelineId: pipeline.id,
        pipelineName: pipeline.name,
        stageId: stage.id,
        stageName: stage.name,
        tag: String(session.tag || "").trim(),
        failPlan: failurePlan(index, session.partialFailure),
        dealId: "",
        taskId: "",
        error: "",
        dealRetried: false,
        taskRetried: false,
      })),
    };
    persisted.batches.push(batch);
    session.activeBatchId = id;
    emit({ save: true });
    for (let index = 0; index < batch.items.length; index += 1) {
      if (disposed) return;
      await wait(25);
      if (disposed) return;
      applyStep(batch, batch.items[index], { allowFailure: true });
      session.processed = index + 1;
      emit({ save: true });
    }
    session.running = false;
    session.phase = "result";
    emit({ save: true });
  }

  async function retry(batchId, contactId) {
    if (session.running) return;
    const batch = persisted.batches.find((item) => item.id === batchId);
    const item = batch?.items.find((entry) => entry.contactId === contactId);
    if (!item || (item.dealId && item.taskId)) return;
    session.running = true;
    emit();
    await wait(180);
    if (disposed) return;
    if (!item.dealId) item.dealRetried = true;
    if (item.dealId && !item.taskId) item.taskRetried = true;
    applyStep(batch, item, { allowFailure: false });
    session.running = false;
    emit({ save: true });
  }

  function showBatch(batchId) {
    if (session.running) return;
    const batch = persisted.batches.find((item) => item.id === batchId) || persisted.batches.at(-1);
    if (!batch) return;
    session.batchFilterId = batch.id;
    session.activeBatchId = batch.id;
    session.page = 1;
    session.query = "";
    session.filterTag = "";
    session.filterSource = "";
    session.filterDeal = "any";
    session.phase = "list";
    emit();
  }

  function clearBatchFilter() {
    session.batchFilterId = null;
    session.page = 1;
    emit();
  }

  function openBatchResult(batchId) {
    const batch = persisted.batches.find((item) => item.id === batchId) || persisted.batches.at(-1);
    if (!batch || session.running) return;
    session.activeBatchId = batch.id;
    session.phase = "result";
    emit();
  }

  function openDeal(id) {
    if (!persisted.deals.some((deal) => deal.id === id)) return;
    session.openDealId = id;
    emit();
  }

  function closeDeal() {
    session.openDealId = null;
    emit();
  }

  function setQuery(value) {
    session.query = value;
    session.page = 1;
    emit();
  }

  function setFilterTag(value) {
    session.filterTag = value;
    session.page = 1;
    emit();
  }

  function setFilterSource(value) {
    session.filterSource = value;
    session.page = 1;
    emit();
  }

  function setFilterDeal(value) {
    session.filterDeal = value;
    session.page = 1;
    emit();
  }

  function setNow(value) {
    if (!Number.isFinite(Date.parse(value))) return false;
    persisted.nowIso = value;
    emit({ save: true });
    return true;
  }

  function setSchedule(partial) {
    persisted.schedule = { ...persisted.schedule, ...partial };
    emit({ save: true });
  }

  function setStart(value) {
    const minutes = parseHm(value);
    if (minutes == null) return;
    setSchedule({ startMinutes: minutes });
  }

  function setEnd(value) {
    const minutes = parseHm(value);
    if (minutes == null) return;
    setSchedule({ endMinutes: minutes });
  }

  function toggleWorkingDay(day) {
    const days = new Set(persisted.schedule.workingDays);
    if (days.has(day)) days.delete(day);
    else days.add(day);
    setSchedule({ workingDays: [...days].sort((a, b) => a - b) });
  }

  function addHoliday(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    if (persisted.schedule.holidays.includes(value)) return;
    setSchedule({ holidays: [...persisted.schedule.holidays, value].sort() });
  }

  function removeHoliday(value) {
    setSchedule({ holidays: persisted.schedule.holidays.filter((day) => day !== value) });
  }

  function setUnlimited(value) {
    persisted.unlimited = Boolean(value);
    emit({ save: true });
  }

  function setPartialFailure(value) {
    session.partialFailure = Boolean(value);
    emit();
  }

  function setForceEmpty(value) {
    loadToken += 1;
    session.loading = false;
    session.forceError = false;
    session.forceEmpty = Boolean(value);
    session.page = 1;
    emit();
  }

  function setForceError(value) {
    loadToken += 1;
    session.loading = false;
    session.forceEmpty = false;
    session.forceError = Boolean(value);
    emit();
  }

  function showLoading() {
    finishLoadingSoon(700);
    emit();
  }

  function retryLoad() {
    session.forceError = false;
    finishLoadingSoon(400);
    emit();
  }

  function prepareDemo() {
    if (session.running) return false;
    loadToken += 1;
    clearTimeout(loadTimer);
    persisted.deals = [];
    persisted.tasks = [];
    persisted.batches = [];
    persisted.quotaUsedByDay = {};
    persisted.unlimited = false;
    persisted.schedule = defaultSchedule();
    persisted.nowIso = DEFAULT_NOW;
    session = defaultSession();
    session.loading = false;
    return true;
  }

  function cleanIds(limit) {
    return demoContacts
      .filter((contact) => contact.phones.length === 1 && !contact.activeDeal)
      .slice(0, limit)
      .map((contact) => contact.id);
  }

  function applyScenario(number) {
    if (!prepareDemo()) return;
    const firstManagers = demoUsers.filter((user) => user.active).map((user) => user.id);
    if (number === 1) {
      armSnapshot(cleanIds(100));
      session.managerIds = firstManagers.slice(0, 4);
      session.durationMinutes = "15";
      session.dailyLimit = "25";
      session.tag = "Октябрьский обзвон";
      session.taskText = "Позвонить и уточнить интерес";
      session.phase = "plan";
    } else if (number === 2) {
      armSnapshot(cleanIds(100));
      session.managerIds = firstManagers.slice(0, 2);
      session.durationMinutes = "15";
      session.dailyLimit = "25";
      session.tag = "Два менеджера";
      session.taskText = "Позвонить";
      session.phase = "plan";
    } else if (number === 3) {
      armSnapshot(cleanIds(30));
      session.managerIds = firstManagers.slice(0, 1);
      session.durationMinutes = "5";
      session.dailyLimit = "30";
      session.tag = "Шаг 18 минут";
      session.taskText = "Короткий звонок";
      session.phase = "plan";
    } else if (number === 4) {
      persisted.nowIso = FRIDAY_NOW;
      persisted.schedule = { ...defaultSchedule(), holidays: ["2026-10-05"] };
      armSnapshot(cleanIds(12));
      session.managerIds = firstManagers.slice(0, 1);
      session.durationMinutes = "20";
      session.dailyLimit = "25";
      session.tag = "Пятничный хвост";
      session.taskText = "Позвонить";
      session.phase = "plan";
    } else if (number === 5) {
      session.filterTag = "опт";
      const ids = filteredContacts().map((contact) => contact.id);
      armSnapshot(ids);
      session.managerIds = firstManagers.slice(0, 2);
      session.durationMinutes = "15";
      session.dailyLimit = "25";
      session.tag = "Фильтр опт";
      session.taskText = "Позвонить по опту";
      session.phase = "plan";
    } else if (number === 6) {
      session.filterDeal = "yes";
      const ids = filteredContacts().map((contact) => contact.id);
      armSnapshot(ids);
      session.managerIds = firstManagers.slice(0, 2);
      session.durationMinutes = "15";
      session.dailyLimit = "25";
      session.tag = "Уже есть сделка";
      session.taskText = "Позвонить ещё раз";
      session.phase = "plan";
    } else if (number === 7) {
      const today = zonedParts(parseInstant(DEFAULT_NOW), 180).dateKey;
      persisted.quotaUsedByDay = { [today]: QUOTA_LIMIT - 20 };
      armSnapshot(cleanIds(21));
      session.managerIds = firstManagers.slice(0, 2);
      session.durationMinutes = "15";
      session.dailyLimit = "25";
      session.tag = "Проверка квоты";
      session.taskText = "Позвонить";
      session.phase = "plan";
    } else if (number === 8) {
      armSnapshot(["c001", "c002", "c004"]);
      session.managerIds = firstManagers.slice(0, 1);
      session.durationMinutes = "15";
      session.dailyLimit = "10";
      session.tag = "";
      session.taskText = "";
      session.phase = "plan";
    } else if (number === 9) {
      armSnapshot(["c006", "c007", "c008", "c009", "c011", "c012"]);
      session.managerIds = firstManagers.slice(0, 2);
      session.durationMinutes = "15";
      session.dailyLimit = "10";
      session.tag = "Проверка повтора";
      session.taskText = "Позвонить";
      session.partialFailure = true;
      session.phase = "plan";
      emit({ save: true });
      launch();
      return;
    }
    emit({ save: true });
  }

  function resetDemo() {
    if (session.running) return;
    loadToken += 1;
    clearTimeout(loadTimer);
    persisted = defaultPersisted();
    session = defaultSession();
    session.loading = false;
    emit({ save: true });
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot,
    dispose() {
      disposed = true;
      clearTimeout(loadTimer);
      listeners.clear();
    },
    setPage,
    toggleContact,
    togglePage,
    selectAllFiltered,
    clearSelection,
    openWizard,
    closeWizard,
    showPlan,
    showSettings,
    setPipeline,
    toggleManager,
    moveManager,
    setDuration,
    setDailyLimit,
    setTag,
    setTaskText,
    setPhone,
    excludeContact,
    includeContact,
    launch,
    retry,
    showBatch,
    clearBatchFilter,
    openBatchResult,
    openDeal,
    closeDeal,
    setQuery,
    setFilterTag,
    setFilterSource,
    setFilterDeal,
    setNow,
    setStart,
    setEnd,
    toggleWorkingDay,
    addHoliday,
    removeHoliday,
    setUnlimited,
    setPartialFailure,
    setForceEmpty,
    setForceError,
    showLoading,
    retryLoad,
    applyScenario,
    resetDemo,
  };
}
