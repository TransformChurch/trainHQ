import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import {
  db,
  planningCenterOAuthStatesTable,
  planningCenterTokensTable,
  usersTable,
} from "@workspace/db";
import { eq, or } from "drizzle-orm";

const AUTHORIZE_URL = "https://api.planningcenteronline.com/oauth/authorize";
const TOKEN_URL = "https://api.planningcenteronline.com/oauth/token";
const PEOPLE_API_URL = "https://api.planningcenteronline.com/people/v2";
const STATE_TTL_MS = 10 * 60 * 1000;
const REFRESH_BUFFER_MS = 60 * 1000;

type TokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
};

export type PlanningCenterPerson = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  address: string | null;
};

export class PlanningCenterError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "PlanningCenterError";
  }
}

function config() {
  const clientId = process.env.PCO_CLIENT_ID?.trim();
  const clientSecret = process.env.PCO_CLIENT_SECRET?.trim();
  const redirectUri = process.env.PCO_REDIRECT_URI?.trim();
  const encryptionSecret = process.env.SESSION_SECRET?.trim();
  if (!clientId || !clientSecret || !redirectUri || !encryptionSecret) {
    throw new PlanningCenterError(
      "planning_center_not_configured",
      "Planning Center login is not configured.",
      503,
    );
  }
  return { clientId, clientSecret, redirectUri, encryptionSecret };
}

function key(): Buffer {
  return createHash("sha256").update(config().encryptionSecret).digest();
}

function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

function decrypt(value: string): string {
  const [version, encodedIv, encodedTag, encodedValue] = value.split(":");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedValue) {
    throw new PlanningCenterError(
      "planning_center_reconnect_required",
      "Your Church Center connection must be renewed.",
      401,
    );
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(encodedIv, "base64url"));
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new PlanningCenterError(
      "planning_center_reconnect_required",
      "Your Church Center connection must be renewed.",
      401,
    );
  }
}

