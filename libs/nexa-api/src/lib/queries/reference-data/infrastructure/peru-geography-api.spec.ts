import { TestBed } from "@angular/core/testing";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { provideNexaHttp } from "../../../http/nexa-http";
import { NexaPeruGeographyApi } from "./peru-geography-api";

describe("NexaPeruGeographyApi", () => {
  let http: HttpTestingController;
  let api: NexaPeruGeographyApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideNexaHttp({ apiBaseUrl: "/api/v1", surface: "PLATFORM" }),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(NexaPeruGeographyApi);
  });

  afterEach(() => http.verify());

  it("loads road types from secured reference data", () => {
    api.roadTypes().subscribe();
    const request = http.expectOne("/api/v1/reference/road-types");
    expect(request.request.method).toBe("GET");
    request.flush([{ id: 1, code: "AV", label: "Avenida", parentCode: null, active: true }]);
  });
});
