import { lazy, Suspense } from "react";
import { DATA_MODE } from "../api";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { Spinner } from "../ui/primitives";
import { HomePage } from "./HomePage";
import { PanelShell } from "./PanelShell";
import { useRoute, type Route } from "./router";

const EmployeePage = lazy(() => import("../features/employee/EmployeePage").then((m) => ({ default: m.EmployeePage })));
const OperatorPage = lazy(() => import("../features/operator/OperatorPage").then((m) => ({ default: m.OperatorPage })));
const MissedCallsPage = lazy(() => import("../features/missed/MissedCallsPage").then((m) => ({ default: m.MissedCallsPage })));
const SettingsPage = lazy(() => import("../features/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })));

function PanelRoute({ route }: { route: Exclude<Route, { name: "home" | "not-found" }> & { viewKey: string } }) {
  switch (route.name) {
    case "dashboard":
      return <DashboardPage date={route.date} />;
    case "employee":
      return <EmployeePage employeeId={route.employeeId} date={route.date} />;
    case "operator":
      return <OperatorPage employeeId={route.employeeId} />;
    case "missed":
      return <MissedCallsPage />;
    case "settings":
      return <SettingsPage tab={route.tab} />;
  }
}

export function App() {
  const route = useRoute();
  if (route.name === "home") return <HomePage mode={DATA_MODE} />;
  if (route.name === "not-found") return <HomePage mode={DATA_MODE} notFound />;
  if (route.name === "settings" && route.viewKey === null) {
    return (
      <Suspense fallback={<Spinner />}>
        <SettingsPage tab={route.tab} standalone />
      </Suspense>
    );
  }
  const viewKey = (route as { viewKey: string }).viewKey;
  return (
    <PanelShell viewKey={viewKey}>
      <Suspense fallback={<Spinner />}>
        <PanelRoute route={route as Parameters<typeof PanelRoute>[0]["route"]} />
      </Suspense>
    </PanelShell>
  );
}
