import { fieldTypes, operators } from './rules.js';
const operatorNames = {equals:'Равно',notEquals:'Не равно',contains:'Содержит',greater:'Больше',less:'Меньше',greaterDays:'За N дней',lessDays:'Через N дней'};
// All values are DOM properties/textContent; rule names never become HTML.
export function renderEditor(root, rules, metadata, {canEdit, changed, save}) {
  const document = root.ownerDocument;
  const node = (tag, text) => { const item = document.createElement(tag); if (text) item.textContent = text; return item; };
  const button = (text, callback) => { const item = node('button', text); item.type = 'button'; item.onclick = () => { if (canEdit()) callback(); }; return item; };
  const input = (label, value, callback, type = 'text') => {
    const wrap = node('label', label), item = node('input'); item.type = type;
    if (type === 'checkbox') item.checked = value; else item.value = value ?? '';
    item.onchange = () => { if (canEdit()) { callback(type === 'checkbox' ? item.checked : item.value); changed(); } };
    wrap.append(item); return wrap;
  };
  const select = (values, value, callback) => {
    const item = node('select');
    for (const [id, label] of values) { const option = node('option', label); option.value = id; item.append(option); }
    item.value = value; item.onchange = () => { if (canEdit()) { callback(item.value); changed(); } }; return item;
  };
  const draw = () => {
    root.replaceChildren(node('h2', 'Правила окрашивания'));
    const fields = metadata.fields.filter(field => fieldTypes.includes(field.type));
    rules.forEach((rule, index) => {
      const card = node('fieldset'), title = node('legend', `Правило ${index + 1}`); card.append(title);
      card.append(input('Название', rule.name, value => { rule.name = value; }));
      card.append(input('Включено', rule.enabled, value => { rule.enabled = value; }, 'checkbox'));
      for (const [key, label] of [['bgColor','Фон'], ['borderColor','Обводка'], ['textColor','Текст']]) card.append(input(label, rule[key], value => { rule[key] = value; }, 'color'));
      const users = node('select'); users.multiple = true; users.setAttribute('aria-label', 'Для пользователей (пусто — для всех)');
      for (const user of metadata.users) { const option = node('option', user.name); option.value = user.id; option.selected = rule.allowedUsers?.includes(Number(user.id)); users.append(option); }
      users.onchange = () => { if (canEdit()) { rule.allowedUsers = Array.from(users.selectedOptions, option => Number(option.value)); changed(); } }; card.append(users);
      rule.conditions.forEach((condition, conditionIndex) => {
        const row = node('div');
        const field = fields.find(item => Number(item.id) === Number(condition.fieldId));
        row.append(select([['','Поле'], ...fields.map(item => [item.id, item.name])], condition.fieldId, value => { condition.fieldId = Number(value); condition.value = ''; draw(); }));
        const allowed = field?.type === 'date' ? operators.filter(op => op !== 'contains') : operators.filter(op => !op.endsWith('Days'));
        row.append(select(allowed.map(op => [op, operatorNames[op]]), condition.operator, value => { condition.operator = value; condition.value = ''; draw(); }));
        if (field?.enums?.length) row.append(select([['','Значение'], ...field.enums.map(item => [field.type === 'user' ? item.id : item.value, item.value])], condition.value, value => { condition.value = value; }));
        else if (field?.type === 'checkbox') row.append(select([['1','Да'],['0','Нет']], condition.value, value => { condition.value = value; }));
        else if (field?.type === 'date' && !condition.operator.endsWith('Days')) {
          const date = condition.value ? new Date(Number(condition.value) * 1000) : null;
          const formatted = date && !Number.isNaN(date.getTime()) ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}` : '';
          row.append(input('Дата', formatted, value => { condition.value = value ? Math.floor(new Date(value + 'T00:00:00').getTime()/1000) : ''; }, 'date'));
        } else row.append(input('Значение', condition.value, value => { condition.value = value; }, field?.type === 'numeric' || condition.operator.endsWith('Days') ? 'number' : 'text'));
        row.append(button('Удалить условие', () => { rule.conditions.splice(conditionIndex,1); changed(); draw(); })); card.append(row);
      });
      card.append(button('Добавить условие', () => { rule.conditions.push({fieldId:'',operator:'equals',value:''}); changed(); draw(); }));
      card.append(button('Удалить правило', () => { rules.splice(index,1); changed(); draw(); })); root.append(card);
    });
    root.append(button('Добавить правило', () => { rules.push({id:Date.now(),name:'',enabled:true,bgColor:'#FFC5C5',borderColor:'#FF5733',textColor:'#414141',allowedUsers:[],conditions:[{fieldId:'',operator:'equals',value:''}]}); changed(); draw(); }));
    root.append(button('Сохранить', save));
    for (const control of root.querySelectorAll('input,select,button')) control.disabled = !canEdit();
  };
  draw();
}
