import { Routes } from "@angular/router";
import { AccessPageComponent } from "./access/access-page.component";
import { AccessStatusPageComponent } from "./access/access-status-page.component";

export const PORTAL_ACCESS_ROUTES: Routes = [
  { path: "access", component: AccessPageComponent },
  { path: "access/denied", component: AccessStatusPageComponent },
  { path: "access/unavailable", component: AccessStatusPageComponent },
];