function normalizeReturnTo(value: unknown): string {
  const candidate = typeof value === "string" && value.trim() ? value.trim() : "/sign-in";
  if (candidate.startsWith("/") && !candidate.startsWith("//")) return candidate;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new PlanningCenterError("invalid_return_url", "The sign-in return URL is invalid.", 400);
  }
  const allowedOrigins = new Set(
    (process.env.CORS_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  if (!allowedOrigins.has(url.origin)) {
    throw new PlanningCenterError("invalid_return_url", "The sign-in return URL is not allowed.", 400);
  }
  return url.toString();
}

function normalizeTokens(data: TokenResponse, fallbackRefreshToken?: string) {
  if (typeof data.access_token !== "string" || !data.access_token) {
    throw new PlanningCenterError(
      "planning_center_token_error",
      "Planning Center did not return a usable access token.",
    );
  }
  const refreshToken = typeof data.refresh_token === "string" && data.refresh_token
    ? data.refresh_token
    : fallbackRefreshToken;
  if (!refreshToken) {
    throw new PlanningCenterError(
      "planning_center_token_error",
      "Planning Center did not return a usable refresh token.",
    );
  }
  const expiresIn = typeof data.expires_in === "number"
    ? data.expires_in
    : Number(data.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new PlanningCenterError(
      "planning_center_token_error",
      "Planning Center returned an invalid token expiration.",
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    scope: typeof data.scope === "string" ? data.scope : null,
  };
}

async function requestTokens(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await response.json().catch(() => null) as TokenResponse | null;
  if (!response.ok || !data) {
    throw new PlanningCenterError(
      response.status === 401 ? "planning_center_reconnect_required" : "planning_center_token_error",
      response.status === 401
        ? "Your Church Center connection must be renewed."
        : "Planning Center could not complete sign-in.",
      response.status === 401 ? 401 : 502,
    );
  }
  return data;
}

async function peopleRequest<T>(
  path: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<T> {
  const requestUrl = planningCenterPeopleUrl(path);
  const response = await fetch(requestUrl, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => null) as T | null;
  if (!response.ok) {
    const permissionError = response.status === 401 || response.status === 403;
    throw new PlanningCenterError(
      permissionError ? "planning_center_permission_error" : "planning_center_api_error",
      permissionError
        ? "Planning Center access is missing or expired. Sign in with Church Center again."
        : "Planning Center could not process this request.",
      permissionError ? 403 : 502,
    );
  }
  return data as T;
}

export function planningCenterPeopleUrl(path: string): URL {
  const base = new URL(`${PEOPLE_API_URL}/`);
  const requestUrl = /^https?:\/\//i.test(path)
    ? new URL(path)
    : new URL(`${base.pathname.replace(/\/$/, "")}/${path.replace(/^\/+/, "")}`, base.origin);
  if (
    requestUrl.origin !== base.origin ||
    !requestUrl.pathname.startsWith(`${base.pathname.replace(/\/$/, "")}/`)
  ) {
    throw new PlanningCenterError(
      "planning_center_api_error",
      "Planning Center returned an invalid pagination URL.",
    );
  }
  return requestUrl;
}

async function fetchPeopleCollection<T>(path: string, accessToken: string): Promise<T[]> {
  const records: T[] = [];
  const visited = new Set<string>();
  let next: string | null = path;

  while (next && !visited.has(next)) {
    visited.add(next);
    const response: {
      data?: T[];
      links?: { next?: unknown };
    } = await peopleRequest(next, accessToken);
    records.push(...(response.data ?? []));
    next = typeof response.links?.next === "string" && response.links.next
      ? response.links.next
      : null;
  }

  return records;
}

export async function createAuthorizationRequest(returnToValue: unknown): Promise<string> {
  const settings = config();
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(64).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  await db.insert(planningCenterOAuthStatesTable).values({
    state,
    codeVerifierEncrypted: encrypt(codeVerifier),
    returnTo: normalizeReturnTo(returnToValue),
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", settings.clientId);
  url.searchParams.set("redirect_uri", settings.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "people");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function consumeAuthorizationState(state: string) {
  const rows = await db
    .delete(planningCenterOAuthStatesTable)
    .where(eq(planningCenterOAuthStatesTable.state, state))
    .returning();
  const record = rows[0];
  if (!record || record.expiresAt.getTime() <= Date.now()) {
    throw new PlanningCenterError(
      "invalid_oauth_state",
      "The Church Center sign-in request expired. Please try again.",
      400,
    );
  }
  return {
    returnTo: record.returnTo,
    codeVerifier: decrypt(record.codeVerifierEncrypted),
  };
}

export async function exchangeAuthorizationCode(code: string, codeVerifier: string) {
  const settings = config();
  return normalizeTokens(await requestTokens(new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: settings.clientId,
    client_secret: settings.clientSecret,
    redirect_uri: settings.redirectUri,
    code_verifier: codeVerifier,
  })));
}

export async function fetchCurrentPerson(accessToken: string): Promise<PlanningCenterPerson> {
  const response = await peopleRequest<{
    data?: { id?: unknown; attributes?: Record<string, unknown> };
  }>("/me", accessToken);
  const id = response.data?.id;
  const attributes = response.data?.attributes ?? {};
  if (typeof id !== "string" || !id) {
    throw new PlanningCenterError(
      "planning_center_profile_error",
      "Planning Center did not return a valid person record.",
    );
  }

  const fullName = typeof attributes.name === "string" ? attributes.name.trim() : "";
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const firstName = typeof attributes.first_name === "string" && attributes.first_name.trim()
    ? attributes.first_name.trim()
    : nameParts[0] ?? "Church";
  const lastName = typeof attributes.last_name === "string" && attributes.last_name.trim()
    ? attributes.last_name.trim()
    : nameParts.slice(1).join(" ") || "Member";
  let email = [attributes.email, attributes.primary_email, attributes.contact_email]
    .find((value): value is string => typeof value === "string" && value.includes("@"))
    ?.trim()
    .toLowerCase();
  if (!email) {
    const emailRecords = await fetchPeopleCollection<{
      attributes?: {
        address?: unknown;
        primary?: unknown;
        blocked?: unknown;
      };
    }>(`/people/${encodeURIComponent(id)}/emails`, accessToken);
    const emails = emailRecords
      .map((item) => ({
        address: typeof item.attributes?.address === "string"
          ? item.attributes.address.trim().toLowerCase()
          : "",
        primary: item.attributes?.primary === true,
        blocked: item.attributes?.blocked === true,
      }))
      .filter((item) => item.address.includes("@"))
      .sort((left, right) =>
        Number(right.primary) - Number(left.primary) ||
        Number(left.blocked) - Number(right.blocked)
      );
    email = emails[0]?.address;
  }
  if (!email) {
    throw new PlanningCenterError(
      "planning_center_profile_email_missing",
      "Your Planning Center profile does not have an email address available.",
      422,
    );
  }

  const [phoneRecords, addressRecords] = await Promise.all([
    fetchPeopleCollection<{ attributes?: Record<string, unknown> }>(
      `/people/${encodeURIComponent(id)}/phone_numbers`,
      accessToken,
    ),
    fetchPeopleCollection<{ attributes?: Record<string, unknown> }>(
      `/people/${encodeURIComponent(id)}/addresses`,
      accessToken,
    ),
  ]);

  return {
    id,
    firstName,
    lastName,
    email,
    phone: selectPrimaryPhone(phoneRecords),
    address: selectPrimaryAddress(addressRecords),
  };
}

function relationshipPriority(attributes: Record<string, unknown> | undefined): number {
  return attributes?.primary === true ? 1 : 0;
}

export function selectPrimaryPhone(
  records: Array<{ attributes?: Record<string, unknown> }>,
): string | null {
  const phones = records
    .map((record) => {
      const attributes = record.attributes ?? {};
      const value = [attributes.number, attributes.phone_number, attributes.value]
        .find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0)
        ?.trim() ?? "";
      return { value, priority: relationshipPriority(attributes) };
    })
    .filter((phone) => phone.value.length > 0)
    .sort((left, right) => right.priority - left.priority);
  return phones[0]?.value ?? null;
}

export function selectPrimaryAddress(
  records: Array<{ attributes?: Record<string, unknown> }>,
): string | null {
  const addresses = records
    .map((record) => {
      const attributes = record.attributes ?? {};
      const lines = [
        attributes.street_line_1,
        attributes.street_line_2,
        attributes.street,
        attributes.city,
        attributes.state,
        attributes.zip,
        attributes.postal_code,
        attributes.country,
        attributes.country_code,
      ]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim());
      return {
        value: [...new Set(lines)].join(", "),
        priority: relationshipPriority(attributes),
      };
    })
    .filter((address) => address.value.length > 0)
    .sort((left, right) => right.priority - left.priority);
  return addresses[0]?.value ?? null;
}

export async function upsertPlanningCenterUser(person: PlanningCenterPerson) {
  const subjectMatches = await db
    .select()
    .from(usersTable)
    .where(or(
      eq(usersTable.planningCenterPersonId, person.id),
      eq(usersTable.externalUserId, person.id),
    ))
    .limit(1);

  if (subjectMatches[0]) {
    const emailOwner = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, person.email))
      .limit(1);
    if (emailOwner[0] && emailOwner[0].id !== subjectMatches[0].id) {
      throw new PlanningCenterError(
        "planning_center_identity_conflict",
        "This Church Center identity conflicts with another local account. Ask an administrator for help.",
        409,
      );
    }
    const updated = await db.update(usersTable).set({
      externalUserId: person.id,
      planningCenterPersonId: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
      phone: person.phone,
      address: person.address,
    }).where(eq(usersTable.id, subjectMatches[0].id)).returning();
    return updated[0];
  }

  const emailMatches = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, person.email))
    .limit(1);
  if (emailMatches[0]) {
    throw new PlanningCenterError(
      "planning_center_account_link_required",
      "An account with this email already exists. Ask an administrator to link it to Church Center.",
      409,
    );
  }

  const configuredAdminEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const configuredAdminExternalUserId = process.env.INITIAL_ADMIN_EXTERNAL_USER_ID?.trim();
  const bootstrapAdmin =
    person.email === configuredAdminEmail ||
    person.id === configuredAdminExternalUserId;
  const existingAdmin = bootstrapAdmin
    ? await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin")).limit(1)
    : [];
  const inserted = await db.insert(usersTable).values({
    id: person.id,
    externalUserId: person.id,
    planningCenterPersonId: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
    phone: person.phone,
    address: person.address,
    role: bootstrapAdmin && existingAdmin.length === 0 ? "admin" : "student",
  }).returning();
  return inserted[0];
}

