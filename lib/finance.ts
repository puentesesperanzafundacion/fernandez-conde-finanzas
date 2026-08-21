import { dbRequest } from "./supabase";

export type DocumentKind = "Presupuesto" | "Recibo" | "Cuenta de cobro";
export type Status = "Pagado" | "Pendiente" | "Vencido" | "Aceptado" | "Rechazado";
export type ClientStage = "Aceptado" | "Pendiente" | "Rechazado";
export type RecordEntity = "client" | "document" | "movement";
export type Partner = { userId: string; name: string; email: string };
export type Companion = { name: string; relationship: string };
export type PaymentStage = { id: string; description: string; amount: number };
export type Client = { id: number; name: string; email: string; phone: string; stage: ClientStage; internalKey: string; companions: Companion[]; total: number; updatedAt: string };
export type FinanceDocument = { id: number; folio: string; kind: DocumentKind; clientId: number; client: string; concept: string; amount: number; paidAmount: number; balance: number; paymentPlan: PaymentStage[]; status: Status; date: string; issuedAt: string; notes: string; updatedAt: string };
export type Movement = { id: number; type: "Ingreso" | "Gasto"; category: string; description: string; amount: number; occurredAt: string; documentId?: number | null; paymentStageId?: string | null; spentBy: string; note: string; updatedAt: string };
export type DocumentMargin = { documentId: number; clientId: number; folio: string; concept: string; income: number; expenses: number; margin: number; marginPercent: number | null };
export type ClientMargin = { clientId: number; clientName: string; income: number; expenses: number; margin: number; marginPercent: number | null };
export type ProfitSettings = { fundPercent: number; oscarPercent: number; danPercent: number; updatedAt: string };
export type ProfitDistribution = { id: number; periodStart: string; periodEnd: string; income: number; expenses: number; netProfit: number; fundAmount: number; oscarAmount: number; danAmount: number; fundPercent: number; oscarPercent: number; danPercent: number; createdAt: string };
export type NewDocumentInput = Omit<FinanceDocument, "id" | "folio" | "date" | "issuedAt" | "paidAmount" | "balance" | "updatedAt"> & { requestId: string };
export type NewExpenseInput = Pick<Movement, "category" | "description" | "amount" | "spentBy" | "occurredAt" | "documentId"> & { requestId: string };
export type NewPaymentInput = Pick<Movement, "amount" | "occurredAt" | "note" | "paymentStageId"> & { documentId: number; requestId: string };
export type TrashItem = { entity: RecordEntity; id: number; label: string; detail: string; deletedAt: string; deletedBy: string; updatedAt: string };
export type AuditEntry = { id: number; entity: RecordEntity; recordId: number; action: "created" | "updated" | "trashed" | "restored"; actor: string; occurredAt: string };

type ClientRow = { id: number; name: string; email: string; phone: string; stage: ClientStage; internal_key?: string | null; companions?: Companion[] | null; updated_at: string; deleted_at?: string | null; deleted_by?: string | null };
type DocumentRow = { id: number; folio: string; kind: DocumentKind; client_id: number; concept: string; amount_cents: number; payment_plan?: Array<{ id: string; description: string; amountCents: number }> | null; status: Status; notes: string; issued_at: string; updated_at: string; deleted_at?: string | null; deleted_by?: string | null; clients?: { name: string } | null };
type MovementRow = { id: number; type: "Ingreso" | "Gasto"; category: string; description: string; amount_cents: number; occurred_at: string; document_id?: number | null; payment_stage_id?: string | null; spent_by?: string | null; note?: string | null; updated_at: string; deleted_at?: string | null; deleted_by?: string | null; deleted_with_document?: boolean; documents?: { folio: string } | null };
type PartnerRow = { user_id: string; display_name: string; email: string };
type DocumentMarginRow = { document_id: number; client_id: number; folio: string; concept: string; income_cents: number; expense_cents: number; margin_cents: number; margin_percent: number | null };
type ClientMarginRow = { client_id: number; client_name: string; income_cents: number; expense_cents: number; margin_cents: number; margin_percent: number | null };
type ProfitSettingsRow = { fund_bps: number; oscar_bps: number; dan_bps: number; updated_at: string };
type ProfitDistributionRow = { id: number; period_start: string; period_end: string; income_cents: number; expense_cents: number; net_profit_cents: number; fund_cents: number; oscar_cents: number; dan_cents: number; fund_bps: number; oscar_bps: number; dan_bps: number; created_at: string };
type FundBalanceRow = { balance_cents: number };
type AuditRow = { id: number; entity: RecordEntity; record_id: number; action: AuditEntry["action"]; actor_id?: string | null; occurred_at: string };
type TimestampRow = { updated_at: string };
type CreatedDocumentRow = TimestampRow & { id: number; folio: string; issued_at: string };

