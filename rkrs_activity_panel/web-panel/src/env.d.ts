/// <reference types="vite/client" />

/** Режим данных сборки: live — только amocrm-pro, fixtures — синтетика, hybrid — live + помеченная синтетика для неготовых контрактов. */
declare const __DATA_MODE__: "live" | "hybrid" | "fixtures";
/** Доступен dev-proxy к management API (только vite serve с серверным токеном в env). */
declare const __DEV_MANAGEMENT__: boolean;
