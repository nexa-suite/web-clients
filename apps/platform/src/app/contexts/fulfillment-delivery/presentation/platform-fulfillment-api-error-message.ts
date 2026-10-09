import { NexaApiError } from "@nexa/api";

export function platformFulfillmentApiErrorMessage(error: unknown): string {
  if (!(error instanceof NexaApiError)) {
    return "Fulfillment information could not be loaded. Try again.";
  }

  switch (error.kind) {
    case "network":
    case "timeout":
      return "The API could not be reached. Check the connection and try again.";
    case "unauthenticated":
      return "The Platform session expired. Sign in to continue.";
    case "forbidden":
      return "This view or command is unavailable for the active membership or warehouse grants.";
    case "conflict":
    case "precondition":
      return "The order changed before fulfillment started. Reload its current details and retry.";
    case "not-found":
      return "The selected order or fulfillment is no longer available in this context.";
    default:
      return "The fulfillment request could not be completed. Refresh the current data and try again.";
  }
}
