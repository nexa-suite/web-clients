import { Routes } from "@angular/router";
import { RecoveryPageComponent } from "./recovery-page.component";
import { SignInPageComponent } from "./sign-in-page.component";

export const PLATFORM_ACCESS_ROUTES: Routes = [
  {
    path: "sign-in",
    component: SignInPageComponent,
    title: "Sign in | Nexa Platform",
  },
  {
    path: "reset-password",
    component: RecoveryPageComponent,
    title: "Reset your password | Nexa",
  },
  {
    path: "forgot-password",
    component: RecoveryPageComponent,
    title: "Forgot your password | Nexa",
  },
];