export async function savePlanningCenterTokens(
  userId: string,
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    scope: string | null;
  },
) {
  const accessTokenEncrypted = encrypt(tokens.accessToken);
  const refreshTokenEncrypted = encrypt(tokens.refreshToken);
  await db.insert(planningCenterTokensTable).values({
    userId,
    accessTokenEncrypted,
    refreshTokenEncrypted,
    accessTokenExpiresAt: tokens.expiresAt,
    scope: tokens.scope,
  }).onConflictDoUpdate({
    target: planningCenterTokensTable.userId,
    set: {
      accessTokenEncrypted,
      refreshTokenEncrypted,
      accessTokenExpiresAt: tokens.expiresAt,
      scope: tokens.scope,
      updatedAt: new Date(),
    },
  });
}

async function refreshAccessToken(userId: string, encryptedRefreshToken: string) {
  const settings = config();
  const currentRefreshToken = decrypt(encryptedRefreshToken);
  const tokens = normalizeTokens(await requestTokens(new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: currentRefreshToken,
    client_id: settings.clientId,
    client_secret: settings.clientSecret,
  })), currentRefreshToken);
  await savePlanningCenterTokens(userId, tokens);
  return tokens.accessToken;
}

export async function getValidPlanningCenterAccessToken(userId: string): Promise<string> {
  const rows = await db
    .select()
    .from(planningCenterTokensTable)
    .where(eq(planningCenterTokensTable.userId, userId))
    .limit(1);
  const token = rows[0];
  if (!token) {
    throw new PlanningCenterError(
      "planning_center_not_connected",
      "This member's Church Center connection is missing. They need to sign in again.",
      409,
    );
  }
  if (token.accessTokenExpiresAt.getTime() > Date.now() + REFRESH_BUFFER_MS) {
    return decrypt(token.accessTokenEncrypted);
  }
  return refreshAccessToken(userId, token.refreshTokenEncrypted);
}

