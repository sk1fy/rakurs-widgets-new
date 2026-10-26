// Память дневного экрана между переходами в профиль и обратно (App.vue,
// DashboardView.vue): к какой карточке вернуться и что было в поиске групп.
// Живёт в памяти вкладки; в URL и хранилище не пишется.

let returnTo: number | null = null;
const searches = new Map<string, string>();

export function rememberReturn(employeeId: number): void {
  returnTo = employeeId;
}

/** Сотрудник, к карточке которого нужно прокрутить; читается один раз. */
export function takeReturn(): number | null {
  const id = returnTo;
  returnTo = null;
  return id;
}

export function groupSearch(groupId: string): string {
  return searches.get(groupId) ?? "";
}

export function saveGroupSearch(groupId: string, value: string): void {
  if (value) searches.set(groupId, value);
  else searches.delete(groupId);
}
