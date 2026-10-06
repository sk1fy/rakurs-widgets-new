import {
  BOT_MOCK,
  createDemoDeals,
  DEFAULT_SETTINGS,
  EMPLOYEES,
  employeeById,
  FROZEN_NOW,
  LINK_MOCK,
  PIPELINES,
  pipelineById,
  SCENARIOS,
  stageName,
  SUBSCRIBERS,
} from "./demo-data.js";
import {
  buildMetrics,
  cohortToCsv,
  composeDigest,
  composeEod,
  criticalDecision,
  formatDateTime,
  formatDuration,
  localDateKey,
  nextWorkingDayStart,
  normalizeSettings,
  periodBounds,
  preAlertDecision,
  projectDeal,
  scheduledInstants,
  selectDigestBreaches,
  selectEodDeals,
  targetMilliseconds,
  validateSettings,
} from "./time.js";

const VERSION = 1;

function emptyFilters() {
  return {
    managerId: "",
    pipelineId: "",
    channel: "",
    speed: "",
    weekday: null,
    hour: null,
  };
}

function freshState() {
  return {
    version: VERSION,
    now: FROZEN_NOW,
    frozen: true,
    settings: structuredClone(DEFAULT_SETTINGS),
    deals: createDemoDeals(),
    journal: [],
    journalSeq: 0,
    period: { preset: "month", from: "2026-10-01", to: "2026-10-31" },
    filters: emptyFilters(),
    tab: "report",
    scenario: "default",
    viewMode: "ready",
    notice: "",
    popup: null,
    lastDigestAt: null,
    lastEodDay: "",
    digestCard: null,
    eodCard: null,
    openDealId: null,
    settingsNonce: 0,
  };
}