export type PlanningCenterDateField = "assigned" | "completed";

type ModuleFieldMapping = {
  assigned?: string | number;
  completed?: string | number;
};

export function parseModuleFieldMapping(raw: string): Record<string, ModuleFieldMapping | string | number> {
  let mapping: unknown;
  try {
    mapping = JSON.parse(raw);
  } catch {
    throw new PlanningCenterError(
      "planning_center_field_mapping_invalid",
      "The Planning Center custom-field mapping is invalid.",
      503,
    );
  }
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    throw new PlanningCenterError(
      "planning_center_field_mapping_invalid",
      "The Planning Center custom-field mapping is invalid.",
      503,
    );
  }
  return mapping as Record<string, ModuleFieldMapping | string | number>;
}

export function fieldDefinitionIdForModule(
  moduleId: number,
  dateField: PlanningCenterDateField,
): string {
  const raw = process.env.PCO_MODULE_FIELD_DEFINITION_MAP?.trim();
  if (!raw) {
    throw new PlanningCenterError(
      "planning_center_field_mapping_missing",
      `This module has no Planning Center ${dateField} date field mapping.`,
      503,
    );
  }
  const mapping = parseModuleFieldMapping(raw);
  const moduleMapping = mapping[String(moduleId)];
  // A string/number entry is the legacy completion-only format.
  const value = typeof moduleMapping === "object" && moduleMapping !== null
    ? moduleMapping[dateField]
    : dateField === "completed"
      ? moduleMapping
      : undefined;
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    String(value).trim() === ""
  ) {
    throw new PlanningCenterError(
      "planning_center_field_mapping_missing",
      `This module has no Planning Center ${dateField} date field mapping.`,
      503,
    );
  }
  return String(value);
}

type FieldDataResource = {
  id?: unknown;
  relationships?: {
    field_definition?: {
      data?: { id?: unknown };
    };
  };
};

type FieldDataPage = {
  data?: FieldDataResource[];
  links?: { next?: unknown };
};

export function findFieldDataId(
  resources: FieldDataResource[] | undefined,
  fieldDefinitionId: string,
): string | null {
  const resource = resources?.find((item) =>
    String(item.relationships?.field_definition?.data?.id ?? "") === fieldDefinitionId,
  );
  return typeof resource?.id === "string" && resource.id ? resource.id : null;
}

