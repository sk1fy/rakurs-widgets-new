// «Пульс аккаунта» — раз в день сообщает ssd.rkrs.ru, что виджет стоит и жив (как account.js в «Динамических полях»).
// Данные и формат отправки — те же, что у прежнего account.js «Удобных полей» 6.0.39 (сервер их уже принимает),
// отличия (26.11.2026): запросы к amoCRM — через ограничитель lib/app/api.js (правило 25.11.2026),
// пользователи — все страницы /api/v4/users (раньше только первая, и у аккаунтов больше 50 человек счёт был занижен),
// ошибки не роняют виджет.
(function (root, factory) {
    if (typeof define === 'function' && define.amd) define([], factory);
    else if (typeof module === 'object' && module.exports) module.exports = factory();
})(this, function () {
    'use strict';

    var SERVER = 'https://ssd.rkrs.ru/api/widget/account/update';
    var MAX_PAGES = 40;

    // Отправляли сегодня? Сервер в ответ отдаёт { day: <число месяца> }, он и лежит в localStorage (как в 6.0.39).
    function sentToday(stored, today) {
        if (!stored) return false;
        try {
            var day = parseInt(JSON.parse(stored).day, 10);
            return day === today;
        } catch (e) {
            return false;
        }
    }

    function baseData(account, user) {
        account = account || {};
        user = user || {};
        return {
            amo_account_id: account.id,
            amo_user_id: user.id,
            amo_user_phone: user.personal_mobile,
            amo_user_name: user.name,
            amo_subdomain: account.subdomain,
            amo_login: user.login,
            amo_account_name: account.name,
            amo_currency: account.currency,
            amo_users_cnt: 0,
            amo_timezone: account.timezone,
            amo_language: account.language,
            amo_paid_from: account.paid_from,
            amo_paid_till: account.paid_till,
            amo_tariff_name: account.tariffName,
            app_name: null,
            phone: null
        };
    }

    function embedded(res, keys) {
        var e = res && res._embedded;
        if (!e) return [];
        for (var i = 0; i < keys.length; i++) if (Array.isArray(e[keys[i]])) return e[keys[i]];
        return [];
    }

    function nextHref(res) {
        return res && res._links && res._links.next && res._links.next.href || null;
    }

    // Все страницы списка — по одной через ограничитель.
    async function allPages(api, url, keys) {
        var list = [];
        for (var page = 0; url && page < MAX_PAGES; page++) {
            var res = await api.get(url);
            list.push.apply(list, embedded(res, keys));
            url = nextHref(res);
        }
        return list;
    }

    function createPulse(o) {
        var storageKey = o.appName;

        async function send() {
            var s = o.settings || {};
            var data = baseData(o.account, o.user);
            data.installer_role = s.role || 'нет';
            data.installer_name = s.name || 'нет';
            data.phone = s.phone || 'нет';
            data.noCall = s.noCall || 'false';
            data.countryName = s.countryName || 'Россия';
            data.widget_data = o.widgetData;
            data.app_name = o.appName;

            var widgets = await allPages(o.api, '/api/v2/widgets', ['widgets', 'items']);
            data.amo_users_widgets = widgets.filter(function (w) { return w.active === 1; }).map(function (w) {
                return { widget_code: w.widget_code, widget_id: w.widget_id };
            });

            var users = await allPages(o.api, '/api/v4/users?limit=250', ['users']);
            data.amo_users_cnt = 0;
            data.amo_users_list = users.map(function (u) {
                var rights = u.rights || {};
                if (rights.is_active) data.amo_users_cnt += 1;
                return { email: u.email, id: u.id, name: u.name, is_admin: Number(rights.is_admin), is_active: Number(rights.is_active) };
            });

            var answer = await o.post(SERVER, data);
            if (answer) o.storage.set(storageKey, JSON.stringify(answer));
            return data;
        }

        return {
            // Раз в день с браузера; при ошибке тихо выходим — завтра (или при следующем открытии) попробуем снова.
            run: function () {
                if (sentToday(o.storage.get(storageKey), o.today())) return Promise.resolve(null);
                return send().catch(function () { return null; });
            },
            send: send
        };
    }

    return { createPulse: createPulse, sentToday: sentToday, SERVER: SERVER };
});
