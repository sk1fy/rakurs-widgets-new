// Compatibility with the inspected Color Leads source, not a claim of production parity.
export const operators = ['equals', 'notEquals', 'contains', 'greater', 'less', 'greaterDays', 'lessDays'];
export const fieldTypes = ['text', 'select', 'multiselect', 'radiobutton', 'date', 'numeric', 'checkbox', 'textarea', 'url', 'streetaddress', 'user'];
const day = value => {
  if (!value) return null;
  const date = new Date(Number(value) * 1000);
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 1000);
};
export function checkConditions(lead, conditions, now = Date.now()) {
  const fields = {504473000: {values: [lead.name], type: 'text'}, 5044780000: {values: [lead.responsible_user_id], type: 'user'}};
  for (const field of lead.custom_fields_values || []) fields[field.field_id] = {values: field.values.map(v => v.value), type: field.field_type};
  return Array.isArray(conditions) && conditions.every(condition => {
    const field = fields[Number(condition.fieldId)];
    if (!field) return false;
    let a = field.values[0], b = condition.value;
    if (field.type === 'date') {
      a = day(Number(a));
      const seconds = Math.floor(now / 1000), days = Number(b);
      if (condition.operator === 'greaterDays') return days === 0 ? day(seconds) === a : seconds >= a - days * 86400 && seconds <= a;
      if (condition.operator === 'lessDays') return seconds > a + days * 86400;
      b = day(Number(b));
    } else if (field.type === 'user') { a = Number(a); b = Number(b); }
    else if (field.type === 'checkbox') { a = a === '1'; b = b === '1'; }
    else { a = String(a); b = String(b); }
    switch (condition.operator) {
      case 'equals': return a === b;
      case 'notEquals': return a !== b;
      case 'contains': return String(a).toLowerCase().includes(String(b).toLowerCase());
      case 'greater': return Number(a) > Number(b);
      case 'less': return Number(a) < Number(b);
      default: return false;
    }
  });
}
export function matchingRule(lead, rules, userId, now) {
  return rules.find(rule => rule.enabled && (!rule.allowedUsers?.length || rule.allowedUsers.includes(Number(userId))) && checkConditions(lead, rule.conditions, now));
}
export function validateRules(rules) {
  if (!Array.isArray(rules) || rules.length > 500) throw new Error('Ожидается не более 500 правил');
  for (const rule of rules) {
    if (!rule.name?.trim() || !Array.isArray(rule.conditions) || !rule.conditions.length) throw new Error('Укажите название и хотя бы одно условие');
    for (const color of ['bgColor', 'borderColor', 'textColor']) if (!/^#[a-f\d]{6}$/i.test(rule[color])) throw new Error('Некорректный цвет');
    for (const condition of rule.conditions) if (!Number.isSafeInteger(Number(condition.fieldId)) || Number(condition.fieldId) <= 0 || !operators.includes(condition.operator) || condition.value === '' || condition.value == null) throw new Error('Заполните условия');
  }
  return rules;
}