const returned = { Prefer: "return=representation" };
export const formatDate = (value: string) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
const formatDateTime = (value: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function mapMovement(row: MovementRow): Movement {
  return { id: row.id, type: row.type, category: row.category, description: row.description, amount: row.amount_cents / 100, occurredAt: row.occurred_at, documentId: row.document_id, paymentStageId: row.payment_stage_id, spentBy: row.spent_by ?? "", note: row.note ?? "", updatedAt: row.updated_at };
}

function mapDocument(row: DocumentRow, paidAmount: number): FinanceDocument {
  const paymentPlan = (row.payment_plan ?? []).map((stage) => ({ id: stage.id, description: stage.description, amount: Number(stage.amountCents) / 100 }));
  return { id: row.id, folio: row.folio, kind: row.kind, clientId: row.client_id, client: row.clients?.name ?? "Cliente", concept: row.concept, amount: row.amount_cents / 100, paidAmount, balance: Math.max(row.amount_cents / 100 - paidAmount, 0), paymentPlan, status: row.status, date: formatDate(row.issued_at), issuedAt: row.issued_at, notes: row.notes ?? "", updatedAt: row.updated_at };
}

export async function loadFinanceData() {
  const [clientRows, documentRows, movementRows, partnerRows, documentMarginRows, clientMarginRows, settingsRows, distributionRows, fundRows] = await Promise.all([
    dbRequest<ClientRow[]>("clients?select=*&deleted_at=is.null&order=id.desc"),
    dbRequest<DocumentRow[]>("documents?select=*,clients(name)&deleted_at=is.null&order=id.desc"),
    dbRequest<MovementRow[]>("movements?select=*&deleted_at=is.null&order=occurred_at.desc,id.desc"),
    dbRequest<PartnerRow[]>("partners?select=user_id,display_name,email&order=display_name"),
    dbRequest<DocumentMarginRow[]>("finance_document_margins_v6?select=*&order=folio"),
    dbRequest<ClientMarginRow[]>("finance_client_margins_v6?select=*&order=client_name"),
    dbRequest<ProfitSettingsRow[]>("profit_distribution_settings_v6?select=*&limit=1"),
    dbRequest<ProfitDistributionRow[]>("profit_distributions_v6?select=*&order=period_start.desc,created_at.desc"),
    dbRequest<FundBalanceRow[]>("finance_fund_balance_v6?select=balance_cents"),
  ]);
  const movements = movementRows.map(mapMovement);
  const paidByDocument = new Map<number, number>();
  for (const movement of movements) if (movement.type === "Ingreso" && movement.documentId) paidByDocument.set(movement.documentId, (paidByDocument.get(movement.documentId) ?? 0) + movement.amount);
  const documents = documentRows.map((row) => mapDocument(row, paidByDocument.get(row.id) ?? 0));
  const clients: Client[] = clientRows.map((row) => ({ id: row.id, name: row.name, email: row.email, phone: row.phone, stage: row.stage ?? "Pendiente", internalKey: row.internal_key ?? "", companions: Array.isArray(row.companions) ? row.companions : [], updatedAt: row.updated_at, total: documents.filter((document) => document.clientId === row.id).reduce((sum, document) => sum + document.paidAmount, 0) }));
  const partners: Partner[] = partnerRows.map((row) => ({ userId: row.user_id, name: row.display_name || row.email, email: row.email }));
  const documentMargins: DocumentMargin[] = documentMarginRows.map((row) => ({ documentId: row.document_id, clientId: row.client_id, folio: row.folio, concept: row.concept, income: row.income_cents / 100, expenses: row.expense_cents / 100, margin: row.margin_cents / 100, marginPercent: row.margin_percent === null ? null : Number(row.margin_percent) }));
  const clientMargins: ClientMargin[] = clientMarginRows.map((row) => ({ clientId: row.client_id, clientName: row.client_name, income: row.income_cents / 100, expenses: row.expense_cents / 100, margin: row.margin_cents / 100, marginPercent: row.margin_percent === null ? null : Number(row.margin_percent) }));
  const settingsRow = settingsRows[0];
  if (!settingsRow) throw new Error("No se encontró la configuración del reparto de utilidades.");
  const profitSettings: ProfitSettings = { fundPercent: settingsRow.fund_bps / 100, oscarPercent: settingsRow.oscar_bps / 100, danPercent: settingsRow.dan_bps / 100, updatedAt: settingsRow.updated_at };
  const distributions: ProfitDistribution[] = distributionRows.map(mapProfitDistribution);
  const fundBalance = (fundRows[0]?.balance_cents ?? 0) / 100;
  return { clients, documents, movements, partners, documentMargins, clientMargins, profitSettings, distributions, fundBalance };
}

function mapProfitDistribution(row: ProfitDistributionRow): ProfitDistribution {
  return { id: row.id, periodStart: row.period_start, periodEnd: row.period_end, income: row.income_cents / 100, expenses: row.expense_cents / 100, netProfit: row.net_profit_cents / 100, fundAmount: row.fund_cents / 100, oscarAmount: row.oscar_cents / 100, danAmount: row.dan_cents / 100, fundPercent: row.fund_bps / 100, oscarPercent: row.oscar_bps / 100, danPercent: row.dan_bps / 100, createdAt: row.created_at };
}

export async function loadTrashData() {
  const [clientRows, documentRows, movementRows, partners] = await Promise.all([
    dbRequest<ClientRow[]>("clients?select=*&deleted_at=not.is.null&order=deleted_at.desc"),
    dbRequest<DocumentRow[]>("documents?select=*,clients(name)&deleted_at=not.is.null&order=deleted_at.desc"),
    dbRequest<MovementRow[]>("movements?select=*,documents(folio)&deleted_at=not.is.null&deleted_with_document=eq.false&order=deleted_at.desc"),
    dbRequest<PartnerRow[]>("partners?select=user_id,display_name,email"),
  ]);
  const partnerNames = new Map(partners.map((partner) => [partner.user_id, partner.display_name || partner.email]));
  const actor = (id?: string | null) => id ? partnerNames.get(id) ?? "Socio autorizado" : "Registro anterior";
  return [
    ...clientRows.map((row): TrashItem => ({ entity: "client", id: row.id, label: row.name, detail: "Cliente", deletedAt: formatDateTime(row.deleted_at!), deletedBy: actor(row.deleted_by), updatedAt: row.updated_at })),
    ...documentRows.map((row): TrashItem => ({ entity: "document", id: row.id, label: `${row.folio} · ${row.clients?.name ?? "Cliente"}`, detail: row.kind, deletedAt: formatDateTime(row.deleted_at!), deletedBy: actor(row.deleted_by), updatedAt: row.updated_at })),
    ...movementRows.map((row): TrashItem => ({ entity: "movement", id: row.id, label: row.description, detail: row.document_id ? `Pago de ${row.documents?.folio ?? "documento"} · $${(row.amount_cents / 100).toLocaleString("es-MX")}` : `${row.category} · $${(row.amount_cents / 100).toLocaleString("es-MX")}`, deletedAt: formatDateTime(row.deleted_at!), deletedBy: actor(row.deleted_by), updatedAt: row.updated_at })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadAuditLog() {
  const [rows, partners] = await Promise.all([dbRequest<AuditRow[]>("finance_audit_log?select=id,entity,record_id,action,actor_id,occurred_at&order=occurred_at.desc&limit=80"), dbRequest<PartnerRow[]>("partners?select=user_id,display_name,email")]);
  const partnerNames = new Map(partners.map((partner) => [partner.user_id, partner.display_name || partner.email]));
  return rows.map((row): AuditEntry => ({ id: row.id, entity: row.entity, recordId: row.record_id, action: row.action, actor: row.actor_id ? partnerNames.get(row.actor_id) ?? "Socio autorizado" : "Registro anterior", occurredAt: formatDateTime(row.occurred_at) }));
}

export async function createClient(input: Omit<Client, "id" | "total" | "updatedAt">) {
  const [row] = await dbRequest<ClientRow[]>("clients", { method: "POST", headers: returned, body: JSON.stringify({ name: input.name, email: input.email, phone: input.phone, stage: input.stage, internal_key: input.internalKey, companions: input.companions }) });
  return { id: row.id, name: row.name, email: row.email, phone: row.phone, stage: row.stage, internalKey: row.internal_key ?? "", companions: row.companions ?? [], total: 0, updatedAt: row.updated_at } as Client;
}

export async function updateClient(input: Client) {
  const path = `clients?id=eq.${input.id}&updated_at=eq.${encodeURIComponent(input.updatedAt)}&deleted_at=is.null`;
  const rows = await dbRequest<ClientRow[]>(path, { method: "PATCH", headers: returned, body: JSON.stringify({ name: input.name, email: input.email, phone: input.phone, stage: input.stage, internal_key: input.internalKey, companions: input.companions }) });
  if (!rows.length) throw new Error("Este cliente fue modificado o eliminado por tu socio. Actualiza la pantalla.");
  return { ...input, updatedAt: rows[0].updated_at };
}

export async function createDocument(input: NewDocumentInput) {
  const paymentPlan = input.paymentPlan.map((stage) => ({ id: stage.id, description: stage.description, amountCents: Math.round(stage.amount * 100) }));
  const [row] = await dbRequest<CreatedDocumentRow[]>("rpc/create_finance_budget_v5", { method: "POST", body: JSON.stringify({ p_client_id: input.clientId, p_concept: input.concept, p_amount_cents: Math.round(input.amount * 100), p_status: input.status, p_notes: input.notes, p_payment_plan: paymentPlan, p_request_id: input.requestId }) });
  return { ...input, id: row.id, folio: row.folio, date: formatDate(row.issued_at), issuedAt: row.issued_at, paidAmount: input.status === "Pagado" ? input.amount : 0, balance: input.status === "Pagado" ? 0 : input.amount, updatedAt: row.updated_at } as FinanceDocument;
}

export async function updateDocument(input: FinanceDocument) {
  const paymentPlan = input.paymentPlan.map((stage) => ({ id: stage.id, description: stage.description, amountCents: Math.round(stage.amount * 100) }));
  const [row] = await dbRequest<TimestampRow[]>("rpc/update_finance_document_v5", { method: "POST", body: JSON.stringify({ p_id: input.id, p_kind: input.kind, p_client_id: input.clientId, p_concept: input.concept, p_amount_cents: Math.round(input.amount * 100), p_status: input.status, p_notes: input.notes, p_payment_plan: paymentPlan, p_expected_updated_at: input.updatedAt }) });
  return { ...input, updatedAt: row.updated_at };
}

export async function markDocumentPaid(input: FinanceDocument) {
  const [row] = await dbRequest<TimestampRow[]>("rpc/mark_finance_document_paid", { method: "POST", body: JSON.stringify({ p_id: input.id, p_expected_updated_at: input.updatedAt }) });
  return { ...input, status: "Pagado" as Status, paidAmount: input.amount, balance: 0, updatedAt: row.updated_at };
}

export async function createDocumentPayment(input: NewPaymentInput) {
  const [row] = await dbRequest<MovementRow[]>("rpc/create_document_payment_v5", { method: "POST", body: JSON.stringify({ p_document_id: input.documentId, p_amount_cents: Math.round(input.amount * 100), p_occurred_at: input.occurredAt, p_note: input.note, p_payment_stage_id: input.paymentStageId || null, p_request_id: input.requestId }) });
  return mapMovement(row);
}

export async function createExpense(input: NewExpenseInput) {
  const [row] = await dbRequest<MovementRow[]>("rpc/create_finance_expense_v6", { method: "POST", body: JSON.stringify({ p_category: input.category, p_description: input.description, p_amount_cents: Math.round(input.amount * 100), p_spent_by: input.spentBy, p_occurred_at: input.occurredAt, p_document_id: input.documentId || null, p_request_id: input.requestId }) });
  return mapMovement(row);
}

export async function updateExpense(input: Movement) {
  const [row] = await dbRequest<MovementRow[]>("rpc/update_finance_expense_v6", { method: "POST", body: JSON.stringify({ p_id: input.id, p_category: input.category, p_description: input.description, p_amount_cents: Math.round(input.amount * 100), p_spent_by: input.spentBy, p_occurred_at: input.occurredAt, p_document_id: input.documentId || null, p_expected_updated_at: input.updatedAt }) });
  return mapMovement(row);
}

export async function updateProfitSettings(input: Omit<ProfitSettings, "updatedAt">) {
  const [row] = await dbRequest<ProfitSettingsRow[]>("rpc/update_profit_distribution_settings_v6", { method: "POST", body: JSON.stringify({ p_fund_bps: Math.round(input.fundPercent * 100), p_oscar_bps: Math.round(input.oscarPercent * 100), p_dan_bps: Math.round(input.danPercent * 100) }) });
  return { fundPercent: row.fund_bps / 100, oscarPercent: row.oscar_bps / 100, danPercent: row.dan_bps / 100, updatedAt: row.updated_at } as ProfitSettings;
}

export async function createProfitDistribution(input: { periodStart: string; periodEnd: string; requestId: string }) {
  const [row] = await dbRequest<ProfitDistributionRow[]>("rpc/create_profit_distribution_v6", { method: "POST", body: JSON.stringify({ p_period_start: input.periodStart, p_period_end: input.periodEnd, p_request_id: input.requestId }) });
  return mapProfitDistribution(row);
}

export async function setRecordTrashed(item: Pick<TrashItem, "entity" | "id" | "updatedAt">, trashed: boolean) {
  const [row] = await dbRequest<TimestampRow[]>("rpc/set_finance_record_trashed", { method: "POST", body: JSON.stringify({ p_entity: item.entity, p_id: item.id, p_expected_updated_at: item.updatedAt, p_trashed: trashed }) });
  return row.updated_at;
}
