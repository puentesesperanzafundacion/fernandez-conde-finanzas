import { dbRequest } from "./supabase";

export type DocumentKind = "Presupuesto" | "Recibo" | "Cuenta de cobro";
export type Status = "Pagado" | "Pendiente" | "Vencido" | "Aceptado";
export type RecordEntity = "client" | "document" | "movement";
export type Client = { id: number; name: string; email: string; phone: string; total: number; updatedAt: string };
export type FinanceDocument = { id: number; folio: string; kind: DocumentKind; clientId: number; client: string; concept: string; amount: number; status: Status; date: string; notes: string; updatedAt: string };
export type Movement = { id: number; type: "Ingreso" | "Gasto"; category: string; description: string; amount: number; occurredAt: string; documentId?: number | null; updatedAt: string };
export type NewDocumentInput = Omit<FinanceDocument, "id" | "folio" | "date" | "updatedAt"> & { requestId: string };
export type TrashItem = { entity: RecordEntity; id: number; label: string; detail: string; deletedAt: string; deletedBy: string; updatedAt: string };
export type AuditEntry = { id: number; entity: RecordEntity; recordId: number; action: "created" | "updated" | "trashed" | "restored"; actor: string; occurredAt: string };

type ClientRow = { id: number; name: string; email: string; phone: string; updated_at: string; deleted_at?: string | null; deleted_by?: string | null };
type DocumentRow = { id: number; folio: string; kind: DocumentKind; client_id: number; concept: string; amount_cents: number; status: Status; notes: string; issued_at: string; updated_at: string; deleted_at?: string | null; deleted_by?: string | null; clients?: { name: string } | null };
type MovementRow = { id: number; type: "Ingreso" | "Gasto"; category: string; description: string; amount_cents: number; occurred_at: string; document_id?: number | null; updated_at: string; deleted_at?: string | null; deleted_by?: string | null };
type PartnerRow = { user_id: string; display_name: string; email: string };
type AuditRow = { id: number; entity: RecordEntity; record_id: number; action: AuditEntry["action"]; actor_id?: string | null; occurred_at: string };
type TimestampRow = { updated_at: string };
type CreatedDocumentRow = TimestampRow & { id: number; folio: string; issued_at: string };

const returned = { Prefer: "return=representation" };
const formatDate = (value: string) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
const formatDateTime = (value: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function mapDocument(row: DocumentRow): FinanceDocument {
  return {
    id: row.id,
    folio: row.folio,
    kind: row.kind,
    clientId: row.client_id,
    client: row.clients?.name ?? "Cliente",
    concept: row.concept,
    amount: row.amount_cents / 100,
    status: row.status,
    date: formatDate(row.issued_at),
    notes: row.notes ?? "",
    updatedAt: row.updated_at,
  };
}

function mapMovement(row: MovementRow): Movement {
  return {
    id: row.id,
    type: row.type,
    category: row.category,
    description: row.description,
    amount: row.amount_cents / 100,
    occurredAt: formatDate(row.occurred_at),
    documentId: row.document_id,
    updatedAt: row.updated_at,
  };
}

export async function loadFinanceData() {
  const [clientRows, documentRows, movementRows] = await Promise.all([
    dbRequest<ClientRow[]>("clients?select=*&deleted_at=is.null&order=id.desc"),
    dbRequest<DocumentRow[]>("documents?select=*,clients(name)&deleted_at=is.null&order=id.desc"),
    dbRequest<MovementRow[]>("movements?select=*&deleted_at=is.null&order=id.desc"),
  ]);
  const documents = documentRows.map(mapDocument);
  const clients: Client[] = clientRows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    updatedAt: row.updated_at,
    total: documents.filter((item) => item.clientId === row.id && item.status === "Pagado").reduce((sum, item) => sum + item.amount, 0),
  }));
  return { clients, documents, movements: movementRows.map(mapMovement) };
}

