import { useMutation } from "@tanstack/react-query";
import type { UseMutationOptions, UseMutationResult } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { ErrorType } from "./custom-fetch";

export type CompleteModuleInput = {
  moduleId: number;
};

export type CompleteModuleResult = {
  moduleId: number;
  completedAt: string;
  planningCenterSynced: boolean;
};

export async function completeModule(
  input: CompleteModuleInput,
  options?: RequestInit,
): Promise<CompleteModuleResult> {
  return customFetch<CompleteModuleResult>("/api/modules/complete", {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(input),
  });
}

export function useCompleteModule<TError = ErrorType<{ error?: string; code?: string }>>(
  options?: UseMutationOptions<CompleteModuleResult, TError, CompleteModuleInput>,
): UseMutationResult<CompleteModuleResult, TError, CompleteModuleInput> {
  return useMutation({
    mutationKey: ["completeModule"],
    mutationFn: (input) => completeModule(input),
    ...options,
  });
}