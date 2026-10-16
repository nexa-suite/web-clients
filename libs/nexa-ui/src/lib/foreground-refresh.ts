import { DestroyRef } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  Observable,
  catchError,
  defer,
  exhaustMap,
  filter,
  fromEvent,
  interval,
  merge,
  of,
  shareReplay,
  Subscription,
  take,
  takeUntil,
  takeWhile,
} from "rxjs";

export interface ForegroundRefreshOptions {
  readonly document: Document;
  readonly destroyRef: DestroyRef;
  /** Completes the timer and any in-flight request when its owner is invalidated. */
  readonly stopWhen: Observable<unknown>;
  /** Return false after a terminal response such as an expired or denied lease. */
  readonly refresh: () => Observable<boolean>;
  readonly intervalMs?: number;
}

/** Runs read refreshes on foreground events and a timer, with one request in flight. */
export function startForegroundRefresh(options: ForegroundRefreshOptions): Subscription | undefined {
  const windowRef = options.document.defaultView;
  if (!windowRef) return;

  const stop$ = options.stopWhen.pipe(
    take(1),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  const triggers = merge(
    interval(options.intervalMs ?? 30_000),
    fromEvent(options.document, "visibilitychange"),
    fromEvent(windowRef, "focus"),
  ).pipe(filter(() => isForeground(options.document, windowRef)));

  return triggers
    .pipe(
      takeUntil(stop$),
      exhaustMap(() =>
        defer(options.refresh).pipe(
          takeUntil(stop$),
          // A transient read failure leaves the timer available for the next refresh.
          catchError(() => of(true)),
        ),
      ),
      takeWhile((shouldContinue) => shouldContinue),
      takeUntilDestroyed(options.destroyRef),
    )
    .subscribe();
}

export function isForeground(documentRef: Document, windowRef: Window): boolean {
  return documentRef.visibilityState === "visible" && documentRef.hasFocus();
}
