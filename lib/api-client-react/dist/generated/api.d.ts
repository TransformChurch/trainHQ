import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { Assignment, AssignmentInput, AuditLogEntry, CompleteModuleInput, CompleteModuleResult, DashboardSummary, FacilitiesAccessGrant, FacilitiesAccessStatus, FacilitiesAccessUpdate, FacilitiesCategory, FacilitiesCategoryInput, FacilitiesCategoryUpdate, FacilitiesGroupAccessGrant, FacilitiesGroupAccessStatus, FacilitiesRequest, FacilitiesRequestInput, FacilitiesRequestUpdate, GetAuditLogParams, Group, GroupInput, GroupMember, GroupMemberInput, HealthStatus, ListModulesParams, ListVideosParams, Module, ModuleDetail, ModuleInput, ModuleUpdate, PatchMeInput, ProgressMatrix, QueueItem, QuizQuestion, QuizQuestionInput, QuizQuestionUpdate, QuizResult, QuizSubmission, RoleUpdate, Setting, SettingInput, Track, TrackInput, TrackUpdate, TrackWithModules, UploadUrlRequest, UploadUrlResponse, User, UserInput, UserWithProgress, Video, VideoInput, VideoUpdate, VisibilityUpdate, WatchHistoryEntry, WatchProgressInput } from './api.schemas';
import { customFetch } from '../custom-fetch';
import type { ErrorType, BodyType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export declare const getHealthCheckUrl: () => string;
/**
 * @summary Health check
 */
export declare const healthCheck: (options?: Parameters<typeof customFetch>[1]) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetMeUrl: () => string;
/**
 * @summary Get current user profile
 */
export declare const getMe: (options?: Parameters<typeof customFetch>[1]) => Promise<User>;
export declare const getGetMeQueryKey: () => readonly ["/api/users/me"];
export declare const getGetMeQueryOptions: <TData = Awaited<ReturnType<typeof getMe>>, TError = ErrorType<void>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMe>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getMe>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetMeQueryResult = NonNullable<Awaited<ReturnType<typeof getMe>>>;
export type GetMeQueryError = ErrorType<void>;
/**
 * @summary Get current user profile
 */
export declare function useGetMe<TData = Awaited<ReturnType<typeof getMe>>, TError = ErrorType<void>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMe>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpsertMeUrl: () => string;
/**
 * @summary Create or update current user (called on first sign-in)
 */
export declare const upsertMe: (userInput: UserInput, options?: Parameters<typeof customFetch>[1]) => Promise<User>;
export declare const getUpsertMeMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof upsertMe>>, TError, UpsertMeMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof upsertMe>>, TError, UpsertMeMutationVariables, TContext>;
export type UpsertMeMutationResult = NonNullable<Awaited<ReturnType<typeof upsertMe>>>;
export type UpsertMeMutationBody = BodyType<UserInput>;
export type UpsertMeMutationError = ErrorType<unknown>;
export type UpsertMeMutationVariables = {
    data: BodyType<UserInput>;
};
/**
* @summary Create or update current user (called on first sign-in)
*/
export declare const useUpsertMe: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof upsertMe>>, TError, UpsertMeMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof upsertMe>>, TError, UpsertMeMutationVariables, TContext>;
export declare const getPatchMeUrl: () => string;
/**
 * @summary Update locally managed profile fields (firstName, lastName, phone)
 */
export declare const patchMe: (patchMeInput: PatchMeInput, options?: Parameters<typeof customFetch>[1]) => Promise<User>;
export declare const getPatchMeMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof patchMe>>, TError, PatchMeMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof patchMe>>, TError, PatchMeMutationVariables, TContext>;
export type PatchMeMutationResult = NonNullable<Awaited<ReturnType<typeof patchMe>>>;
export type PatchMeMutationBody = BodyType<PatchMeInput>;
export type PatchMeMutationError = ErrorType<void>;
export type PatchMeMutationVariables = {
    data: BodyType<PatchMeInput>;
};
/**
* @summary Update locally managed profile fields (firstName, lastName, phone)
*/
export declare const usePatchMe: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof patchMe>>, TError, PatchMeMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof patchMe>>, TError, PatchMeMutationVariables, TContext>;
export declare const getGetFacilitiesAccessUrl: () => string;
/**
 * @summary Check whether the current user can access the Request Hub
 */
export declare const getFacilitiesAccess: (options?: Parameters<typeof customFetch>[1]) => Promise<FacilitiesAccessStatus>;
export declare const getGetFacilitiesAccessQueryKey: () => readonly ["/api/facilities/access"];
export declare const getGetFacilitiesAccessQueryOptions: <TData = Awaited<ReturnType<typeof getFacilitiesAccess>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getFacilitiesAccess>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getFacilitiesAccess>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetFacilitiesAccessQueryResult = NonNullable<Awaited<ReturnType<typeof getFacilitiesAccess>>>;
export type GetFacilitiesAccessQueryError = ErrorType<unknown>;
/**
 * @summary Check whether the current user can access the Request Hub
 */
export declare function useGetFacilitiesAccess<TData = Awaited<ReturnType<typeof getFacilitiesAccess>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getFacilitiesAccess>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListFacilitiesCategoriesUrl: () => string;
/**
 * @summary List visible request categories and cards
 */
export declare const listFacilitiesCategories: (options?: Parameters<typeof customFetch>[1]) => Promise<FacilitiesCategory[]>;
export declare const getListFacilitiesCategoriesQueryKey: () => readonly ["/api/facilities"];
export declare const getListFacilitiesCategoriesQueryOptions: <TData = Awaited<ReturnType<typeof listFacilitiesCategories>>, TError = ErrorType<void>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listFacilitiesCategories>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listFacilitiesCategories>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListFacilitiesCategoriesQueryResult = NonNullable<Awaited<ReturnType<typeof listFacilitiesCategories>>>;
export type ListFacilitiesCategoriesQueryError = ErrorType<void>;
/**
 * @summary List visible request categories and cards
 */
export declare function useListFacilitiesCategories<TData = Awaited<ReturnType<typeof listFacilitiesCategories>>, TError = ErrorType<void>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listFacilitiesCategories>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getAdminListFacilitiesCategoriesUrl: () => string;
/**
 * @summary List all Facilities categories and cards
 */
export declare const adminListFacilitiesCategories: (options?: Parameters<typeof customFetch>[1]) => Promise<FacilitiesCategory[]>;
export declare const getAdminListFacilitiesCategoriesQueryKey: () => readonly ["/api/admin/facilities"];
export declare const getAdminListFacilitiesCategoriesQueryOptions: <TData = Awaited<ReturnType<typeof adminListFacilitiesCategories>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof adminListFacilitiesCategories>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof adminListFacilitiesCategories>>, TError, TData> & {
    queryKey: QueryKey;
};
export type AdminListFacilitiesCategoriesQueryResult = NonNullable<Awaited<ReturnType<typeof adminListFacilitiesCategories>>>;
export type AdminListFacilitiesCategoriesQueryError = ErrorType<unknown>;
/**
 * @summary List all Facilities categories and cards
 */
export declare function useAdminListFacilitiesCategories<TData = Awaited<ReturnType<typeof adminListFacilitiesCategories>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof adminListFacilitiesCategories>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListFacilitiesAccessGrantsUrl: () => string;
/**
 * @summary List explicit user Request Hub access grants
 */
export declare const listFacilitiesAccessGrants: (options?: Parameters<typeof customFetch>[1]) => Promise<FacilitiesAccessGrant[]>;
export declare const getListFacilitiesAccessGrantsQueryKey: () => readonly ["/api/admin/facilities/access"];
export declare const getListFacilitiesAccessGrantsQueryOptions: <TData = Awaited<ReturnType<typeof listFacilitiesAccessGrants>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listFacilitiesAccessGrants>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listFacilitiesAccessGrants>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListFacilitiesAccessGrantsQueryResult = NonNullable<Awaited<ReturnType<typeof listFacilitiesAccessGrants>>>;
export type ListFacilitiesAccessGrantsQueryError = ErrorType<unknown>;
/**
 * @summary List explicit user Request Hub access grants
 */
export declare function useListFacilitiesAccessGrants<TData = Awaited<ReturnType<typeof listFacilitiesAccessGrants>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listFacilitiesAccessGrants>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateFacilitiesAccessUrl: (userId: string) => string;
/**
 * @summary Grant or revoke a user's Request Hub access
 */
export declare const updateFacilitiesAccess: (userId: string, facilitiesAccessUpdate: FacilitiesAccessUpdate, options?: Parameters<typeof customFetch>[1]) => Promise<FacilitiesAccessStatus>;
export declare const getUpdateFacilitiesAccessMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateFacilitiesAccess>>, TError, UpdateFacilitiesAccessMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateFacilitiesAccess>>, TError, UpdateFacilitiesAccessMutationVariables, TContext>;
export type UpdateFacilitiesAccessMutationResult = NonNullable<Awaited<ReturnType<typeof updateFacilitiesAccess>>>;
export type UpdateFacilitiesAccessMutationBody = BodyType<FacilitiesAccessUpdate>;
export type UpdateFacilitiesAccessMutationError = ErrorType<unknown>;
export type UpdateFacilitiesAccessMutationVariables = {
    userId: string;
    data: BodyType<FacilitiesAccessUpdate>;
};
/**
* @summary Grant or revoke a user's Request Hub access
*/
export declare const useUpdateFacilitiesAccess: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateFacilitiesAccess>>, TError, UpdateFacilitiesAccessMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateFacilitiesAccess>>, TError, UpdateFacilitiesAccessMutationVariables, TContext>;
export declare const getListFacilitiesGroupAccessGrantsUrl: () => string;
/**
 * @summary List group Request Hub access grants
 */
export declare const listFacilitiesGroupAccessGrants: (options?: Parameters<typeof customFetch>[1]) => Promise<FacilitiesGroupAccessGrant[]>;
export declare const getListFacilitiesGroupAccessGrantsQueryKey: () => readonly ["/api/admin/facilities/access/groups"];
export declare const getListFacilitiesGroupAccessGrantsQueryOptions: <TData = Awaited<ReturnType<typeof listFacilitiesGroupAccessGrants>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listFacilitiesGroupAccessGrants>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listFacilitiesGroupAccessGrants>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListFacilitiesGroupAccessGrantsQueryResult = NonNullable<Awaited<ReturnType<typeof listFacilitiesGroupAccessGrants>>>;
export type ListFacilitiesGroupAccessGrantsQueryError = ErrorType<unknown>;
/**
 * @summary List group Request Hub access grants
 */
export declare function useListFacilitiesGroupAccessGrants<TData = Awaited<ReturnType<typeof listFacilitiesGroupAccessGrants>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listFacilitiesGroupAccessGrants>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateFacilitiesGroupAccessUrl: (groupId: number) => string;
/**
 * @summary Grant or revoke a group's Request Hub access
 */
export declare const updateFacilitiesGroupAccess: (groupId: number, facilitiesAccessUpdate: FacilitiesAccessUpdate, options?: Parameters<typeof customFetch>[1]) => Promise<FacilitiesGroupAccessStatus>;
export declare const getUpdateFacilitiesGroupAccessMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateFacilitiesGroupAccess>>, TError, UpdateFacilitiesGroupAccessMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateFacilitiesGroupAccess>>, TError, UpdateFacilitiesGroupAccessMutationVariables, TContext>;
export type UpdateFacilitiesGroupAccessMutationResult = NonNullable<Awaited<ReturnType<typeof updateFacilitiesGroupAccess>>>;
export type UpdateFacilitiesGroupAccessMutationBody = BodyType<FacilitiesAccessUpdate>;
export type UpdateFacilitiesGroupAccessMutationError = ErrorType<unknown>;
export type UpdateFacilitiesGroupAccessMutationVariables = {
    groupId: number;
    data: BodyType<FacilitiesAccessUpdate>;
};
/**
* @summary Grant or revoke a group's Request Hub access
*/
export declare const useUpdateFacilitiesGroupAccess: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateFacilitiesGroupAccess>>, TError, UpdateFacilitiesGroupAccessMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateFacilitiesGroupAccess>>, TError, UpdateFacilitiesGroupAccessMutationVariables, TContext>;
export declare const getCreateFacilitiesCategoryUrl: () => string;
/**
 * @summary Create a request category
 */
export declare const createFacilitiesCategory: (facilitiesCategoryInput: FacilitiesCategoryInput, options?: Parameters<typeof customFetch>[1]) => Promise<FacilitiesCategory>;
export declare const getCreateFacilitiesCategoryMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createFacilitiesCategory>>, TError, CreateFacilitiesCategoryMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createFacilitiesCategory>>, TError, CreateFacilitiesCategoryMutationVariables, TContext>;
export type CreateFacilitiesCategoryMutationResult = NonNullable<Awaited<ReturnType<typeof createFacilitiesCategory>>>;
export type CreateFacilitiesCategoryMutationBody = BodyType<FacilitiesCategoryInput>;
export type CreateFacilitiesCategoryMutationError = ErrorType<unknown>;
export type CreateFacilitiesCategoryMutationVariables = {
    data: BodyType<FacilitiesCategoryInput>;
};
/**
* @summary Create a request category
*/
export declare const useCreateFacilitiesCategory: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createFacilitiesCategory>>, TError, CreateFacilitiesCategoryMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createFacilitiesCategory>>, TError, CreateFacilitiesCategoryMutationVariables, TContext>;
export declare const getUpdateFacilitiesCategoryUrl: (categoryId: number) => string;
/**
 * @summary Update a request category
 */
export declare const updateFacilitiesCategory: (categoryId: number, facilitiesCategoryUpdate: FacilitiesCategoryUpdate, options?: Parameters<typeof customFetch>[1]) => Promise<FacilitiesCategory>;
export declare const getUpdateFacilitiesCategoryMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateFacilitiesCategory>>, TError, UpdateFacilitiesCategoryMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateFacilitiesCategory>>, TError, UpdateFacilitiesCategoryMutationVariables, TContext>;
export type UpdateFacilitiesCategoryMutationResult = NonNullable<Awaited<ReturnType<typeof updateFacilitiesCategory>>>;
export type UpdateFacilitiesCategoryMutationBody = BodyType<FacilitiesCategoryUpdate>;
export type UpdateFacilitiesCategoryMutationError = ErrorType<unknown>;
export type UpdateFacilitiesCategoryMutationVariables = {
    categoryId: number;
    data: BodyType<FacilitiesCategoryUpdate>;
};
/**
* @summary Update a request category
*/
export declare const useUpdateFacilitiesCategory: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateFacilitiesCategory>>, TError, UpdateFacilitiesCategoryMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateFacilitiesCategory>>, TError, UpdateFacilitiesCategoryMutationVariables, TContext>;
export declare const getDeleteFacilitiesCategoryUrl: (categoryId: number) => string;
/**
 * @summary Delete a category and its request cards
 */
export declare const deleteFacilitiesCategory: (categoryId: number, options?: Parameters<typeof customFetch>[1]) => Promise<void>;
export declare const getDeleteFacilitiesCategoryMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteFacilitiesCategory>>, TError, DeleteFacilitiesCategoryMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteFacilitiesCategory>>, TError, DeleteFacilitiesCategoryMutationVariables, TContext>;
export type DeleteFacilitiesCategoryMutationResult = NonNullable<Awaited<ReturnType<typeof deleteFacilitiesCategory>>>;
export type DeleteFacilitiesCategoryMutationError = ErrorType<unknown>;
export type DeleteFacilitiesCategoryMutationVariables = {
    categoryId: number;
};
/**
* @summary Delete a category and its request cards
*/
export declare const useDeleteFacilitiesCategory: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteFacilitiesCategory>>, TError, DeleteFacilitiesCategoryMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteFacilitiesCategory>>, TError, DeleteFacilitiesCategoryMutationVariables, TContext>;
export declare const getCreateFacilitiesRequestUrl: () => string;
/**
 * @summary Create a request card
 */
export declare const createFacilitiesRequest: (facilitiesRequestInput: FacilitiesRequestInput, options?: Parameters<typeof customFetch>[1]) => Promise<FacilitiesRequest>;
export declare const getCreateFacilitiesRequestMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createFacilitiesRequest>>, TError, CreateFacilitiesRequestMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createFacilitiesRequest>>, TError, CreateFacilitiesRequestMutationVariables, TContext>;
export type CreateFacilitiesRequestMutationResult = NonNullable<Awaited<ReturnType<typeof createFacilitiesRequest>>>;
export type CreateFacilitiesRequestMutationBody = BodyType<FacilitiesRequestInput>;
export type CreateFacilitiesRequestMutationError = ErrorType<unknown>;
export type CreateFacilitiesRequestMutationVariables = {
    data: BodyType<FacilitiesRequestInput>;
};
/**
* @summary Create a request card
*/
export declare const useCreateFacilitiesRequest: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createFacilitiesRequest>>, TError, CreateFacilitiesRequestMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createFacilitiesRequest>>, TError, CreateFacilitiesRequestMutationVariables, TContext>;
export declare const getUpdateFacilitiesRequestUrl: (requestId: number) => string;
/**
 * @summary Update a request card, link, or button
 */
export declare const updateFacilitiesRequest: (requestId: number, facilitiesRequestUpdate: FacilitiesRequestUpdate, options?: Parameters<typeof customFetch>[1]) => Promise<FacilitiesRequest>;
export declare const getUpdateFacilitiesRequestMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateFacilitiesRequest>>, TError, UpdateFacilitiesRequestMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateFacilitiesRequest>>, TError, UpdateFacilitiesRequestMutationVariables, TContext>;
export type UpdateFacilitiesRequestMutationResult = NonNullable<Awaited<ReturnType<typeof updateFacilitiesRequest>>>;
export type UpdateFacilitiesRequestMutationBody = BodyType<FacilitiesRequestUpdate>;
export type UpdateFacilitiesRequestMutationError = ErrorType<unknown>;
export type UpdateFacilitiesRequestMutationVariables = {
    requestId: number;
    data: BodyType<FacilitiesRequestUpdate>;
};
/**
* @summary Update a request card, link, or button
*/
export declare const useUpdateFacilitiesRequest: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateFacilitiesRequest>>, TError, UpdateFacilitiesRequestMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateFacilitiesRequest>>, TError, UpdateFacilitiesRequestMutationVariables, TContext>;
export declare const getDeleteFacilitiesRequestUrl: (requestId: number) => string;
/**
 * @summary Delete a request card
 */
export declare const deleteFacilitiesRequest: (requestId: number, options?: Parameters<typeof customFetch>[1]) => Promise<void>;
export declare const getDeleteFacilitiesRequestMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteFacilitiesRequest>>, TError, DeleteFacilitiesRequestMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteFacilitiesRequest>>, TError, DeleteFacilitiesRequestMutationVariables, TContext>;
export type DeleteFacilitiesRequestMutationResult = NonNullable<Awaited<ReturnType<typeof deleteFacilitiesRequest>>>;
export type DeleteFacilitiesRequestMutationError = ErrorType<unknown>;
export type DeleteFacilitiesRequestMutationVariables = {
    requestId: number;
};
/**
* @summary Delete a request card
*/
export declare const useDeleteFacilitiesRequest: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteFacilitiesRequest>>, TError, DeleteFacilitiesRequestMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteFacilitiesRequest>>, TError, DeleteFacilitiesRequestMutationVariables, TContext>;
export declare const getGetDashboardSummaryUrl: () => string;
/**
 * @summary Get student dashboard summary (assigned modules, progress, queue count)
 */
export declare const getDashboardSummary: (options?: Parameters<typeof customFetch>[1]) => Promise<DashboardSummary>;
export declare const getGetDashboardSummaryQueryKey: () => readonly ["/api/dashboard/summary"];
export declare const getGetDashboardSummaryQueryOptions: <TData = Awaited<ReturnType<typeof getDashboardSummary>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboardSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDashboardSummary>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDashboardSummaryQueryResult = NonNullable<Awaited<ReturnType<typeof getDashboardSummary>>>;
export type GetDashboardSummaryQueryError = ErrorType<unknown>;
/**
 * @summary Get student dashboard summary (assigned modules, progress, queue count)
 */
export declare function useGetDashboardSummary<TData = Awaited<ReturnType<typeof getDashboardSummary>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboardSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListTracksUrl: () => string;
/**
 * @summary List all training tracks
 */
export declare const listTracks: (options?: Parameters<typeof customFetch>[1]) => Promise<Track[]>;
export declare const getListTracksQueryKey: () => readonly ["/api/tracks"];
export declare const getListTracksQueryOptions: <TData = Awaited<ReturnType<typeof listTracks>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listTracks>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listTracks>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListTracksQueryResult = NonNullable<Awaited<ReturnType<typeof listTracks>>>;
export type ListTracksQueryError = ErrorType<unknown>;
/**
 * @summary List all training tracks
 */
export declare function useListTracks<TData = Awaited<ReturnType<typeof listTracks>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listTracks>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateTrackUrl: () => string;
/**
 * @summary Create a new track (admin only)
 */
export declare const createTrack: (trackInput: TrackInput, options?: Parameters<typeof customFetch>[1]) => Promise<Track>;
export declare const getCreateTrackMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createTrack>>, TError, CreateTrackMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createTrack>>, TError, CreateTrackMutationVariables, TContext>;
export type CreateTrackMutationResult = NonNullable<Awaited<ReturnType<typeof createTrack>>>;
export type CreateTrackMutationBody = BodyType<TrackInput>;
export type CreateTrackMutationError = ErrorType<unknown>;
export type CreateTrackMutationVariables = {
    data: BodyType<TrackInput>;
};
/**
* @summary Create a new track (admin only)
*/
export declare const useCreateTrack: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createTrack>>, TError, CreateTrackMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createTrack>>, TError, CreateTrackMutationVariables, TContext>;
export declare const getGetTrackUrl: (trackId: number) => string;
/**
 * @summary Get a single track with its modules
 */
export declare const getTrack: (trackId: number, options?: Parameters<typeof customFetch>[1]) => Promise<TrackWithModules>;
export declare const getGetTrackQueryKey: (trackId: number) => readonly [`/api/tracks/${number}`];
export declare const getGetTrackQueryOptions: <TData = Awaited<ReturnType<typeof getTrack>>, TError = ErrorType<void>>(trackId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTrack>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getTrack>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetTrackQueryResult = NonNullable<Awaited<ReturnType<typeof getTrack>>>;
export type GetTrackQueryError = ErrorType<void>;
/**
 * @summary Get a single track with its modules
 */
export declare function useGetTrack<TData = Awaited<ReturnType<typeof getTrack>>, TError = ErrorType<void>>(trackId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTrack>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateTrackUrl: (trackId: number) => string;
/**
 * @summary Update a track (admin only)
 */
export declare const updateTrack: (trackId: number, trackUpdate: TrackUpdate, options?: Parameters<typeof customFetch>[1]) => Promise<Track>;
export declare const getUpdateTrackMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateTrack>>, TError, UpdateTrackMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateTrack>>, TError, UpdateTrackMutationVariables, TContext>;
export type UpdateTrackMutationResult = NonNullable<Awaited<ReturnType<typeof updateTrack>>>;
export type UpdateTrackMutationBody = BodyType<TrackUpdate>;
export type UpdateTrackMutationError = ErrorType<unknown>;
export type UpdateTrackMutationVariables = {
    trackId: number;
    data: BodyType<TrackUpdate>;
};
/**
* @summary Update a track (admin only)
*/
export declare const useUpdateTrack: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateTrack>>, TError, UpdateTrackMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateTrack>>, TError, UpdateTrackMutationVariables, TContext>;
export declare const getDeleteTrackUrl: (trackId: number) => string;
/**
 * @summary Delete a track (admin only)
 */
export declare const deleteTrack: (trackId: number, options?: Parameters<typeof customFetch>[1]) => Promise<void>;
export declare const getDeleteTrackMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteTrack>>, TError, DeleteTrackMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteTrack>>, TError, DeleteTrackMutationVariables, TContext>;
export type DeleteTrackMutationResult = NonNullable<Awaited<ReturnType<typeof deleteTrack>>>;
export type DeleteTrackMutationError = ErrorType<unknown>;
export type DeleteTrackMutationVariables = {
    trackId: number;
};
/**
* @summary Delete a track (admin only)
*/
export declare const useDeleteTrack: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteTrack>>, TError, DeleteTrackMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteTrack>>, TError, DeleteTrackMutationVariables, TContext>;
export declare const getListModulesUrl: (params?: ListModulesParams) => string;
/**
 * @summary List all modules (optionally filter by trackId)
 */
export declare const listModules: (params?: ListModulesParams, options?: Parameters<typeof customFetch>[1]) => Promise<Module[]>;
export declare const getListModulesQueryKey: (params?: ListModulesParams) => readonly ["/api/modules", ...ListModulesParams[]];
export declare const getListModulesQueryOptions: <TData = Awaited<ReturnType<typeof listModules>>, TError = ErrorType<unknown>>(params?: ListModulesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listModules>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listModules>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListModulesQueryResult = NonNullable<Awaited<ReturnType<typeof listModules>>>;
export type ListModulesQueryError = ErrorType<unknown>;
/**
 * @summary List all modules (optionally filter by trackId)
 */
export declare function useListModules<TData = Awaited<ReturnType<typeof listModules>>, TError = ErrorType<unknown>>(params?: ListModulesParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listModules>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateModuleUrl: () => string;
/**
 * @summary Create a new module (admin only)
 */
export declare const createModule: (moduleInput: ModuleInput, options?: Parameters<typeof customFetch>[1]) => Promise<Module>;
export declare const getCreateModuleMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createModule>>, TError, CreateModuleMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createModule>>, TError, CreateModuleMutationVariables, TContext>;
export type CreateModuleMutationResult = NonNullable<Awaited<ReturnType<typeof createModule>>>;
export type CreateModuleMutationBody = BodyType<ModuleInput>;
export type CreateModuleMutationError = ErrorType<unknown>;
export type CreateModuleMutationVariables = {
    data: BodyType<ModuleInput>;
};
/**
* @summary Create a new module (admin only)
*/
export declare const useCreateModule: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createModule>>, TError, CreateModuleMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createModule>>, TError, CreateModuleMutationVariables, TContext>;
export declare const getCompleteModuleUrl: () => string;
/**
 * @summary Mark a module complete and sync its completion date to Planning Center
 */
export declare const completeModule: (completeModuleInput: CompleteModuleInput, options?: Parameters<typeof customFetch>[1]) => Promise<CompleteModuleResult>;
export declare const getCompleteModuleMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof completeModule>>, TError, CompleteModuleMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof completeModule>>, TError, CompleteModuleMutationVariables, TContext>;
export type CompleteModuleMutationResult = NonNullable<Awaited<ReturnType<typeof completeModule>>>;
export type CompleteModuleMutationBody = BodyType<CompleteModuleInput>;
export type CompleteModuleMutationError = ErrorType<unknown>;
export type CompleteModuleMutationVariables = {
    data: BodyType<CompleteModuleInput>;
};
/**
* @summary Mark a module complete and sync its completion date to Planning Center
*/
export declare const useCompleteModule: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof completeModule>>, TError, CompleteModuleMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof completeModule>>, TError, CompleteModuleMutationVariables, TContext>;
export declare const getGetModuleUrl: (moduleId: number) => string;
/**
 * @summary Get a single module with its videos and quiz status
 */
export declare const getModule: (moduleId: number, options?: Parameters<typeof customFetch>[1]) => Promise<ModuleDetail>;
export declare const getGetModuleQueryKey: (moduleId: number) => readonly [`/api/modules/${number}`];
export declare const getGetModuleQueryOptions: <TData = Awaited<ReturnType<typeof getModule>>, TError = ErrorType<void>>(moduleId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getModule>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getModule>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetModuleQueryResult = NonNullable<Awaited<ReturnType<typeof getModule>>>;
export type GetModuleQueryError = ErrorType<void>;
/**
 * @summary Get a single module with its videos and quiz status
 */
export declare function useGetModule<TData = Awaited<ReturnType<typeof getModule>>, TError = ErrorType<void>>(moduleId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getModule>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateModuleUrl: (moduleId: number) => string;
/**
 * @summary Update a module (admin only)
 */
export declare const updateModule: (moduleId: number, moduleUpdate: ModuleUpdate, options?: Parameters<typeof customFetch>[1]) => Promise<Module>;
export declare const getUpdateModuleMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateModule>>, TError, UpdateModuleMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateModule>>, TError, UpdateModuleMutationVariables, TContext>;
export type UpdateModuleMutationResult = NonNullable<Awaited<ReturnType<typeof updateModule>>>;
export type UpdateModuleMutationBody = BodyType<ModuleUpdate>;
export type UpdateModuleMutationError = ErrorType<unknown>;
export type UpdateModuleMutationVariables = {
    moduleId: number;
    data: BodyType<ModuleUpdate>;
};
/**
* @summary Update a module (admin only)
*/
export declare const useUpdateModule: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateModule>>, TError, UpdateModuleMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateModule>>, TError, UpdateModuleMutationVariables, TContext>;
export declare const getDeleteModuleUrl: (moduleId: number) => string;
/**
 * @summary Delete a module (admin only)
 */
export declare const deleteModule: (moduleId: number, options?: Parameters<typeof customFetch>[1]) => Promise<void>;
export declare const getDeleteModuleMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteModule>>, TError, DeleteModuleMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteModule>>, TError, DeleteModuleMutationVariables, TContext>;
export type DeleteModuleMutationResult = NonNullable<Awaited<ReturnType<typeof deleteModule>>>;
export type DeleteModuleMutationError = ErrorType<unknown>;
export type DeleteModuleMutationVariables = {
    moduleId: number;
};
/**
* @summary Delete a module (admin only)
*/
export declare const useDeleteModule: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteModule>>, TError, DeleteModuleMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteModule>>, TError, DeleteModuleMutationVariables, TContext>;
export declare const getListVideosUrl: (params?: ListVideosParams) => string;
/**
 * @summary List videos (optionally filter by moduleId)
 */
export declare const listVideos: (params?: ListVideosParams, options?: Parameters<typeof customFetch>[1]) => Promise<Video[]>;
export declare const getListVideosQueryKey: (params?: ListVideosParams) => readonly ["/api/videos", ...ListVideosParams[]];
export declare const getListVideosQueryOptions: <TData = Awaited<ReturnType<typeof listVideos>>, TError = ErrorType<unknown>>(params?: ListVideosParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listVideos>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listVideos>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListVideosQueryResult = NonNullable<Awaited<ReturnType<typeof listVideos>>>;
export type ListVideosQueryError = ErrorType<unknown>;
/**
 * @summary List videos (optionally filter by moduleId)
 */
export declare function useListVideos<TData = Awaited<ReturnType<typeof listVideos>>, TError = ErrorType<unknown>>(params?: ListVideosParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listVideos>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateVideoUrl: () => string;
/**
 * @summary Create a new video (admin only)
 */
export declare const createVideo: (videoInput: VideoInput, options?: Parameters<typeof customFetch>[1]) => Promise<Video>;
export declare const getCreateVideoMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createVideo>>, TError, CreateVideoMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createVideo>>, TError, CreateVideoMutationVariables, TContext>;
export type CreateVideoMutationResult = NonNullable<Awaited<ReturnType<typeof createVideo>>>;
export type CreateVideoMutationBody = BodyType<VideoInput>;
export type CreateVideoMutationError = ErrorType<unknown>;
export type CreateVideoMutationVariables = {
    data: BodyType<VideoInput>;
};
/**
* @summary Create a new video (admin only)
*/
export declare const useCreateVideo: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createVideo>>, TError, CreateVideoMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createVideo>>, TError, CreateVideoMutationVariables, TContext>;
export declare const getGetVideoUrl: (videoId: number) => string;
/**
 * @summary Get a single video
 */
export declare const getVideo: (videoId: number, options?: Parameters<typeof customFetch>[1]) => Promise<Video>;
export declare const getGetVideoQueryKey: (videoId: number) => readonly [`/api/videos/${number}`];
export declare const getGetVideoQueryOptions: <TData = Awaited<ReturnType<typeof getVideo>>, TError = ErrorType<void>>(videoId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getVideo>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getVideo>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetVideoQueryResult = NonNullable<Awaited<ReturnType<typeof getVideo>>>;
export type GetVideoQueryError = ErrorType<void>;
/**
 * @summary Get a single video
 */
export declare function useGetVideo<TData = Awaited<ReturnType<typeof getVideo>>, TError = ErrorType<void>>(videoId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getVideo>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateVideoUrl: (videoId: number) => string;
/**
 * @summary Update a video (admin only)
 */
export declare const updateVideo: (videoId: number, videoUpdate: VideoUpdate, options?: Parameters<typeof customFetch>[1]) => Promise<Video>;
export declare const getUpdateVideoMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateVideo>>, TError, UpdateVideoMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateVideo>>, TError, UpdateVideoMutationVariables, TContext>;
export type UpdateVideoMutationResult = NonNullable<Awaited<ReturnType<typeof updateVideo>>>;
export type UpdateVideoMutationBody = BodyType<VideoUpdate>;
export type UpdateVideoMutationError = ErrorType<unknown>;
export type UpdateVideoMutationVariables = {
    videoId: number;
    data: BodyType<VideoUpdate>;
};
/**
* @summary Update a video (admin only)
*/
export declare const useUpdateVideo: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateVideo>>, TError, UpdateVideoMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateVideo>>, TError, UpdateVideoMutationVariables, TContext>;
export declare const getDeleteVideoUrl: (videoId: number) => string;
/**
 * @summary Delete a video (admin only)
 */
export declare const deleteVideo: (videoId: number, options?: Parameters<typeof customFetch>[1]) => Promise<void>;
export declare const getDeleteVideoMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteVideo>>, TError, DeleteVideoMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteVideo>>, TError, DeleteVideoMutationVariables, TContext>;
export type DeleteVideoMutationResult = NonNullable<Awaited<ReturnType<typeof deleteVideo>>>;
export type DeleteVideoMutationError = ErrorType<unknown>;
export type DeleteVideoMutationVariables = {
    videoId: number;
};
/**
* @summary Delete a video (admin only)
*/
export declare const useDeleteVideo: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteVideo>>, TError, DeleteVideoMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteVideo>>, TError, DeleteVideoMutationVariables, TContext>;
export declare const getListWatchHistoryUrl: () => string;
/**
 * @summary Get current user's watch history
 */
export declare const listWatchHistory: (options?: Parameters<typeof customFetch>[1]) => Promise<WatchHistoryEntry[]>;
export declare const getListWatchHistoryQueryKey: () => readonly ["/api/watch-history"];
export declare const getListWatchHistoryQueryOptions: <TData = Awaited<ReturnType<typeof listWatchHistory>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listWatchHistory>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listWatchHistory>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListWatchHistoryQueryResult = NonNullable<Awaited<ReturnType<typeof listWatchHistory>>>;
export type ListWatchHistoryQueryError = ErrorType<unknown>;
/**
 * @summary Get current user's watch history
 */
export declare function useListWatchHistory<TData = Awaited<ReturnType<typeof listWatchHistory>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listWatchHistory>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpsertWatchProgressUrl: (videoId: number) => string;
/**
 * @summary Update watch progress for a video
 */
export declare const upsertWatchProgress: (videoId: number, watchProgressInput: WatchProgressInput, options?: Parameters<typeof customFetch>[1]) => Promise<WatchHistoryEntry>;
export declare const getUpsertWatchProgressMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof upsertWatchProgress>>, TError, UpsertWatchProgressMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof upsertWatchProgress>>, TError, UpsertWatchProgressMutationVariables, TContext>;
export type UpsertWatchProgressMutationResult = NonNullable<Awaited<ReturnType<typeof upsertWatchProgress>>>;
export type UpsertWatchProgressMutationBody = BodyType<WatchProgressInput>;
export type UpsertWatchProgressMutationError = ErrorType<unknown>;
export type UpsertWatchProgressMutationVariables = {
    videoId: number;
    data: BodyType<WatchProgressInput>;
};
/**
* @summary Update watch progress for a video
*/
export declare const useUpsertWatchProgress: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof upsertWatchProgress>>, TError, UpsertWatchProgressMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof upsertWatchProgress>>, TError, UpsertWatchProgressMutationVariables, TContext>;
export declare const getListQueueUrl: () => string;
/**
 * @summary Get current user's video queue
 */
export declare const listQueue: (options?: Parameters<typeof customFetch>[1]) => Promise<QueueItem[]>;
export declare const getListQueueQueryKey: () => readonly ["/api/queue"];
export declare const getListQueueQueryOptions: <TData = Awaited<ReturnType<typeof listQueue>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listQueue>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listQueue>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListQueueQueryResult = NonNullable<Awaited<ReturnType<typeof listQueue>>>;
export type ListQueueQueryError = ErrorType<unknown>;
/**
 * @summary Get current user's video queue
 */
export declare function useListQueue<TData = Awaited<ReturnType<typeof listQueue>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listQueue>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getAddToQueueUrl: (videoId: number) => string;
/**
 * @summary Add a video to personal queue
 */
export declare const addToQueue: (videoId: number, options?: Parameters<typeof customFetch>[1]) => Promise<QueueItem>;
export declare const getAddToQueueMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof addToQueue>>, TError, AddToQueueMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof addToQueue>>, TError, AddToQueueMutationVariables, TContext>;
export type AddToQueueMutationResult = NonNullable<Awaited<ReturnType<typeof addToQueue>>>;
export type AddToQueueMutationError = ErrorType<unknown>;
export type AddToQueueMutationVariables = {
    videoId: number;
};
/**
* @summary Add a video to personal queue
*/
export declare const useAddToQueue: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof addToQueue>>, TError, AddToQueueMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof addToQueue>>, TError, AddToQueueMutationVariables, TContext>;
export declare const getRemoveFromQueueUrl: (videoId: number) => string;
/**
 * @summary Remove a video from personal queue
 */
export declare const removeFromQueue: (videoId: number, options?: Parameters<typeof customFetch>[1]) => Promise<void>;
export declare const getRemoveFromQueueMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof removeFromQueue>>, TError, RemoveFromQueueMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof removeFromQueue>>, TError, RemoveFromQueueMutationVariables, TContext>;
export type RemoveFromQueueMutationResult = NonNullable<Awaited<ReturnType<typeof removeFromQueue>>>;
export type RemoveFromQueueMutationError = ErrorType<unknown>;
export type RemoveFromQueueMutationVariables = {
    videoId: number;
};
/**
* @summary Remove a video from personal queue
*/
export declare const useRemoveFromQueue: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof removeFromQueue>>, TError, RemoveFromQueueMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof removeFromQueue>>, TError, RemoveFromQueueMutationVariables, TContext>;
export declare const getGetQuizUrl: (moduleId: number) => string;
/**
 * @summary Get quiz questions for a module
 */
export declare const getQuiz: (moduleId: number, options?: Parameters<typeof customFetch>[1]) => Promise<QuizQuestion[]>;
export declare const getGetQuizQueryKey: (moduleId: number) => readonly [`/api/modules/${number}/quiz`];
export declare const getGetQuizQueryOptions: <TData = Awaited<ReturnType<typeof getQuiz>>, TError = ErrorType<unknown>>(moduleId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getQuiz>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getQuiz>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetQuizQueryResult = NonNullable<Awaited<ReturnType<typeof getQuiz>>>;
export type GetQuizQueryError = ErrorType<unknown>;
/**
 * @summary Get quiz questions for a module
 */
export declare function useGetQuiz<TData = Awaited<ReturnType<typeof getQuiz>>, TError = ErrorType<unknown>>(moduleId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getQuiz>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateQuizQuestionUrl: (moduleId: number) => string;
/**
 * @summary Add a quiz question to a module (admin only)
 */
export declare const createQuizQuestion: (moduleId: number, quizQuestionInput: QuizQuestionInput, options?: Parameters<typeof customFetch>[1]) => Promise<QuizQuestion>;
export declare const getCreateQuizQuestionMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createQuizQuestion>>, TError, CreateQuizQuestionMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createQuizQuestion>>, TError, CreateQuizQuestionMutationVariables, TContext>;
export type CreateQuizQuestionMutationResult = NonNullable<Awaited<ReturnType<typeof createQuizQuestion>>>;
export type CreateQuizQuestionMutationBody = BodyType<QuizQuestionInput>;
export type CreateQuizQuestionMutationError = ErrorType<unknown>;
export type CreateQuizQuestionMutationVariables = {
    moduleId: number;
    data: BodyType<QuizQuestionInput>;
};
/**
* @summary Add a quiz question to a module (admin only)
*/
export declare const useCreateQuizQuestion: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createQuizQuestion>>, TError, CreateQuizQuestionMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createQuizQuestion>>, TError, CreateQuizQuestionMutationVariables, TContext>;
export declare const getSubmitQuizUrl: (moduleId: number) => string;
/**
 * @summary Submit quiz answers and get result
 */
export declare const submitQuiz: (moduleId: number, quizSubmission: QuizSubmission, options?: Parameters<typeof customFetch>[1]) => Promise<QuizResult>;
export declare const getSubmitQuizMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof submitQuiz>>, TError, SubmitQuizMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof submitQuiz>>, TError, SubmitQuizMutationVariables, TContext>;
export type SubmitQuizMutationResult = NonNullable<Awaited<ReturnType<typeof submitQuiz>>>;
export type SubmitQuizMutationBody = BodyType<QuizSubmission>;
export type SubmitQuizMutationError = ErrorType<unknown>;
export type SubmitQuizMutationVariables = {
    moduleId: number;
    data: BodyType<QuizSubmission>;
};
/**
* @summary Submit quiz answers and get result
*/
export declare const useSubmitQuiz: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof submitQuiz>>, TError, SubmitQuizMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof submitQuiz>>, TError, SubmitQuizMutationVariables, TContext>;
export declare const getGetQuizResultUrl: (moduleId: number) => string;
/**
 * @summary Get current user's quiz result for a module
 */
export declare const getQuizResult: (moduleId: number, options?: Parameters<typeof customFetch>[1]) => Promise<QuizResult>;
export declare const getGetQuizResultQueryKey: (moduleId: number) => readonly [`/api/modules/${number}/quiz/result`];
export declare const getGetQuizResultQueryOptions: <TData = Awaited<ReturnType<typeof getQuizResult>>, TError = ErrorType<void>>(moduleId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getQuizResult>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getQuizResult>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetQuizResultQueryResult = NonNullable<Awaited<ReturnType<typeof getQuizResult>>>;
export type GetQuizResultQueryError = ErrorType<void>;
/**
 * @summary Get current user's quiz result for a module
 */
export declare function useGetQuizResult<TData = Awaited<ReturnType<typeof getQuizResult>>, TError = ErrorType<void>>(moduleId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getQuizResult>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateQuizQuestionUrl: (questionId: number) => string;
/**
 * @summary Update a quiz question (admin only)
 */
export declare const updateQuizQuestion: (questionId: number, quizQuestionUpdate: QuizQuestionUpdate, options?: Parameters<typeof customFetch>[1]) => Promise<QuizQuestion>;
export declare const getUpdateQuizQuestionMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateQuizQuestion>>, TError, UpdateQuizQuestionMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateQuizQuestion>>, TError, UpdateQuizQuestionMutationVariables, TContext>;
export type UpdateQuizQuestionMutationResult = NonNullable<Awaited<ReturnType<typeof updateQuizQuestion>>>;
export type UpdateQuizQuestionMutationBody = BodyType<QuizQuestionUpdate>;
export type UpdateQuizQuestionMutationError = ErrorType<unknown>;
export type UpdateQuizQuestionMutationVariables = {
    questionId: number;
    data: BodyType<QuizQuestionUpdate>;
};
/**
* @summary Update a quiz question (admin only)
*/
export declare const useUpdateQuizQuestion: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateQuizQuestion>>, TError, UpdateQuizQuestionMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateQuizQuestion>>, TError, UpdateQuizQuestionMutationVariables, TContext>;
export declare const getDeleteQuizQuestionUrl: (questionId: number) => string;
/**
 * @summary Delete a quiz question (admin only)
 */
export declare const deleteQuizQuestion: (questionId: number, options?: Parameters<typeof customFetch>[1]) => Promise<void>;
export declare const getDeleteQuizQuestionMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteQuizQuestion>>, TError, DeleteQuizQuestionMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteQuizQuestion>>, TError, DeleteQuizQuestionMutationVariables, TContext>;
export type DeleteQuizQuestionMutationResult = NonNullable<Awaited<ReturnType<typeof deleteQuizQuestion>>>;
export type DeleteQuizQuestionMutationError = ErrorType<unknown>;
export type DeleteQuizQuestionMutationVariables = {
    questionId: number;
};
/**
* @summary Delete a quiz question (admin only)
*/
export declare const useDeleteQuizQuestion: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteQuizQuestion>>, TError, DeleteQuizQuestionMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteQuizQuestion>>, TError, DeleteQuizQuestionMutationVariables, TContext>;
export declare const getListGroupsUrl: () => string;
/**
 * @summary List all groups with member counts (admin only)
 */
export declare const listGroups: (options?: Parameters<typeof customFetch>[1]) => Promise<Group[]>;
export declare const getListGroupsQueryKey: () => readonly ["/api/groups"];
export declare const getListGroupsQueryOptions: <TData = Awaited<ReturnType<typeof listGroups>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listGroups>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listGroups>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListGroupsQueryResult = NonNullable<Awaited<ReturnType<typeof listGroups>>>;
export type ListGroupsQueryError = ErrorType<unknown>;
/**
 * @summary List all groups with member counts (admin only)
 */
export declare function useListGroups<TData = Awaited<ReturnType<typeof listGroups>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listGroups>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateGroupUrl: () => string;
/**
 * @summary Create a new group (admin only)
 */
export declare const createGroup: (groupInput: GroupInput, options?: Parameters<typeof customFetch>[1]) => Promise<Group>;
export declare const getCreateGroupMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createGroup>>, TError, CreateGroupMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createGroup>>, TError, CreateGroupMutationVariables, TContext>;
export type CreateGroupMutationResult = NonNullable<Awaited<ReturnType<typeof createGroup>>>;
export type CreateGroupMutationBody = BodyType<GroupInput>;
export type CreateGroupMutationError = ErrorType<unknown>;
export type CreateGroupMutationVariables = {
    data: BodyType<GroupInput>;
};
/**
* @summary Create a new group (admin only)
*/
export declare const useCreateGroup: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createGroup>>, TError, CreateGroupMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createGroup>>, TError, CreateGroupMutationVariables, TContext>;
export declare const getUpdateGroupUrl: (groupId: number) => string;
/**
 * @summary Update a group (admin only)
 */
export declare const updateGroup: (groupId: number, groupInput: GroupInput, options?: Parameters<typeof customFetch>[1]) => Promise<Group>;
export declare const getUpdateGroupMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateGroup>>, TError, UpdateGroupMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateGroup>>, TError, UpdateGroupMutationVariables, TContext>;
export type UpdateGroupMutationResult = NonNullable<Awaited<ReturnType<typeof updateGroup>>>;
export type UpdateGroupMutationBody = BodyType<GroupInput>;
export type UpdateGroupMutationError = ErrorType<unknown>;
export type UpdateGroupMutationVariables = {
    groupId: number;
    data: BodyType<GroupInput>;
};
/**
* @summary Update a group (admin only)
*/
export declare const useUpdateGroup: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateGroup>>, TError, UpdateGroupMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateGroup>>, TError, UpdateGroupMutationVariables, TContext>;
export declare const getDeleteGroupUrl: (groupId: number) => string;
/**
 * @summary Delete a group (admin only)
 */
export declare const deleteGroup: (groupId: number, options?: Parameters<typeof customFetch>[1]) => Promise<void>;
export declare const getDeleteGroupMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteGroup>>, TError, DeleteGroupMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteGroup>>, TError, DeleteGroupMutationVariables, TContext>;
export type DeleteGroupMutationResult = NonNullable<Awaited<ReturnType<typeof deleteGroup>>>;
export type DeleteGroupMutationError = ErrorType<unknown>;
export type DeleteGroupMutationVariables = {
    groupId: number;
};
/**
* @summary Delete a group (admin only)
*/
export declare const useDeleteGroup: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteGroup>>, TError, DeleteGroupMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteGroup>>, TError, DeleteGroupMutationVariables, TContext>;
export declare const getListGroupMembersUrl: (groupId: number) => string;
/**
 * @summary List members of a group (admin only)
 */
export declare const listGroupMembers: (groupId: number, options?: Parameters<typeof customFetch>[1]) => Promise<GroupMember[]>;
export declare const getListGroupMembersQueryKey: (groupId: number) => readonly [`/api/groups/${number}/members`];
export declare const getListGroupMembersQueryOptions: <TData = Awaited<ReturnType<typeof listGroupMembers>>, TError = ErrorType<unknown>>(groupId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listGroupMembers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listGroupMembers>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListGroupMembersQueryResult = NonNullable<Awaited<ReturnType<typeof listGroupMembers>>>;
export type ListGroupMembersQueryError = ErrorType<unknown>;
/**
 * @summary List members of a group (admin only)
 */
export declare function useListGroupMembers<TData = Awaited<ReturnType<typeof listGroupMembers>>, TError = ErrorType<unknown>>(groupId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listGroupMembers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getAddGroupMemberUrl: (groupId: number) => string;
/**
 * @summary Add a user to a group (admin only)
 */
export declare const addGroupMember: (groupId: number, groupMemberInput: GroupMemberInput, options?: Parameters<typeof customFetch>[1]) => Promise<void>;
export declare const getAddGroupMemberMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof addGroupMember>>, TError, AddGroupMemberMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof addGroupMember>>, TError, AddGroupMemberMutationVariables, TContext>;
export type AddGroupMemberMutationResult = NonNullable<Awaited<ReturnType<typeof addGroupMember>>>;
export type AddGroupMemberMutationBody = BodyType<GroupMemberInput>;
export type AddGroupMemberMutationError = ErrorType<unknown>;
export type AddGroupMemberMutationVariables = {
    groupId: number;
    data: BodyType<GroupMemberInput>;
};
/**
* @summary Add a user to a group (admin only)
*/
export declare const useAddGroupMember: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof addGroupMember>>, TError, AddGroupMemberMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof addGroupMember>>, TError, AddGroupMemberMutationVariables, TContext>;
export declare const getRemoveGroupMemberUrl: (groupId: number, userId: string) => string;
/**
 * @summary Remove a user from a group (admin only)
 */
export declare const removeGroupMember: (groupId: number, userId: string, options?: Parameters<typeof customFetch>[1]) => Promise<void>;
export declare const getRemoveGroupMemberMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof removeGroupMember>>, TError, RemoveGroupMemberMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof removeGroupMember>>, TError, RemoveGroupMemberMutationVariables, TContext>;
export type RemoveGroupMemberMutationResult = NonNullable<Awaited<ReturnType<typeof removeGroupMember>>>;
export type RemoveGroupMemberMutationError = ErrorType<unknown>;
export type RemoveGroupMemberMutationVariables = {
    groupId: number;
    userId: string;
};
/**
* @summary Remove a user from a group (admin only)
*/
export declare const useRemoveGroupMember: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof removeGroupMember>>, TError, RemoveGroupMemberMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof removeGroupMember>>, TError, RemoveGroupMemberMutationVariables, TContext>;
export declare const getListMyAssignmentsUrl: () => string;
/**
 * @summary List current user's module assignments
 */
export declare const listMyAssignments: (options?: Parameters<typeof customFetch>[1]) => Promise<Assignment[]>;
export declare const getListMyAssignmentsQueryKey: () => readonly ["/api/assignments"];
export declare const getListMyAssignmentsQueryOptions: <TData = Awaited<ReturnType<typeof listMyAssignments>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listMyAssignments>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listMyAssignments>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListMyAssignmentsQueryResult = NonNullable<Awaited<ReturnType<typeof listMyAssignments>>>;
export type ListMyAssignmentsQueryError = ErrorType<unknown>;
/**
 * @summary List current user's module assignments
 */
export declare function useListMyAssignments<TData = Awaited<ReturnType<typeof listMyAssignments>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listMyAssignments>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getAdminListUsersUrl: () => string;
/**
 * @summary List all users with contact info (admin only)
 */
export declare const adminListUsers: (options?: Parameters<typeof customFetch>[1]) => Promise<UserWithProgress[]>;
export declare const getAdminListUsersQueryKey: () => readonly ["/api/admin/users"];
export declare const getAdminListUsersQueryOptions: <TData = Awaited<ReturnType<typeof adminListUsers>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof adminListUsers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof adminListUsers>>, TError, TData> & {
    queryKey: QueryKey;
};
export type AdminListUsersQueryResult = NonNullable<Awaited<ReturnType<typeof adminListUsers>>>;
export type AdminListUsersQueryError = ErrorType<unknown>;
/**
 * @summary List all users with contact info (admin only)
 */
export declare function useAdminListUsers<TData = Awaited<ReturnType<typeof adminListUsers>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof adminListUsers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateUserRoleUrl: (userId: string) => string;
/**
 * @summary Update a user's role (admin only)
 */
export declare const updateUserRole: (userId: string, roleUpdate: RoleUpdate, options?: Parameters<typeof customFetch>[1]) => Promise<User>;
export declare const getUpdateUserRoleMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateUserRole>>, TError, UpdateUserRoleMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateUserRole>>, TError, UpdateUserRoleMutationVariables, TContext>;
export type UpdateUserRoleMutationResult = NonNullable<Awaited<ReturnType<typeof updateUserRole>>>;
export type UpdateUserRoleMutationBody = BodyType<RoleUpdate>;
export type UpdateUserRoleMutationError = ErrorType<unknown>;
export type UpdateUserRoleMutationVariables = {
    userId: string;
    data: BodyType<RoleUpdate>;
};
/**
* @summary Update a user's role (admin only)
*/
export declare const useUpdateUserRole: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateUserRole>>, TError, UpdateUserRoleMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateUserRole>>, TError, UpdateUserRoleMutationVariables, TContext>;
export declare const getCreateAssignmentUrl: () => string;
/**
 * @summary Assign a module to one or more users (admin only)
 */
export declare const createAssignment: (assignmentInput: AssignmentInput, options?: Parameters<typeof customFetch>[1]) => Promise<Assignment[]>;
export declare const getCreateAssignmentMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createAssignment>>, TError, CreateAssignmentMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createAssignment>>, TError, CreateAssignmentMutationVariables, TContext>;
export type CreateAssignmentMutationResult = NonNullable<Awaited<ReturnType<typeof createAssignment>>>;
export type CreateAssignmentMutationBody = BodyType<AssignmentInput>;
export type CreateAssignmentMutationError = ErrorType<unknown>;
export type CreateAssignmentMutationVariables = {
    data: BodyType<AssignmentInput>;
};
/**
* @summary Assign a module to one or more users (admin only)
*/
export declare const useCreateAssignment: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createAssignment>>, TError, CreateAssignmentMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createAssignment>>, TError, CreateAssignmentMutationVariables, TContext>;
export declare const getDeleteAssignmentUrl: (assignmentId: number) => string;
/**
 * @summary Delete an assignment (admin only)
 */
export declare const deleteAssignment: (assignmentId: number, options?: Parameters<typeof customFetch>[1]) => Promise<void>;
export declare const getDeleteAssignmentMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteAssignment>>, TError, DeleteAssignmentMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteAssignment>>, TError, DeleteAssignmentMutationVariables, TContext>;
export type DeleteAssignmentMutationResult = NonNullable<Awaited<ReturnType<typeof deleteAssignment>>>;
export type DeleteAssignmentMutationError = ErrorType<unknown>;
export type DeleteAssignmentMutationVariables = {
    assignmentId: number;
};
/**
* @summary Delete an assignment (admin only)
*/
export declare const useDeleteAssignment: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteAssignment>>, TError, DeleteAssignmentMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteAssignment>>, TError, DeleteAssignmentMutationVariables, TContext>;
export declare const getUpdateModuleVisibilityUrl: (moduleId: number) => string;
/**
 * @summary Toggle module public/private visibility (admin only)
 */
export declare const updateModuleVisibility: (moduleId: number, visibilityUpdate: VisibilityUpdate, options?: Parameters<typeof customFetch>[1]) => Promise<Module>;
export declare const getUpdateModuleVisibilityMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateModuleVisibility>>, TError, UpdateModuleVisibilityMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateModuleVisibility>>, TError, UpdateModuleVisibilityMutationVariables, TContext>;
export type UpdateModuleVisibilityMutationResult = NonNullable<Awaited<ReturnType<typeof updateModuleVisibility>>>;
export type UpdateModuleVisibilityMutationBody = BodyType<VisibilityUpdate>;
export type UpdateModuleVisibilityMutationError = ErrorType<unknown>;
export type UpdateModuleVisibilityMutationVariables = {
    moduleId: number;
    data: BodyType<VisibilityUpdate>;
};
/**
* @summary Toggle module public/private visibility (admin only)
*/
export declare const useUpdateModuleVisibility: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateModuleVisibility>>, TError, UpdateModuleVisibilityMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateModuleVisibility>>, TError, UpdateModuleVisibilityMutationVariables, TContext>;
export declare const getGetProgressMatrixUrl: () => string;
/**
 * @summary Get pass/fail matrix for all users across all modules (admin only)
 */
export declare const getProgressMatrix: (options?: Parameters<typeof customFetch>[1]) => Promise<ProgressMatrix>;
export declare const getGetProgressMatrixQueryKey: () => readonly ["/api/admin/progress-matrix"];
export declare const getGetProgressMatrixQueryOptions: <TData = Awaited<ReturnType<typeof getProgressMatrix>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getProgressMatrix>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getProgressMatrix>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetProgressMatrixQueryResult = NonNullable<Awaited<ReturnType<typeof getProgressMatrix>>>;
export type GetProgressMatrixQueryError = ErrorType<unknown>;
/**
 * @summary Get pass/fail matrix for all users across all modules (admin only)
 */
export declare function useGetProgressMatrix<TData = Awaited<ReturnType<typeof getProgressMatrix>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getProgressMatrix>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetAuditLogUrl: (params?: GetAuditLogParams) => string;
/**
 * @summary Get content change log (admin only)
 */
export declare const getAuditLog: (params?: GetAuditLogParams, options?: Parameters<typeof customFetch>[1]) => Promise<AuditLogEntry[]>;
export declare const getGetAuditLogQueryKey: (params?: GetAuditLogParams) => readonly ["/api/admin/audit-log", ...GetAuditLogParams[]];
export declare const getGetAuditLogQueryOptions: <TData = Awaited<ReturnType<typeof getAuditLog>>, TError = ErrorType<unknown>>(params?: GetAuditLogParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAuditLog>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getAuditLog>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetAuditLogQueryResult = NonNullable<Awaited<ReturnType<typeof getAuditLog>>>;
export type GetAuditLogQueryError = ErrorType<unknown>;
/**
 * @summary Get content change log (admin only)
 */
export declare function useGetAuditLog<TData = Awaited<ReturnType<typeof getAuditLog>>, TError = ErrorType<unknown>>(params?: GetAuditLogParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAuditLog>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetAdminSettingsUrl: () => string;
/**
 * @summary Get all admin settings (admin only)
 */
export declare const getAdminSettings: (options?: Parameters<typeof customFetch>[1]) => Promise<Setting[]>;
export declare const getGetAdminSettingsQueryKey: () => readonly ["/api/admin/settings"];
export declare const getGetAdminSettingsQueryOptions: <TData = Awaited<ReturnType<typeof getAdminSettings>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAdminSettings>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getAdminSettings>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetAdminSettingsQueryResult = NonNullable<Awaited<ReturnType<typeof getAdminSettings>>>;
export type GetAdminSettingsQueryError = ErrorType<unknown>;
/**
 * @summary Get all admin settings (admin only)
 */
export declare function useGetAdminSettings<TData = Awaited<ReturnType<typeof getAdminSettings>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAdminSettings>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateAdminSettingUrl: () => string;
/**
 * @summary Upsert an admin setting (admin only)
 */
export declare const updateAdminSetting: (settingInput: SettingInput, options?: Parameters<typeof customFetch>[1]) => Promise<Setting>;
export declare const getUpdateAdminSettingMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateAdminSetting>>, TError, UpdateAdminSettingMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateAdminSetting>>, TError, UpdateAdminSettingMutationVariables, TContext>;
export type UpdateAdminSettingMutationResult = NonNullable<Awaited<ReturnType<typeof updateAdminSetting>>>;
export type UpdateAdminSettingMutationBody = BodyType<SettingInput>;
export type UpdateAdminSettingMutationError = ErrorType<unknown>;
export type UpdateAdminSettingMutationVariables = {
    data: BodyType<SettingInput>;
};
/**
* @summary Upsert an admin setting (admin only)
*/
export declare const useUpdateAdminSetting: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateAdminSetting>>, TError, UpdateAdminSettingMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateAdminSetting>>, TError, UpdateAdminSettingMutationVariables, TContext>;
export declare const getRequestUploadUrlUrl: () => string;
/**
 * @summary Request a presigned URL for file upload
 */
export declare const requestUploadUrl: (uploadUrlRequest: UploadUrlRequest, options?: Parameters<typeof customFetch>[1]) => Promise<UploadUrlResponse>;
export declare const getRequestUploadUrlMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof requestUploadUrl>>, TError, RequestUploadUrlMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof requestUploadUrl>>, TError, RequestUploadUrlMutationVariables, TContext>;
export type RequestUploadUrlMutationResult = NonNullable<Awaited<ReturnType<typeof requestUploadUrl>>>;
export type RequestUploadUrlMutationBody = BodyType<UploadUrlRequest>;
export type RequestUploadUrlMutationError = ErrorType<void>;
export type RequestUploadUrlMutationVariables = {
    data: BodyType<UploadUrlRequest>;
};
/**
* @summary Request a presigned URL for file upload
*/
export declare const useRequestUploadUrl: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof requestUploadUrl>>, TError, RequestUploadUrlMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof requestUploadUrl>>, TError, RequestUploadUrlMutationVariables, TContext>;
export declare const getGetStorageObjectUrl: (objectPath: string) => string;
/**
 * @summary Serve an uploaded object
 */
export declare const getStorageObject: (objectPath: string, options?: Parameters<typeof customFetch>[1]) => Promise<Blob>;
export declare const getGetStorageObjectQueryKey: (objectPath: string) => readonly [`/api/storage/objects/${string}`];
export declare const getGetStorageObjectQueryOptions: <TData = Awaited<ReturnType<typeof getStorageObject>>, TError = ErrorType<void>>(objectPath: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getStorageObject>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getStorageObject>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetStorageObjectQueryResult = NonNullable<Awaited<ReturnType<typeof getStorageObject>>>;
export type GetStorageObjectQueryError = ErrorType<void>;
/**
 * @summary Serve an uploaded object
 */
export declare function useGetStorageObject<TData = Awaited<ReturnType<typeof getStorageObject>>, TError = ErrorType<void>>(objectPath: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getStorageObject>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export {};
//# sourceMappingURL=api.d.ts.map