define([], function () {
    'use strict';

    const path = '/api/v1/widget/account-license';
    const refreshInterval = 15 * 60 * 1000;
    const retryInterval = 15 * 1000;
    // The final attempt leaves room for the OAuth token fence and CRM clock skew.
    const retryDelays = [retryInterval, 110 * 1000];
    const maxTrialEnd = 253402300799;
    const observations = new Map();
    const retries = new WeakSet();

    function positiveInteger(value, max = Number.MAX_SAFE_INTEGER) {
        if (typeof value === 'string' && /^\d+$/.test(value.trim())) value = Number(value);
        return Number.isSafeInteger(value) && value > 0 && value <= max ? value : undefined;
    }

    function accountLicense() {
        const crm = typeof APP !== 'undefined' ? APP : AMOCRM;
        const account = crm.constant('account');
        const tariffId = positiveInteger(account?.tariffId);
        const trialEnd = positiveInteger(account?.trial_end, maxTrialEnd);
        const payType = typeof account?.pay_type === 'string' ? account.pay_type.trim() : '';
        return {
            tariff_id: tariffId,
            pay_type: payType && payType.length <= 64 && !/\p{Cc}/u.test(payType) &&
                new TextEncoder().encode(payType).length <= 64 ? payType : undefined,
            trial_end: trialEnd
        };
    }

    async function send(origin, integration, body) {
        let timer;
        try {
            const controller = new AbortController();
            timer = setTimeout(() => controller.abort(), 12000);
            const proof = await fetch('/ajax/v2/integrations/' + integration + '/disposable_token', {
                credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
                headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' }
            });
            if (!proof.ok) return false;
            const data = await proof.json();
            if (typeof data?.token !== 'string' || !data.token) return false;

            const result = await fetch(origin + path, {
                method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store',
                redirect: 'error', signal: controller.signal, body,
                headers: { 'Content-Type': 'application/json', 'X-Auth-Token': data.token }
            });
            return result.status === 204;
        } catch (error) {
            return false;
        } finally {
            clearTimeout(timer);
        }
    }

    async function observe(widget, origin, { installing = false, refresh = true } = {}) {
        try {
            const integration = widget.get_settings()?.oauth_client_uuid;
            if (typeof integration !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(integration)) return true;
            const license = accountLicense();
            const needsTariff = license.tariff_id === undefined;
            const body = JSON.stringify(license);
            if (body === '{}') return true;

            const key = origin + '/' + integration.toLowerCase();
            const previous = observations.get(key);
            if (previous?.pending) return previous.body !== body || needsTariff;
            if (!installing && previous?.body === body &&
                (previous.nextAttempt > Date.now() || (!refresh && previous.sent))) {
                return !previous.sent || needsTariff;
            }

            const observation = { body, pending: true, sent: false, nextAttempt: 0 };
            observations.set(key, observation);
            observation.sent = await send(origin, integration, body);
            observation.nextAttempt = Date.now() + (observation.sent ? refreshInterval : retryInterval);
            observation.pending = false;
            return !observation.sent || needsTariff;
        } catch (error) {
            // CRM may not have made the account or OAuth settings available yet.
            return true;
        }
    }

    async function retry(widget, origin) {
        try {
            for (const delay of retryDelays) {
                await new Promise(resolve => setTimeout(resolve, delay));
                if (!await observe(widget, origin, { refresh: false })) return;
            }
        } finally {
            retries.delete(widget);
        }
    }

    async function sync(widget, coreOrigin, installing = false) {
        let origin;
        try {
            origin = new URL(coreOrigin);
        } catch (error) {
            return;
        }
        if (origin.protocol !== 'https:' || origin.href !== origin.origin + '/') return;
        if (!await observe(widget, origin.origin, { installing }) || retries.has(widget)) return;
        retries.add(widget);
        void retry(widget, origin.origin);
    }

    return { sync };
});
