import { dbRequest } from "./supabase";

export type DocumentKind = "Presupuesto" | "Recibo" | "Cuenta de cobro";
export type Status = "Pagado" | "Pendiente" | "Vencido" | "Aceptado";
export type Client = { id: number; name: string; email: string; phone: string; total: number };
export type FinanceDocument = { id: number; folio: string; kind: DocumentKind; clientId: number; client: string; concept: string; amount: number; status: Status; date: string };
export type Movement = { id: number; type: "Ingreso" | "Gasto"; category: string; description: string; amount: number; occurredAt: string; documentId?: number | null };

type ClientRow = { id: number; name: string; email: string; phone: string };
type DocumentRow = { id: number; folio: string; kind: DocumentKind; client_id: number; concept: string; amount_cents: number; status: Status; issued_at: string; clients?: { name: string } | null };
type MovementRow = { id: number; type: "Ingreso" | "Gasto"; category: string; description: string; amount_cents: number; occurred_at: string; document_id?: number | null };

const formatDate = (value: string) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
const returned = { Prefer: "return=representation" };

export async function loadFinanceData() {
  const [clientRows, documentRows, movementRows] = await Promise.all([
    dbRequest<ClientRow[]>("clients?select=*&order=id.desc"),
    dbRequest<DocumentRow[]>("documents?select=*,clients(name)&order=id.desc"),
    dbRequest<MovementRow[]>("movements?select=*&order=id.desc"),
  ]);
  const documents: FinanceDocument[] = documentRows.map((row) => ({
    id: row.id, folio: row.folio, kind: row.kind, clientId: row.client_id,
    client: row.clients?.name ?? "Cliente", concept: row.concept,
    amount: row.amount_cents / 100, status: row.status, date: formatDate(row.issued_at),
  }));
  const clients: Client[] = clientRows.map((row) => ({
    ...row,
    total: documents.filter((item) => item.clientId === row.id && item.status === "Pagado").reduce((sum, item) => sum + item.amount, 0),
  }));
  const movements: Movement[] = movementRows.map((row) => ({
    id: row.id, type: row.type, category: row.category, description: row.description,
    amount: row.amount_cents / 100, occurredAt: formatDate(row.occurred_at), documentId: row.document_id,
  }));
  return { clients, documents, movements };
}

export async function createClient(input: Omit<Client, "id" | "total">) {
  const [row] = await dbRequest<ClientRow[]>("clients", { method: "POST", headers: returned, body: JSON.stringify(input) });
  return { ...row, total: 0 } as Client;
}

export async function updateClient(input: Client) {
  await dbRequest(`clients?id=eq.${input.id}`, { method: "PATCH", body: JSON.stringify({ name: input.name, email: input.email, phone: input.phone }) });
}

export async function deleteClient(id: number) {
  await dbRequest(`clients?id=eq.${id}`, { method: "DELETE" });
}

export async function createDocument(input: Omit<FinanceDocument, "id" | "folio" | "date">) {
  const prefix = input.kind === "Presupuesto" ? "PRE" : input.kind === "Recibo" ? "REC" : "COB";
  const temporaryFolio = `${prefix}-${crypto.randomUUID()}`;
  const [row] = await dbRequest<DocumentRow[]>("documents", {
    method: "POST", headers: returned,
    body: JSON.stringify({ folio: temporaryFolio, kind: input.kind, client_id: input.clientId, concept: input.concept, amount_cents: Math.round(input.amount * 100), status: input.status }),
  });
  const folio = `${prefix}-${String(row.id).padStart(4, "0")}`;
  await dbRequest(`documents?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ folio }) });
  if (input.status === "Pagado") await createIncome(row.id, input.concept, input.amount);
  return { ...input, id: row.id, folio, date: formatDate(row.issued_at) } as FinanceDocument;
}

async function createIncome(documentId: number, description: string, amount: number) {
  await dbRequest("movements", { method: "POST", body: JSON.stringify({ type: "Ingreso", category: "Honorarios", description, amount_cents: Math.round(amount * 100), document_id: documentId }) });
}

export async function updateDocument(input: FinanceDocument, previousStatus: Status) {
  await dbRequest(`documents?id=eq.${input.id}`, { method: "PATCH", body: JSON.stringify({ kind: input.kind, client_id: input.clientId, concept: input.concept, amount_cents: Math.round(input.amount * 100), status: input.status }) });
  if (previousStatus !== "Pagado" && input.status === "Pagado") await createIncome(input.id, input.concept, input.amount);
  if (previousStatus === "Pagado" && input.status !== "Pagado") await dbRequest(`movements?document_id=eq.${input.id}`, { method: "DELETE" });
  if (previousStatus === "Pagado" && input.status === "Pagado") await dbRequest(`movements?document_id=eq.${input.id}`, { method: "PATCH", body: JSON.stringify({ description: input.concept, amount_cents: Math.round(input.amount * 100) }) });
}

export async function markDocumentPaid(input: FinanceDocument) {
  await dbRequest(`documents?id=eq.${input.id}`, { method: "PATCH", body: JSON.stringify({ status: "Pagado" }) });
  await createIncome(input.id, input.concept, input.amount);
}

export async function deleteDocument(id: number) {
  await dbRequest(`documents?id=eq.${id}`, { method: "DELETE" });
}

export async function createExpense(input: Omit<Movement, "id" | "type" | "occurredAt">) {
  const [row] = await dbRequest<MovementRow[]>("movements", { method: "POST", headers: returned, body: JSON.stringify({ type: "Gasto", category: input.category, description: input.description, amount_cents: Math.round(input.amount * 100) }) });
  return { ...input, id: row.id, type: "Gasto", occurredAt: formatDate(row.occurred_at) } as Movement;
}

export async function updateExpense(input: Movement) {
  await dbRequest(`movements?id=eq.${input.id}&document_id=is.null`, { method: "PATCH", body: JSON.stringify({ category: input.category, description: input.description, amount_cents: Math.round(input.amount * 100) }) });
}

export async function deleteMovement(id: number) {
  await dbRequest(`movements?id=eq.${id}&document_id=is.null`, { method: "DELETE" });
}
