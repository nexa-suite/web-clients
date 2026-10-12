import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { provideNexaHttp } from "@nexa/api";
import { AppComponent } from "./app.component";
import { routes } from "./app.routes";

describe("Portal app", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter(routes),
        provideNexaHttp({ apiBaseUrl: "/api/v1", surface: "PORTAL" }),
      ],
    }).compileComponents();
  });

  it("renders the router outlet used by Portal route composition", () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector("router-outlet")).not.toBeNull();
  });
});
