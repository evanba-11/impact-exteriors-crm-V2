import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider } from "@/lib/app-context";
import Layout from "@/components/Layout";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Pipeline from "@/pages/Pipeline";
import Leads from "@/pages/Leads";
import { OpportunityPage, JobPage } from "@/pages/RecordPage";
import { Redirect } from "wouter";
import Estimates from "@/pages/Estimates";
import PriceList from "@/pages/PriceList";
import Jobs from "@/pages/Jobs";
import Financials from "@/pages/Financials";
import Automations from "@/pages/Automations";
import Campaigns from "@/pages/Campaigns";
import Triggers from "@/pages/Triggers";
import Tasks from "@/pages/Tasks";
import Calendar from "@/pages/Calendar";
import Vendors from "@/pages/Vendors";
import Settings from "@/pages/Settings";
import Proposals from "@/pages/Proposals";
import MaterialReturns from "@/pages/MaterialReturns";
import ARaging from "@/pages/ARaging";
import Issues from "@/pages/Issues";
import CustomerMap from "@/pages/CustomerMap";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/pipeline" component={Pipeline} />
      <Route path="/opportunities" component={Leads} />
      <Route path="/opportunities/:id" component={OpportunityPage} />
      <Route path="/jobs/:id" component={JobPage} />
      <Route path="/leads">{() => <Redirect to="/opportunities" />}</Route>
      <Route path="/estimates" component={Estimates} />
      <Route path="/price-list" component={PriceList} />
      <Route path="/jobs" component={Jobs} />
      <Route path="/financials" component={Financials} />
      <Route path="/automations/triggers" component={Triggers} />
      <Route path="/automations/campaigns" component={Campaigns} />
      <Route path="/automations/active" component={Automations} />
      <Route path="/automations">{() => <Redirect to="/automations/triggers" />}</Route>
      <Route path="/tasks" component={Tasks} />
      <Route path="/calendar" component={Calendar} />
      <Route path="/vendors" component={Vendors} />
      <Route path="/settings" component={Settings} />
      <Route path="/proposals/:estimateId" component={Proposals} />
      <Route path="/material-returns" component={MaterialReturns} />
      <Route path="/ar-aging" component={ARaging} />
      <Route path="/issues" component={Issues} />
      <Route path="/map" component={CustomerMap} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppProvider>
          <Router hook={useHashLocation}>
            <Layout>
              <AppRouter />
            </Layout>
          </Router>
        </AppProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