export function createSlaController({ storage, storageKey } = {}) {
  const listeners = new Set();
  let state = freshState();
  let realAnchor = null;
  let demoAnchor = state.now;

  function persist() {
    if (!storage || !storageKey) return;
    try {
      storage.setItem(
        storageKey,
        JSON.stringify({
          version: VERSION,
          now: state.now,
          frozen: state.frozen,
          settings: state.settings,
          deals: state.deals,
          journal: state.journal,
          journalSeq: state.journalSeq,
          period: state.period,
          filters: state.filters,
          tab: state.tab,
          scenario: state.scenario,
          viewMode: state.viewMode,
          notice: state.notice,
          lastDigestAt: state.lastDigestAt,
          lastEodDay: state.lastEodDay,
          digestCard: state.digestCard,
          eodCard: state.eodCard,
          openDealId: state.openDealId,
          settingsNonce: state.settingsNonce,
        })
      );
    } catch {
      /* Private mode and quota failures stay in memory. */
    }
  }

  function emit() {
    const snapshot = getSnapshot();
    for (const listener of listeners) listener(snapshot);
  }

  function currentNow() {
    if (state.frozen || realAnchor == null) return state.now;
    return demoAnchor + (Date.now() - realAnchor);
  }

  function decorate(view) {
    const employee = employeeById(view.managerId);
    const pipeline = pipelineById(view.pipelineId);
    return {
      ...view,
      managerName: employee?.name || "Не назначен",
      managerShort: employee?.short || "—",
      pipelineName: pipeline?.name || "Воронка",
      stageName: stageName(view.pipelineId, view.stageId),
    };
  }

  function projectAll(at) {
    return state.deals
      .map((deal) => decorate(projectDeal(deal, state.settings, at)))
      .filter((view) => !view.invalid);
  }

  function journal(entry) {
    state.journalSeq += 1;
    state.journal.push({ id: `j${state.journalSeq}`, ...entry });
    if (state.journal.length > 200) state.journal.splice(0, state.journal.length - 200);
  }

  function evaluate(at, silent) {
    const errors = validateSettings(state.settings);
    if (errors.length) return;
    let popup = null;
    const targetMs = targetMilliseconds(state.settings);
    for (const deal of state.deals) {
      if (!state.settings.pipelineIds.includes(deal.pipelineId)) continue;
      const view = projectDeal(deal, state.settings, at);
      if (view.invalid || view.future || view.answered) continue;
      const pre = preAlertDecision({
        elapsedMs: view.elapsedMs,
        targetMs,
        percent: state.settings.preAlertPercent,
        answered: false,
        alreadySent: deal.preAlertSent,
        alreadySkipped: deal.preAlertSkipped,
      });
      if (pre.action === "fire") {
        deal.preAlertSent = true;
        deal.preAlertAt = at;
        journal({
          at,
          kind: "pre_alert",
          dealId: deal.id,
          text: `Пре-алерт для «${deal.title}»: ${decorate(view).managerName}, прошло ${formatDuration(view.elapsedMs)} из ${state.settings.targetMinutes} мин. Это не первое касание.`,
        });
        if (!silent && !popup) {
          popup = {
            dealId: deal.id,
            title: "Пре-алерт",
            text: `${decorate(view).managerName}, сделка «${deal.title}» приблизилась к нормативу: ${formatDuration(view.elapsedMs)} из ${state.settings.targetMinutes} мин рабочего времени.`,
          };
        }
      } else if (pre.action === "skip") {
        deal.preAlertSkipped = true;
        journal({
          at,
          kind: "pre_alert_skip",
          dealId: deal.id,
          text: `Пре-алерт для «${deal.title}» пропущен: рабочий возраст ожидания больше 2× норматива.`,
        });
      }
      const decision = criticalDecision({
        elapsedMs: view.elapsedMs,
        targetMs,
        multiplier: state.settings.criticalMultiplier,
        budget: deal.budget,
        threshold: state.settings.budgetThreshold,
        answered: false,
        alreadyCreated: Boolean(deal.criticalTask),
      });
      if (decision.create) {
        const reason =
          decision.reason === "budget"
            ? "бюджет выше порога при уже нарушенном нормативе"
            : decision.reason === "both"
              ? "достигнуты множитель и порог бюджета"
              : "достигнут множитель норматива";
        deal.criticalTask = {
          id: `task-${deal.id}`,
          at,
          managerId: view.managerId,
          reason: decision.reason,
        };
        journal({
          at,
          kind: "critical",
          dealId: deal.id,
          text: `Критическая задача по «${deal.title}»: ${reason}. Эскалация, не первое касание.`,
        });
      }
    }
    if (popup) state.popup = popup;
  }

  function runDigest(at, source) {
    const views = projectAll(at).filter((view) =>
      state.settings.pipelineIds.includes(view.pipelineId)
    );
    const breaches = selectDigestBreaches(views, state.lastDigestAt, at);
    const message = composeDigest(breaches, state.settings);
    if (source !== "preview") state.lastDigestAt = at;
    if (!message) {
      const text = "Дайджест не сформирован: нет нарушений с прошлой отправки.";
      state.digestCard = { empty: true, text };
      journal({
        at,
        kind: "digest",
        text: source === "preview" ? `Предпросмотр. ${text}` : text,
      });
      return;
    }
    const text = `${message.title}: ${message.breachCount} нарушений. ${message.lines.join(" · ")}`;
    state.digestCard = {
      empty: false,
      title: message.title,
      breachCount: message.breachCount,
      lines: message.lines,
      source,
    };
    journal({
      at,
      kind: "digest",
      text:
        source === "preview"
          ? `Предпросмотр дайджеста. ${text}`
          : source === "simulate"
            ? `Смоделирована отправка дайджеста. ${text}`
            : text,
    });
  }

  function runEod(at, source) {
    const timeZone = state.settings.timezone;
    const day = localDateKey(at, timeZone);
    if (source === "schedule" && state.lastEodDay === day) return;
    const deals = selectEodDeals(projectAll(at), day, timeZone).filter((view) =>
      state.settings.pipelineIds.includes(view.pipelineId)
    );
    const message = composeEod(deals, EMPLOYEES, state.settings);
    if (source === "schedule") state.lastEodDay = day;
    if (!message) {
      const text = "Итог дня не сформирован: за этот день нет сделок.";
      state.eodCard = { empty: true, text };
      journal({
        at,
        kind: "eod",
        text: source === "preview" ? `Предпросмотр. ${text}` : text,
      });
      return;
    }
    const lines = message.managers.map(
      (manager) =>
        `${manager.name}: ${manager.deals} сделок, средняя реакция ${manager.averageLabel}, нарушений ${manager.breaches}`
    );
    lines.push(`Команда: ${message.total} сделок, нарушений ${message.breachPercentLabel}.`);
    state.eodCard = { empty: false, title: message.title, lines, source };
    const text = lines.join(" · ");
    journal({
      at,
      kind: "eod",
      text:
        source === "preview"
          ? `Предпросмотр итога дня. ${text}`
          : source === "simulate"
            ? `Смоделирована отправка итога дня. ${text}`
            : text,
    });
  }

  function onAdvance(prev, next) {
    if (!(next > prev) || validateSettings(state.settings).length) {
      evaluate(next, false);
      return;
    }
    const timeZone = state.settings.timezone;
    const marks = [
      ...scheduledInstants(prev, next, state.settings.digestHour, timeZone).map((at) => ({
        at,
        kind: "digest",
      })),
      ...scheduledInstants(prev, next, state.settings.eodHour, timeZone).map((at) => ({
        at,
        kind: "eod",
      })),
    ].sort((a, b) => a.at - b.at || (a.kind === "digest" ? -1 : 1));
    for (const mark of marks) {
      evaluate(mark.at, true);
      if (mark.kind === "digest") runDigest(mark.at, "schedule");
      else runEod(mark.at, "schedule");
    }
    evaluate(next, false);
  }

  function commitNow(next, scenario) {
    const prev = currentNow();
    state.now = next;
    state.scenario = scenario;
    if (state.viewMode !== "ready") state.viewMode = "ready";
    if (!state.frozen) {
      demoAnchor = next;
      realAnchor = Date.now();
    }
    onAdvance(prev, next);
  }

  function restore() {
    if (!storage || !storageKey) {
      evaluate(state.now, true);
      persist();
      return;
    }
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) {
        evaluate(state.now, true);
        persist();
        return;
      }
      const saved = JSON.parse(raw);
      if (!saved || saved.version !== VERSION || !Array.isArray(saved.deals)) {
        evaluate(state.now, true);
        persist();
        return;
      }
      state = {
        ...freshState(),
        ...saved,
        settings: normalizeSettings({ ...DEFAULT_SETTINGS, ...saved.settings }),
        filters: { ...emptyFilters(), ...saved.filters },
        frozen: true,
      };
      if (saved.frozen === false) {
        state.notice =
          "После обновления страницы демо-часы снова заморожены на последней отметке.";
      }
    } catch {
      state = freshState();
      evaluate(state.now, true);
      persist();
    }
  }

  function boundsFor(at) {
    return periodBounds(state.period.preset, at, state.settings.timezone, state.period);
  }

  function activeFilters(reportReady) {
    if (!reportReady) return [];
    const chips = [];
    if (state.filters.managerId) {
      chips.push({
        key: "managerId",
        label: employeeById(state.filters.managerId)?.name || "Сотрудник",
      });
    }
    if (state.filters.pipelineId) {
      chips.push({
        key: "pipelineId",
        label: pipelineById(state.filters.pipelineId)?.name || "Воронка",
      });
    }
    if (state.filters.channel) chips.push({ key: "channel", label: state.filters.channel });
    if (state.filters.speed) {
      const labels = {
        within: "В нормативе",
        slight: "Немного позже",
        severe: "Значительно позже",
        unanswered: "Без ответа",
      };
      chips.push({ key: "speed", label: labels[state.filters.speed] || state.filters.speed });
    }
    if (state.filters.weekday != null && state.filters.hour != null) {
      chips.push({
        key: "cell",
        label: `${["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][state.filters.weekday]}, ${String(state.filters.hour).padStart(2, "0")}:00`,
      });
    }
    return chips;
  }

  function kanbanOf(projected) {
    return PIPELINES.filter((pipeline) => state.settings.pipelineIds.includes(pipeline.id)).map(
      (pipeline) => ({
        id: pipeline.id,
        name: pipeline.name,
        stages: pipeline.stages.map((stage) => ({
          id: stage.id,
          name: stage.name,
          deals: projected.filter(
            (deal) =>
              !deal.future && deal.pipelineId === pipeline.id && deal.stageId === stage.id
          ),
        })),
      })
    );
  }

  function getSnapshot() {
    const at = currentNow();
    const settingsErrors = validateSettings(state.settings);
    const timeZone = state.settings.timezone;
    let report = null;
    let kanban = [];
    let drawer = null;
    if (state.viewMode !== "loading" && state.viewMode !== "error" && !settingsErrors.length) {
      const projected =
        state.viewMode === "empty" ? [] : projectAll(at).filter((view) => !view.future);
      const bounds = boundsFor(at);
      report = bounds.invalid
        ? { invalid: true, notes: [] }
        : buildMetrics({
            deals: projected,
            bounds,
            settings: state.settings,
            filters: state.filters,
            employees: EMPLOYEES,
            now: at,
          });
      kanban = state.viewMode === "empty" ? [] : kanbanOf(projected);
      if (state.openDealId && state.viewMode !== "empty") {
        drawer = projectAll(at).find((view) => view.id === state.openDealId) || null;
        if (drawer?.future) drawer = null;
      }
    }
    const scenarios =
      state.scenario === "custom"
        ? [...SCENARIOS, { id: "custom", label: "Своё демо-время" }]
        : SCENARIOS;
    return {
      now: at,
      frozen: state.frozen,
      clockLabel: new Intl.DateTimeFormat("ru-RU", {
        timeZone,
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      }).format(at),
      timeZone,
      scenario: state.scenario,
      scenarios,
      viewMode: state.viewMode,
      settingsErrors,
      notice: state.notice,
      tab: state.tab,
      settings: state.settings,
      settingsNonce: state.settingsNonce,
      period: state.period,
      periodLabel: report && !report.invalid ? boundsFor(at).label : state.period.preset,
      filters: state.filters,
      activeFilters: activeFilters(Boolean(report && !report.invalid)),
      report,
      kanban,
      drawer,
      popup: state.popup,
      journal: [...state.journal].reverse(),
      digestCard: state.digestCard,
      eodCard: state.eodCard,
      employees: EMPLOYEES,
      pipelines: PIPELINES,
      subscribers: SUBSCRIBERS,
      bot: BOT_MOCK,
      link: LINK_MOCK,
    };
  }

  restore();

  return {
    getSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    tick() {
      if (state.frozen || realAnchor == null) return;
      const next = demoAnchor + (Date.now() - realAnchor);
      if (next - state.now < 250) return;
      const prev = state.now;
      state.now = next;
      onAdvance(prev, next);
      persist();
      emit();
    },
    setFrozen(frozen) {
      if (frozen) {
        state.now = currentNow();
        state.frozen = true;
        realAnchor = null;
      } else {
        state.now = currentNow();
        demoAnchor = state.now;
        realAnchor = Date.now();
        state.frozen = false;
      }
      persist();
      emit();
    },
    addMinutes(minutes) {
      commitNow(currentNow() + minutes * 60000, "custom");
      state.notice = `Демо-часы сдвинуты на ${minutes} мин. Таймеры, отчёт и журнал используют одну отметку.`;
      persist();
      emit();
    },
    jumpNextWorkingDay() {
      const next = nextWorkingDayStart(currentNow(), state.settings);
      if (!next) {
        state.notice = "Следующий рабочий день не найден. Проверьте окно и дни недели.";
        persist();
        emit();
        return;
      }
      commitNow(next, "custom");
      state.notice = `Демо-часы переведены на следующее рабочее утро: ${formatDateTime(next, state.settings.timezone)}. Праздники демокалендаря пропущены.`;
      persist();
      emit();
    },
    setScenario(id) {
      if (id === "custom") return;
      if (id === "default") {
        this.reset();
        return;
      }
      if (id === "loading") {
        state.viewMode = "loading";
        state.scenario = id;
        state.openDealId = null;
        state.notice = "";
        persist();
        emit();
        return;
      }
      if (id === "empty") {
        state.viewMode = "empty";
        state.scenario = id;
        state.openDealId = null;
        state.notice =
          "Демосценарий без сделок. Среднее не показывается как 0 минут, сравнение не строится.";
        persist();
        emit();
        return;
      }
      if (id === "error") {
        state.viewMode = "error";
        state.scenario = id;
        state.openDealId = null;
        state.notice = "";
        persist();
        emit();
        return;
      }
      if (id === "empty-period") {
        state.viewMode = "ready";
        state.scenario = id;
        state.period = { preset: "custom", from: "2026-01-05", to: "2026-01-09" };
        state.filters = emptyFilters();
        state.notice =
          "Выбран период без сделок. Среднее — «нет данных», дельта к пустому прошлому периоду не считается.";
        persist();
        emit();
        return;
      }
      if (id === "holiday") {
        state.viewMode = "ready";
        state.period = { preset: "week", from: "2026-10-05", to: "2026-10-11" };
        state.filters = emptyFilters();
        commitNow(Date.parse("2026-10-08T09:15:00+03:00"), "holiday");
        state.notice =
          "Часы на четверг, 8 октября 2026, 09:15. «Пекарня Мост — ночная заявка»: 10 рабочих минут после вечера вторника и праздника 7 октября.";
        persist();
        emit();
        return;
      }
      if (id === "prealert") {
        state.viewMode = "ready";
        commitNow(currentNow() + 5 * 60000, "prealert");
        state.notice =
          "К часам прибавлено 5 минут. Сделка «Клиника Рассвет — лицензионный пакет» пересекает порог 22 мин 30 с, если пре-алерт ещё не отправлялся.";
        persist();
        emit();
      }
    },
    reset() {
      state = freshState();
      realAnchor = null;
      demoAnchor = state.now;
      evaluate(state.now, true);
      state.notice = "Демоданные и настройки возвращены к базовому вторнику, 6 октября 2026, 11:00.";
      persist();
      emit();
    },
    setTab(tab) {
      state.tab = tab;
      persist();
      emit();
    },
    focusSettings() {
      state.tab = "settings";
      state.settingsNonce += 1;
      persist();
      emit();
    },
    setPeriod(period) {
      state.period = {
        preset: period.preset,
        from: period.from || state.period.from,
        to: period.to || state.period.to,
      };
      if (state.viewMode !== "ready") state.viewMode = "ready";
      persist();
      emit();
    },
    setFilters(partial) {
      state.filters = { ...state.filters, ...partial };
      persist();
      emit();
    },
    toggleChannel(channel) {
      state.filters.channel = state.filters.channel === channel ? "" : channel;
      persist();
      emit();
    },
    toggleSpeed(speed) {
      state.filters.speed = state.filters.speed === speed ? "" : speed;
      persist();
      emit();
    },
    toggleCell(weekday, hour) {
      if (state.filters.weekday === weekday && state.filters.hour === hour) {
        state.filters.weekday = null;
        state.filters.hour = null;
      } else {
        state.filters.weekday = weekday;
        state.filters.hour = hour;
      }
      persist();
      emit();
    },
    clearFilter(key) {
      if (key === "cell") {
        state.filters.weekday = null;
        state.filters.hour = null;
      } else if (key === "weekday" || key === "hour") {
        state.filters.weekday = null;
        state.filters.hour = null;
      } else {
        state.filters[key] = key === "weekday" || key === "hour" ? null : "";
      }
      persist();
      emit();
    },
    clearFilters() {
      state.filters = emptyFilters();
      persist();
      emit();
    },
    openDeal(id) {
      state.openDealId = id;
      if (state.viewMode !== "ready") state.viewMode = "ready";
      persist();
      emit();
    },
    closeDeal() {
      state.openDealId = null;
      persist();
      emit();
    },
    dismissPopup() {
      state.popup = null;
      emit();
    },
    openFromPopup() {
      const id = state.popup?.dealId;
      state.popup = null;
      if (id) {
        state.openDealId = id;
        state.tab = "report";
      }
      persist();
      emit();
    },
    setSettings(input) {
      const previous = state.settings;
      const next = normalizeSettings({ ...DEFAULT_SETTINGS, ...input });
      state.settings = next;
      state.settingsNonce += 1;
      const errors = validateSettings(next);
      if (errors.length) {
        state.notice = errors[0];
      } else {
        let extra = "";
        if (previous.noteCounts !== next.noteCounts)
          extra += " Учёт ручных примечаний пересчитан.";
        if (previous.reassignmentPolicy !== next.reassignmentPolicy)
          extra += " Политика переназначения применена к открытым ожиданиям.";
        if (previous.hideOffHoursHighlight !== next.hideOffHoursHighlight)
          extra += " Подсветка изменена только визуально, рабочее время то же.";
        state.notice = `Сохранено локально. Пересчитаны: статусы, рабочее время, среднее, доля в SLA, нарушения, скорость, рейтинг и heatmap.${extra} Уже отправленные пре-алерты и критические задачи не дублируются.`;
        evaluate(currentNow(), false);
      }
      persist();
      emit();
    },
    applyAction(dealId, action, payload = {}) {
      const deal = state.deals.find((item) => item.id === dealId);
      if (!deal) return;
      const at = currentNow();
      if (validateSettings(state.settings).length) {
        state.notice = "Сначала исправьте рабочее окно: действие не к чему применить.";
        persist();
        emit();
        return;
      }
      const before = projectDeal(deal, state.settings, at);
      if (before.invalid || before.future) {
        state.notice = "По демо-часам эта сделка ещё не назначена.";
        persist();
        emit();
        return;
      }
      const actor = before.managerId;
      const id = `${action}-${deal.id}-${deal.events.length + deal.assignments.length}`;
      if (action === "reassign") {
        if (!payload.managerId || payload.managerId === actor) {
          state.notice = "Выберите другого сотрудника.";
          persist();
          emit();
          return;
        }
        deal.assignments.push({ managerId: payload.managerId, at });
      } else if (action === "call") {
        deal.events.push({
          id,
          type: "call",
          direction: "out",
          durationSec: 120,
          actorId: actor,
          actorKind: "user",
          at,
        });
      } else if (action === "call-zero") {
        deal.events.push({
          id,
          type: "call",
          direction: "out",
          durationSec: 0,
          actorId: actor,
          actorKind: "user",
          at,
        });
      } else if (action === "message") {
        deal.events.push({
          id,
          type: "message",
          direction: "out",
          durationSec: 0,
          actorId: actor,
          actorKind: "user",
          at,
        });
      } else if (action === "message-in") {
        deal.events.push({
          id,
          type: "message",
          direction: "in",
          durationSec: 0,
          actorId: "client",
          actorKind: "user",
          at,
        });
      } else if (action === "email") {
        deal.events.push({
          id,
          type: "email",
          direction: "out",
          durationSec: 0,
          actorId: actor,
          actorKind: "user",
          at,
        });
      } else if (action === "note") {
        deal.events.push({
          id,
          type: "note",
          direction: "out",
          durationSec: 0,
          actorId: actor,
          actorKind: "user",
          at,
        });
      }
      const after = projectDeal(deal, state.settings, at);
      if (before.touch && after.touch && before.touch.eventId === after.touch.eventId) {
        state.notice = before.touch
          ? "Итог уже зафиксирован. Новое событие его не переписывает."
          : state.notice;
      }
      if (!before.touch && after.touch) {
        state.notice = `Первое касание: ${after.channel}, ${formatDuration(after.elapsedMs)} рабочего времени.`;
      } else if (!before.touch && !after.touch && action !== "reassign") {
        state.notice = "Событие записано и не останавливает таймер.";
      } else if (action === "reassign" && !before.touch) {
        state.notice =
          state.settings.reassignmentPolicy === "keep"
            ? "Ответственный сменён, исходный старт обязательства сохранён."
            : "Ответственный сменён, начата новая эпоха таймера. Прежняя осталась в истории.";
      } else if (before.touch) {
        state.notice = "Итог уже зафиксирован. Новое событие его не переписывает.";
      }
      evaluate(at, false);
      persist();
      emit();
    },
    previewDigest() {
      runDigest(currentNow(), "preview");
      persist();
      emit();
    },
    simulateDigest() {
      runDigest(currentNow(), "simulate");
      persist();
      emit();
    },
    previewEod() {
      runEod(currentNow(), "preview");
      persist();
      emit();
    },
    simulateEod() {
      runEod(currentNow(), "simulate");
      persist();
      emit();
    },
    exportCsv() {
      const snapshot = getSnapshot();
      const rows = snapshot.report?.cohort || [];
      return cohortToCsv(rows, state.settings.timezone);
    },
    dispose() {
      listeners.clear();
    },
  };
}
