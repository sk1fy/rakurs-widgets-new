define([], function () {
    'use strict';

    // Разметка окна «Справочник маркеров» в стиле «Меню amo» (1.0.134). Только строки HTML: события, вставка маркеров
    // и доступ — в script.js. Макет-эталон: business/assets/mockups/dynamic-fields-amo-style/index.html.
    var LOGO = '<svg viewBox="12 12 218 59" height="24" aria-hidden="true" focusable="false"><path opacity="0.35" d="M23 41H16C14.3431 41 13 42.3431 13 44V60C13 61.6569 14.3431 63 16 63H23C24.6569 63 26 61.6569 26 60V44C26 42.3431 24.6569 41 23 41Z" fill="white"/><path opacity="0.65" d="M43 31H36C34.3431 31 33 32.3431 33 34V60C33 61.6569 34.3431 63 36 63H43C44.6569 63 46 61.6569 46 60V34C46 32.3431 44.6569 31 43 31Z" fill="white"/><path d="M63 13H56C54.3431 13 53 14.3431 53 16V60C53 61.6569 54.3431 63 56 63H63C64.6569 63 66 61.6569 66 60V16C66 14.3431 64.6569 13 63 13Z" fill="#60C3BC"/><path d="M88.5284 62V32.9091H100.006C102.212 32.9091 104.092 33.3305 105.645 34.1733C107.198 35.0066 108.382 36.1667 109.196 37.6534C110.02 39.1307 110.432 40.8352 110.432 42.767C110.432 44.6989 110.015 46.4034 109.182 47.8807C108.348 49.358 107.141 50.5085 105.56 51.3324C103.988 52.1562 102.084 52.5682 99.8494 52.5682H92.5341V47.6392H98.8551C100.039 47.6392 101.014 47.4356 101.781 47.0284C102.558 46.6117 103.135 46.0388 103.514 45.3097C103.902 44.571 104.097 43.7235 104.097 42.767C104.097 41.8011 103.902 40.9583 103.514 40.2386C103.135 39.5095 102.558 38.946 101.781 38.5483C101.005 38.1411 100.02 37.9375 98.8267 37.9375H94.679V62H88.5284ZM119.949 62.4119C118.557 62.4119 117.316 62.1705 116.227 61.6875C115.138 61.1951 114.277 60.4706 113.642 59.5142C113.017 58.5483 112.705 57.3456 112.705 55.9062C112.705 54.6941 112.927 53.6761 113.372 52.8523C113.817 52.0284 114.423 51.3655 115.19 50.8636C115.957 50.3617 116.829 49.983 117.804 49.7273C118.789 49.4716 119.821 49.2917 120.901 49.1875C122.17 49.0549 123.192 48.9318 123.969 48.8182C124.745 48.6951 125.309 48.5152 125.659 48.2784C126.009 48.0417 126.185 47.6913 126.185 47.2273V47.142C126.185 46.2424 125.901 45.5464 125.332 45.054C124.774 44.5616 123.978 44.3153 122.946 44.3153C121.857 44.3153 120.991 44.5568 120.347 45.0398C119.703 45.5133 119.277 46.1098 119.068 46.8295L113.472 46.375C113.756 45.0492 114.314 43.9034 115.148 42.9375C115.981 41.9621 117.056 41.214 118.372 40.6932C119.698 40.1629 121.232 39.8977 122.974 39.8977C124.187 39.8977 125.347 40.0398 126.455 40.3239C127.572 40.608 128.562 41.0483 129.423 41.6449C130.295 42.2415 130.981 43.0085 131.483 43.946C131.985 44.8741 132.236 45.9867 132.236 47.2841V62H126.497V58.9744H126.327C125.976 59.6562 125.508 60.2576 124.92 60.7784C124.333 61.2898 123.628 61.6922 122.804 61.9858C121.98 62.2699 121.028 62.4119 119.949 62.4119ZM121.682 58.2358C122.572 58.2358 123.358 58.0606 124.04 57.7102C124.722 57.3504 125.257 56.8674 125.645 56.2614C126.033 55.6553 126.227 54.9687 126.227 54.2017V51.8864C126.038 52.0095 125.777 52.1231 125.446 52.2273C125.124 52.322 124.759 52.4119 124.352 52.4972C123.945 52.5729 123.538 52.6439 123.131 52.7102C122.723 52.767 122.354 52.8191 122.023 52.8665C121.313 52.9706 120.692 53.1364 120.162 53.3636C119.632 53.5909 119.22 53.8987 118.926 54.2869C118.633 54.6657 118.486 55.1392 118.486 55.7074C118.486 56.5312 118.784 57.161 119.381 57.5966C119.987 58.0227 120.754 58.2358 121.682 58.2358ZM136.93 62V40.1818H142.982V48.6477H144.686L150.624 40.1818H157.726L150.013 51.0057L157.811 62H150.624L145.24 54.2585H142.982V62H136.93ZM164.455 70.1818C163.688 70.1818 162.969 70.1203 162.296 69.9972C161.633 69.8835 161.084 69.7367 160.648 69.5568L162.012 65.0398C162.722 65.2576 163.362 65.3759 163.93 65.3949C164.507 65.4138 165.004 65.2813 165.421 64.9972C165.847 64.7131 166.193 64.2301 166.458 63.5483L166.813 62.625L158.987 40.1818H165.35L169.867 56.2045H170.094L174.654 40.1818H181.06L172.58 64.358C172.173 65.5322 171.619 66.5549 170.918 67.4261C170.227 68.3068 169.351 68.9839 168.29 69.4574C167.23 69.9403 165.951 70.1818 164.455 70.1818ZM184.157 70.1818V40.1818H190.123V43.8466H190.393C190.658 43.2595 191.041 42.6629 191.543 42.0568C192.055 41.4413 192.718 40.9299 193.532 40.5227C194.356 40.1061 195.379 39.8977 196.6 39.8977C198.191 39.8977 199.659 40.3144 201.004 41.1477C202.348 41.9716 203.423 43.2169 204.228 44.8835C205.033 46.5407 205.435 48.6193 205.435 51.1193C205.435 53.553 205.042 55.608 204.256 57.2841C203.48 58.9508 202.419 60.215 201.075 61.0767C199.739 61.929 198.243 62.3551 196.586 62.3551C195.412 62.3551 194.413 62.161 193.589 61.7727C192.774 61.3845 192.107 60.8968 191.586 60.3097C191.065 59.7131 190.667 59.1117 190.393 58.5057H190.208V70.1818H184.157ZM190.08 51.0909C190.08 52.3883 190.26 53.5199 190.62 54.4858C190.98 55.4517 191.501 56.2045 192.183 56.7443C192.864 57.2746 193.693 57.5398 194.668 57.5398C195.653 57.5398 196.487 57.2699 197.168 56.7301C197.85 56.1809 198.366 55.4233 198.717 54.4574C199.076 53.482 199.256 52.3598 199.256 51.0909C199.256 49.8314 199.081 48.7235 198.731 47.767C198.38 46.8106 197.864 46.0625 197.183 45.5227C196.501 44.983 195.663 44.7131 194.668 44.7131C193.683 44.7131 192.85 44.9735 192.168 45.4943C191.496 46.0152 190.98 46.7538 190.62 47.7102C190.26 48.6667 190.08 49.7936 190.08 51.0909ZM219.327 62.4261C217.093 62.4261 215.17 61.9527 213.56 61.0057C211.96 60.0492 210.729 58.7235 209.867 57.0284C209.015 55.3333 208.589 53.3826 208.589 51.1761C208.589 48.9413 209.02 46.9811 209.881 45.2955C210.753 43.6004 211.988 42.2794 213.589 41.3324C215.189 40.3759 217.093 39.8977 219.299 39.8977C221.202 39.8977 222.869 40.2434 224.299 40.9347C225.729 41.6259 226.861 42.5966 227.694 43.8466C228.527 45.0966 228.987 46.5644 229.072 48.25H223.362C223.201 47.161 222.774 46.285 222.083 45.6222C221.401 44.9498 220.506 44.6136 219.398 44.6136C218.461 44.6136 217.642 44.8693 216.941 45.3807C216.25 45.8826 215.71 46.6165 215.322 47.5824C214.933 48.5483 214.739 49.7178 214.739 51.0909C214.739 52.483 214.929 53.6667 215.308 54.642C215.696 55.6174 216.24 56.3608 216.941 56.8722C217.642 57.3835 218.461 57.6392 219.398 57.6392C220.09 57.6392 220.71 57.4972 221.259 57.2131C221.818 56.929 222.277 56.517 222.637 55.9773C223.006 55.428 223.248 54.7699 223.362 54.0028H229.072C228.977 55.6695 228.522 57.1373 227.708 58.4062C226.903 59.6657 225.79 60.6506 224.37 61.3608C222.95 62.071 221.269 62.4261 219.327 62.4261Z" fill="white"/></svg>';

    var SECTIONS = [
        { id: 'guide', title: 'Инструкция', hint: 'Видео и быстрый старт' },
        { id: 'group', title: 'Группы полей', hint: 'Сворачиваемые блоки' },
        { id: 'switch', title: 'Связанные группы', hint: 'Показ по выбору в списке' },
        { id: 'highlight', title: 'Подсветка', hint: '8 цветов для важного' },
        { id: 'view', title: 'Расположение', hint: 'Название сверху, текст снизу' },
        { id: 'tips', title: 'Подсказки', hint: 'Пояснения к полям' },
        { id: 'checklist', title: 'Чек-листы', hint: 'Прогресс квалификации' },
        { id: 'templates', title: 'Шаблоны', hint: 'Готовые наборы полей' }
    ];
    // В этих разделах маркер никуда не вставляется — блок «Куда вставляем» скрыт.
    var NO_TARGET = ['guide', 'templates'];
    var COLORS = [
        ['1', 'Красный', '#f37575', 'Важные или срочные поля'],
        ['2', 'Зелёный', '#5fc98a', 'Готовые или подтверждённые данные'],
        ['3', 'Синий', '#6fa3f7', 'Справочная информация'],
        ['4', 'Жёлтый', '#f2d34f', 'Требуют внимания'],
        ['5', 'Оранжевый', '#f2a24f', 'Предупреждения'],
        ['6', 'Фиолетовый', '#c58af5', 'Дополнительные данные'],
        ['7', 'Серый', '#b9bec2', 'Служебные поля'],
        ['8', 'Салатовый', '#c6e86b', 'Позитивные статусы']
    ];
    var PRESETS = [['С', 'Сделка'], ['Д', 'Доставка'], ['П', 'Платежи'], ['Ю', 'Юр. лицо'], ['Ф', 'Физ. лицо'], ['К', 'Контакты']];
    var MODES = [
        ['1', 'Свёрнута', 'Открывается по клику'],
        ['2', 'Свёрнута, если пусто', 'Раскрыта, когда есть данные'],
        ['3', 'Раскрыта', 'Всегда открыта'],
        ['4', 'Свернётся после заполнения', 'Открыта, пока не всё заполнено']
    ];
    var TIP_KINDS = [['hover', 'При наведении'], ['red', 'Красная подпись'], ['green', 'Зелёная подпись']];
    var TEMPLATE_GROUPS = [
        { name: 'Успех сделки', hint: 'Квалификация клиента и подготовка к закрытию', items: [
            { id: 'formula', name: 'Формула сделки', author: 'Методика Олега Шевелёва',
                short: '5 условий, которые должны совпасть, чтобы сделка закрылась: деньги, потребность, доверие, ЛПР и готовность решать сейчас.',
                size: '6 полей · чек-лист' }
        ] }
    ];
    var ENTITY_WHERE = { leads: 'в сделках', contacts: 'в контактах', companies: 'в компаниях', customers: 'в покупателях' };

    function esc(text) {
        return String(text === undefined || text === null ? '' : text).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }
    function intro(title, text) { return '<div class="dfh-intro"><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p></div>'; }
    function block(title, html) { return '<div class="dfh-block"><h4>' + esc(title) + '</h4>' + html + '</div>'; }
    function step(number, title, hint, html) {
        return '<div class="dfh-step"><div class="dfh-step-h">' + (number ? '<span>' + number + '</span>' : '') +
            '<b>' + esc(title) + '<small>' + esc(hint) + '</small></b></div>' + html + '</div>';
    }
    function insertAttrs(kind, insert, color) {
        return ' data-kind="' + kind + '" data-insert="' + esc(insert) + '"' + (color ? ' data-color="' + color + '"' : '');
    }
    function row(code, name, desc, kind, insert, swatch, color) {
        return '<div class="dfh-row"><code>' + esc(code) + '</code><div><b>' +
            (swatch ? '<span class="dfh-sw" style="background:' + swatch + '"></span>' : '') + esc(name) + '</b><small>' + esc(desc) + '</small></div>' +
            '<button type="button" class="dfh-btn dfh-btn-light"' + insertAttrs(kind, insert, color) + '>Вставить</button></div>';
    }
    function groupName(letter) {
        var preset = PRESETS.filter(function (item) { return item[0] === letter; })[0];
        return preset ? preset[1] : 'Своя группа';
    }
    function presets(letter) {
        var own = PRESETS.every(function (item) { return item[0] !== letter; });
        return '<div class="dfh-presets"><span>Группа:</span>' + PRESETS.map(function (item) {
            return '<button type="button" class="dfh-chip" data-letter="' + item[0] + '" aria-pressed="' + (item[0] === letter) + '"><b>' + item[0] + '</b>' + item[1] + '</button>';
        }).join('') + '<label class="dfh-own">своя буква <input class="dfh-own-input" maxlength="1" autocomplete="off" value="' + (own ? esc(letter) : '') +
            '" aria-label="Своя буква группы"></label></div>';
    }
    function ownGroups(groups) {
        var list = (groups && groups.list) || [];
        if (!list.length && groups && groups.status === 'loading') {
            return block('Ваши группы', '<p class="dfh-more">Читаем названия полей amoCRM…</p>');
        }
        if (!list.length) {
            return block('Ваши группы', '<div class="dfh-empty-groups"><b>Групп пока нет</b>' +
                'Создайте хотя бы одну группу в разделе «Группы полей» и сохраните поле — она появится здесь, и её можно будет привязать к варианту списка.' +
                '<button type="button" class="dfh-btn dfh-btn-primary" data-go="group">Перейти в «Группы полей»</button></div>' +
                (groups && groups.status === 'error' ? '<p class="dfh-more">Не удалось прочитать поля amoCRM. <a href="#" data-groups-refresh>Повторить</a></p>' : ''));
        }
        return block('Ваши группы — вставьте в вариант ответа',
            '<p class="dfh-more dfh-more-top">Кликните в amoCRM в название варианта списка или переключателя и нажмите «Вставить» у группы, которую он должен показывать.</p>' +
            list.map(function (group) {
                return row('[@' + group.key + ']', 'Показать «' + group.name + '»', 'Группа [' + group.key + '] · полей: ' + group.count, 'switch', '[@' + group.key + '] ');
            }).join('') +
            '<p class="dfh-more">Нет нужной группы? <a href="#" data-go="group">Создайте её в «Группах полей»</a> и сохраните поле — она появится в этом списке. ' +
            '<a href="#" data-groups-refresh>Обновить список</a></p>');
    }

    // Пример «Связанных групп» (1.0.139, макет business/assets/mockups/dynamic-fields-linked-groups/): свёрнут в строку,
    // по «Показать» — два слайда по очереди: список, потом переключатель. Сценарий проигрывает script.js (playHelpExample).
    var EX_CURSOR = '<i class="dfh-ex-cur" aria-hidden="true"><svg viewBox="0 0 18 22" width="18" height="22"><path d="M1 1v17l4.5-4.2 3 6.7 3-1.4-3-6.6H15z" fill="#fff" stroke="#22292f" stroke-width="1.4" stroke-linejoin="round"/></svg></i>';
    var EX_GROUP = '<div class="dfh-ex-grp out"><div class="dfh-ex-grp-h">▾ <span class="dfh-ex-gn">Физ. лицо</span></div>' +
        '<div class="dfh-af"><span class="dfh-ex-g1">Имя</span><b>…</b></div><div class="dfh-af"><span class="dfh-ex-g2">Паспорт</span><b>…</b></div></div>';
    function exampleCard(kind, field) {
        return '<div class="dfh-ex-card" data-kind="' + kind + '"><div class="dfh-ex-card-h">Карточка сделки</div>' +
            '<div class="dfh-af"><span>Бюджет</span><b>120 000 ₽</b></div>' + field + EX_GROUP + EX_CURSOR + '</div>';
    }
    // Общая «свёрнутая» заготовка примера: строка «Посмотреть пример» → «Показать»; внутри один или несколько слайдов.
    function exampleBox(open, pic, hint, slides) {
        var many = slides.length > 1;
        return '<div class="dfh-ex">' +
            '<button type="button" class="dfh-ex-open" data-example="open" aria-expanded="' + (open ? 'true' : 'false') + '"' + (open ? ' hidden' : '') + '>' +
                '<span class="dfh-ex-pic" aria-hidden="true">' + pic + '</span>' +
                '<span class="dfh-ex-txt"><b>Посмотреть пример</b><small>' + esc(hint) + '</small></span>' +
                '<span class="dfh-ex-play">Показать</span></button>' +
            '<div class="dfh-ex-stage"' + (open ? '' : ' hidden') + '>' +
                '<div class="dfh-ex-head"><span>Пример</span><button type="button" class="dfh-ex-close" data-example="close">Скрыть ✕</button></div>' +
                (many ? '<div class="dfh-ex-bar"><button type="button" class="dfh-ex-arr" data-example="prev" aria-label="Назад">‹</button><div class="dfh-ex-dots">' +
                    slides.map(function (slide, i) {
                        return '<button type="button" class="dfh-ex-dot' + (i ? '' : ' on') + '" data-example="slide" data-slide="' + i + '">' + (i + 1) + ' · ' + esc(slide.label) + '<i><b></b></i></button>';
                    }).join('') + '</div><button type="button" class="dfh-ex-arr" data-example="next" aria-label="Вперёд">›</button></div>' : '') +
                slides.map(function (slide, i) {
                    return '<div class="dfh-ex-slide"' + (i ? ' hidden' : '') + '>' + slide.html + '<p class="dfh-ex-cap">' + slide.cap + '</p></div>';
                }).join('') +
            '</div></div>';
    }
    function switchExample(open) {
        var list = exampleCard('list', '<div class="dfh-af"><span>Тип клиента</span><div class="dfh-ex-sel empty"><span class="dfh-ex-v">Выбрать</span>' +
            '<ul class="dfh-ex-dd"><li data-o="F">Физ. лицо</li><li data-o="U">Юр. лицо</li><li data-o="I">ИП</li><li data-o="S">Самозанятый</li></ul></div></div>');
        var radio = exampleCard('switch', '<div class="dfh-af dfh-af-col"><span>Тип клиента</span><div class="dfh-rad"><b data-o="F">Физ. лицо</b><b data-o="U">Юр. лицо</b></div></div>');
        return exampleBox(open, '<i></i><i class="g"></i><i></i><i class="u"></i>',
            'Как группа появляется по выбору в списке и в переключателе · 2 слайда, около 10 секунд', [
                { label: 'Список', html: list, cap: '<b>Список</b> — когда вариантов много. Менеджер открывает список и выбирает — под полем появляется группа для этого варианта.' },
                { label: 'Переключатель', html: radio, cap: '<b>Переключатель</b> — когда вариантов 2–3. Все варианты видны сразу, выбор в один клик.' }
            ]);
    }
    // Пример «Подсветки» (1.0.148): цветные полосы появляются у полей по очереди.
    function highlightExample(open) {
        var rows = [['1', 'Бюджет', '120 000 ₽'], ['', 'Источник', 'Сайт'], ['5', 'Дата доставки', '25.11.2026'], ['2', 'Оплата', 'Получена'], ['3', 'Комментарий', 'Позвонить после 15:00']];
        var card = '<div class="dfh-ex-card" data-kind="highlight"><div class="dfh-ex-card-h">Карточка сделки</div>' + rows.map(function (row) {
            return '<div class="dfh-af dfh-hl-row"' + (row[0] ? ' data-hl="' + row[0] + '"' : '') + '><span>' + row[1] + '</span><b>' + row[2] + '</b></div>';
        }).join('') + '</div>';
        return exampleBox(open, '<i class="hl1"></i><i></i><i class="hl2"></i><i class="hl3"></i>',
            'Как цветные полосы выделяют главное в карточке · около 5 секунд', [
                { label: 'Подсветка', html: card, cap: 'Красный — важное, оранжевый — предупреждение, зелёный — подтверждено, синий — справка. Менеджер видит только полосу, маркер в названии скрыт.' }
            ]);
    }
    // Пример «Расположения» (1.0.148): длинный текст до и после маркера {:col}.
    function viewExample(open) {
        var LONG = 'Клиент просит доставку до 15:00, въезд со двора, пропуск заказывать за день. Оплата после подписания акта. Водителю позвонить за час — ворота открывает охрана.';
        var before = '<div class="dfh-ex-card" data-kind="view"><div class="dfh-ex-card-h">Карточка сделки</div><div class="dfh-vw-row"><span>Комментарий</span><p>' + LONG + '</p></div></div>';
        var after = '<div class="dfh-ex-card" data-kind="view"><div class="dfh-ex-card-h">Карточка сделки</div><div class="dfh-vw-col"><span>Комментарий</span><p>' + LONG + '</p></div></div>';
        return exampleBox(open, '<i class="vw1"></i><i class="vw2"></i><i></i>',
            'Как длинный текст выглядит до и после маркера · 2 слайда', [
                { label: 'Как сейчас', html: before, cap: '<b>Как сейчас</b> — amoCRM ставит название слева, а текст зажимает в узкую колонку и обрезает.' },
                { label: 'Название сверху', html: after, cap: '<b>С маркером «Название сверху»</b> — текст занимает всю ширину карточки и читается целиком.' }
            ]);
    }
    // Пример «Подсказок» (1.0.149): курсор наводит на «i» — всплывает подсказка; красная и зелёная подписи видны всегда.
    function tipsExample(open) {
        var card = '<div class="dfh-ex-card dfh-tp-demo" data-kind="tips"><div class="dfh-ex-card-h">Карточка сделки</div>' +
            '<div class="dfh-tp-row"><span class="dfh-tp-name">ИНН <i>i</i></span><b>…</b><div class="dfh-tp-pop">Введите ИНН без пробелов — 10 или 12 цифр</div></div>' +
            '<div class="dfh-tp-row"><span>Телефон</span><b>+7 900 000-00-00</b></div><p class="dfh-tp-note red">Обязательно для договора</p>' +
            '<div class="dfh-tp-row"><span>Сайт клиента</span><b>…</b></div><p class="dfh-tp-note green">По сайту проверяем нишу и объём</p>' + EX_CURSOR + '</div>';
        return exampleBox(open, '<i class="tp1"></i><i></i><i class="tp2"></i><i class="tp3"></i>',
            'Как подсказки выглядят в карточке · около 5 секунд', [
                { label: 'Подсказки', html: card, cap: '<b>При наведении</b> — всплывает над названием поля. <b>Красная</b> и <b>зелёная</b> подписи видны под полем всегда.' }
            ]);
    }
    // Пример «Чек-листов» (1.0.143): тот же приём — по нажатию; курсор отмечает ответы, растёт прогресс, «Нет» даёт блокер и совет.
    function checklistExample(open) {
        var answers = function (row) {
            return '<div class="dfh-rad" data-ck-row="' + row + '"><b data-v="ok">Да</b><b data-v="none" class="on">Не выяснено</b><b data-v="bad">Нет</b></div>';
        };
        var card = '<div class="dfh-ex-card" data-kind="checklist"><div class="dfh-ex-card-h">Карточка сделки</div>' +
            '<div class="dfh-ck-h"><span>▾ Квалификация</span><b class="dfh-ck-p">0%</b></div><div class="dfh-ck-bar"><i></i><i></i></div>' +
            '<div class="dfh-ck-item"><span>Бюджет</span>' + answers(0) + '</div>' +
            '<div class="dfh-ck-item"><span>ЛПР</span>' + answers(1) + '</div>' +
            '<div class="dfh-ck-tip" hidden>ЛПР: Попросите встречу с ЛПР</div>' + EX_CURSOR + '</div>';
        return exampleBox(open, '<i class="ck"></i><i class="ckbar"></i><i></i><i></i>',
            'Как менеджер заполняет чек-лист: прогресс, блокер и совет · около 7 секунд', [
                { label: 'Чек-лист', html: card, cap: 'Менеджер отмечает ответы — прогресс растёт. Ответ <b>«Нет»</b> — блокер: чек-лист краснеет и подсказывает, что делать.' }
            ]);
    }
    // Мастера «Чек-листы» и «Группы полей» (2.0.0). Макеты: business/assets/mockups/dynamic-fields-checklists/wizard2.html,
    // business/assets/mockups/dynamic-fields-groups/wizard.html. Модель готовит script.js (wizardView / groupView); здесь только разметка.
    var WZ_VALUES = [['ok', 'Выполнено'], ['none', 'Не выяснено'], ['bad', 'Блокер']];
    var GW_MODES = [['1', 'Свёрнута', 'Открывается по клику', false], ['2', 'Умная', 'Свёрнута, пока пусто; раскрыта, когда есть данные', false],
        ['3', 'Раскрыта', 'Всегда открыта', true], ['4', 'Свернётся после заполнения', 'Открыта, пока не всё заполнено', true]];
    var GW_COLORS = [['7', '#7d8994', 'серый'], ['6', '#9b55c7', 'фиолетовый'], ['5', '#e57a24', 'оранжевый'], ['4', '#d6ac16', 'жёлтый'],
        ['3', '#3f7fd8', 'синий'], ['2', '#35a76f', 'зелёный'], ['1', '#e04444', 'красный']];
    function gwColor(n) { var c = GW_COLORS.filter(function (x) { return x[0] === String(n); })[0]; return c ? c[1] : '#2f8f88'; }
    function wzType(type) { return '<span class="dfh-wz-ty' + (type === 'Текст' ? ' txt' : '') + '">' + esc(type) + '</span>'; }
    function wzHand(html) { return '<div class="dfh-wz-hand"><i aria-hidden="true">✎</i><div><b>Можно вручную.</b> ' + html + '</div></div>'; }
    function wzCode(text) { return '<code>' + esc(text) + '</code>'; }
    function wzSteps(ns, w, list) {
        return '<div class="dfh-wz-steps">' + list.map(function (step, i) {
            return '<button type="button" data-' + ns + '="go" data-step="' + i + '" class="' + (i === w.step ? 'on' : i < w.step ? 'done' : '') + '"' + (w.status === 'applying' ? ' disabled' : '') + '>' +
                '<b>' + (i + 1) + ' · ' + step[0] + '</b><small>' + step[1] + '</small></button>';
        }).join('') + '</div>';
    }
    function wzFoot(ns, w, nextLabel, applyLabel, info, last) {
        last = last === undefined ? 3 : last;
        return '<div class="dfh-wz-foot"><button type="button" class="dfh-btn dfh-btn-ghost" data-' + ns + '="go" data-step="' + (w.step - 1) + '"' + (w.step && w.status !== 'applying' ? '' : ' disabled') + '>‹ Назад</button>' +
            '<span class="dfh-wz-sp">' + (info || '') + '</span>' +
            (w.step < last ? '<button type="button" class="dfh-btn dfh-btn-primary" data-' + ns + '="go" data-step="' + (w.step + 1) + '">' + nextLabel + ' ›</button>'
                : '<button type="button" class="dfh-btn dfh-btn-primary dfh-wz-go" data-' + ns + '="apply"' + (w.canApply && w.status !== 'applying' ? '' : ' disabled') + '>' +
                    (w.status === 'applying' ? 'Сохраняем…' : applyLabel) + '</button>') + '</div>' +
            '';
    }
    function wzState(w, ns) {
        if (w.status === 'loading') return '<div class="dfh-wz"><p class="dfh-more">Читаем поля amoCRM…</p></div>';
        if (w.status === 'noentity') return '<div class="dfh-wz"><p class="dfh-more">Откройте настройки полей сделки, контакта, компании или покупателя — мастер возьмёт поля оттуда.</p></div>';
        if (w.status === 'error') return '<div class="dfh-wz"><p class="dfh-more">Не удалось прочитать поля amoCRM. <a href="#" data-' + ns + '="reload-fields">Повторить</a></p></div>';
        return '';
    }
    // Шаг 1 у обоих мастеров: название с поиском, буква с пояснением, «Уже есть».
    function wzHeadStep(ns, w, kind) {
        var what = kind === 'checklist' ? 'чек-лист' : 'группу';
        var html = '';
        if (w.edit) {
            html += '<div class="dfh-wz-editbar"><b>Изменение ' + (kind === 'checklist' ? 'чек-листа' : 'группы') + ' «' + esc(w.edit.name) + '»</b>' +
                '<span>буква ' + esc(w.edit.letter) + ' · ' + (kind === 'checklist' ? 'вопросов' : 'полей') + ': ' + w.edit.count + '</span>' +
                '<a href="#" data-' + ns + '="new">← Создать ' + (kind === 'checklist' ? 'новый чек-лист' : 'новую группу') + '</a></div>' +
                '<h4>Название ' + (kind === 'checklist' ? 'чек-листа' : 'группы') + '</h4><p class="dfh-wz-hint">Это название поля-заголовка «' + esc(w.edit.raw) + '». Можно переименовать.</p>' +
                '<input class="dfh-input dfh-wz-name" data-' + ns + '-input="head-name" maxlength="80" value="' + esc(w.head ? w.head.name : '') + '">';
        } else {
            html += '<h4>Как назовём ' + what + '?</h4><p class="dfh-wz-hint">Заголовок — поле карточки' + (kind === 'checklist' ? ' с названием и процентом выполнения' : '') +
                '. Обычно создаём новое; можно выбрать своё поле «Текст».</p>';
            if (w.head) {
                html += '<div class="dfh-wz-chosen">' + (w.head.isNew ? 'Новое поле' : 'Своё поле') + ' «<b>' + esc(w.head.name) + '</b>»<small>' +
                    (w.head.isNew ? 'создадим «Текст»' : 'Текст') + '</small><a href="#" data-' + ns + '="head-clear">изменить</a></div>';
            } else {
                html += '<div class="dfh-wz-cb"><input class="dfh-input" data-' + ns + '-input="head-q" maxlength="80" autocomplete="off" value="' + esc(w.headQ) + '" placeholder="' +
                    (kind === 'checklist' ? 'Например «Квалификация»' : 'Например «Доставка»') + '">' +
                    (w.combo && (String(w.headQ).trim() || w.comboItems.length) ? '<div class="dfh-wz-dd">' +
                        (String(w.headQ).trim() ? '<button type="button" class="new" data-' + ns + '="head-new">+ Создать новое поле «' + esc(String(w.headQ).trim()) + '»<small>Текст</small></button>' : '') +
                        (w.comboItems.length ? '<div class="cap">Или выбрать своё поле «Текст»</div>' + w.comboItems.map(function (item) {
                            return '<button type="button" data-' + ns + '="head-pick" data-id="' + item.id + '">' + esc(item.label) + '<small>Текст</small></button>';
                        }).join('') : '') + '</div>' : '') + '</div>';
            }
        }
        html += '<div class="dfh-wz-lt"><label><b>Буква ' + (kind === 'checklist' ? 'чек-листа' : 'группы') + '</b>' +
            '<input class="dfh-input" data-' + ns + '-input="letter" maxlength="1" autocomplete="off" value="' + esc(w.letter) + '"></label><p>' +
            (w.edit ? 'Одна буква связывает заголовок и все ' + (kind === 'checklist' ? 'вопросы' : 'поля') + '. Сейчас буква <b>' + esc(w.edit.letter) +
                '</b>. Можно поменять на любую свободную — виджет перепишет маркеры у заголовка' + (kind === 'checklist' ? ', вопросов и поля «100 %»' : ', всех полей и у вариантов, которые эту группу показывают') + '.'
                : 'Одна буква связывает заголовок и все ' + (kind === 'checklist' ? 'вопросы' : 'поля группы') + ' — в названиях полей она стоит в скобках, например ' +
                    wzCode('[' + w.letter + ']') + '. Мы подставили свободную, можно вписать свою.') + '</p></div>' +
            (w.ltNote ? '<p class="dfh-wz-warn">' + esc(w.ltNote) + '</p>' : '');
        var list = kind === 'checklist' ? w.existing : w.existing;
        if (list.length) {
            html += '<span class="dfh-wz-lbl">Уже есть — нажмите, чтобы изменить</span><div class="dfh-wz-ex">' + list.map(function (item) {
                return '<button type="button" class="dfh-wz-exg' + (w.edit && w.edit.letter === item.letter ? ' on' : '') + '" data-' + ns + '="edit" data-letter="' + esc(item.letter) + '">' +
                    '<b style="background:' + (kind === 'checklist' || item.checklist ? '#35a76f' : gwColor(item.color || '7')) + '">' + esc(item.letter) + '</b>' + esc(item.name) +
                    (item.checklist && kind !== 'checklist' ? '<small>чек-лист</small>' : kind === 'checklist' ? '<small>' + item.count + ' ' + plural(item.count, 'вопрос', 'вопроса', 'вопросов') + '</small>' : '') + '</button>';
            }).join('') + '</div>' + (w.note ? '<p class="dfh-wz-warn">' + esc(w.note) + '</p>' : '');
        }
        return html;
    }
    function wzChanges(rows) {
        return '<div class="dfh-wz-chg"><h5>Что изменится в amoCRM</h5>' + (rows.length ? rows.map(function (row) {
            return '<div class="dfh-wz-r' + (row.sub ? ' sub' : '') + (row.rm ? ' rm' : '') + '"><s>' + esc(row.was) + '</s><span>' + esc(row.now) + '</span></div>';
        }).join('') : '<div class="dfh-wz-r"><span>Изменений пока нет</span></div>') + '</div>';
    }
    function wzDone(title, w) {
        return '<div class="dfh-wz dfh-wz-done"><div class="dfh-wz-tick">✓</div><h4>' + esc(title) + '</h4>' +
            '<p>Обновите страницу настроек, чтобы увидеть новые названия полей. Данные в сделках не менялись.</p>' +
            '<div class="dfh-wz-row"><button type="button" class="dfh-btn dfh-btn-primary" data-act="reload">Обновить страницу</button>' +
            '<button type="button" class="dfh-btn dfh-btn-ghost" data-' + w + '="again">Ещё один</button></div></div>';
    }

    function checklistWizard(w) {
        var st = wzState(w, 'wz');
        if (st) return st;
        if (w.status === 'done') return wzDone(w.edit ? 'Чек-лист «' + w.headTitle + '» сохранён' : 'Чек-лист «' + w.headTitle + '» создан', 'wz');
        var L = w.letter;
        var html = '<div class="dfh-wz">' + wzSteps('wz', w, [['Заголовок', 'название и буква'], ['Пункты', 'вопросы'], ['Ответы', 'что значит ответ'], ['Проверка', w.edit ? 'и сохранение' : 'и создание']]) + '<div class="dfh-wz-body">';
        if (w.step === 0) {
            html += wzHeadStep('wz', w, 'checklist') +
                wzHand('Впишите в начало названия поля «Текст» букву и цифру 4, а в конец — ' + wzCode('{:checklist}') + ': ' + wzCode('[' + L + '4] ' + w.headTitle + ' {:checklist}') + '.');
        } else if (w.step === 1) {
            html += '<h4>Какие вопросы будут в чек-листе?</h4><p class="dfh-wz-hint">Впишите вопросы по порядку — каждый станет полем-пунктом. ' + wzType('Переключатель') +
                ' — ответы кнопками, удобно до 3–4 ответов; ' + wzType('Список') + ' — если ответов много.</p><div class="dfh-wz-list">' + w.items.map(function (item, i) {
                    return '<div class="dfh-wz-q"><i class="dfh-wz-n">' + (i + 1) + '</i>' +
                        '<input class="dfh-input" data-wz-input="item-name" data-index="' + i + '" maxlength="80" value="' + esc(item.label) + '" aria-label="Вопрос ' + (i + 1) + '">' +
                        (item.orig ? '<span class="dfh-wz-tyfix" title="Тип созданного поля amoCRM поменять нельзя">' + item.typeName + '</span>'
                            : '<div class="dfh-wz-seg">' + [['radiobutton', 'Переключатель'], ['select', 'Список']].map(function (type) {
                                return '<button type="button" data-wz="type" data-index="' + i + '" data-type="' + type[0] + '" class="v-none' + (item.type === type[0] ? ' on' : '') + '">' + type[1] + '</button>';
                            }).join('') + '</div>') +
                        '<a href="#" data-wz="del" data-index="' + i + '" title="Убрать вопрос" aria-label="Убрать вопрос">×</a></div>';
                }).join('') + '</div>' +
                '<div class="dfh-wz-row"><input class="dfh-input" data-wz-input="new-item" maxlength="80" placeholder="' + (w.items.length ? 'Ещё вопрос, например «Сроки»' : 'Например «Бюджет», потом «ЛПР», «Сроки»') + '">' +
                '<button type="button" class="dfh-btn dfh-btn-light" data-wz="add">+ Добавить вопрос</button></div>' +
                (w.edit ? '<p class="dfh-wz-note">Готовые вопросы — уже созданные поля amoCRM: их можно переименовать или убрать из чек-листа, а тип поменять нельзя. Тип выбирается только у новых вопросов. Убранный вопрос останется полем в карточке — снимем только маркер.</p>' : '') +
                wzHand('Каждый вопрос — поле «Переключатель» или «Список». В начало его названия впишите букву: ' + wzCode('[' + L + '] Бюджет') + '. Другие типы (текст, число, мультисписок) в чек-листе не работают.');
        } else if (w.step === 2) {
            html += '<h4>Какие ответы в каждом вопросе?</h4><p class="dfh-wz-hint">Впишите ответы и отметьте, что значит каждый. «Выполнено» — пункт закрыт, «Блокер» — чек-лист краснеет и показывает совет.</p>' +
                (w.items.length ? w.items.map(function (item, i) {
                    return '<div class="dfh-wz-item"><div class="dfh-wz-item-h">' + (i + 1) + '. ' + esc(item.label) + wzType(item.typeName) + '</div>' + item.options.map(function (option, k) {
                        return '<div class="dfh-wz-ans"><span class="dfh-wz-ans-in"><input class="dfh-input" data-wz-input="opt-label" data-index="' + i + '" data-opt="' + k + '" maxlength="80" value="' + esc(option.label) +
                            '" placeholder="Вариант ответа" aria-label="Вариант ответа ' + (k + 1) + '">' +
                            (option.orig ? '' : '<a href="#" data-wz="del-opt" data-index="' + i + '" data-opt="' + k + '" title="Убрать ответ" aria-label="Убрать ответ">×</a>') + '</span>' +
                            '<div class="dfh-wz-seg">' + WZ_VALUES.map(function (value) {
                                return '<button type="button" data-wz="ans" data-index="' + i + '" data-opt="' + k + '" data-v="' + value[0] + '" class="v-' + value[0] + (option.value === value[0] ? ' on' : '') + '">' + value[1] + '</button>';
                            }).join('') + '</div>' + (option.value === 'bad' ? '<label class="dfh-wz-adv">Совет менеджеру:<input class="dfh-input" data-wz-input="advice" data-index="' + i + '" data-opt="' + k +
                                '" maxlength="200" value="' + esc(option.advice) + '" placeholder="Например: попросите встречу с ЛПР"></label>' : '') + '</div>';
                    }).join('') + '<div class="dfh-wz-ans-add"><a href="#" data-wz="add-opt" data-index="' + i + '">+ Добавить ответ</a></div></div>';
                }).join('') : '<p class="dfh-more">Сначала впишите вопросы на шаге 2.</p>') +
                (w.edit ? '<p class="dfh-wz-note">Готовые ответы можно переименовать и поменять их значение. Удалить готовый ответ здесь нельзя — в сделках, где он выбран, пропало бы значение.</p>' : '') +
                wzHand('В начало названия ответа: ' + wzCode('[+] Да') + ' — выполнено, ' + wzCode('[-] Нет') + ' — блокер, без маркера — не выяснено. Совет — в конце ответа-блокера: ' + wzCode('[-] Нет {!Попросите встречу с ЛПР}') + '.');
        } else {
            html += '<h4>' + (w.edit ? 'Проверьте и сохраните' : 'Проверьте и создайте') + '</h4><div class="dfh-wz-meta"><span>Раздел: <b>' + esc(w.entityName) + '</b></span><span>Вопросов: <b>' + w.items.length + '</b></span>' +
                '<span>Буква: <b>' + esc(L) + '</b></span></div><div class="dfh-wz-rev">' + wzChanges(w.changes) + wizardCard(w) + '</div>' + wizardDone(w) +
                (w.message ? '<p class="dfh-wz-warn" role="status">' + esc(w.message) + '</p>' : '') +
                wzHand('Поле «Флаг» с галочкой «Только из API», в конце названия — буква чек-листа: ' + wzCode(w.headTitle + ' — выполнено {:done ' + L + '}') + '. Убрать чек-лист — кнопка «Сбросить» внизу справочника.');
        }
        html += '</div>' + wzFoot('wz', w, 'Дальше', w.edit ? 'Сохранить изменения' : 'Создать чек-лист',
            w.step === 3 ? esc(w.applyNote) : w.step === 1 ? w.items.length + ' ' + plural(w.items.length, 'вопрос', 'вопроса', 'вопросов') : '') + '</div>';
        return html;
    }
    // 100 % → поле-флаг: виджет ставит галочку, amoCRM не пускает сделку на этап, где это поле обязательно.
    function wizardDone(w) {
        var d = w.done;
        if (d.existing) {
            return '<div class="dfh-wz-done-box' + (d.keep ? ' on' : '') + '"><label class="dfh-wz-done-h"><input type="checkbox" data-wz-change="done-keep"' + (d.keep ? ' checked' : '') + '>' +
                '<b>Отмечать в amoCRM, когда чек-лист заполнен на 100 %</b></label><p>Поле «' + esc(d.existing) + '». ' +
                (d.keep ? 'Виджет ставит в нём галочку при 100 % и снимает, если ответ поменяют.' : 'Галочку больше не ставим — с поля снимем маркер чек-листа.') + '</p></div>';
        }
        var picked = d.fields.filter(function (field) { return String(field.id) === String(d.pick); })[0];
        return '<div class="dfh-wz-done-box' + (d.on ? ' on' : '') + '"><label class="dfh-wz-done-h"><input type="checkbox" data-wz-change="done-on"' + (d.on ? ' checked' : '') + '>' +
                '<b>Отмечать в amoCRM, когда чек-лист заполнен на 100 %</b></label>' +
            (d.on ? '<p>Виджет поставит галочку в поле «Флаг», когда менеджер сохранит все ответы «Выполнено», и снимет её, если ответ поменяют. ' +
                'Сделайте это поле обязательным для нужного этапа — amoCRM не пустит сделку дальше, пока галочки нет.</p>' +
                '<label class="dfh-wz-opt' + (d.mode === 'new' ? ' on' : '') + '"><input type="radio" name="dfh-wz-dm" value="new" data-wz-change="done-mode"' + (d.mode === 'new' ? ' checked' : '') + '>' +
                    '<span><b>Создать поле</b><small>Поле «Флаг» с галочкой «Только из API» — менеджер не сможет поставить её сам</small>' +
                    '<input class="dfh-input" data-wz-input="done-name" maxlength="80" value="' + esc(d.name) + '" placeholder="' + esc(d.defaultName) + '"></span></label>' +
                '<label class="dfh-wz-opt' + (d.mode === 'pick' ? ' on' : '') + (d.fields.length ? '' : ' off') + '"><input type="radio" name="dfh-wz-dm" value="pick" data-wz-change="done-mode"' +
                    (d.mode === 'pick' ? ' checked' : '') + (d.fields.length ? '' : ' disabled') + '>' +
                    '<span><b>Выбрать готовое поле</b><small>' + (d.fields.length ? 'Только поля «Флаг». Одно поле — для одного чек-листа' : 'Полей «Флаг» ' + esc(w.where) + ' пока нет') + '</small>' +
                    (d.fields.length ? '<select class="dfh-input" data-wz-change="done-pick"><option value="">Выберите поле</option>' + d.fields.map(function (field) {
                        return '<option value="' + field.id + '"' + (String(field.id) === String(d.pick) ? ' selected' : '') + (field.busy ? ' disabled' : '') + '>' +
                            esc(field.label) + (field.busy ? ' — уже у чек-листа «' + esc(field.busy) + '»' : field.apiOnly ? ' — только из API' : '') + '</option>';
                    }).join('') + '</select>' : '') + '</span></label>' +
                (d.mode === 'pick' && picked && !picked.apiOnly ? '<p class="dfh-wz-warn">У поля «' + esc(picked.label) + '» нет галочки «Только из API» — менеджер сможет поставить её руками. Включите её в настройках поля amoCRM.</p>' : '')
            : '') + '</div>';
    }
    // Превью «Так увидит менеджер» — кликабельное: ответы нажимаются, процент и блокер пересчитываются.
    function wizardCard(w) {
        return '<div class="dfh-wz-card"><h5>Так увидит менеджер — нажмите на ответы</h5>' +
            '<div class="dfh-ck-h' + (w.preview.blocked ? ' bad' : w.preview.complete ? ' ok' : '') + '"><span>▾ ' + esc(w.headTitle) + '</span><b class="dfh-ck-p">' + w.preview.percent + '%</b></div>' +
            '<div class="dfh-ck-bar" style="grid-template-columns:repeat(' + Math.max(1, w.items.length) + ',1fr)">' + w.items.map(function (item) {
                return '<i class="' + (item.previewValue === 'none' ? '' : item.previewValue) + '"></i>';
            }).join('') + '</div>' +
            w.items.map(function (item) {
                return '<div class="dfh-ck-item"><span>' + esc(item.label) + '</span><div class="dfh-rad">' + item.filled.map(function (option, i) {
                    return '<b role="button" tabindex="0" data-wz="pv" data-item="' + esc(item.key) + '" data-opt="' + i + '"' +
                        (item.previewIndex === i ? ' class="on" data-v="' + option.value + '"' : '') + '>' + esc(option.label) + '</b>';
                }).join('') + '</div></div>';
            }).join('') +
            w.preview.tips.map(function (tip) { return '<div class="dfh-ck-tip">' + esc(tip) + '</div>'; }).join('') + '</div>';
    }

    function groupWizard(w) {
        var st = wzState(w, 'gw');
        if (st) return st;
        if (w.status === 'done') return wzDone(w.edit ? 'Группа «' + w.title + '» сохранена' : 'Группа «' + w.title + '» создана', 'gw');
        var L = w.letter;
        var html = '<div class="dfh-wz">' + wzSteps('gw', w, [['Заголовок', 'название и буква'], ['Вид и цвет', 'как выглядит'], ['Поля', 'что внутри'], ['Проверка', w.edit ? 'и сохранение' : 'и создание']]) + '<div class="dfh-wz-body">';
        if (w.step === 0) {
            html += wzHeadStep('gw', w, 'group') +
                wzHand(w.edit ? 'Заголовок этой группы — поле с маркером ' + wzCode('[' + w.edit.letter + w.mode + ' /' + w.color + '/]') + ' в начале названия. Название меняйте, маркер не трогайте.'
                    : 'Впишите в начало названия поля-заголовка букву и цифру вида: ' + wzCode('[' + L + '3] ' + w.title) + '. Буква — любая свободная.');
        } else if (w.step === 1) {
            html += '<h4>Как будет выглядеть группа?</h4><div class="dfh-gw-modes">' + GW_MODES.map(function (mode) {
                return '<button type="button" class="dfh-gw-md' + (w.mode === mode[0] ? ' on' : '') + '" data-gw="mode" data-mode="' + mode[0] + '">' +
                    '<span class="dfh-gw-mini' + (mode[3] ? ' box' : '') + '" style="--gc:' + gwColor(w.color) + '"><span class="h">' + esc(w.title) + '</span>' + (mode[3] ? '<span class="r f"></span><span class="r"></span>' : '') + '</span>' +
                    '<b><code>' + esc(L + mode[0]) + '</code>' + mode[1] + '</b><small>' + mode[2] + '</small></button>';
            }).join('') + '</div><span class="dfh-wz-lbl">Цвет рамки и точки — по умолчанию серый</span><div class="dfh-gw-colors">' + GW_COLORS.map(function (color) {
                return '<button type="button" class="dfh-gw-sw' + (w.color === color[0] ? ' on' : '') + '" data-gw="color" data-color="' + color[0] + '" title="' + color[2] + '" aria-label="' + color[2] + '" style="background:' + color[1] + '"></button>';
            }).join('') + '</div>' +
                wzHand('Цифра после буквы задаёт вид: ' + wzCode('[' + L + '1]') + ' свёрнута, ' + wzCode('[' + L + '2]') + ' умная, ' + wzCode('[' + L + '3]') + ' раскрыта, ' + wzCode('[' + L + '4]') +
                    ' свернётся после заполнения. Цвет — через пробел: ' + wzCode('[' + L + w.mode + ' /' + w.color + '/]') + ' (7 серый, 6 фиолетовый, 5 оранжевый, 4 жёлтый, 3 синий, 2 зелёный, 1 красный).');
        } else if (w.step === 2) {
            html += '<h4>Какие поля войдут в группу?</h4><p class="dfh-wz-hint">Начните вводить название поля и выберите его в подсказке. Поля, которые уже в другой группе или чек-листе, в подсказку не попадают.</p>' +
                (w.members.length ? '<div class="dfh-wz-list">' + w.members.map(function (member, i) {
                    return '<div class="dfh-gw-fr"><i class="dfh-wz-n">' + (i + 1) + '</i><span>' + esc(member.label) + '</span><small>' + esc(member.typeName) + '</small>' +
                        '<a href="#" data-gw="del" data-index="' + member.index + '" title="Убрать из группы" aria-label="Убрать из группы">×</a></div>';
                }).join('') + '</div>' : '') +
                '<span class="dfh-wz-lbl">' + (w.members.length ? 'Добавить поле в группу' : 'Первое поле группы') + '</span>' +
                '<div class="dfh-wz-cb"><input class="dfh-input" data-gw-input="fq" maxlength="80" autocomplete="off" value="' + esc(w.fq) + '" placeholder="Начните вводить, например «адрес»">' +
                (w.fqOpen ? '<div class="dfh-wz-dd">' + (w.fqItems.length ? w.fqItems.map(function (item) {
                    return '<button type="button" data-gw="pick" data-id="' + item.id + '">' + esc(item.label) + '<small>' + esc(item.typeName) + '</small></button>';
                }).join('') : '<div class="cap">Свободных полей с таким названием нет</div>') +
                    '<button type="button" class="new" data-gw="create">+ Создать новое поле «' + esc(String(w.fq).trim()) + '»<small>Текст</small></button></div>' : '') + '</div>' +
                (w.edit ? '<p class="dfh-wz-note">Убранное поле останется в карточке — снимем только маркер группы.</p>' : '') +
                wzHand('Впишите в начало названия каждого поля группы букву без цифры: ' + wzCode('[' + L + '] Адрес доставки') + '. Поле переедет под заголовок, даже если стоит в карточке в другом месте.');
        } else {
            html += '<h4>' + (w.edit ? 'Проверьте и сохраните' : 'Проверьте и создайте') + '</h4><div class="dfh-wz-meta"><span>Раздел: <b>' + esc(w.entityName) + '</b></span><span>Полей: <b>' + w.members.length + '</b></span>' +
                '<span>Буква: <b>' + esc(L) + '</b></span></div><div class="dfh-wz-rev">' + wzChanges(w.changes) +
                '<div class="dfh-wz-card"><h5>Так увидит менеджер — попробуйте</h5><div class="dfh-gw-box' + (w.preview.closed ? ' closed' : '') + '" style="--gc:' + gwColor(w.color) + '">' +
                    '<div class="dfh-gw-hd" role="button" tabindex="0" data-gw="toggle"><i>▾</i>' + esc(w.title) + '<small>' + (w.preview.closed ? 'открыть' : 'свернуть') + '</small></div><div class="dfh-gw-ff">' +
                    w.members.map(function (member) {
                        return '<div class="dfh-gw-f"><span>' + esc(member.label) + '</span><input class="dfh-input" data-gw-input="val" data-index="' + member.index + '" value="' + esc(w.preview.vals[member.index] || '') + '" placeholder="…"></div>';
                    }).join('') + '</div></div></div></div>' +
                (w.message ? '<p class="dfh-wz-warn" role="status">' + esc(w.message) + '</p>' : '') +
                wzHand('То же вручную: заголовок ' + wzCode('[' + L + w.mode + ' /' + w.color + '/] ' + w.title) + ', поля — ' + wzCode('[' + L + '] …') + '. Убрать группу — кнопка «Сбросить» внизу справочника.');
        }
        html += '</div>' + wzFoot('gw', w, 'Дальше', w.edit ? 'Сохранить изменения' : 'Создать группу', w.step === 3 ? esc(w.applyNote) : '') + '</div>';
        return html;
    }

    // Мастер связанных групп (2.0.2): поле «Переключатель»/«Список», у каждого варианта — группа. Модель — linkedView() в script.js.
    function linkedWizard(w) {
        var st = wzState(w, 'lw');
        if (st) return st;
        if (w.status === 'done') return wzDone('Связанные группы «' + (w.field ? w.field.name : '') + '» ' + (w.edit ? 'сохранены' : 'настроены'), 'lw');
        var html = '<div class="dfh-wz">' + wzSteps('lw', w, [['Поле', 'переключатель или список'], ['Варианты', 'какую группу показывать'], ['Проверка', w.edit ? 'и сохранение' : 'и создание']]) + '<div class="dfh-wz-body">';
        if (w.step === 0) {
            if (w.edit) html += '<div class="dfh-wz-editbar"><b>Изменение связанных групп «' + esc(w.field.name) + '»</b><span>' + w.opts.length + ' ' + plural(w.opts.length, 'вариант', 'варианта', 'вариантов') + '</span>' +
                '<a href="#" data-lw="field-clear">← Настроить другое поле</a></div>';
            html += '<h4>Какое поле будет переключать группы?</h4><p class="dfh-wz-hint">Поле «Переключатель» (2–3 варианта, видны кнопками) или «Список» (вариантов много). Обычно создаём новое; можно выбрать своё.</p>';
            if (w.field) {
                html += '<div class="dfh-wz-chosen">' + (w.field.isNew ? 'Новое поле' : 'Своё поле') + ' «<b>' + esc(w.field.name) + '</b>»<small>' +
                    (w.field.isNew ? 'создадим' : esc(w.field.type === 'select' ? 'Список' : 'Переключатель')) + '</small><a href="#" data-lw="field-clear">изменить</a></div>';
                if (w.field.isNew) html += '<span class="dfh-wz-lbl">Тип нового поля</span><div class="dfh-wz-seg dfh-lw-type">' + [['radiobutton', 'Переключатель — 2–3 варианта'], ['select', 'Список — вариантов много']].map(function (type) {
                    return '<button type="button" data-lw="type" data-type="' + type[0] + '" class="v-none' + (w.type === type[0] ? ' on' : '') + '">' + type[1] + '</button>';
                }).join('') + '</div>';
            } else {
                html += '<div class="dfh-wz-cb"><input class="dfh-input" data-lw-input="q" maxlength="80" autocomplete="off" value="' + esc(w.q) + '" placeholder="Например «Тип клиента»">' +
                    (w.combo && (String(w.q).trim() || w.comboItems.length) ? '<div class="dfh-wz-dd">' +
                        (String(w.q).trim() ? '<button type="button" class="new" data-lw="field-new">+ Создать новое поле «' + esc(String(w.q).trim()) + '»<small>Переключатель или Список</small></button>' : '') +
                        (w.comboItems.length ? '<div class="cap">Или выбрать своё поле «Список» / «Переключатель»</div>' + w.comboItems.map(function (item) {
                            return '<button type="button" data-lw="field-pick" data-id="' + item.id + '">' + esc(item.label) + '<small>' + esc(item.typeName) + ' · ' + item.count + ' ' +
                                plural(item.count, 'вариант', 'варианта', 'вариантов') + '</small></button>';
                        }).join('') : '') + '</div>' : '') + '</div>';
            }
            if (w.existing.length) html += '<span class="dfh-wz-lbl">Уже есть — нажмите, чтобы изменить</span><div class="dfh-wz-ex">' + w.existing.map(function (item) {
                return '<button type="button" class="dfh-wz-exg' + (w.field && String(w.field.id) === String(item.id) ? ' on' : '') + '" data-lw="edit" data-id="' + item.id + '">' +
                    '<b style="background:#3f7fd8">@</b>' + esc(item.name) + '<small>' + esc(item.letters) + '</small></button>';
            }).join('') + '</div>';
            html += wzHand('Связанные группы задаются в вариантах поля «Переключатель» или «Список»: в начало названия варианта впишите ' + wzCode('[@Буква группы]') + ', например ' + wzCode('[@Ю] Юр. лицо') + '.');
        } else if (w.step === 1) {
            var isNew = w.field && w.field.isNew;
            html += '<h4>Какую группу показывает каждый вариант?</h4><p class="dfh-wz-hint">' + (isNew ? 'Впишите варианты поля и выберите группу для каждого. ' : 'Варианты — как в поле amoCRM, их не меняем. ') +
                'Вариант без группы ничего не показывает.</p>';
            if (!w.groups.length) html += '<p class="dfh-wz-warn">В этом разделе пока нет групп. Создайте их в «Группах полей» — они появятся здесь.</p>';
            html += '<div class="dfh-lw-head"><span>Вариант</span><span>Показывает группу</span><span></span></div><div class="dfh-wz-list">' + w.opts.map(function (opt) {
                return '<div class="dfh-lw-row">' + (opt.orig ? '<span class="dfh-lw-fixed">' + esc(opt.label) + '</span>'
                    : '<input class="dfh-input" data-lw-input="opt" data-index="' + opt.index + '" maxlength="80" value="' + esc(opt.label) + '" placeholder="Вариант">') +
                    '<select class="dfh-input' + (opt.g ? ' set' : '') + '" data-lw-change="group" data-index="' + opt.index + '"><option value="">— ничего не показывать —</option>' +
                    w.groups.map(function (group) { return '<option value="' + esc(group.letter) + '"' + (opt.g === group.letter ? ' selected' : '') + '>[' + esc(group.letter) + '] ' + esc(group.name) + '</option>'; }).join('') + '</select>' +
                    (opt.orig ? '<span></span>' : '<a href="#" data-lw="opt-del" data-index="' + opt.index + '" title="Убрать вариант" aria-label="Убрать вариант">×</a>') + '</div>';
            }).join('') + '</div>' +
                (isNew ? '<div class="dfh-wz-row"><input class="dfh-input" data-lw-input="new-opt" maxlength="80" value="' + esc(w.newOpt) + '" placeholder="Ещё вариант, например «ИП»">' +
                    '<button type="button" class="dfh-btn dfh-btn-light" data-lw="opt-add">+ Добавить вариант</button></div>' : '') +
                '<p class="dfh-wz-note">Нет нужной группы? <a href="#" data-go="group">Создайте её в «Группах полей»</a> — она появится в списке.</p>' +
                wzHand('В начало названия варианта впишите букву группы со знаком @: ' + wzCode('[@' + ((w.opts.filter(function (o) { return o.g; })[0] || {}).g || 'Ю') + '] ' +
                    ((w.opts.filter(function (o) { return o.g; })[0] || {}).label || 'Юр. лицо')) + '.');
        } else {
            var p = w.preview;
            html += '<h4>' + (w.edit ? 'Проверьте и сохраните' : 'Проверьте и создайте') + '</h4><div class="dfh-wz-rev">' + wzChanges(w.changes) +
                '<div class="dfh-wz-card"><h5>Так увидит менеджер — выберите вариант</h5><div class="dfh-lw-sw"><span>' + esc(w.field ? w.field.name : '') + '</span>' +
                (w.radio ? '<div class="dfh-rad">' + w.opts.map(function (opt) {
                    return '<b role="button" tabindex="0" data-lw="pv" data-index="' + opt.index + '"' + (p.index === opt.index ? ' class="on"' : '') + '>' + esc(opt.label || '…') + '</b>';
                }).join('') + '</div>' : '<select class="dfh-input" data-lw-change="pv"><option value="">Выбрать</option>' + w.opts.map(function (opt) {
                    return '<option value="' + opt.index + '"' + (p.index === opt.index ? ' selected' : '') + '>' + esc(opt.label || '…') + '</option>';
                }).join('') + '</select>') + '</div>' +
                (p.group ? '<div class="dfh-gw-box" style="--gc:' + gwColor(p.group.color) + '"><div class="dfh-gw-hd"><i>▾</i>' + esc(p.group.name) + '</div><div class="dfh-gw-ff">' +
                    (p.group.fields.length ? p.group.fields.map(function (name) { return '<div class="dfh-gw-f"><span>' + esc(name) + '</span><b>…</b></div>'; }).join('') : '<div class="dfh-gw-f"><span>В группе пока нет полей</span></div>') + '</div></div>'
                    : '<p class="dfh-lw-hidden">' + (p.index === null ? (p.hidden.length ? 'Группы ' + p.hidden.map(function (n) { return '«' + esc(n) + '»'; }).join(', ') + ' скрыты, пока не выбран вариант' : 'Выберите вариант') : 'Этот вариант не показывает группу') + '</p>') +
                '</div></div>' + (w.message ? '<p class="dfh-wz-warn" role="status">' + esc(w.message) + '</p>' : '') +
                wzHand('То же вручную: в вариантах поля «' + esc(w.field ? w.field.name : '') + '» — ' + w.opts.filter(function (o) { return o.g; }).map(function (o) { return wzCode('[@' + o.g + '] ' + o.label); }).join(', ') + '. Маркер менеджер не видит.');
        }
        html += '</div>' + wzFoot('lw', w, 'Дальше', w.edit ? 'Сохранить изменения' : 'Сохранить', w.step === 2 ? esc(w.applyNote) : '', 2) + '</div>';
        return html;
    }


    // «Расположение» (2.0.3): поля «Текстовая область» с текстом на всю ширину. Модель — viewView() в script.js.
    function viewWizard(w) {
        var st = wzState(w, 'vw');
        if (st) return st;
        if (w.status === 'done') return wzDone('Расположение сохранено', 'vw');
        var tags = { rm: '<span class="dfh-vw-st rm">уберём</span>', add: '<span class="dfh-vw-st add">добавим</span>', 'new': '<span class="dfh-vw-st add">создадим</span>' };
        var html = '<div class="dfh-wz"><div class="dfh-wz-body"><h4>Поля с текстом на всю ширину</h4>' +
            (w.rows.length ? '<div class="dfh-wz-list">' + w.rows.map(function (row) {
                return '<div class="dfh-vw-row' + (row.state === 'rm' ? ' rm' : '') + '"><span class="n">' + esc(row.label) + '</span><small>' + (row.state === 'new' ? 'новое поле · ' : '') + 'Текстовая область</small>' +
                    (tags[row.state] || '') +
                    (row.state === 'rm' ? '<a href="#" class="undo" data-vw="undo" data-id="' + row.id + '">вернуть</a>'
                        : row.state === 'add' ? '<a href="#" data-vw="unadd" data-id="' + row.id + '" title="Не добавлять" aria-label="Не добавлять">×</a>'
                        : row.state === 'new' ? '<a href="#" data-vw="uncreate" data-index="' + row.index + '" title="Не создавать" aria-label="Не создавать">×</a>'
                        : '<a href="#" data-vw="rm" data-id="' + row.id + '" title="Убрать" aria-label="Убрать">×</a>') + '</div>';
            }).join('') + '</div>' : '<p class="dfh-vw-empty">Пока ни одного поля. Добавьте поле «Текстовая область» — комментарий, адрес, условия.</p>') +
            (w.adding ? '<div class="dfh-wz-cb dfh-vw-cb"><input class="dfh-input" data-vw-input="q" maxlength="80" autocomplete="off" value="' + esc(w.q) + '" placeholder="Начните вводить, например «комментарий»">' +
                '<div class="dfh-wz-dd">' + (w.items.length ? '<div class="cap">Поля «Текстовая область»</div>' + w.items.map(function (item) {
                    return '<button type="button" data-vw="pick" data-id="' + item.id + '">' + esc(item.label) + '<small>Текстовая область</small></button>';
                }).join('') : '<div class="cap">Свободных полей «Текстовая область»' + (String(w.q).trim() ? ' с таким названием' : '') + ' нет</div>') +
                (String(w.q).trim() ? '<button type="button" class="new" data-vw="create">+ Создать новое поле «' + esc(String(w.q).trim()) + '»<small>Текстовая область</small></button>' : '') + '</div></div>'
                : '<button type="button" class="dfh-vw-add" data-vw="adding">+ Добавить поле</button>') +
            (w.message ? '<p class="dfh-wz-warn" role="status">' + esc(w.message) + '</p>' : '') +
            wzHand('В конец названия поля «Текстовая область» впишите ' + wzCode('{:col}') + ': ' + wzCode('Комментарий менеджера {:col}') + '. Другие типы полей (текст в одну строку, число, список) не меняются.') +
            '</div><div class="dfh-wz-foot"><span class="dfh-wz-sp">' + esc(w.applyNote) + '</span><button type="button" class="dfh-btn dfh-btn-primary dfh-wz-go" data-vw="apply"' + (w.canApply ? '' : ' disabled') + '>' +
            (w.status === 'applying' ? 'Сохраняем…' : 'Сохранить') + '</button></div>' +
            '</div>';
        return html;
    }


    // «Подсветка» (2.0.4): поля с цветной полосой, выбор цвета справа. Модель — hlView() в script.js. Ручной разметки здесь нет (Максим).
    function hlColor(n) { var c = COLORS.filter(function (x) { return x[0] === String(n); })[0]; return c || ['1', 'Красный', '#f37575', '']; }
    function hlWizard(w) {
        var st = wzState(w, 'hl');
        if (st) return st;
        if (w.status === 'done') return wzDone('Подсветка сохранена', 'hl');
        var tags = { rm: '<span class="dfh-vw-st rm">уберём</span>', ch: '<span class="dfh-vw-st ch">новый цвет</span>', add: '<span class="dfh-vw-st add">добавим</span>', 'new': '<span class="dfh-vw-st add">создадим</span>' };
        function picker(row) {
            var c = hlColor(row.color);
            return '<div class="dfh-hl-cp"><button type="button" data-hl="open" data-key="' + row.key + '"><i style="background:' + c[2] + '"></i>' + c[1] + '</button>' +
                (w.open === row.key ? '<div class="dfh-hl-dd">' + COLORS.map(function (color) {
                    return '<button type="button" data-hl="color" data-key="' + row.key + '" data-color="' + color[0] + '"' + (String(row.color) === color[0] ? ' class="on"' : '') + '>' +
                        '<i style="background:' + color[2] + '"></i><b>' + color[1] + '</b><small>' + color[3] + '</small></button>';
                }).join('') + '</div>' : '') + '</div>';
        }
        var html = '<div class="dfh-wz"><div class="dfh-wz-body"><h4>Поля с подсветкой</h4>' +
            (w.rows.length ? '<div class="dfh-wz-list">' + w.rows.map(function (row) {
                var rm = row.state === 'rm';
                return '<div class="dfh-hl-row' + (rm ? ' rm' : '') + '"><span class="bar" style="background:' + hlColor(row.color)[2] + '"></span>' +
                    '<span class="n">' + esc(row.label) + '<small>' + esc(row.typeName) + (row.group ? ' · в группе [' + esc(row.group) + ']' : '') + '</small></span>' + (tags[row.state] || '<span></span>') +
                    (rm ? '<span></span><a href="#" class="undo" data-hl="undo" data-id="' + row.id + '">вернуть</a>'
                        : picker(row) + (row.state === 'add' ? '<a href="#" data-hl="unadd" data-index="' + row.index + '" title="Не добавлять" aria-label="Не добавлять">×</a>'
                            : row.state === 'new' ? '<a href="#" data-hl="unnew" data-index="' + row.index + '" title="Не создавать" aria-label="Не создавать">×</a>'
                            : '<a href="#" data-hl="rm" data-id="' + row.id + '" title="Убрать подсветку" aria-label="Убрать подсветку">×</a>')) + '</div>';
            }).join('') + '</div>' : '<p class="dfh-vw-empty">Пока ни одного поля с подсветкой. Добавьте поле — например, бюджет или срок оплаты.</p>') +
            (w.adding ? '<div class="dfh-wz-cb dfh-vw-cb"><input class="dfh-input" data-hl-input="q" maxlength="80" autocomplete="off" value="' + esc(w.q) + '" placeholder="Начните вводить название поля">' +
                '<div class="dfh-wz-dd">' + (w.items.length ? w.items.map(function (item) {
                    return '<button type="button" data-hl="pick" data-id="' + item.id + '">' + esc(item.label) + '<small>' + esc(item.typeName) + '</small></button>';
                }).join('') : '<div class="cap">Полей' + (String(w.q).trim() ? ' с таким названием' : '') + ' нет</div>') +
                (String(w.q).trim() ? '<button type="button" class="new" data-hl="create">+ Создать новое поле «' + esc(String(w.q).trim()) + '»<small>Текст</small></button>' : '') + '</div></div>'
                : '<button type="button" class="dfh-vw-add" data-hl="adding">+ Добавить поле</button>') +
            (w.message ? '<p class="dfh-wz-warn" role="status">' + esc(w.message) + '</p>' : '') +
            wzHand('В начало названия поля впишите номер цвета: ' + wzCode('[/1/] Бюджет') + ' (1 красный, 2 зелёный, 3 синий, 4 жёлтый, 5 оранжевый, 6 фиолетовый, 7 серый, 8 салатовый). Если поле в группе — цвет внутри её блока: ' + wzCode('[Д /5/] Дата доставки') + '.') +
            '</div><div class="dfh-wz-foot"><span class="dfh-wz-sp">' + esc(w.applyNote) + '</span><button type="button" class="dfh-btn dfh-btn-primary dfh-wz-go" data-hl="apply"' + (w.canApply ? '' : ' disabled') + '>' +
            (w.status === 'applying' ? 'Сохраняем…' : 'Сохранить') + '</button></div></div>';
        return html;
    }


    // «Подсказки» (2.0.5): поле, ниже текст и справа вид подсказки. Модель — tipsView() в script.js.
    var TP_KINDS = [['hover', 'При наведении'], ['red', 'Красная подпись'], ['green', 'Зелёная подпись']];
    function tipsWizard(w) {
        var st = wzState(w, 'tp');
        if (st) return st;
        if (w.status === 'done') return wzDone('Подсказки сохранены', 'tp');
        var tags = { rm: '<span class="dfh-vw-st rm">уберём</span>', ch: '<span class="dfh-vw-st ch">изменим</span>', add: '<span class="dfh-vw-st add">добавим</span>', 'new': '<span class="dfh-vw-st add">создадим</span>' };
        var html = '<div class="dfh-wz"><div class="dfh-wz-body"><h4>Поля с подсказками</h4>' +
            (w.rows.length ? '<div class="dfh-wz-list">' + w.rows.map(function (row) {
                var rm = row.state === 'rm';
                return '<div class="dfh-tpw-row' + (rm ? ' rm' : '') + '"><div class="top"><span class="n">' + esc(row.label) + '</span><small>' + esc(row.typeName) + '</small>' + (tags[row.state] || '<span class="sp"></span>') +
                    (rm ? '<a href="#" class="undo" data-tp="undo" data-index="' + row.index + '">вернуть</a>' : '<a href="#" data-tp="rm" data-index="' + row.index + '" title="Убрать подсказку" aria-label="Убрать подсказку">×</a>') + '</div>' +
                    (rm ? '' : '<div class="ed"><input class="dfh-input" data-tp-input="text" data-index="' + row.index + '" maxlength="200" value="' + esc(row.text) + '" placeholder="Текст подсказки">' +
                        '<select class="dfh-input k-' + row.kind + '" data-tp-change="kind" data-index="' + row.index + '" aria-label="Вид подсказки">' + TP_KINDS.map(function (kind) {
                            return '<option value="' + kind[0] + '"' + (row.kind === kind[0] ? ' selected' : '') + '>' + kind[1] + '</option>';
                        }).join('') + '</select></div>') + '</div>';
            }).join('') + '</div>' : '<p class="dfh-vw-empty">Пока ни одной подсказки. Добавьте — например, к ИНН или телефону.</p>') +
            (w.adding ? '<div class="dfh-wz-cb dfh-vw-cb"><input class="dfh-input" data-tp-input="q" maxlength="80" autocomplete="off" value="' + esc(w.q) + '" placeholder="Начните вводить название поля">' +
                '<div class="dfh-wz-dd">' + (w.items.length ? w.items.map(function (item) {
                    return '<button type="button" data-tp="pick" data-id="' + item.id + '">' + esc(item.label) + '<small>' + esc(item.typeName) + '</small></button>';
                }).join('') : '<div class="cap">Полей' + (String(w.q).trim() ? ' с таким названием' : '') + ' нет</div>') +
                (String(w.q).trim() ? '<button type="button" class="new" data-tp="create">+ Создать новое поле «' + esc(String(w.q).trim()) + '»<small>Текст</small></button>' : '') + '</div></div>'
                : '<button type="button" class="dfh-vw-add" data-tp="adding">+ Добавить подсказку</button>') +
            (w.message ? '<p class="dfh-wz-warn" role="status">' + esc(w.message) + '</p>' : '') +
            wzHand('В конец названия поля: ' + wzCode('{::Текст}') + ' — при наведении, ' + wzCode('{:1= Текст}') + ' — красная подпись, ' + wzCode('{:2= Текст}') + ' — зелёная. Например: ' + wzCode('ИНН {::Без пробелов, 10 или 12 цифр}') + '.') +
            '</div><div class="dfh-wz-foot"><span class="dfh-wz-sp">' + esc(w.applyNote) + '</span><button type="button" class="dfh-btn dfh-btn-primary dfh-wz-go" data-tp="apply"' + (w.canApply ? '' : ' disabled') + '>' +
            (w.status === 'applying' ? 'Сохраняем…' : 'Сохранить') + '</button></div></div>';
        return html;
    }

    function plural(n, one, few, many) {
        var a = n % 10, b = n % 100;
        return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
    }

    var BUILD = {
        guide: function () {
            return intro('Как настроить за 7 минут', 'Маркер в названии поля говорит виджету, что сделать с полем в карточке. Посмотрите видео или начните по шагам.') +
                '<button type="button" class="dfh-video" data-video="guide" aria-label="Смотреть видеоинструкцию"><i></i><small>Видео · запускается по нажатию</small></button>' +
                block('Быстрый старт', '<ol class="dfh-steps">' +
                    '<li><span>1</span>Нажмите «Настроить» у полей карточки и кликните в название поля</li>' +
                    '<li><span>2</span>Выберите раздел слева и нажмите «Вставить» у нужного маркера</li>' +
                    '<li><span>3</span>Сохраните поле — в карточке маркер не виден, поле оформлено</li></ol>');
        },
        group: function (ctx) {
            if (!ctx.gwizard || !ctx.gwizard.manual) {
                return intro('Группы полей', 'Соберите связанные поля под одним заголовком — маркеры виджет поставит сам.') +
                    '<div class="dfh-gw-wrap">' + groupWizard(ctx.gwizard || { status: 'loading' }) + '</div>';
            }
            var G = ctx.letter;
            var name = groupName(G);
            return intro('Группы полей', 'Ручная разметка: кликните в нужное поле в amoCRM и нажмите «Вставить».') +
                '<p class="dfh-more"><a href="#" data-gw="auto">← Вернуться к мастеру группы</a></p>' +
                presets(G) +
                step(1, 'Заголовок группы', 'Кликните в поле, которое станет заголовком «' + name + '», и выберите, как группа выглядит',
                    '<div class="dfh-modes">' + MODES.map(function (mode) {
                        return '<button type="button" class="dfh-mode"' + insertAttrs('group', '[' + G + mode[0] + '] ') + '><code>[' + G + mode[0] + ']</code>' +
                            '<span>' + mode[1] + '<small>' + mode[2] + '</small></span><i>Вставить</i></button>';
                    }).join('') + '</div>') +
                step(2, 'Поля этой группы', 'Кликните в каждое поле, которое должно попасть в «' + name + '»',
                    '<div class="dfh-one"><code>[' + G + ']</code><div><b>Поле группы «' + esc(name) + '»</b>Поле переедет под заголовок</div>' +
                    '<button type="button" class="dfh-btn dfh-btn-primary"' + insertAttrs('group', '[' + G + '] ') + '>Вставить</button></div>');
        },
        switch: function (ctx) {
            if (!ctx.lwizard || !ctx.lwizard.manual) {
                return intro('Связанные группы', 'Группа появляется в карточке, только когда менеджер выбрал нужный вариант.') +
                    switchExample(ctx.exampleOpen) +
                    '<div class="dfh-lw-wrap">' + linkedWizard(ctx.lwizard || { status: 'loading' }) + '</div>';
            }
            return intro('Связанные группы', 'Ручная разметка: создайте поле «Список» или «Переключатель» и в его вариантах выберите ваши группы.') +
                '<p class="dfh-more"><a href="#" data-lw="auto">← Вернуться к мастеру</a></p>' +
                switchExample(ctx.exampleOpen) +
                '<div class="dfh-own-wrap">' + ownGroups(ctx.groups) + '</div>';
        },
        checklist: function (ctx) {
            if (!ctx.wizard || !ctx.wizard.manual) {
                return intro('Чек-листы', 'Менеджер увидит прогресс: что выяснено, что нет и где блокер. Впишите вопросы и ответы — поля и маркеры виджет создаст сам.') +
                    checklistExample(ctx.exampleOpen) +
                    '<div class="dfh-wz-wrap">' + checklistWizard(ctx.wizard || { status: 'loading' }) + '</div>';
            }
            var G = ctx.letter;
            var name = groupName(G);
            return intro('Чек-листы', 'Ручная разметка: кликните в нужное поле в amoCRM и нажмите «Вставить».') +
                '<p class="dfh-more"><a href="#" data-wz="auto">← Вернуться к мастеру чек-листа</a></p>' +
                presets(G) +
                step(1, 'Заголовок чек-листа', 'Кликните в название поля, которое станет заголовком',
                    row('[' + G + '4] … {:checklist}', 'Новый чек-лист «' + name + '»', 'Заголовок группы с процентом выполнения', 'checklist-group', '[' + G + '4] ') +
                    row('{:checklist}', 'Группа уже есть', 'Превратить готовую группу в чек-лист — маркер встанет в конец названия', 'checklist-suffix', '{:checklist}')) +
                step(2, 'Пункты чек-листа', 'Кликните в название поля «Список» или «Переключатель» — каждое такое поле станет пунктом',
                    row('[' + G + ']', 'Пункт чек-листа', 'Поле переедет под заголовок «' + name + '»', 'group', '[' + G + '] ')) +
                step(3, 'Ответы в каждом пункте', 'Кликните в название варианта ответа и отметьте, что он значит',
                    row('[+]', 'Выполнено', 'Ответ «Да» — пункт закрыт, прогресс растёт', 'checklist-option', '[+] ') +
                    row('[-]', 'Блокер', 'Ответ «Нет» — чек-лист краснеет, менеджер видит совет', 'checklist-option', '[-] ')) +
                step(0, 'Дополнительно', 'По желанию: совет менеджеру и короткая метка пункта',
                    '<div class="dfh-form-row"><label><span>Совет при блокере — в вариант с [-]</span>' +
                        '<input class="dfh-input" data-field="advice" maxlength="200" autocomplete="off" placeholder="Например: попросите встречу с ЛПР"></label>' +
                        '<button type="button" class="dfh-btn dfh-btn-light" data-act="advice">Вставить</button></div>' +
                    '<div class="dfh-form-row"><label><span>Короткая метка пункта — в название поля</span>' +
                        '<input class="dfh-input" data-field="tag" maxlength="12" autocomplete="off" placeholder="Например: ЛПР"></label>' +
                        '<button type="button" class="dfh-btn dfh-btn-light" data-act="tag">Вставить</button></div>');
        },
        highlight: function (ctx) {
            return intro('Подсветка', 'Цветная полоса у поля — менеджер сразу видит главное.') +
                highlightExample(ctx.exampleOpen) +
                '<div class="dfh-hl-wrap">' + hlWizard(ctx.hwizard || { status: 'loading' }) + '</div>';
        },
        view: function (ctx) {
            if (!ctx.vwizard || !ctx.vwizard.manual) {
                return intro('Расположение', 'Для длинного текста — комментариев, адресов, условий: название сверху, текст на всю ширину карточки.') +
                    viewExample(ctx.exampleOpen) +
                    '<div class="dfh-vw-wrap">' + viewWizard(ctx.vwizard || { status: 'loading' }) + '</div>';
            }
            return '<p class="dfh-more"><a href="#" data-vw="auto">← Вернуться к списку полей</a></p>' + intro('Расположение', 'Для длинного текста — комментариев, адресов, условий. Обычно amoCRM ставит название слева, а текст зажимает в узкую колонку справа. ' +
                    'С маркером «Название сверху» текст займёт всю ширину карточки и будет читаться целиком.') +
                viewExample(ctx.exampleOpen) +
                step(0, 'Поле «Текстовая область»', 'Кликните в название такого поля в amoCRM и нажмите «Вставить»',
                    row('{:col}', 'Название сверху, текст снизу', 'Маркер встанет в конец названия', 'textarea-column', '{:col}') +
                    '<p class="dfh-more">Другие типы полей (текст в одну строку, число, список) не меняются.</p>');
        },
        tips: function (ctx) {
            return intro('Подсказки', 'Объясните менеджеру прямо в карточке, что писать в поле. Подсказка при наведении появляется, когда менеджер наводит на название поля или на «i» у группы. ' +
                    'Подпись видна под полем всегда: красная — для важного, зелёная — для пояснений.') +
                tipsExample(ctx.exampleOpen) +
                '<div class="dfh-tp-wrap">' + tipsWizard(ctx.twizard || { status: 'loading' }) + '</div>';
        },
        templates: function (ctx) {
            return intro('Шаблоны', 'Готовые наборы полей, сгруппированные по задачам. Откройте шаблон, посмотрите, что он делает, и создайте поля в amoCRM одной кнопкой.') +
                TEMPLATE_GROUPS.map(function (group) {
                    return '<div class="dfh-tg"><div class="dfh-tg-h"><b>' + esc(group.name) + '</b><small>' + esc(group.hint) + '</small></div><div class="dfh-tg-list">' +
                        group.items.map(function (item) {
                            return '<div class="dfh-tcard"><div><b>' + esc(item.name) + '</b><small>' + esc(item.author) + '</small><p>' + esc(item.short) + '</p></div>' +
                                '<div class="dfh-tcard-foot"><span>' + esc(item.size) + '</span><button type="button" class="dfh-btn dfh-btn-ghost" data-tpl="' + item.id + '">Посмотреть</button></div></div>';
                        }).join('') + '</div></div>';
                }).join('') +
                '<p class="dfh-more">Новые шаблоны будут появляться в своих группах.</p>' +
                '<div class="dfh-tpl-own"><div><b>Нужен шаблон под вашу задачу?</b><p>Напишите нам, как у вас устроена продажа и что менеджер должен видеть в карточке. Подготовим шаблон под ваш бизнес.</p></div>' +
                '<div class="dfh-tpl-own-btns">' + messengerButtons(ctx.contacts) + '</div></div>';
        }
    };

    function messengerButtons(contacts) {
        return ((contacts && contacts.messengers) || []).map(function (item) {
            return '<a class="dfh-btn dfh-btn-ghost" href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer">' + esc(item.name) + '</a>';
        }).join('');
    }

    function shell(ctx) {
        return '<header class="dfh-head">' +
                '<a class="dfh-brand" href="' + esc(ctx.contacts.site) + '" target="_blank" rel="noopener noreferrer" aria-label="Ракурс — rkrs.ru">' + LOGO + '</a>' +
                '<div class="dfh-head-text"><h2>Динамические поля</h2>' + (ctx.version ? '<p>Версия ' + esc(ctx.version) + '</p>' : '') + '</div>' +
                '<span class="dfh-test-slot"></span>' +
                '<span class="dfh-drag" aria-hidden="true">⠿ перетащить</span>' +
                '<button type="button" class="dfh-x" data-act="close" aria-label="Закрыть">×</button>' +
            '</header>' +
            '<div class="dfh-alert" hidden></div>' +
            '<div class="dfh-body">' +
                '<nav class="dfh-nav" aria-label="Разделы справочника"></nav>' +
                '<div class="dfh-main">' +
                    '<div class="dfh-target">' +
                        '<div class="dfh-target-lbl">Куда вставляем <em></em></div>' +
                        '<div class="dfh-target-box"><textarea class="dfh-target-editor" rows="1" readonly spellcheck="false" aria-label="Название выбранного поля или варианта"></textarea>' +
                        '<button type="button" class="dfh-target-clear" hidden title="Убрать маркеры из названия" aria-label="Убрать маркеры из названия">×</button></div>' +
                    '</div>' +
                    '<div class="dfh-content"></div>' +
                '</div>' +
            '</div>' +
            '<footer class="dfh-foot"><button type="button" class="dfh-btn dfh-btn-reset" data-act="reset" title="Убрать маркеры виджета из названий полей">Сбросить</button>' +
                '<span class="dfh-state" role="status"></span>' +
                '<button type="button" class="dfh-btn dfh-btn-ghost" data-act="close">Закрыть</button></footer>' +
            '<div class="dfh-modal" hidden></div>';
    }

    function nav(ctx) {
        var date = esc(ctx.date);
        if (ctx.client) return SECTIONS.map(function (section) {
            return '<button type="button" class="dfh-nav-item" data-id="' + section.id + '" aria-current="' + (section.id === ctx.section) + '">' +
                '<span class="dfh-nav-title">' + esc(section.title) + '</span><span class="dfh-nav-hint">' + esc(section.hint) + '</span></button>';
        }).join('');
        var sub = ctx.access === 'active'
            ? '<div class="dfh-sub"><span class="dfh-sub-lbl">Продлён до</span><b class="dfh-sub-date">' + (date || '—') + '</b>' +
                '<a class="dfh-btn dfh-btn-primary" href="' + esc(ctx.contacts.pay) + '" target="_blank" rel="noopener noreferrer">Продлить</a></div>'
            : ctx.access === 'expired'
                ? '<div class="dfh-sub bad"><span class="dfh-sub-lbl">Доступ закончился</span><b class="dfh-sub-date">' + (date || '—') + '</b>' +
                    '<a class="dfh-btn dfh-btn-primary" href="' + esc(ctx.contacts.pay) + '" target="_blank" rel="noopener noreferrer">Продлить</a>' +
                    '<a class="dfh-sub-link" href="#" data-act="contact">Связаться с нами</a></div>'
                : '<div class="dfh-sub bad"><span class="dfh-sub-lbl">Нет доступа</span><b class="dfh-sub-date">Нужна переустановка</b>' +
                    '<a class="dfh-btn dfh-btn-primary" href="' + esc(ctx.contacts.reinstall) + '" target="_blank" rel="noopener noreferrer">Восстановить виджет</a></div>';
        return SECTIONS.map(function (section) {
            return '<button type="button" class="dfh-nav-item" data-id="' + section.id + '" aria-current="' + (section.id === ctx.section) + '">' +
                '<span class="dfh-nav-title">' + section.title + '</span><span class="dfh-nav-hint">' + section.hint + '</span></button>';
        }).join('') + sub;
    }

    // Красная полоса под шапкой: пустая строка — доступ в порядке, полосу прячем.
    function alert(ctx) {
        if (ctx.access === 'expired') {
            return '<div class="dfh-alert-text"><b>Доступ закончился' + (ctx.date ? ' ' + esc(ctx.date) : '') + ' — динамические поля выключены</b>' +
                '<span>Маркеры можно размечать и сейчас: в карточках они заработают сразу после продления.</span></div>' +
                '<a class="dfh-btn dfh-btn-ghost" href="#" data-act="contact">Связаться с нами</a>' +
                '<a class="dfh-btn dfh-btn-primary" href="' + esc(ctx.contacts.pay) + '" target="_blank" rel="noopener noreferrer">Продлить</a>';
        }
        if (ctx.access === 'error') {
            return '<div class="dfh-alert-text"><b>Нет доступа — требуется переустановка виджета</b>' +
                '<span>Сервер Ракурса не подтвердил доступ. Нажмите «Восстановить виджет» и переустановите его.</span></div>' +
                '<a class="dfh-btn dfh-btn-primary" href="' + esc(ctx.contacts.reinstall) + '" target="_blank" rel="noopener noreferrer">Восстановить виджет</a>';
        }
        return '';
    }

    function content(ctx) {
        return (BUILD[ctx.section] || BUILD.group)(ctx);
    }

    // Кнопка создания полей и её состояние: перерисовывается отдельно, чтобы видео в окне шаблона не перезапускалось.
    function templateAction(ctx) {
        var run = ctx.run || {};
        var where = ENTITY_WHERE[ctx.entity] || '';
        var busy = run.status === 'loading';
        var done = run.status === 'complete';
        var note = ctx.access !== 'active' ? 'Создать поля можно после продления доступа.'
            : !ctx.entity ? 'Откройте карточку сделки, контакта, компании или покупателя.'
            : !ctx.admin ? 'Создавать поля может только администратор amoCRM.'
            : 'Создаёт администратор amoCRM. Уже созданные поля не дублируются, ответы в карточках не заполняются.';
        var disabled = ctx.access !== 'active' || !ctx.entity || !ctx.admin || busy || done;
        return '<button type="button" class="dfh-btn dfh-btn-primary" data-act="tpl-go"' + (disabled ? ' disabled' : '') + '>' +
                (busy ? 'Создаём…' : done ? 'Поля созданы' : 'Создать 6 полей' + (where ? ' ' + where : '')) + '</button>' +
            (done ? '<button type="button" class="dfh-btn dfh-btn-ghost" data-act="reload">Обновить страницу</button>' : '') +
            '<span class="dfh-tpl-msg' + (run.status === 'error' ? ' bad' : done ? ' ok' : '') + '" role="status">' + esc(run.message || note) + '</span>';
    }

    function templateDialog(ctx) {
        var fields = ctx.fields || [];
        var demo = ['ok', 'ok', 'ok', 'bad', 'none'];
        var done = demo.filter(function (value) { return value === 'ok'; }).length;
        var blocker = fields[demo.indexOf('bad')];
        return '<div class="dfh-dlg dfh-tpl-dlg" role="dialog" aria-modal="true" aria-label="Шаблон «Формула сделки»">' +
            '<div class="dfh-tpl-dlg-head"><div><small>Успех сделки</small><h3>Формула сделки</h3><p>Чек-лист из 5 условий закрытия сделки · ' + esc(ctx.method).toLowerCase().replace('олега шевелёва', 'Олега Шевелёва') + '</p></div>' +
                '<button type="button" class="dfh-x dfh-tpl-x" data-act="modal-close" aria-label="Закрыть">×</button></div>' +
            '<div class="dfh-tpl-dlg-body"><div class="dfh-tpl">' +
                '<div class="dfh-tpl-video-wrap"><button type="button" class="dfh-tpl-video" data-video="formula" aria-label="Смотреть видео о методике"><i></i>' +
                    '<span><b>Видео о методике</b><small>YouTube · Олег Шевелёв · 56 секунд</small></span></button></div>' +
                '<p class="dfh-more"><a href="' + esc(ctx.methodUrl) + '" target="_blank" rel="noopener noreferrer">Открыть видео на YouTube</a></p>' +
                '<p class="dfh-tpl-what">Сделка закрывается, когда совпали все 5 условий: клиент может заплатить, хочет такое решение, доверяет вам, решение принимает он сам и готов решать сейчас. ' +
                    'Менеджер видит, какого условия не хватает. Ответ «Нет» по любому из них останавливает сделку, и виджет подсказывает, что делать дальше.</p>' +
                '<div class="dfh-tpl-act">' + templateAction(ctx) + '</div>' +
            '</div>' +
            '<div class="dfh-tpl-pic"><div class="dfh-anim-cap">Так это будет выглядеть в карточке</div><div class="dfh-anim-card">' +
                '<div class="dfh-ck-h bad"><span>▾ Формула сделки <i class="dfh-tpl-i">i</i></span><b>' + done * 20 + '%</b></div>' +
                '<div class="dfh-ck-bar dfh-ck-bar-5">' + demo.map(function (value) { return '<i class="' + (value === 'none' ? '' : value) + '"></i>'; }).join('') + '</div>' +
                fields.map(function (field, index) {
                    return '<div class="dfh-ck-item"><span>' + esc(field.name) + ' <em class="dfh-tpl-tag">' + esc(field.tag) + '</em></span><div class="dfh-rad">' +
                        [['ok', 'Да'], ['none', 'Не выяснено'], ['bad', 'Нет']].map(function (option) {
                            return '<b data-v="' + option[0] + '"' + (demo[index] === option[0] ? ' class="on"' : '') + '>' + option[1] + '</b>';
                        }).join('') + '</div></div>';
                }).join('') +
                (blocker ? '<div class="dfh-ck-tip">' + esc(blocker.tag) + ': ' + esc(blocker.negativeAdvice) + '</div>' : '') +
            '</div></div>' +
            block('Что будет создано — 6 полей',
                '<div class="dfh-tpl-f"><span class="dfh-tpl-n">1</span><div><b>Формула сделки</b><small>Заголовок группы · Текст · превращается в чек-лист, у названия — значок «i» с подписью о методике</small></div></div>' +
                fields.map(function (field, index) {
                    return '<div class="dfh-tpl-f"><span class="dfh-tpl-n">' + (index + 2) + '</span><div><b>' + esc(field.name) + ' <em class="dfh-tpl-tag">' + esc(field.tag) + '</em></b>' +
                        '<small>Переключатель · ' + esc(field.meaning) + '</small>' +
                        '<div class="dfh-vars"><span class="dfh-v-ok">' + esc(field.options[0]) + '</span><span>' + esc(field.options[1]) + '</span><span class="dfh-v-bad">' + esc(field.options[2]) + '</span></div>' +
                        '<small class="dfh-tpl-adv">Совет при «Нет»: ' + esc(field.negativeAdvice) + '</small></div></div>';
                }).join('')) +
            '</div></div>';
    }

    function contactDialog(ctx) {
        var c = ctx.contacts;
        return '<div class="dfh-dlg" role="dialog" aria-modal="true" aria-label="Связаться с Ракурсом">' +
            '<div class="dfh-dlg-head"><h3>Связаться с нами</h3><p>Напишите в удобный мессенджер — ответим и поможем с доступом и настройкой.</p></div>' +
            '<div class="dfh-dlg-body"><div class="dfh-tpl-own-btns">' + messengerButtons(c) + '</div>' +
                '<p class="dfh-more">Телефон: <a href="tel:' + esc(c.phoneHref) + '">' + esc(c.phone) + '</a> · Почта: <a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a></p></div>' +
            '<div class="dfh-dlg-foot"><button type="button" class="dfh-btn dfh-btn-ghost" data-act="modal-close">Закрыть</button></div></div>';
    }

    // Окно «Сбросить»: поиск → подтверждение → прогресс → готово (1.0.136, по макету dynamic-fields-amo-style).
    function resetDialog(r) {
        var head, body, foot;
        var close = '<button type="button" class="dfh-btn dfh-btn-ghost" data-act="modal-close">';
        if (r.status === 'scan') {
            head = '<h3>Ищем маркеры…</h3><p>Смотрим названия полей и вариантов списков в сделках, контактах, компаниях и покупателях.</p>';
            body = '<div class="dfh-rs-bar is-busy"><i></i></div>';
            foot = close + 'Отмена</button>';
        } else if (r.status === 'run') {
            head = '<h3>' + (r.mode === 'restore' ? 'Возвращаем маркеры…' : 'Очищаем названия…') + '</h3>';
            body = '<p class="dfh-rs-p"><b class="dfh-rs-n">' + r.done + '</b> из ' + r.total + '</p>' +
                '<div class="dfh-rs-bar"><i style="width:' + Math.round(r.done / Math.max(1, r.total) * 100) + '%"></i></div>' +
                '<p class="dfh-rs-small">Не закрывайте страницу. Запросы идут по очереди, чтобы amoCRM не заблокировала виджет.</p>';
            foot = '';
        } else if (r.status === 'done') {
            var ok = r.total - r.failed;
            head = r.failed && !ok
                ? '<h3>Не получилось</h3><p>' + esc(r.message || 'amoCRM не приняла изменения. Попробуйте ещё раз или напишите нам.') + '</p>'
                : '<h3>Готово</h3><p>' + (r.mode === 'restore' ? 'Маркеры возвращены в ' : 'Маркеры убраны из ') + ok + ' назв.' +
                    (r.failed ? ' Не получилось: ' + r.failed + '. ' + esc(r.message || '') : '') + ' Обновите страницу, чтобы увидеть результат.</p>';
            body = r.mode === 'restore' || !ok ? '' : '<div class="dfh-rs-note">Прежние названия сохранены в этом браузере. Передумали — «Сбросить» → «Вернуть маркеры».</div>';
            foot = close + 'Закрыть</button>' + (ok ? '<button type="button" class="dfh-btn dfh-btn-primary" data-act="reload">Обновить страницу</button>' : '');
        } else {
            var count = r.chosen.length;
            head = '<h3>Убрать маркеры из названий полей?</h3><p>Виджет уберёт свои маркеры — [В1], [/1/], [@С], {::…} и другие — из названий полей и вариантов списков. Сами поля и данные в них не меняются.</p>';
            body = '<div class="dfh-rs-checks">' + r.entities.map(function (entity) {
                    return '<label' + (entity.failed || !entity.count ? ' class="is-off"' : '') + '><input type="checkbox" data-entity="' + entity.key + '"' +
                        (entity.checked ? ' checked' : '') + (entity.failed || !entity.count ? ' disabled' : '') + '>' + entity.title +
                        '<em>' + (entity.failed ? 'нет доступа' : entity.count) + '</em></label>';
                }).join('') + '</div>' +
                (count
                    ? '<ul class="dfh-rs-list">' + r.chosen.slice(0, 5).map(function (item) {
                            return '<li><s>' + esc(item.oldName) + '</s> → <b>' + esc(item.name) + '</b>' + (item.enums ? ' <span>+ варианты</span>' : '') + '</li>';
                        }).join('') + (count > 5 ? '<li class="more">и ещё ' + (count - 5) + '…</li>' : '') + '</ul>' +
                        '<div class="dfh-rs-warn">После очистки группы, подсветка, чек-листы и подсказки в карточках пропадут — поля станут как в обычной amoCRM. Прежние названия сохраним в этом браузере: вернуть их можно кнопкой «Вернуть маркеры».</div>'
                    : '<div class="dfh-rs-note">Маркеров в названиях полей не нашли.</div>');
            foot = close + 'Отмена</button>' +
                (r.backup ? '<button type="button" class="dfh-btn dfh-btn-ghost" data-act="reset-back">Вернуть маркеры (' + r.backup.items.length + ')</button>' : '') +
                (count ? '<button type="button" class="dfh-btn dfh-btn-danger" data-act="reset-go">Убрать маркеры (' + count + ')</button>' : '');
        }
        return '<div class="dfh-dlg dfh-rs" role="dialog" aria-modal="true" aria-label="Сбросить маркеры">' +
            '<div class="dfh-dlg-head">' + head + '</div>' +
            (body ? '<div class="dfh-dlg-body">' + body + '</div>' : '') +
            (foot ? '<div class="dfh-dlg-foot">' + foot + '</div>' : '') + '</div>';
    }

    return {
        sections: SECTIONS,
        resetDialog: resetDialog,
        noTarget: NO_TARGET,
        esc: esc,
        ownGroups: ownGroups,
        checklistWizard: checklistWizard,
        groupWizard: groupWizard,
        linkedWizard: linkedWizard,
        viewWizard: viewWizard,
        hlWizard: hlWizard,
        tipsWizard: tipsWizard,
        shell: shell,
        nav: nav,
        alert: alert,
        content: content,
        templateAction: templateAction,
        templateDialog: templateDialog,
        contactDialog: contactDialog
    };
});
