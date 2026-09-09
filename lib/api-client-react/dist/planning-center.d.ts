import type { UseMutationOptions, UseMutationResult } from "@tanstack/react-query";
import type { ErrorType } from "./custom-fetch";
export type CompleteModuleInput = {
    moduleId: number;
};
export type CompleteModuleResult = {
    moduleId: number;
    completedAt: string;
    planningCenterSynced: boolean;
};
export declare function completeModule(input: CompleteModuleInput, options?: RequestInit): Promise<CompleteModuleResult>;
export declare function useCompleteModule<TError = ErrorType<{
    error?: string;
    code?: string;
}>>(options?: UseMutationOptions<CompleteModuleResult, TError, CompleteModuleInput>): UseMutationResult<CompleteModuleResult, TError, CompleteModuleInput>;
//# sourceMappingURL=planning-center.d.ts.map