import type { DataMode } from "../api";
import { Icon } from "../ui/Icon";

export function DataModeBanner({ mode }: { mode: DataMode }) {
  if (mode === "fixtures") {
    return (
      <div className="banner fixture" role="note">
        <Icon name="alert" />
        <span>
          <b>Режим разработки: синтетические данные.</b> Сотрудники, звонки, сделки и задачи сгенерированы и не относятся к реальному аккаунту. Подключение к amocrm-pro не проверяется.
        </span>
      </div>
    );
  }
  if (mode === "hybrid") {
    return (
      <div className="banner hybrid" role="note">
        <Icon name="info" />
        <span>
          <b>Гибридный режим разработки.</b> События и сотрудники — из amocrm-pro. Блоки без готового контракта (проблемные списки, сессии задач и Imbox) заполнены синтетикой и помечены «синтетика».
        </span>
      </div>
    );
  }
  return null;
}
