import { Component, DestroyRef } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { NEVER, Subject, of } from "rxjs";
import { startForegroundRefresh } from "./foreground-refresh";

@Component({ standalone: true, template: "" })
class RefreshHostComponent {}

describe("startForegroundRefresh", () => {
  let originalVisibility: PropertyDescriptor | undefined;
  let hasFocus: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    originalVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    TestBed.configureTestingModule({ imports: [RefreshHostComponent] });
  });

  afterEach(() => {
    vi.useRealTimers();
    hasFocus.mockRestore();
    if (originalVisibility) {
      Object.defineProperty(document, "visibilityState", originalVisibility);
    } else {
      Reflect.deleteProperty(document, "visibilityState");
    }
  });

  it("refreshes on visibility and foreground timer only while visible and focused", () => {
    const fixture = TestBed.createComponent(RefreshHostComponent);
    const refresh = vi.fn(() => of(true));
    startForegroundRefresh({
      document,
      destroyRef: fixture.componentRef.injector.get(DestroyRef),
      stopWhen: NEVER,
      refresh,
      intervalMs: 1_000,
    });

    vi.advanceTimersByTime(1_000);
    expect(refresh).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledTimes(1);

    hasFocus.mockReturnValue(false);
    vi.advanceTimersByTime(1_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    hasFocus.mockReturnValue(true);
    window.dispatchEvent(new Event("focus"));
    expect(refresh).toHaveBeenCalledTimes(2);
    fixture.destroy();
  });

  it("cancels an in-flight refresh and future timer work when its scope ends", () => {
    const fixture = TestBed.createComponent(RefreshHostComponent);
    const response = new Subject<boolean>();
    const stop = new Subject<void>();
    const refresh = vi.fn(() => response.asObservable());
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    startForegroundRefresh({
      document,
      destroyRef: fixture.componentRef.injector.get(DestroyRef),
      stopWhen: stop,
      refresh,
      intervalMs: 1_000,
    });

    vi.advanceTimersByTime(1_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(response.observed).toBe(true);

    stop.next();
    expect(response.observed).toBe(false);
    vi.advanceTimersByTime(2_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it("stops future refreshes after a terminal session or permission response", () => {
    const fixture = TestBed.createComponent(RefreshHostComponent);
    const refresh = vi.fn(() => of(false));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    startForegroundRefresh({
      document,
      destroyRef: fixture.componentRef.injector.get(DestroyRef),
      stopWhen: NEVER,
      refresh,
      intervalMs: 1_000,
    });

    window.dispatchEvent(new Event("focus"));
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3_000);
    window.dispatchEvent(new Event("focus"));
    expect(refresh).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });
});