export async function findFieldDataIdAcrossPages(
  initialPath: string,
  fieldDefinitionId: string,
  loadPage: (path: string) => Promise<FieldDataPage>,
): Promise<string | null> {
  let nextPath: string | null = initialPath;
  const visited = new Set<string>();
  for (let pageNumber = 0; nextPath && pageNumber < 50; pageNumber += 1) {
    if (visited.has(nextPath)) {
      throw new PlanningCenterError(
        "planning_center_api_error",
        "Planning Center returned a pagination loop.",
      );
    }
    visited.add(nextPath);
    const page = await loadPage(nextPath);
    const match = findFieldDataId(page.data, fieldDefinitionId);
    if (match) return match;
    nextPath = typeof page.links?.next === "string" && page.links.next
      ? page.links.next
      : null;
  }
  if (nextPath) {
    throw new PlanningCenterError(
      "planning_center_api_error",
      "Planning Center returned too many pages of custom fields.",
    );
  }
  return null;
}

export function buildFieldDatumUpdate(fieldDataId: string, completedAt: Date) {
  return {
    data: {
      type: "FieldDatum",
      id: fieldDataId,
      attributes: { value: completedAt.toISOString().slice(0, 10) },
    },
  };
}

async function updatePlanningCenterDateField(
  user: { id: string; planningCenterPersonId: string | null },
  moduleId: number,
  dateField: PlanningCenterDateField,
  date: Date,
) {
  if (!user.planningCenterPersonId) {
    throw new PlanningCenterError(
      "planning_center_not_connected",
      "This member has not connected Church Center.",
      409,
    );
  }
  const fieldDefinitionId = fieldDefinitionIdForModule(moduleId, dateField);
  const accessToken = await getValidPlanningCenterAccessToken(user.id);
  const fieldDataId = await findFieldDataIdAcrossPages(
    `/people/${encodeURIComponent(user.planningCenterPersonId)}/field_data`,
    fieldDefinitionId,
    (path) => peopleRequest<FieldDataPage>(path, accessToken),
  );
  if (!fieldDataId) {
    throw new PlanningCenterError(
      "planning_center_field_data_missing",
      `The mapped Planning Center ${dateField} date field is not available on this member's profile.`,
      422,
    );
  }
  await peopleRequest(
    `/field_data/${encodeURIComponent(fieldDataId)}`,
    accessToken,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildFieldDatumUpdate(fieldDataId, date)),
    },
  );
  return { fieldDataId };
}

export async function updatePlanningCenterModuleAssignment(
  user: { id: string; planningCenterPersonId: string | null },
  moduleId: number,
  assignedAt: Date,
) {
  return updatePlanningCenterDateField(user, moduleId, "assigned", assignedAt);
}

export type PlanningCenterAssignmentSyncResult =
  | { status: "synced" }
  | { status: "skipped"; message: string }
  | { status: "failed"; code: string; message: string };

export async function syncPlanningCenterModuleAssignment(
  user: { id: string; planningCenterPersonId: string | null },
  moduleId: number,
  assignedAt: Date,
  sync: (
    user: { id: string; planningCenterPersonId: string | null },
    moduleId: number,
    assignedAt: Date,
  ) => Promise<unknown> = updatePlanningCenterModuleAssignment,
): Promise<PlanningCenterAssignmentSyncResult> {
  if (!user.planningCenterPersonId) {
    return {
      status: "skipped",
      message: "Church Center is not connected for this member.",
    };
  }
  try {
    await sync(user, moduleId, assignedAt);
    return { status: "synced" };
  } catch (err) {
    if (err instanceof PlanningCenterError) {
      return { status: "failed", code: err.code, message: err.message };
    }
    return {
      status: "failed",
      code: "planning_center_assignment_sync_failed",
      message: "Planning Center could not be updated for this member.",
    };
  }
}

export async function updatePlanningCenterModuleCompletion(
  user: { id: string; planningCenterPersonId: string | null },
  moduleId: number,
  completedAt: Date,
) {
  return updatePlanningCenterDateField(user, moduleId, "completed", completedAt);
}