export async function loadTrashData() {
  const [clientRows, documentRows, movementRows, partners] = await Promise.all([
    dbRequest<ClientRow[]>("clients?select=*&deleted_at=not.is.null&order=deleted_at.desc"),
    dbRequest<DocumentRow[]>("documents?select=*,clients(name)&deleted_at=not.is.null&order=deleted_at.desc"),
    dbRequest<MovementRow[]>("movements?select=*&deleted_at=not.is.null&document_id=is.null&order=deleted_at.desc"),
    dbRequest<PartnerRow[]>("partners?select=user_id,display_name,email"),
  ]);
  const partnerNames = new Map(partners.map((partner) => [partner.user_id, partner.display_name || partner.email]));
  const actor = (id?: string | null) => id ? partnerNames.get(id) ?? "Socio autorizado" : "Registro anterior";
  return [
    ...clientRows.map((row): TrashItem => ({ entity: "client", id: row.id, label: row.name, detail: "Cliente", deletedAt: formatDateTime(row.deleted_at!), deletedBy: actor(row.deleted_by), updatedAt: row.updated_at })),
    ...documentRows.map((row): TrashItem => ({ entity: "document", id: row.id, label: `${row.folio} · ${row.clients?.name ?? "Cliente"}`, detail: row.kind, deletedAt: formatDateTime(row.deleted_at!), deletedBy: actor(row.deleted_by), updatedAt: row.updated_at })),
    ...movementRows.map((row): TrashItem => ({ entity: "movement", id: row.id, label: row.description, detail: `${row.category} · $${(row.amount_cents / 100).toLocaleString("es-MX")}`, deletedAt: formatDateTime(row.deleted_at!), deletedBy: actor(row.deleted_by), updatedAt: row.updated_at })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadAuditLog() {
  const [rows, partners] = await Promise.all([
    dbRequest<AuditRow[]>("finance_audit_log?select=id,entity,record_id,action,actor_id,occurred_at&order=occurred_at.desc&limit=80"),
    dbRequest<PartnerRow[]>("partners?select=user_id,display_name,email"),
  ]);
  const partnerNames = new Map(partners.map((partner) => [partner.user_id, partner.display_name || partner.email]));
  return rows.map((row): AuditEntry => ({
    id: row.id,
    entity: row.entity,
    recordId: row.record_id,
    action: row.action,
    actor: row.actor_id ? partnerNames.get(row.actor_id) ?? "Socio autorizado" : "Registro anterior",
    occurredAt: formatDateTime(row.occurred_at),
  }));
}

export async function createClient(input: Omit<Client, "id" | "total" | "updatedAt">) {
  const [row] = await dbRequest<ClientRow[]>("clients", { method: "POST", headers: returned, body: JSON.stringify(input) });
  return { id: row.id, name: row.name, email: row.email, phone: row.phone, total: 0, updatedAt: row.updated_at } as Client;
}

export async function updateClient(input: Client) {
  const path = `clients?id=eq.${input.id}&updated_at=eq.${encodeURIComponent(input.updatedAt)}&deleted_at=is.null`;
  const rows = await dbRequest<ClientRow[]>(path, { method: "PATCH", headers: returned, body: JSON.stringify({ name: input.name, email: input.email, phone: input.phone }) });
  if (!rows.length) throw new Error("Este cliente fue modificado o eliminado por tu socio. Actualiza la pantalla.");
  return { ...input, updatedAt: rows[0].updated_at };
}

export async function createDocument(input: NewDocumentInput) {
  const [row] = await dbRequest<CreatedDocumentRow[]>("rpc/create_finance_document", {
    method: "POST",
    body: JSON.stringify({
      p_kind: input.kind,
      p_client_id: input.clientId,
      p_concept: input.concept,
      p_amount_cents: Math.round(input.amount * 100),
      p_status: input.status,
      p_notes: input.notes,
      p_request_id: input.requestId,
    }),
  });
  return { ...input, id: row.id, folio: row.folio, date: formatDate(row.issued_at), updatedAt: row.updated_at } as FinanceDocument;
}

export async function updateDocument(input: FinanceDocument) {
  const [row] = await dbRequest<TimestampRow[]>("rpc/update_finance_document", {
    method: "POST",
    body: JSON.stringify({
      p_id: input.id,
      p_kind: input.kind,
      p_client_id: input.clientId,
      p_concept: input.concept,
      p_amount_cents: Math.round(input.amount * 100),
      p_status: input.status,
      p_notes: input.notes,
      p_expected_updated_at: input.updatedAt,
    }),
  });
  return { ...input, updatedAt: row.updated_at };
}

export async function markDocumentPaid(input: FinanceDocument) {
  const [row] = await dbRequest<TimestampRow[]>("rpc/mark_finance_document_paid", {
    method: "POST",
    body: JSON.stringify({ p_id: input.id, p_expected_updated_at: input.updatedAt }),
  });
  return { ...input, status: "Pagado" as Status, updatedAt: row.updated_at };
}

export async function createExpense(input: Omit<Movement, "id" | "type" | "occurredAt" | "updatedAt">) {
  const [row] = await dbRequest<MovementRow[]>("movements", { method: "POST", headers: returned, body: JSON.stringify({ type: "Gasto", category: input.category, description: input.description, amount_cents: Math.round(input.amount * 100) }) });
  return { ...input, id: row.id, type: "Gasto", occurredAt: formatDate(row.occurred_at), updatedAt: row.updated_at } as Movement;
}

export async function updateExpense(input: Movement) {
  const path = `movements?id=eq.${input.id}&updated_at=eq.${encodeURIComponent(input.updatedAt)}&deleted_at=is.null&document_id=is.null`;
  const rows = await dbRequest<MovementRow[]>(path, { method: "PATCH", headers: returned, body: JSON.stringify({ category: input.category, description: input.description, amount_cents: Math.round(input.amount * 100) }) });
  if (!rows.length) throw new Error("Este gasto fue modificado o eliminado por tu socio. Actualiza la pantalla.");
  return { ...input, updatedAt: rows[0].updated_at };
}

export async function setRecordTrashed(item: Pick<TrashItem, "entity" | "id" | "updatedAt">, trashed: boolean) {
  const [row] = await dbRequest<TimestampRow[]>("rpc/set_finance_record_trashed", {
    method: "POST",
    body: JSON.stringify({ p_entity: item.entity, p_id: item.id, p_expected_updated_at: item.updatedAt, p_trashed: trashed }),
  });
  return row.updated_at;
}
