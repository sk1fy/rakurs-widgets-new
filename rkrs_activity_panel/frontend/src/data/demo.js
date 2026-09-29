import { DEMO_DATE } from "../utils/periods.js";

const rows = [
  [
    "vika",
    "Виктория",
    "t",
    50.5,
    42,
    [2, 3],
    [8, 12],
    [3, 5],
    [10, 13],
    [4, 6],
    0,
    4,
    6,
  ],
  [
    "yura",
    "Юрий",
    "b",
    39.5,
    84,
    [6, 7],
    [3, 8],
    [1, 2],
    [4, 8],
    [2, 4],
    1,
    12,
    9,
  ],
  [
    "kirill",
    "Кирилл",
    "g",
    25.5,
    20,
    [2, 2],
    [4, 7],
    [1, 2],
    [4, 6],
    [2, 3],
    0,
    2,
    3,
  ],
  [
    "nikita",
    "Никита",
    "o",
    10.5,
    2,
    [1, 2],
    [2, 6],
    [0, 2],
    [3, 7],
    [1, 3],
    3,
    27,
    31,
  ],
  [
    "nastya",
    "Анастасия",
    "p",
    39,
    12,
    [1, 2],
    [20, 16],
    [1, 1],
    [7, 6],
    [4, 3],
    0,
    0,
    0,
  ],
  [
    "sasha",
    "Александр",
    "r",
    26,
    20,
    [3, 2],
    [3, 2],
    [1, 0],
    [3, 2],
    [1, 1],
    2,
    63,
    65,
  ],
  [
    "dasha",
    "Дарья",
    "y",
    10,
    2,
    [1, 1],
    [3, 8],
    [1, 2],
    [2, 5],
    [1, 3],
    0,
    8,
    4,
  ],
  [
    "philipp",
    "Филипп",
    "b",
    7,
    0,
    [0, 1],
    [1, 1],
    [0, 0],
    [1, 1],
    [0, 0],
    0,
    0,
    0,
  ],
];

// Explicit illustrative snapshots. This module never generates API or period totals.
const patterns = [
  "iiiigcacggggigigcigggggggiiiiigggggggiccigggiiiiicgggggggiiggg",
  "iiiiiiiicciiiigcgciiiiggggiiiiggggggiiiicciiiigggcggiiiiiiiiii",
  "iiiiigggigggiiiiiicigigiiiiiiiiiiiiiiiiiiiigiiiiigiiiiiiiiiiii",
  "iiiiiiiiiiiiiiiiiiiiiiiiiigiiiiiiiiiiiiigiiiiciiiigiiiiiiiiiii",
  "iigiiiicggggggigiiigggggiiiiigggggiiiigggggiiiiiiiggggiiiiiggg",
  "iiiiggcggiiiiicgiiiiiiiiiiiiiiiiigggiiiiiiiiiiigiiiiiiiiiiiiii",
  "iiiiiiiiiiiiiigiiiiiiiiiiiiiiiiigiiiiiiiiiiiiiigiiiiiiciiiiiii",
  "iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiigiiiiiiiiiciiiiiiiiiiii",
];

function timeline(pattern, callMinutes, rating, historical = false) {
  const elapsed = historical ? 720 : 400;
  const types = [...pattern].map((type) =>
    type === "g" || type === "a" ? "crm" : type === "c" ? "call" : "idle"
  );
  const minutes = {
    crm: (elapsed * rating) / 100 - callMinutes,
    call: callMinutes,
    idle: elapsed * (1 - rating / 100),
  };
  // Lay out the illustrative strip using the explicit fixture totals, keeping labels consistent.
  let start = 0;
  const cells = types.flatMap((type) => {
    const duration =
      minutes[type] / types.filter((value) => value === type).length;
    if (duration <= 0) return [];
    const segment = { start, duration, type };
    start += duration;
    return [segment];
  });
  if (!historical) cells.push({ start: 400, duration: 320, type: "future" });
  return cells;
}

export const employees = rows.map(
  (
    [
      id,
      name,
      tone,
      rating,
      callMinutes,
      calls,
      messages,
      emails,
      tasks,
      deals,
      noTasks,
      overdueDeals,
      overdueTasks,
    ],
    index
  ) => ({
    id,
    name,
    tone,
    rating,
    callMinutes,
    groupId: "sales",
    groupName: "Отдел продаж",
    metrics: { calls, messages, emails, tasks, deals },
    noTasks,
    overdueDeals,
    overdueTasks,
    timeline: timeline(patterns[index], callMinutes, rating),
    hasData: true,
  })
);

export const directory = [
  ...employees,
  {
    id: "olga",
    name: "Ольга",
    tone: "p",
    groupId: "admin",
    groupName: "Администрация",
    hasData: false,
    rating: null,
  },
  {
    id: "sergey",
    name: "Сергей",
    tone: "b",
    groupId: "admin",
    groupName: "Администрация",
    hasData: false,
    rating: null,
  },
];

export function getDemoDay(date) {
  if (date === DEMO_DATE) return employees;
  if (date === "2026-09-23")
    return employees.map((employee, index) => ({
      ...employee,
      rating: [53.2, 36.6, 27.1, 22.7, 35.8, 28.9, 19.2, 5.6][index],
      callMinutes: [56, 92, 28, 15, 19, 16, 12, 2][index],
      metrics: Object.fromEntries(
        Object.entries(employee.metrics).map(([key, value]) => [
          key,
          [value[1], null],
        ])
      ),
      timeline: timeline(
        patterns[index],
        [56, 92, 28, 15, 19, 16, 12, 2][index],
        [53.2, 36.6, 27.1, 22.7, 35.8, 28.9, 19.2, 5.6][index],
        true
      ),
    }));
  return [];
}
