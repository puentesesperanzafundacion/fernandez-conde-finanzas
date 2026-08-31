"use client";

import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays, Check,
  ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Download, FileCheck2,
  FilePlus2, FileText, Home, History, LogOut, Mail, Pencil, Phone, Plus,
  ClipboardCheck, RotateCcw, Search, Send, Trash2, TrendingUp, UserRound, Users,
  WalletCards, WifiOff, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import {
  createClient, createDocument, createDocumentPayment, createExpense, createProfitDistribution, formatDate,
  loadAuditLog, loadFinanceData, loadTrashData, markDocumentPaid, setClientCaseStage, setProfitDistributionVoided, setRecordTrashed,
  updateClient, updateDocument, updateExpense, updateProfitSettings, type AuditEntry, type Client,
  type CaseStageStep, type CaseStageTemplate, type ClientCaseStageProgress, type ClientMargin, type ClientStage, type Companion, type DocumentMargin, type FinanceDocument as Document,
  type Movement, type NewDocumentInput, type NewExpenseInput, type NewPaymentInput,
  type PaymentStage, type PracticeArea, type ProfitDistribution, type ProfitSettings, type RecordEntity, type Status, type TrashItem,
} from "../lib/finance";
import { getSession, isSupabaseConfigured, signIn, signOut, type Session } from "../lib/supabase";

type Tab = "inicio" | "documentos" | "clientes" | "movimientos" | "informes" | "reparto" | "papelera";
type DeleteTarget = { type: RecordEntity; id: number; label: string; updatedAt: string };
type DashboardTotals = { income: number; pending: number; quoted: number; expenses: number };
type QuickAction = "presupuesto" | "gasto" | "cliente" | "abono";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
const brandLogoSrc = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/logo-fernandez-conde.png`;
const servicePresets = [
  "Tarjeta de Visitante por Razones Humanitarias",
  "Solicitud ante COMAR",
  "Ensayo de entrevistas",
  "Amparo para entrevista",
  "Amparo general",
  "Amparo TVRH",
  "Regularización Migratoria",
  "Asesoría Corporativa Mensual",
  "Juicio Contencioso",
];
const expenseCategories = ["Operación", "Marketing", "Transporte", "Servicios", "Impuestos", "Impresiones y copias", "Otros"];
const expenseSpenders = ["Oscar", "Dan", "Fondo"];
const practiceAreas: PracticeArea[] = ["Migratorio/COMAR", "Arrendamiento", "Civil", "Otro"];
const nationalityPresets = ["Cubana", "Venezolana", "Colombiana", "China"] as const;
const isPresetNationality = (value: string) => nationalityPresets.some((nationality) => nationality === value);
const todayInput = () => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const toDatabaseDate = (value: string) => `${value}T12:00:00.000Z`;
const toInputDate = (value: string) => new Date(value).toISOString().slice(0, 10);
const sameMonth = (value: string, reference = new Date()) => {
  const date = new Date(value);
  return date.getUTCFullYear() === reference.getFullYear() && date.getUTCMonth() === reference.getMonth();
};

async function imageAsDataUrl(src: string) {
  const blob = await fetch(src).then((response) => {
    if (!response.ok) throw new Error("No fue posible cargar el logotipo");
    return response.blob();
  });
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function clippedLines(pdf: jsPDF, text: string, width: number, maxLines: number) {
  const all = pdf.splitTextToSize(text, width) as string[];
  if (all.length <= maxLines) return all;
  const visible = all.slice(0, maxLines);
  visible[maxLines - 1] = `${visible[maxLines - 1].replace(/[.…]+$/, "")}…`;
  return visible;
}

function drawCorporateContact(pdf: jsPDF, startY: number) {
  pdf.setTextColor(95, 102, 110);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.2);
  pdf.text("contacto@fernandezconde.com  ·  www.fernandezconde.com", 108, startY, { align: "center" });
  pdf.setFontSize(7.6);
  pdf.text("Av. Insurgentes Sur 1783, Oficina 301, Tercer Piso", 108, startY + 5.5, { align: "center" });
  pdf.text("Colonia Guadalupe Inn, Álvaro Obregón, CDMX", 108, startY + 10.5, { align: "center" });
}

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [tab, setTab] = useState<Tab>("inicio");
  const [clients, setClients] = useState<Client[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [documentMargins, setDocumentMargins] = useState<DocumentMargin[]>([]);
  const [clientMargins, setClientMargins] = useState<ClientMargin[]>([]);
  const [profitSettings, setProfitSettings] = useState<ProfitSettings>({ fundPercent: 20, oscarPercent: 40, danPercent: 40, updatedAt: "" });
  const [distributions, setDistributions] = useState<ProfitDistribution[]>([]);
  const [voidedDistributions, setVoidedDistributions] = useState<ProfitDistribution[]>([]);
  const [fundBalance, setFundBalance] = useState(0);
  const [fundAllocated, setFundAllocated] = useState(0);
  const [fundSpent, setFundSpent] = useState(0);
  const [caseStageTemplates, setCaseStageTemplates] = useState<CaseStageTemplate[]>([]);
  const [caseStageSteps, setCaseStageSteps] = useState<CaseStageStep[]>([]);
  const [clientCaseStageProgress, setClientCaseStageProgress] = useState<ClientCaseStageProgress[]>([]);
  const [trash, setTrash] = useState<TrashItem[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [query, setQuery] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [paymentPickerOpen, setPaymentPickerOpen] = useState(false);
  const [paymentFor, setPaymentFor] = useState<Document | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);
  const [clientDetail, setClientDetail] = useState<Client | null>(null);
  const [stageSavingKey, setStageSavingKey] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [distributionToVoid, setDistributionToVoid] = useState<ProfitDistribution | null>(null);
  const [detail, setDetail] = useState<Document | null>(null);
  const [toast, setToast] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const refreshData = useCallback(async () => {
    const data = await loadFinanceData();
    setClients(data.clients);
    setDocuments(data.documents);
    setMovements(data.movements);
    setDocumentMargins(data.documentMargins);
    setClientMargins(data.clientMargins);
    setProfitSettings(data.profitSettings);
    setDistributions(data.distributions);
    setVoidedDistributions(data.voidedDistributions);
    setFundBalance(data.fundBalance);
    setFundAllocated(data.fundAllocated);
    setFundSpent(data.fundSpent);
    setCaseStageTemplates(data.caseStageTemplates);
    setCaseStageSteps(data.caseStageSteps);
    setClientCaseStageProgress(data.clientCaseStageProgress);
    return data;
  }, []);
  const refreshTrash = useCallback(async () => {
    const [trashItems, auditEntries] = await Promise.all([loadTrashData(), loadAuditLog()]);
    setTrash(trashItems);
    setAuditLog(auditEntries);
  }, []);

  useEffect(() => {
    getSession().then(setSession).catch(() => setSession(null)).finally(() => setAuthReady(true));
    setIsOnline(navigator.onLine);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if ("serviceWorker" in navigator) {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      navigator.serviceWorker.register(`${basePath}/sw.js`).catch(() => undefined);
    }
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    refreshData().catch((error) => setToast(error instanceof Error ? error.message : "No fue posible cargar los datos"));
    const interval = window.setInterval(() => refreshData().catch(() => undefined), 30000);
    const onFocus = () => refreshData().catch(() => undefined);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [session, refreshData]);
  useEffect(() => {
    if (!session || tab !== "papelera") return;
    refreshTrash().catch((error) => setToast(error instanceof Error ? error.message : "No fue posible abrir la papelera"));
  }, [session, tab, refreshTrash]);

  const totals = useMemo<DashboardTotals>(() => {
    const currentDocuments = documents.filter((document) => sameMonth(document.issuedAt));
    const currentMovements = movements.filter((movement) => sameMonth(movement.occurredAt));
    return {
      income: currentMovements.filter((movement) => movement.type === "Ingreso").reduce((sum, movement) => sum + movement.amount, 0),
      pending: currentDocuments.reduce((sum, document) => sum + document.balance, 0),
      quoted: currentDocuments.filter((document) => document.kind === "Presupuesto").reduce((sum, document) => sum + document.amount, 0),
      expenses: currentMovements.filter((movement) => movement.type === "Gasto").reduce((sum, movement) => sum + movement.amount, 0),
    };
  }, [documents, movements]);
  const comarTemplate = caseStageTemplates.find((template) => template.practiceArea === "Migratorio/COMAR");
  const comarSteps = caseStageSteps.filter((step) => step.templateId === comarTemplate?.id).sort((a, b) => a.order - b.order);
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };
  const openComposer = () => setComposerOpen(true);
  const openQuickAction = (action: QuickAction) => {
    setQuickMenuOpen(false);
    if (action === "presupuesto") setComposerOpen(true);
    if (action === "gasto") setExpenseOpen(true);
    if (action === "cliente") setClientOpen(true);
    if (action === "abono") setPaymentPickerOpen(true);
  };

  const addClient = async (client: Omit<Client, "id" | "total" | "updatedAt">) => {
    const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    const duplicate = clients.find((item) => normalized(item.name) === normalized(client.name) || Boolean(client.email && normalized(item.email) === normalized(client.email)));
    if (duplicate) { notify(`Ya existe un cliente parecido: ${duplicate.name}`); return; }
    setIsSaving(true);
    try {
      const saved = await createClient(client);
      setClients((current) => [saved, ...current]);
      setClientOpen(false);
      notify("Cliente guardado correctamente");
    } catch (error) { notify(error instanceof Error ? error.message : "No fue posible guardar el cliente"); }
    finally { setIsSaving(false); }
  };
  const addDocument = async (draft: NewDocumentInput) => {
    setIsSaving(true);
    try {
      const next = await createDocument(draft);
      const data = await refreshData();
      setComposerOpen(false);
      setDetail(data.documents.find((document) => document.id === next.id) ?? next);
      notify(`${draft.kind} creado correctamente`);
    } catch (error) { notify(error instanceof Error ? error.message : "No fue posible crear el documento"); }
    finally { setIsSaving(false); }
  };
  const addExpense = async (draft: NewExpenseInput) => {
    setIsSaving(true);
    try {
      await createExpense(draft);
      await refreshData();
      setExpenseOpen(false);
      notify("Gasto registrado correctamente");
    } catch (error) { notify(error instanceof Error ? error.message : "No fue posible guardar el gasto"); }
    finally { setIsSaving(false); }
  };
  const addPayment = async (draft: NewPaymentInput) => {
    setIsSaving(true);
    try {
      await createDocumentPayment(draft);
      const data = await refreshData();
      const updated = data.documents.find((document) => document.id === draft.documentId) ?? null;
      setDetail(updated);
      setPaymentFor(null);
      notify("Abono registrado correctamente");
    } catch (error) { notify(error instanceof Error ? error.message : "No fue posible registrar el abono"); }
    finally { setIsSaving(false); }
  };
  const saveClientEdit = async (updated: Client) => {
    setIsSaving(true);
    try {
      const saved = await updateClient(updated);
      setClients((current) => current.map((item) => item.id === saved.id ? saved : item));
      setClientDetail((current) => current?.id === saved.id ? saved : current);
      setEditingClient(null);
      notify("Cliente actualizado");
    } catch (error) { notify(error instanceof Error ? error.message : "No fue posible editar el cliente"); }
    finally { setIsSaving(false); }
  };
  const toggleClientCaseStage = async (clientId: number, stepId: number, completed: boolean) => {
    const savingKey = `${clientId}-${stepId}`;
    setStageSavingKey(savingKey);
    try {
      const saved = await setClientCaseStage(clientId, stepId, completed);
      setClientCaseStageProgress((current) => {
        const exists = current.some((item) => item.clientId === clientId && item.stepId === stepId);
        return exists ? current.map((item) => item.clientId === clientId && item.stepId === stepId ? saved : item) : [...current, saved];
      });
      notify(completed ? "Etapa marcada como completada" : "Etapa marcada como pendiente");
    } catch (error) { notify(error instanceof Error ? error.message : "No fue posible actualizar la etapa"); }
    finally { setStageSavingKey(""); }
  };
  const saveDocumentEdit = async (updated: Document) => {
    setIsSaving(true);
    try {
      await updateDocument(updated);
      const data = await refreshData();
      setEditingDocument(null);
      setDetail(data.documents.find((document) => document.id === updated.id) ?? null);
      notify("Documento actualizado");
    } catch (error) { notify(error instanceof Error ? error.message : "No fue posible editar el documento"); }
    finally { setIsSaving(false); }
  };
  const changeDocumentStatus = async (document: Document, status: Status) => {
    if (document.status === status) return;
    setIsSaving(true);
    try {
      await updateDocument({ ...document, status });
      const data = await refreshData();
      setDetail(data.documents.find((item) => item.id === document.id) ?? null);
      notify(status === "Rechazado" ? "Presupuesto marcado como rechazado" : `Presupuesto marcado como ${status.toLowerCase()}`);
    } catch (error) { notify(error instanceof Error ? error.message : "No fue posible cambiar el resultado del presupuesto"); }
    finally { setIsSaving(false); }
  };
  const saveMovementEdit = async (updated: Movement) => {
    setIsSaving(true);
    try {
      await updateExpense(updated);
      await refreshData();
      setEditingMovement(null);
      notify("Gasto actualizado");
    } catch (error) { notify(error instanceof Error ? error.message : "No fue posible editar el gasto"); }
    finally { setIsSaving(false); }
  };
  const saveDistributionSettings = async (settings: Omit<ProfitSettings, "updatedAt">) => {
    setIsSaving(true);
    try {
      await updateProfitSettings(settings);
      await refreshData();
      notify("Porcentajes actualizados");
    } catch (error) { notify(error instanceof Error ? error.message : "No fue posible actualizar los porcentajes"); }
    finally { setIsSaving(false); }
  };
  const addDistribution = async (periodStart: string, periodEnd: string, fundAmount: number | null) => {
    setIsSaving(true);
    try {
      await createProfitDistribution({ periodStart, periodEnd, fundAmount, requestId: crypto.randomUUID() });
      await refreshData();
      notify("Reparto guardado en el histórico");
    } catch (error) { notify(error instanceof Error ? error.message : "No fue posible calcular el reparto"); }
    finally { setIsSaving(false); }
  };
  const changeDistributionVoid = async (distribution: ProfitDistribution, voided: boolean) => {
    const action = voided ? "anular" : "restaurar";
    setIsSaving(true);
    try {
      await setProfitDistributionVoided(distribution.id, voided);
      await refreshData();
      if (voided) setDistributionToVoid(null);
      notify(voided ? "Reparto anulado; el periodo puede recalcularse" : "Reparto restaurado");
    } catch (error) { notify(error instanceof Error ? error.message : `No fue posible ${action} el reparto`); }
    finally { setIsSaving(false); }
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsSaving(true);
    try {
      await setRecordTrashed({ entity: deleteTarget.type, id: deleteTarget.id, updatedAt: deleteTarget.updatedAt }, true);
      const [data] = await Promise.all([refreshData(), refreshTrash()]);
      if (deleteTarget.type === "document") setDetail(null);
      else if (detail) setDetail(data.documents.find((document) => document.id === detail.id) ?? null);
      setDeleteTarget(null);
      notify("Registro enviado a la papelera");
    } catch (error) { setDeleteTarget(null); notify(error instanceof Error ? error.message : "No fue posible enviar a la papelera"); }
    finally { setIsSaving(false); }
  };
  const restoreRecord = async (item: TrashItem) => {
    setIsSaving(true);
    try {
      await setRecordTrashed(item, false);
      await Promise.all([refreshData(), refreshTrash()]);
      notify("Registro restaurado");
    } catch (error) { notify(error instanceof Error ? error.message : "No fue posible restaurar el registro"); }
    finally { setIsSaving(false); }
  };
  const handlePaid = async () => {
    if (!detail) return;
    setIsSaving(true);
    try {
      await markDocumentPaid(detail);
      const data = await refreshData();
      setDetail(data.documents.find((document) => document.id === detail.id) ?? null);
      notify("Saldo liquidado");
    } catch (error) { notify(error instanceof Error ? error.message : "No fue posible liquidar el saldo"); }
    finally { setIsSaving(false); }
  };

  const generatePdf = async (doc: Document, share = false) => {
    const payments = movements.filter((movement) => movement.type === "Ingreso" && movement.documentId === doc.id);
    const pdf = new jsPDF({ unit: "mm", format: "letter" });
    const blue: [number, number, number] = [15, 48, 87];
    const gold: [number, number, number] = [184, 139, 55];
    const drawDocumentFooter = () => {
      pdf.setTextColor(75, 82, 90); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5);
      pdf.text("El presente documento no constituye un CFDI.", 18, 220);
      pdf.text("Gracias por confiar en Fernández Conde, S.C.", 18, 227);
      pdf.setDrawColor(...gold); pdf.setLineWidth(1); pdf.line(18, 244, 198, 244);
      drawCorporateContact(pdf, 251);
    };
    const startDocumentContinuation = (section: string) => {
      drawDocumentFooter();
      pdf.addPage();
      pdf.setTextColor(...blue); pdf.setFont("helvetica", "bold"); pdf.setFontSize(12);
      pdf.text(`${doc.kind.toUpperCase()} ${doc.folio}`, 18, 20);
      pdf.setTextColor(95, 102, 110); pdf.setFontSize(8.5); pdf.text("CONTINUACIÓN", 198, 20, { align: "right" });
      pdf.setDrawColor(...gold); pdf.setLineWidth(.6); pdf.line(18, 27, 198, 27);
      pdf.setTextColor(75, 82, 90); pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); pdf.text(section, 18, 38);
      return 38;
    };
    pdf.setFillColor(255, 255, 255); pdf.rect(0, 0, 216, 45, "F");
    try { pdf.addImage(await imageAsDataUrl(brandLogoSrc), "PNG", 8, 3, 125, 42); }
    catch { pdf.setTextColor(...blue); pdf.setFont("helvetica", "bold"); pdf.setFontSize(19); pdf.text("FERNÁNDEZ CONDE", 18, 19); }
    pdf.setTextColor(...blue); pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.text(doc.kind.toUpperCase(), 198, 18, { align: "right" });
    pdf.setTextColor(95, 102, 110); pdf.setFontSize(9); pdf.text(doc.folio, 198, 27, { align: "right" });
    pdf.setDrawColor(...gold); pdf.setLineWidth(.6); pdf.line(18, 45, 198, 45);
    pdf.setTextColor(40, 47, 55); pdf.setFont("helvetica", "normal"); pdf.text("EMITIDO PARA", 18, 56);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.text(clippedLines(pdf, doc.client, 118, 2), 18, 65);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.text(`Fecha: ${doc.date}`, 198, 56, { align: "right" }); pdf.text("Moneda: MXN", 198, 63, { align: "right" });
    pdf.setDrawColor(220, 224, 229); pdf.line(18, 78, 198, 78); pdf.setFont("helvetica", "bold"); pdf.setFillColor(245, 247, 250); pdf.rect(18, 82, 180, 12, "F"); pdf.text("CONCEPTO", 23, 90); pdf.text("IMPORTE", 191, 90, { align: "right" });
    pdf.setFont("helvetica", "normal"); const conceptLines = clippedLines(pdf, doc.concept, 125, 3); pdf.text(conceptLines, 23, 106); pdf.text(money.format(doc.amount), 191, 106, { align: "right" });
    const detailBottom = 116 + Math.max(0, conceptLines.length - 1) * 4; pdf.line(18, detailBottom, 198, detailBottom);
    let cursor = detailBottom + 13;
    pdf.setFont("helvetica", "bold"); pdf.text("TOTAL", 145, cursor); pdf.setTextColor(...blue); pdf.setFontSize(13); pdf.text(money.format(doc.amount), 198, cursor, { align: "right" });
    cursor += 8; pdf.setFontSize(9); pdf.setTextColor(75, 82, 90); pdf.text("PAGADO", 145, cursor); pdf.text(money.format(doc.paidAmount), 198, cursor, { align: "right" });
    cursor += 7; pdf.text("SALDO", 145, cursor); pdf.setTextColor(...blue); pdf.text(money.format(doc.balance), 198, cursor, { align: "right" });
    if (doc.paymentPlan.length) {
      if (cursor + 13 > 205) cursor = startDocumentContinuation("PLAN DE PAGOS POR ACTOS PROCESALES");
      else { cursor += 13; pdf.setTextColor(75, 82, 90); pdf.setFont("helvetica", "bold"); pdf.text("PLAN DE PAGOS POR ACTOS PROCESALES", 18, cursor); }
      for (const stage of doc.paymentPlan) {
        if (cursor + 7 > 205) cursor = startDocumentContinuation("PLAN DE PAGOS (CONT.)");
        const stageLabel = stage.scheduledDate ? `${stage.description} · Previsto: ${formatDate(`${stage.scheduledDate}T12:00:00.000Z`)}` : stage.description;
        cursor += 7; pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.setTextColor(75, 82, 90); pdf.text(clippedLines(pdf, stageLabel, 135, 1), 18, cursor); pdf.text(money.format(stage.amount), 198, cursor, { align: "right" });
      }
    }
    if (payments.length) {
      if (cursor + 13 > 205) cursor = startDocumentContinuation("DESGLOSE DE PAGOS");
      else { cursor += 13; pdf.setTextColor(75, 82, 90); pdf.setFont("helvetica", "bold"); pdf.text("DESGLOSE DE PAGOS", 18, cursor); }
      pdf.setFont("helvetica", "normal");
      for (const payment of payments) {
        if (cursor + 6 > 205) cursor = startDocumentContinuation("DESGLOSE DE PAGOS (CONT.)");
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
        const stage = doc.paymentPlan.find((item) => item.id === payment.paymentStageId);
        cursor += 6; pdf.text(clippedLines(pdf, `${formatDate(payment.occurredAt)} · ${stage?.description ?? "Pago general"}${payment.note ? ` · ${payment.note}` : ""}`, 145, 1), 18, cursor); pdf.text(money.format(payment.amount), 198, cursor, { align: "right" });
      }
    }
    if (doc.notes.trim()) {
      const noteLines = clippedLines(pdf, doc.notes, 180, 5);
      const noteHeight = 19 + Math.max(0, noteLines.length - 1) * 4;
      if (cursor + noteHeight > 205) cursor = startDocumentContinuation("NOTAS");
      else { cursor += 13; pdf.setFont("helvetica", "bold"); pdf.text("NOTAS", 18, cursor); }
      pdf.setFont("helvetica", "normal"); pdf.text(noteLines, 18, cursor + 6);
    }
    drawDocumentFooter();
    const filename = `${doc.folio}-${doc.client.replace(/\s+/g, "-")}.pdf`;
    if (share && navigator.share) {
      const file = new File([pdf.output("blob")], filename, { type: "application/pdf" });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ title: `${doc.kind} ${doc.folio}`, text: `Documento de Fernández Conde, S.C. por ${money.format(doc.amount)}`, files: [file] });
          notify("Documento compartido"); return;
        } catch (error) { if (error instanceof DOMException && error.name === "AbortError") { notify("Compartir cancelado"); return; } }
      }
    }
    pdf.save(filename); notify(share ? "PDF descargado para compartir" : "PDF descargado");
  };

  const generatePaymentReceipt = async (doc: Document, payment: Movement, share = false) => {
    const pdf = new jsPDF({ unit: "mm", format: "letter" });
    const blue: [number, number, number] = [15, 48, 87];
    const gold: [number, number, number] = [184, 139, 55];
    const orderedPayments = movements.filter((movement) => movement.type === "Ingreso" && movement.documentId === doc.id && (new Date(movement.occurredAt).getTime() < new Date(payment.occurredAt).getTime() || (movement.occurredAt === payment.occurredAt && movement.id <= payment.id)));
    const balanceAfter = Math.max(doc.amount - orderedPayments.reduce((sum, movement) => sum + movement.amount, 0), 0);
    const stage = doc.paymentPlan.find((item) => item.id === payment.paymentStageId);
    try { pdf.addImage(await imageAsDataUrl(brandLogoSrc), "PNG", 10, 4, 120, 40); }
    catch { pdf.setTextColor(...blue); pdf.setFont("helvetica", "bold"); pdf.setFontSize(19); pdf.text("FERNÁNDEZ CONDE", 18, 22); }
    pdf.setTextColor(...blue); pdf.setFont("helvetica", "bold"); pdf.setFontSize(16); pdf.text("RECIBO DE PAGO", 198, 18, { align: "right" });
    pdf.setTextColor(95, 102, 110); pdf.setFontSize(9); pdf.text(`REC-${doc.folio}-${payment.id}`, 198, 27, { align: "right" });
    pdf.setDrawColor(...gold); pdf.setLineWidth(.7); pdf.line(18, 47, 198, 47);
    pdf.setTextColor(40, 47, 55); pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.text("RECIBIMOS DE", 18, 61);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(14); pdf.text(clippedLines(pdf, doc.client, 160, 2), 18, 71);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.text(`Fecha del pago: ${formatDate(payment.occurredAt)}`, 18, 88); pdf.text(`Presupuesto relacionado: ${doc.folio}`, 18, 96);
    pdf.setFillColor(245, 247, 250); pdf.rect(18, 108, 180, 38, "F"); pdf.setTextColor(75, 82, 90); pdf.text("IMPORTE RECIBIDO", 25, 119);
    pdf.setTextColor(...blue); pdf.setFont("helvetica", "bold"); pdf.setFontSize(22); pdf.text(money.format(payment.amount), 191, 134, { align: "right" });
    pdf.setFontSize(9); pdf.setTextColor(40, 47, 55); pdf.text("CONCEPTO", 18, 161); pdf.setFont("helvetica", "normal"); pdf.text(clippedLines(pdf, stage?.description ?? "Pago general de honorarios", 180, 3), 18, 170);
    if (payment.note) { pdf.setFont("helvetica", "bold"); pdf.text("REFERENCIA", 18, 190); pdf.setFont("helvetica", "normal"); pdf.text(clippedLines(pdf, payment.note, 180, 3), 18, 199); }
    pdf.setFont("helvetica", "bold"); pdf.setTextColor(...blue); pdf.text(`Saldo general posterior: ${money.format(balanceAfter)}`, 198, 214, { align: "right" });
    pdf.setDrawColor(...gold); pdf.line(18, 244, 198, 244); pdf.setTextColor(95, 102, 110); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.text("Comprobante interno de pago · No constituye CFDI", 108, 250, { align: "center" });
    drawCorporateContact(pdf, 256);
    const filename = `REC-${doc.folio}-${payment.id}.pdf`;
    if (share && navigator.share) {
      const file = new File([pdf.output("blob")], filename, { type: "application/pdf" });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        try { await navigator.share({ title: `Recibo ${doc.folio}`, text: `Recibo de pago por ${money.format(payment.amount)}`, files: [file] }); notify("Recibo compartido"); return; }
        catch (error) { if (error instanceof DOMException && error.name === "AbortError") { notify("Compartir cancelado"); return; } }
      }
    }
    pdf.save(filename); notify(share ? "Recibo descargado para compartir" : "Recibo descargado");
  };

  if (!authReady) return <LoadingScreen />;
  if (!isSupabaseConfigured) return <SetupScreen />;
  if (!session) return <LoginScreen onSignedIn={setSession} />;
  const detailPayments = detail ? movements.filter((movement) => movement.type === "Ingreso" && movement.documentId === detail.id) : [];

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="sidebar-logo-wrap"><img src={brandLogoSrc} alt="Fernández Conde, S.C." /></div>
      <nav><NavItem active={tab === "inicio"} icon={<Home />} label="Inicio" onClick={() => setTab("inicio")} /><NavItem active={tab === "documentos"} icon={<FileText />} label="Presupuestos" onClick={() => setTab("documentos")} /><NavItem active={tab === "clientes"} icon={<Users />} label="Clientes" onClick={() => setTab("clientes")} /><NavItem active={tab === "movimientos"} icon={<WalletCards />} label="Movimientos" onClick={() => setTab("movimientos")} /><NavItem active={tab === "informes"} icon={<BarChart3 />} label="Informes" onClick={() => setTab("informes")} /><NavItem active={tab === "reparto"} icon={<CircleDollarSign />} label="Reparto" onClick={() => setTab("reparto")} /><NavItem active={tab === "papelera"} icon={<Trash2 />} label="Papelera" onClick={() => setTab("papelera")} /></nav>
      <div className="firm-pill"><span className="avatar">FC</span><div><strong>Socio conectado</strong><small>{session.user.email}</small></div><button className="session-exit" aria-label="Cerrar sesión" onClick={() => { void signOut().catch(() => undefined).finally(() => setSession(null)); }}><LogOut /></button></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><div><p className="eyebrow">FERNÁNDEZ CONDE, S.C.</p><h1>{titleFor(tab)}</h1></div><button className="primary compact" onClick={() => setQuickMenuOpen(true)}><Plus /> Nuevo</button></header>
      {!isOnline && <div className="offline-banner"><WifiOff /> Sin conexión. Puedes consultar la pantalla, pero no guardar cambios.</div>}
      {tab === "inicio" && <Dashboard totals={totals} documents={documents} movements={movements} setTab={setTab} openDocument={setDetail} openComposer={openComposer} />}
      {tab === "documentos" && <DocumentsView documents={documents} query={query} setQuery={setQuery} openDocument={setDetail} openComposer={openComposer} />}
      {tab === "clientes" && <ClientsView clients={clients} clientMargins={clientMargins} query={query} setQuery={setQuery} openClient={() => setClientOpen(true)} onOpen={setClientDetail} onEdit={setEditingClient} onDelete={(client) => setDeleteTarget({ type: "client", id: client.id, label: client.name, updatedAt: client.updatedAt })} />}
      {tab === "movimientos" && <MovementsView movements={movements} documents={documents} openExpense={() => setExpenseOpen(true)} onEdit={setEditingMovement} onDelete={(movement) => setDeleteTarget({ type: "movement", id: movement.id, label: movement.description, updatedAt: movement.updatedAt })} />}
      {tab === "informes" && <ReportsView documents={documents} movements={movements} clients={clients} documentMargins={documentMargins} clientMargins={clientMargins} />}
      {tab === "reparto" && <ProfitDistributionView settings={profitSettings} distributions={distributions} voidedDistributions={voidedDistributions} fundBalance={fundBalance} fundAllocated={fundAllocated} fundSpent={fundSpent} movements={movements} saving={isSaving} onSaveSettings={saveDistributionSettings} onCreateDistribution={addDistribution} onVoid={setDistributionToVoid} onRestore={(distribution) => changeDistributionVoid(distribution, false)} />}
      {tab === "papelera" && <TrashView items={trash} auditLog={auditLog} saving={isSaving} onRestore={restoreRecord} />}
    </section>
    <nav className="bottom-nav"><NavItem active={tab === "inicio"} icon={<Home />} label="Inicio" onClick={() => setTab("inicio")} /><NavItem active={tab === "documentos"} icon={<FileText />} label="Presup." onClick={() => setTab("documentos")} /><button className="mobile-create" onClick={() => setQuickMenuOpen(true)} aria-label="Abrir captura rápida"><Plus /></button><NavItem active={tab === "clientes"} icon={<Users />} label="Clientes" onClick={() => setTab("clientes")} /><NavItem active={tab === "movimientos"} icon={<WalletCards />} label="Gastos" onClick={() => setTab("movimientos")} /><NavItem active={tab === "informes"} icon={<BarChart3 />} label="Informes" onClick={() => setTab("informes")} /><NavItem active={tab === "reparto"} icon={<CircleDollarSign />} label="Reparto" onClick={() => setTab("reparto")} /><NavItem active={tab === "papelera"} icon={<Trash2 />} label="Papelera" onClick={() => setTab("papelera")} /></nav>
    {quickMenuOpen && <QuickCreateMenu onClose={() => setQuickMenuOpen(false)} onSelect={openQuickAction} />}
    {paymentPickerOpen && <PendingPaymentPicker documents={documents} onClose={() => setPaymentPickerOpen(false)} onSelect={(document) => { setPaymentPickerOpen(false); setPaymentFor(document); }} />}
    {composerOpen && <DocumentComposer clients={clients} saving={isSaving} onClose={() => setComposerOpen(false)} onSave={addDocument} />}
    {clientOpen && <ClientComposer saving={isSaving} onClose={() => setClientOpen(false)} onSave={addClient} />}
    {expenseOpen && <ExpenseComposer documents={documents} saving={isSaving} onClose={() => setExpenseOpen(false)} onSave={addExpense} />}
    {editingClient && <ClientEditor client={editingClient} saving={isSaving} onClose={() => setEditingClient(null)} onSave={saveClientEdit} />}
    {editingDocument && <DocumentEditor document={editingDocument} clients={clients} saving={isSaving} onClose={() => setEditingDocument(null)} onSave={saveDocumentEdit} />}
    {editingMovement && <ExpenseEditor movement={editingMovement} documents={documents} saving={isSaving} onClose={() => setEditingMovement(null)} onSave={saveMovementEdit} />}
    {clientDetail && <ClientDetail client={clientDetail} steps={comarSteps} progress={clientCaseStageProgress} savingKey={stageSavingKey} onClose={() => setClientDetail(null)} onEdit={() => { setEditingClient(clientDetail); setClientDetail(null); }} onToggle={(stepId, completed) => { void toggleClientCaseStage(clientDetail.id, stepId, completed); }} />}
    {deleteTarget && <DeleteConfirm target={deleteTarget} saving={isSaving} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} />}
    {distributionToVoid && <ConfirmDialog eyebrow="ANULAR REPARTO" title="¿Anular este reparto?" message="El reparto dejará de sumar al Fondo, se conservará como anulado y podrá restaurarse. El periodo quedará disponible para volver a calcularlo." confirmLabel="Anular reparto" savingLabel="Anulando…" saving={isSaving} onClose={() => setDistributionToVoid(null)} onConfirm={() => { void changeDistributionVoid(distributionToVoid, true); }} />}
    {detail && <DocumentDetail doc={detail} payments={detailPayments} margin={documentMargins.find((item) => item.documentId === detail.id)} saving={isSaving} onClose={() => setDetail(null)} onPdf={() => generatePdf(detail)} onShare={() => generatePdf(detail, true)} onEdit={() => { setEditingDocument(detail); setDetail(null); }} onDelete={() => setDeleteTarget({ type: "document", id: detail.id, label: detail.folio, updatedAt: detail.updatedAt })} onPayment={() => setPaymentFor(detail)} onPaymentPdf={(payment) => generatePaymentReceipt(detail, payment)} onPaymentShare={(payment) => generatePaymentReceipt(detail, payment, true)} onDeletePayment={(payment) => setDeleteTarget({ type: "movement", id: payment.id, label: `pago de ${money.format(payment.amount)}`, updatedAt: payment.updatedAt })} onPaid={handlePaid} onStatusChange={(status) => { void changeDocumentStatus(detail, status); }} />}
    {paymentFor && <PaymentComposer document={paymentFor} payments={movements.filter((movement) => movement.type === "Ingreso" && movement.documentId === paymentFor.id)} saving={isSaving} onClose={() => setPaymentFor(null)} onSave={addPayment} />}
    {toast && <div className="toast"><Check /> {toast}</div>}
  </main>;
}

function LoadingScreen() { return <main className="auth-screen"><div className="auth-card"><img className="auth-brand-logo" src={brandLogoSrc} alt="Fernández Conde, S.C." /><p>Abriendo control financiero…</p></div></main>; }
function SetupScreen() { return <main className="auth-screen"><div className="auth-card"><img className="auth-brand-logo" src={brandLogoSrc} alt="Fernández Conde, S.C." /><p className="eyebrow">CONFIGURACIÓN PENDIENTE</p><h1>Falta conectar la base compartida</h1><p>Agrega las variables de Supabase al repositorio para habilitar el acceso de los dos socios.</p></div></main>; }
function LoginScreen({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  return <main className="auth-screen"><form className="auth-card" onSubmit={async (event) => { event.preventDefault(); setLoading(true); setError(""); try { onSignedIn(await signIn(email, password)); } catch (caught) { setError(caught instanceof Error ? caught.message : "No fue posible iniciar sesión"); } finally { setLoading(false); } }}><img className="auth-brand-logo" src={brandLogoSrc} alt="Fernández Conde, S.C." /><p className="eyebrow">ACCESO PARA SOCIOS</p><h1>Control financiero</h1><p>Acceso exclusivo para socios autorizados.</p><label>Correo electrónico<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>{error && <div className="auth-error">{error}</div>}<button className="primary" disabled={loading}>{loading ? "Ingresando…" : "Iniciar sesión"}</button></form></main>;
}

function titleFor(tab: Tab) { return { inicio: "Resumen", documentos: "Presupuestos", clientes: "Clientes", movimientos: "Movimientos", informes: "Informes", reparto: "Reparto de utilidades", papelera: "Papelera y bitácora" }[tab]; }
function NavItem({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) { return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>{icon}<span>{label}</span></button>; }
function monthLabel(date = new Date()) { return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(date).replace(/^./, (letter) => letter.toUpperCase()); }

function Dashboard({ totals, documents, movements, setTab, openDocument, openComposer }: { totals: DashboardTotals; documents: Document[]; movements: Movement[]; setTab: (tab: Tab) => void; openDocument: (doc: Document) => void; openComposer: () => void }) {
  return <div className="page-content">
    <section className="welcome-row brand-welcome"><img src={brandLogoSrc} alt="Fernández Conde, S.C." /><button className="text-button" onClick={() => setTab("informes")} aria-label={`Abrir informes de ${monthLabel()}`}><CalendarDays /> {monthLabel()}</button></section>
    <section className="stats-grid"><StatCard label="Ingresos cobrados" value={totals.income} icon={<ArrowUpRight />} trend="Cobros del mes" tone="green" /><StatCard label="Por cobrar" value={totals.pending} icon={<Clock3 />} trend="Saldos de presupuestos del mes" tone="amber" /><StatCard label="Presupuestado" value={totals.quoted} icon={<FileCheck2 />} trend="Propuestas del mes" tone="blue" /><StatCard label="Balance del mes" value={totals.income - totals.expenses} icon={<TrendingUp />} trend="Después de gastos" tone="navy" /></section>
    <section className="main-grid"><article className="panel activity-panel"><div className="panel-heading"><div><p className="eyebrow">ACTIVIDAD</p><h3>Presupuestos recientes</h3></div><button className="text-link" onClick={() => setTab("documentos")}>Ver todos <ChevronRight /></button></div><div className="document-list">{documents.slice(0, 4).map((doc) => <DocumentRow key={doc.id} doc={doc} onClick={() => openDocument(doc)} />)}{documents.length === 0 && <EmptyState title="Aún no hay presupuestos" text="Crea tu primer presupuesto." />}</div></article>
      <article className="panel quick-panel"><p className="eyebrow">ACCESOS RÁPIDOS</p><h3>Gestión de la firma</h3><button className="quick-action" onClick={openComposer}><span className="quick-icon blue"><FilePlus2 /></span><span><strong>Nuevo presupuesto</strong><small>Incluye pagos por actos procesales</small></span><ChevronRight /></button><button className="quick-action" onClick={() => setTab("movimientos")}><span className="quick-icon gold"><WalletCards /></span><span><strong>Registrar gasto</strong><small>Controla los egresos de Oscar, Dan o el Fondo</small></span><ChevronRight /></button><button className="quick-action" onClick={() => setTab("informes")}><span className="quick-icon green"><BarChart3 /></span><span><strong>Consultar informes</strong><small>Revisa resultados mensuales y anuales</small></span><ChevronRight /></button></article>
    </section>
    <Receivables documents={documents} movements={movements} openDocument={openDocument} />
  </div>;
}

function Receivables({ documents, movements, openDocument }: { documents: Document[]; movements: Movement[]; openDocument: (doc: Document) => void }) {
  const [now] = useState(() => Date.now());
  const rows = documents.filter((document) => document.balance > 0 && document.status !== "Rechazado").sort((a, b) => new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime()).map((document) => {
    const payments = movements.filter((movement) => movement.type === "Ingreso" && movement.documentId === document.id);
    const lastPayment = payments.reduce<string | null>((latest, payment) => !latest || new Date(payment.occurredAt) > new Date(latest) ? payment.occurredAt : latest, null);
    const reference = lastPayment ?? document.issuedAt;
    const days = Math.max(Math.floor((now - new Date(reference).getTime()) / 86400000), 0);
    return { document, days, hasPayments: payments.length > 0, stale: days >= 30 };
  });
  return <section className="panel receivables-panel"><div className="panel-heading"><div><p className="eyebrow">SEGUIMIENTO</p><h3>Cuentas por cobrar</h3></div><span className="count-pill">{rows.length}</span></div><div className="receivable-list">{rows.map(({ document, days, hasPayments, stale }) => <button key={document.id} className={`receivable-row ${stale ? "stale" : ""}`} onClick={() => openDocument(document)}><span className="receivable-alert">{stale ? <AlertTriangle /> : <Clock3 />}</span><span><strong>{document.client}</strong><small>{document.folio} · {hasPayments ? `${days} días desde el último abono` : `${days} días desde su emisión`}</small></span><strong>{money.format(document.balance)}</strong><ChevronRight /></button>)}{rows.length === 0 && <EmptyState title="Sin cuentas pendientes" text="No hay saldos activos por cobrar." />}</div></section>;
}

function StatCard({ label, value, icon, trend, tone }: { label: string; value: number; icon: React.ReactNode; trend: string; tone: string }) { return <article className={`stat-card ${tone}`}><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><strong>{money.format(value)}</strong><small>{trend}</small></article>; }
function StatusPill({ status }: { status: Status }) { return <span className={`status ${status.toLowerCase().replace(" ", "-")}`}>{status}</span>; }
function StagePill({ stage }: { stage: ClientStage }) { return <span className={`status client-${stage.toLowerCase()}`}>{stage}</span>; }
function PracticeAreaField({ value, onChange }: { value: PracticeArea | null; onChange: (value: PracticeArea | null) => void }) {
  return <label>Área de práctica<select value={value ?? ""} onChange={(event) => onChange(event.target.value ? event.target.value as PracticeArea : null)}><option value="">Sin clasificar</option>{practiceAreas.map((area) => <option key={area} value={area}>{area}</option>)}</select><small className="field-help">El seguimiento procesal se habilita al elegir Migratorio/COMAR.</small></label>;
}

function NationalityField({ option, custom, onOptionChange, onCustomChange }: { option: string; custom: string; onOptionChange: (value: string) => void; onCustomChange: (value: string) => void }) {
  return <><label>Nacionalidad<select value={option} onChange={(event) => onOptionChange(event.target.value)}><option value="">Sin registrar</option>{nationalityPresets.map((nationality) => <option key={nationality} value={nationality}>{nationality}</option>)}<option value="Otra">Otra</option></select></label>{option === "Otra" && <label>Especificar nacionalidad<input value={custom} onChange={(event) => onCustomChange(event.target.value)} placeholder="Escribe la nacionalidad" maxLength={80} /></label>}</>;
}

function DocumentRow({ doc, onClick }: { doc: Document; onClick: () => void }) {
  const paymentLabel = doc.paidAmount > 0 && doc.balance > 0 ? `Abonado ${money.format(doc.paidAmount)}` : doc.concept;
  return <button className="document-row" onClick={onClick}><span className="file-icon"><FileText /></span><span className="document-main"><strong>{doc.client}</strong><small>{doc.folio} · {paymentLabel}</small></span><span className="document-amount"><strong>{money.format(doc.amount)}</strong><StatusPill status={doc.status} /></span><ChevronRight className="chevron" /></button>;
}

function DocumentsView({ documents, query, setQuery, openDocument, openComposer }: { documents: Document[]; query: string; setQuery: (value: string) => void; openDocument: (doc: Document) => void; openComposer: () => void }) {
  const [filter, setFilter] = useState("Todos");
  const visible = documents.filter((doc) => (filter === "Todos" || doc.kind === filter) && `${doc.client} ${doc.folio} ${doc.concept}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="page-content"><div className="section-tools"><label className="search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por cliente, folio o concepto" /></label><button className="primary" onClick={openComposer}><Plus /> Crear presupuesto</button></div><div className="filter-row">{["Todos", "Presupuesto", "Recibo", "Cuenta de cobro"].map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><article className="panel"><div className="table-head"><span>Presupuesto</span><span>Cliente y concepto</span><span>Fecha</span><span>Importe</span><span>Estado</span></div>{visible.map((doc) => <DocumentRow key={doc.id} doc={doc} onClick={() => openDocument(doc)} />)}{visible.length === 0 && <EmptyState title="No encontramos presupuestos" text="Prueba con otra búsqueda o crea un presupuesto nuevo." />}</article></div>;
}

function ClientsView({ clients, clientMargins, query, setQuery, openClient, onOpen, onEdit, onDelete }: { clients: Client[]; clientMargins: ClientMargin[]; query: string; setQuery: (value: string) => void; openClient: () => void; onOpen: (client: Client) => void; onEdit: (client: Client) => void; onDelete: (client: Client) => void }) {
  const [stage, setStage] = useState<ClientStage | "Todos">("Todos");
  const visible = clients.filter((client) => (stage === "Todos" || client.stage === stage) && `${client.name} ${client.email}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="page-content">
    <div className="section-tools"><label className="search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente" /></label><button className="primary" onClick={openClient}><Plus /> Añadir cliente</button></div>
    <div className="filter-row">{["Todos", "Aceptado", "Pendiente", "Rechazado"].map((item) => <button key={item} className={stage === item ? "selected" : ""} onClick={() => setStage(item as ClientStage | "Todos")}>{item}</button>)}</div>
    <section className="client-grid">{visible.map((client) => { const margin = clientMargins.find((item) => item.clientId === client.id); return <article className="client-card" key={client.id}><div className="client-top"><span className="avatar large">{client.name.split(" ").slice(0, 2).map((word) => word[0]).join("")}</span><div className="row-actions"><StagePill stage={client.stage} /><button aria-label={`Editar ${client.name}`} onClick={() => onEdit(client)}><Pencil /></button><button className="danger-icon" aria-label={`Eliminar ${client.name}`} onClick={() => onDelete(client)}><Trash2 /></button></div></div><button type="button" className="client-name-button" onClick={() => onOpen(client)}><h3>{client.name}</h3><ChevronRight /></button><p className={`practice-area-pill ${client.practiceArea ? "classified" : "unclassified"}`}>{client.practiceArea ?? "Sin área de práctica"}</p>{client.internalKey && <p className="client-key">Clave: {client.internalKey}</p>}<a href={`mailto:${client.email}`}><Mail /> {client.email || "Sin correo"}</a><a href={`tel:${client.phone}`}><Phone /> {client.phone || "Sin teléfono"}</a>{client.companions.length > 0 && <div className="companions-summary"><strong>Acompañantes</strong>{client.companions.map((companion, index) => <span key={`${companion.name}-${index}`}>{companion.name} · {companion.relationship}</span>)}</div>}<div className="client-total"><span>Margen del cliente</span><strong className={(margin?.margin ?? 0) < 0 ? "negative" : "positive"}>{money.format(margin?.margin ?? 0)}</strong><small>{margin?.marginPercent === null || margin?.marginPercent === undefined ? "Sin ingresos" : `${margin.marginPercent}% de margen`}</small></div></article>; })}</section>
    {visible.length === 0 && <article className="panel"><EmptyState title="No hay clientes en esta clasificación" text="Cambia el filtro o añade un cliente." /></article>}
  </div>;
}

function isCaseStageCompleted(progress: ClientCaseStageProgress[], clientId: number, stepId: number) {
  return progress.find((item) => item.clientId === clientId && item.stepId === stepId)?.completed ?? false;
}

function CaseStageToggle({ completed, saving, label, onToggle }: { completed: boolean; saving: boolean; label: string; onToggle: () => void }) {
  return <button type="button" className={`case-stage-toggle ${completed ? "completed" : "pending"}`} disabled={saving} onClick={onToggle} aria-pressed={completed} aria-label={`${label}: ${completed ? "completado" : "pendiente"}. Toca para cambiar.`} title={`${label}: ${completed ? "Completado" : "Pendiente"}`}>{completed ? <Check /> : <X />}<span>{completed ? "Completado" : "Pendiente"}</span></button>;
}

function ComarChecklist({ client, steps, progress, savingKey, onToggle }: { client: Client; steps: CaseStageStep[]; progress: ClientCaseStageProgress[]; savingKey: string; onToggle: (stepId: number, completed: boolean) => void }) {
  const completedCount = steps.filter((step) => isCaseStageCompleted(progress, client.id, step.id)).length;
  const groups = [...new Set(steps.map((step) => step.groupName))];
  return <section className="comar-checklist"><div className="comar-checklist-heading"><div><p className="eyebrow">SEGUIMIENTO PROCESAL</p><h3>Seguimiento COMAR</h3></div><strong>{completedCount} de {steps.length}</strong></div>{groups.map((group) => <div className="case-stage-group" key={group}><h4>{group}</h4>{steps.filter((step) => step.groupName === group).map((step) => { const completed = isCaseStageCompleted(progress, client.id, step.id); return <div className="case-stage-row" key={step.id}><span><small>Etapa {step.order}</small><strong>{step.name}</strong></span><CaseStageToggle completed={completed} saving={savingKey === `${client.id}-${step.id}`} label={step.name} onToggle={() => onToggle(step.id, !completed)} /></div>; })}</div>)}</section>;
}

function ClientDetail({ client, steps, progress, savingKey, onClose, onEdit, onToggle }: { client: Client; steps: CaseStageStep[]; progress: ClientCaseStageProgress[]; savingKey: string; onClose: () => void; onEdit: () => void; onToggle: (stepId: number, completed: boolean) => void }) {
  return <div className="overlay client-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="client-detail-title"><section className="sheet client-detail-sheet"><div className="sheet-head"><div><p className="eyebrow">FICHA DEL CLIENTE</p><h2 id="client-detail-title">{client.name}</h2></div><div className="sheet-head-actions"><button className="icon-button" aria-label={`Editar ${client.name}`} onClick={onEdit}><Pencil /></button><button className="icon-button" aria-label="Cerrar ficha" onClick={onClose}><X /></button></div></div><div className="client-profile-summary"><span className="avatar large">{client.name.split(" ").slice(0, 2).map((word) => word[0]).join("")}</span><div><StagePill stage={client.stage} /><p className={`practice-area-pill ${client.practiceArea ? "classified" : "unclassified"}`}>{client.practiceArea ?? "Sin área de práctica"}</p></div></div><div className="client-profile-data"><div><span>Clave interna</span><strong>{client.internalKey || "Sin clave"}</strong></div><div><span>Nacionalidad</span><strong>{client.nationality || "Sin registrar"}</strong></div><div><span>Correo</span><strong>{client.email || "Sin correo"}</strong></div><div><span>Teléfono</span><strong>{client.phone || "Sin teléfono"}</strong></div></div>{client.companions.length > 0 && <div className="client-detail-companions"><strong>Acompañantes</strong>{client.companions.map((companion, index) => <span key={`${companion.name}-${index}`}>{companion.name}<small>{companion.relationship}</small></span>)}</div>}{client.practiceArea === "Migratorio/COMAR" && <ComarChecklist client={client} steps={steps} progress={progress} savingKey={savingKey} onToggle={onToggle} />}{!client.practiceArea && <div className="client-area-empty"><ClipboardCheck /><span><strong>Seguimiento sin configurar</strong><small>Edita la ficha y selecciona un área de práctica.</small></span></div>}</section></div>;
}

function MovementsView({ movements, documents, openExpense, onEdit, onDelete }: { movements: Movement[]; documents: Document[]; openExpense: () => void; onEdit: (movement: Movement) => void; onDelete: (movement: Movement) => void }) {
  const current = movements.filter((movement) => sameMonth(movement.occurredAt));
  const income = current.filter((movement) => movement.type === "Ingreso").reduce((sum, movement) => sum + movement.amount, 0);
  const expenses = current.filter((movement) => movement.type === "Gasto").reduce((sum, movement) => sum + movement.amount, 0);
  return <div className="page-content"><div className="expense-banner"><div><span className="movement-icon expense"><ArrowDownRight /></span><div><strong>Registrar un gasto</strong><small>Identifica quién lo cubrió y, si corresponde, el expediente.</small></div></div><button className="primary" onClick={openExpense}><Plus /> Agregar gasto</button></div><section className="stats-grid compact-grid"><StatCard label="Entradas del mes" value={income} icon={<ArrowUpRight />} trend="Pagos registrados" tone="green" /><StatCard label="Gastos del mes" value={expenses} icon={<ArrowDownRight />} trend="Egresos registrados" tone="red" /></section><article className="panel"><div className="panel-heading"><div><p className="eyebrow">{monthLabel().toUpperCase()}</p><h3>Historial de movimientos</h3></div><button className="primary subtle" onClick={openExpense}><Plus /> Registrar gasto</button></div>{movements.map((movement) => { const linked = documents.find((document) => document.id === movement.documentId); return <div className="movement editable" key={movement.id}><span className={`movement-icon ${movement.type === "Ingreso" ? "income" : "expense"}`}>{movement.type === "Ingreso" ? <ArrowUpRight /> : <ArrowDownRight />}</span><span><strong>{movement.description}</strong><small>{movement.category} · {formatDate(movement.occurredAt)}{movement.type === "Gasto" && ` · Cubrió: ${movement.spentBy}`}{linked && ` · ${linked.folio}`}{movement.note && ` · ${movement.note}`}</small></span><strong className={movement.type === "Ingreso" ? "positive" : "negative"}>{movement.type === "Ingreso" ? "+" : "−"}{money.format(movement.amount)}</strong>{movement.type === "Gasto" ? <div className="row-actions"><button aria-label={`Editar ${movement.description}`} onClick={() => onEdit(movement)}><Pencil /></button><button className="danger-icon" aria-label={`Eliminar ${movement.description}`} onClick={() => onDelete(movement)}><Trash2 /></button></div> : <small className="linked-note">Pago de documento</small>}</div>; })}{movements.length === 0 && <EmptyState title="Sin movimientos" text="Los cobros y gastos aparecerán aquí." />}</article></div>;
}

function TrashView({ items, auditLog, saving, onRestore }: { items: TrashItem[]; auditLog: AuditEntry[]; saving: boolean; onRestore: (item: TrashItem) => void }) {
  const entityName = { client: "Cliente", document: "Documento", movement: "Movimiento" };
  const actionName = { created: "creó", updated: "actualizó", trashed: "envió a la papelera", restored: "restauró" };
  return <div className="page-content trash-page"><section className="trash-intro"><div><p className="eyebrow">RECUPERACIÓN</p><h2>Nada se elimina definitivamente</h2><p>Los registros enviados aquí dejan de afectar los informes y pueden restaurarse.</p></div><Trash2 /></section><section className="trash-grid"><article className="panel"><div className="panel-heading"><div><p className="eyebrow">PAPELERA</p><h3>Registros eliminados</h3></div><span className="count-pill">{items.length}</span></div><div className="trash-list">{items.map((item) => <div className="trash-row" key={`${item.entity}-${item.id}`}><span className="trash-icon"><Trash2 /></span><span><strong>{item.label}</strong><small>{item.detail} · {item.deletedAt} · {item.deletedBy}</small></span><button className="secondary compact" disabled={saving} onClick={() => onRestore(item)}><RotateCcw /> Restaurar</button></div>)}{items.length === 0 && <EmptyState title="La papelera está vacía" text="Los registros eliminados aparecerán aquí." />}</div></article><article className="panel audit-panel"><div className="panel-heading"><div><p className="eyebrow">BITÁCORA</p><h3>Actividad reciente</h3></div><History /></div><div className="audit-list">{auditLog.map((entry) => <div className="audit-row" key={entry.id}><span className={`audit-dot ${entry.action}`} /><span><strong>{entry.detail ? `${entry.actor} ${entry.detail}` : `${entry.actor} ${actionName[entry.action]} un ${entityName[entry.entity].toLowerCase()}`}</strong><small>{entry.occurredAt} · registro #{entry.recordId}</small></span></div>)}{auditLog.length === 0 && <EmptyState title="Sin actividad registrada" text="Los próximos cambios quedarán asentados aquí." />}</div></article></section></div>;
}

type ReportScope = "month" | "year" | "all";
function inPeriod(value: string, scope: ReportScope, anchor: Date) {
  if (scope === "all") return true;
  const date = new Date(value);
  if (date.getUTCFullYear() !== anchor.getFullYear()) return false;
  return scope === "year" || date.getUTCMonth() === anchor.getMonth();
}
function reportPeriodLabel(scope: ReportScope, anchor: Date) {
  if (scope === "all") return "Histórico completo";
  return new Intl.DateTimeFormat("es-MX", scope === "month" ? { month: "long", year: "numeric" } : { year: "numeric" }).format(anchor).replace(/^./, (letter) => letter.toUpperCase());
}

function ReportsView({ documents, movements, clients, documentMargins, clientMargins }: { documents: Document[]; movements: Movement[]; clients: Client[]; documentMargins: DocumentMargin[]; clientMargins: ClientMargin[] }) {
  const [scope, setScope] = useState<ReportScope>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const periodDocuments = documents.filter((document) => inPeriod(document.issuedAt, scope, anchor));
  const periodMovements = movements.filter((movement) => inPeriod(movement.occurredAt, scope, anchor));
  const income = periodMovements.filter((movement) => movement.type === "Ingreso").reduce((sum, movement) => sum + movement.amount, 0);
  const expenses = periodMovements.filter((movement) => movement.type === "Gasto").reduce((sum, movement) => sum + movement.amount, 0);
  const quoted = periodDocuments.filter((document) => document.kind === "Presupuesto").reduce((sum, document) => sum + document.amount, 0);
  const pending = periodDocuments.reduce((sum, document) => sum + document.balance, 0);
  const max = Math.max(quoted, income, pending, expenses, 1);
  const average = periodDocuments.length ? periodDocuments.reduce((sum, document) => sum + document.amount, 0) / periodDocuments.length : 0;
  const budgets = periodDocuments.filter((document) => document.kind === "Presupuesto");
  const periodDocumentIds = new Set(periodDocuments.map((document) => document.id));
  const visibleDocumentMargins = documentMargins.filter((margin) => periodDocumentIds.has(margin.documentId));
  const budgetCounts = { accepted: budgets.filter((document) => document.status === "Aceptado" || document.status === "Pagado").length, pending: budgets.filter((document) => document.status === "Pendiente" || document.status === "Vencido").length, rejected: budgets.filter((document) => document.status === "Rechazado").length };
  const clientCounts = { accepted: clients.filter((client) => client.stage === "Aceptado").length, pending: clients.filter((client) => client.stage === "Pendiente").length, rejected: clients.filter((client) => client.stage === "Rechazado").length };
  const label = reportPeriodLabel(scope, anchor);
  const movePeriod = (direction: number) => setAnchor((current) => {
    const next = new Date(current);
    if (scope === "month") next.setMonth(next.getMonth() + direction);
    if (scope === "year") next.setFullYear(next.getFullYear() + direction);
    return next;
  });
  const downloadReport = async () => {
    const pdf = new jsPDF({ unit: "mm", format: "letter" });
    const blue: [number, number, number] = [15, 48, 87];
    const gold: [number, number, number] = [184, 139, 55];
    const drawReportFooter = () => {
      pdf.setDrawColor(...gold); pdf.setLineWidth(.6); pdf.line(18, 244, 198, 244);
      pdf.setTextColor(95, 102, 110); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5);
      pdf.text(`Generado el ${formatDate(new Date().toISOString())} · Control interno, no constituye documentación fiscal`, 108, 250, { align: "center" });
      drawCorporateContact(pdf, 256);
    };
    const startReportContinuation = () => {
      drawReportFooter();
      pdf.addPage();
      pdf.setTextColor(...blue); pdf.setFont("helvetica", "bold"); pdf.setFontSize(13);
      pdf.text("INFORME FINANCIERO", 18, 20);
      pdf.setTextColor(90, 98, 108); pdf.setFontSize(9); pdf.text(`${label} · CONTINUACIÓN`, 198, 20, { align: "right" });
      pdf.setDrawColor(...gold); pdf.setLineWidth(.6); pdf.line(18, 27, 198, 27);
      pdf.setTextColor(35, 45, 56); pdf.setFontSize(11); pdf.text("Movimientos del periodo", 18, 38);
      return 38;
    };
    try { pdf.addImage(await imageAsDataUrl(brandLogoSrc), "PNG", 12, 5, 118, 39); }
    catch { pdf.setTextColor(...blue); pdf.setFont("helvetica", "bold"); pdf.setFontSize(18); pdf.text("FERNÁNDEZ CONDE, S.C.", 18, 22); }
    pdf.setTextColor(...blue); pdf.setFont("helvetica", "bold"); pdf.setFontSize(16); pdf.text("INFORME FINANCIERO", 198, 18, { align: "right" });
    pdf.setTextColor(90, 98, 108); pdf.setFontSize(10); pdf.text(label, 198, 27, { align: "right" });
    pdf.setDrawColor(...gold); pdf.setLineWidth(.7); pdf.line(18, 47, 198, 47);
    pdf.setTextColor(35, 45, 56); pdf.setFontSize(12); pdf.text("Resumen del periodo", 18, 61);
    const rows: Array<[string, string]> = [["Ingresos cobrados", money.format(income)], ["Gastos", money.format(expenses)], ["Balance", money.format(income - expenses)], ["Presupuestado", money.format(quoted)], ["Saldo pendiente", money.format(pending)]];
    let y = 73;
    for (const [name, value] of rows) { pdf.setFont("helvetica", "normal"); pdf.setTextColor(80, 88, 98); pdf.text(name, 22, y); pdf.setFont("helvetica", "bold"); pdf.setTextColor(...blue); pdf.text(value, 194, y, { align: "right" }); pdf.setDrawColor(230, 233, 237); pdf.line(18, y + 4, 198, y + 4); y += 13; }
    y += 8; pdf.setTextColor(35, 45, 56); pdf.setFontSize(12); pdf.text("Actividad comercial", 18, y);
    y += 12; pdf.setFontSize(9); pdf.setFont("helvetica", "normal"); pdf.text(`Presupuestos emitidos: ${periodDocuments.length}`, 22, y); pdf.text(`Ticket promedio: ${money.format(average)}`, 112, y);
    y += 10; pdf.text(`Presupuestos: ${budgetCounts.accepted} aceptados · ${budgetCounts.pending} pendientes · ${budgetCounts.rejected} rechazados`, 22, y);
    y += 10; pdf.text(`Clientes actuales: ${clientCounts.accepted} aceptados · ${clientCounts.pending} pendientes · ${clientCounts.rejected} rechazados`, 22, y);
    y += 17; pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.text("Movimientos del periodo", 18, y);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5);
    for (const movement of periodMovements) {
      if (y + 7 > 232) y = startReportContinuation();
      y += 7; pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.setTextColor(75, 82, 90);
      pdf.text(clippedLines(pdf, `${formatDate(movement.occurredAt)} · ${movement.description}`, 135, 1), 22, y);
      pdf.setTextColor(movement.type === "Ingreso" ? 20 : 160, movement.type === "Ingreso" ? 125 : 55, movement.type === "Ingreso" ? 82 : 55);
      pdf.text(`${movement.type === "Ingreso" ? "+" : "−"}${money.format(movement.amount)}`, 194, y, { align: "right" });
    }
    drawReportFooter();
    pdf.save(`Informe-${label.replace(/\s+/g, "-")}.pdf`);
  };

  return <div className="page-content reports">
    <section className="report-controls panel"><div className="period-picker">{scope !== "all" && <button className="icon-button" onClick={() => movePeriod(-1)} aria-label="Periodo anterior"><ChevronLeft /></button>}<strong>{label}</strong>{scope !== "all" && <button className="icon-button" onClick={() => movePeriod(1)} aria-label="Periodo siguiente"><ChevronRight /></button>}</div><div className="report-actions"><select value={scope} onChange={(event) => setScope(event.target.value as ReportScope)}><option value="month">Mensual</option><option value="year">Anual</option><option value="all">Histórico</option></select><button className="primary" onClick={() => void downloadReport()}><Download /> Generar informe PDF</button></div></section>
    <section className="report-hero"><div><p className="eyebrow">{label.toUpperCase()}</p><h2>{income - expenses >= 0 ? "La firma mantiene un balance positivo." : "Los gastos superan los cobros del periodo."}</h2><p>Los cobros representan el {Math.round((income / Math.max(income + pending, 1)) * 100)}% del ingreso comprometido.</p></div><div className="balance-orb"><small>Balance</small><strong>{money.format(income - expenses)}</strong><span><TrendingUp /> Actualizado</span></div></section>
    <section className="report-grid"><article className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">FINANZAS</p><h3>Ingresos, pendientes y gastos</h3></div></div><div className="bars"><ReportBar label="Cobrado" value={income} max={max} tone="navy" /><ReportBar label="Pendiente" value={pending} max={max} tone="gold" /><ReportBar label="Gastos" value={expenses} max={max} tone="red" /><ReportBar label="Presupuestado" value={quoted} max={max} tone="blue" /></div></article><article className="panel"><p className="eyebrow">INDICADORES</p><h3>Rendimiento comercial</h3><div className="kpi"><span>Presupuestos emitidos</span><strong>{periodDocuments.length}</strong></div><div className="kpi"><span>Ticket promedio</span><strong>{money.format(average)}</strong></div><div className="kpi"><span>Movimientos</span><strong>{periodMovements.length}</strong></div></article></section>
    <section className="report-grid status-report-grid"><article className="panel"><div className="panel-heading"><div><p className="eyebrow">PRESUPUESTOS</p><h3>Resultado de propuestas</h3></div></div><StatusSummary accepted={budgetCounts.accepted} pending={budgetCounts.pending} rejected={budgetCounts.rejected} /></article><article className="panel"><div className="panel-heading"><div><p className="eyebrow">CLIENTES</p><h3>Clasificación actual</h3></div></div><StatusSummary accepted={clientCounts.accepted} pending={clientCounts.pending} rejected={clientCounts.rejected} /></article></section>
    <section className="margin-report-grid"><MarginPanel title="Margen por expediente" subtitle={label} rows={visibleDocumentMargins.map((item) => ({ id: item.documentId, label: item.folio, detail: item.concept, income: item.income, expenses: item.expenses, margin: item.margin, percent: item.marginPercent }))} /><MarginPanel title="Margen por cliente" subtitle="Histórico acumulado" rows={clientMargins.map((item) => ({ id: item.clientId, label: item.clientName, detail: "Todos sus expedientes", income: item.income, expenses: item.expenses, margin: item.margin, percent: item.marginPercent }))} /></section>
  </div>;
}

function ReportBar({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) { return <div className="bar-row"><div><span>{label}</span><strong>{money.format(value)}</strong></div><div className="bar-track"><span className={tone} style={{ width: `${value ? Math.max((value / max) * 100, 4) : 0}%` }} /></div></div>; }
function StatusSummary({ accepted, pending, rejected }: { accepted: number; pending: number; rejected: number }) { const total = Math.max(accepted + pending + rejected, 1); return <div className="status-summary"><div><span>Aceptados</span><strong>{accepted}</strong><i className="accepted" style={{ width: `${accepted / total * 100}%` }} /></div><div><span>Pendientes</span><strong>{pending}</strong><i className="pending" style={{ width: `${pending / total * 100}%` }} /></div><div><span>Rechazados</span><strong>{rejected}</strong><i className="rejected" style={{ width: `${rejected / total * 100}%` }} /></div></div>; }

function MarginPanel({ title, subtitle, rows }: { title: string; subtitle: string; rows: Array<{ id: number; label: string; detail: string; income: number; expenses: number; margin: number; percent: number | null }> }) {
  return <article className="panel margin-panel"><div className="panel-heading"><div><p className="eyebrow">{subtitle.toUpperCase()}</p><h3>{title}</h3></div></div><div className="margin-list">{rows.map((row) => <div className="margin-row" key={row.id}><span><strong>{row.label}</strong><small>{row.detail}</small></span><span><small>Ingresos {money.format(row.income)} · Gastos {money.format(row.expenses)}</small><strong className={row.margin < 0 ? "negative" : "positive"}>{money.format(row.margin)}{row.percent !== null && ` · ${row.percent}%`}</strong></span></div>)}{rows.length === 0 && <p className="payment-empty">No hay expedientes con movimientos en este periodo.</p>}</div></article>;
}

function ProfitDistributionView({ settings, distributions, voidedDistributions, fundBalance, fundAllocated, fundSpent, movements, saving, onSaveSettings, onCreateDistribution, onVoid, onRestore }: { settings: ProfitSettings; distributions: ProfitDistribution[]; voidedDistributions: ProfitDistribution[]; fundBalance: number; fundAllocated: number; fundSpent: number; movements: Movement[]; saving: boolean; onSaveSettings: (settings: Omit<ProfitSettings, "updatedAt">) => void; onCreateDistribution: (periodStart: string, periodEnd: string, fundAmount: number | null) => void; onVoid: (distribution: ProfitDistribution) => void; onRestore: (distribution: ProfitDistribution) => void }) {
  const today = new Date();
  const initialStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const initialEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const [periodStart, setPeriodStart] = useState(initialStart);
  const [periodEnd, setPeriodEnd] = useState(initialEnd);
  const [fundPercent, setFundPercent] = useState(String(settings.fundPercent));
  const [oscarPercent, setOscarPercent] = useState(String(settings.oscarPercent));
  const [danPercent, setDanPercent] = useState(String(settings.danPercent));
  const [fundMode, setFundMode] = useState<"percentage" | "fixed">("percentage");
  const [fixedFundAmount, setFixedFundAmount] = useState("");
  useEffect(() => { setFundPercent(String(settings.fundPercent)); setOscarPercent(String(settings.oscarPercent)); setDanPercent(String(settings.danPercent)); }, [settings]);
  const percentages = { fundPercent: Number(fundPercent), oscarPercent: Number(oscarPercent), danPercent: Number(danPercent) };
  const percentageTotal = percentages.fundPercent + percentages.oscarPercent + percentages.danPercent;
  const periodMovements = movements.filter((movement) => { const date = toInputDate(movement.occurredAt); return date >= periodStart && date <= periodEnd; });
  const income = periodMovements.filter((movement) => movement.type === "Ingreso").reduce((sum, movement) => sum + movement.amount, 0);
  const expenses = periodMovements.filter((movement) => movement.type === "Gasto").reduce((sum, movement) => sum + movement.amount, 0);
  const netProfit = income - expenses;
  const positiveProfit = Math.max(netProfit, 0);
  const fixedFund = Number(fixedFundAmount);
  const validFixedFund = fundMode === "percentage" || (fixedFundAmount.trim() !== "" && Number.isFinite(fixedFund) && fixedFund >= 0 && fixedFund <= positiveProfit);
  const partnerWeight = settings.oscarPercent + settings.danPercent;
  const fundAmount = fundMode === "fixed" ? (Number.isFinite(fixedFund) ? fixedFund : 0) : positiveProfit * settings.fundPercent / 100;
  const partnerPool = Math.max(positiveProfit - fundAmount, 0);
  const oscarShare = partnerWeight > 0 ? settings.oscarPercent / partnerWeight : 0;
  const oscarAmount = fundMode === "fixed" ? partnerPool * oscarShare : positiveProfit * settings.oscarPercent / 100;
  const danAmount = fundMode === "fixed" ? partnerPool - oscarAmount : positiveProfit * settings.danPercent / 100;
  return <div className="page-content distribution-page">
    <section className="fund-hero"><div><p className="eyebrow">FONDO DE LA FIRMA</p><h2>{money.format(fundBalance)}</h2><p>Saldo disponible después de los gastos cubiertos por el Fondo.</p><div className="fund-breakdown"><span>Aportado <strong>{money.format(fundAllocated)}</strong></span><span>Gastado <strong>{money.format(fundSpent)}</strong></span></div></div><CircleDollarSign /></section>
    <section className="distribution-grid"><article className="panel distribution-calculator"><div className="panel-heading"><div><p className="eyebrow">NUEVO CÁLCULO</p><h3>Repartir utilidad del periodo</h3></div></div><div className="date-range"><label>Desde<input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label><label>Hasta<input type="date" value={periodEnd} min={periodStart} onChange={(event) => setPeriodEnd(event.target.value)} /></label></div><div className="fund-allocation-controls"><label>Aportación al Fondo<select value={fundMode} onChange={(event) => setFundMode(event.target.value as "percentage" | "fixed")}><option value="percentage">Porcentaje configurado ({settings.fundPercent}%)</option><option value="fixed">Cantidad fija</option></select></label>{fundMode === "fixed" && <label>Cantidad para el Fondo (MXN)<div className="money-input"><span>$</span><input inputMode="decimal" value={fixedFundAmount} onChange={(event) => setFixedFundAmount(event.target.value)} placeholder="0.00" /></div></label>}<small>{fundMode === "fixed" ? "El resto se divide entre Oscar y Dan respetando la proporción configurada entre ambos." : "Se aplicarán los porcentajes guardados en la configuración."}</small></div><div className="distribution-preview"><div><span>Ingresos</span><strong>{money.format(income)}</strong></div><div><span>Gastos</span><strong>{money.format(expenses)}</strong></div><div className="net-profit"><span>Utilidad neta</span><strong>{money.format(netProfit)}</strong></div><div><span>Fondo · {fundMode === "fixed" ? "cantidad fija" : `${settings.fundPercent}%`}</span><strong>{money.format(fundAmount)}</strong></div><div><span>Oscar{fundMode === "fixed" ? ` · ${(oscarShare * 100).toFixed(2)}% del remanente` : ` · ${settings.oscarPercent}%`}</span><strong>{money.format(oscarAmount)}</strong></div><div><span>Dan{fundMode === "fixed" ? ` · ${((1 - oscarShare) * 100).toFixed(2)}% del remanente` : ` · ${settings.danPercent}%`}</span><strong>{money.format(danAmount)}</strong></div></div>{netProfit <= 0 && <p className="distribution-warning">El periodo debe tener utilidad positiva para guardar un reparto.</p>}{fundMode === "fixed" && !validFixedFund && <p className="distribution-warning">La cantidad del Fondo debe estar entre $0.00 y {money.format(positiveProfit)}.</p>}{fundMode === "fixed" && partnerWeight <= 0 && fundAmount < positiveProfit && <p className="distribution-warning">Configura un porcentaje para Oscar o Dan antes de repartir el remanente.</p>}<button className="primary distribution-submit" disabled={saving || !periodStart || !periodEnd || periodEnd < periodStart || netProfit <= 0 || !validFixedFund || (fundMode === "fixed" && partnerWeight <= 0 && fundAmount < positiveProfit)} onClick={() => onCreateDistribution(periodStart, periodEnd, fundMode === "fixed" ? fixedFund : null)}><Check /> {saving ? "Guardando…" : "Calcular y guardar reparto"}</button></article>
      <article className="panel settings-panel"><div className="panel-heading"><div><p className="eyebrow">CONFIGURACIÓN</p><h3>Porcentajes del reparto</h3></div></div><div className="percentage-fields"><label>Fondo (%)<input inputMode="decimal" value={fundPercent} onChange={(event) => setFundPercent(event.target.value)} /></label><label>Oscar (%)<input inputMode="decimal" value={oscarPercent} onChange={(event) => setOscarPercent(event.target.value)} /></label><label>Dan (%)<input inputMode="decimal" value={danPercent} onChange={(event) => setDanPercent(event.target.value)} /></label></div><div className={`percentage-total ${Math.abs(percentageTotal - 100) < .001 ? "complete" : "warning"}`}><span>Total</span><strong>{percentageTotal.toFixed(2)}%</strong></div><p>Los cambios solo afectan repartos futuros; el histórico conserva los porcentajes usados en cada cálculo.</p><button className="secondary" disabled={saving || !Number.isFinite(percentageTotal) || Math.abs(percentageTotal - 100) >= .001 || Object.values(percentages).some((value) => value < 0)} onClick={() => onSaveSettings(percentages)}><Check /> Guardar porcentajes</button></article></section>
    <article className="panel distribution-history"><div className="panel-heading"><div><p className="eyebrow">HISTÓRICO VIGENTE</p><h3>Repartos guardados</h3></div><span className="count-pill">{distributions.length}</span></div><p className="distribution-help">Si un reparto tiene un error, anúlalo y vuelve a calcular el periodo. El registro original se conservará como anulado.</p>{distributions.map((distribution) => <div className="distribution-row" key={distribution.id}><span><strong>{formatDate(`${distribution.periodStart}T12:00:00Z`)} — {formatDate(`${distribution.periodEnd}T12:00:00Z`)}</strong><small>Utilidad {money.format(distribution.netProfit)} · Fondo {distribution.fundPercent}% · Oscar {distribution.oscarPercent}% · Dan {distribution.danPercent}%</small></span><span><strong>Fondo {money.format(distribution.fundAmount)}</strong><small>Oscar {money.format(distribution.oscarAmount)} · Dan {money.format(distribution.danAmount)}</small></span><button className="icon-button danger-icon" disabled={saving} aria-label="Anular reparto" onClick={() => onVoid(distribution)}><Trash2 /></button></div>)}{distributions.length === 0 && <EmptyState title="Aún no hay repartos vigentes" text="Calcula uno nuevo o restaura un reparto anulado." />}</article>
    {voidedDistributions.length > 0 && <article className="panel distribution-history voided-history"><div className="panel-heading"><div><p className="eyebrow">CORRECCIONES</p><h3>Repartos anulados</h3></div><span className="count-pill">{voidedDistributions.length}</span></div>{voidedDistributions.map((distribution) => <div className="distribution-row voided" key={distribution.id}><span><strong>{formatDate(`${distribution.periodStart}T12:00:00Z`)} — {formatDate(`${distribution.periodEnd}T12:00:00Z`)}</strong><small>Anulado · utilidad original {money.format(distribution.netProfit)}</small></span><span><strong>Fondo {money.format(distribution.fundAmount)}</strong><small>Oscar {money.format(distribution.oscarAmount)} · Dan {money.format(distribution.danAmount)}</small></span><button className="secondary compact" disabled={saving} onClick={() => onRestore(distribution)}><RotateCcw /> Restaurar</button></div>)}</article>}
  </div>;
}

function ServiceConceptField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const preset = servicePresets.includes(value);
  return <><select value={preset ? value : "__other"} onChange={(event) => onChange(event.target.value === "__other" ? "" : event.target.value)}>{servicePresets.map((service) => <option key={service} value={service}>{service}</option>)}<option value="__other">Otro concepto</option></select>{!preset && <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Escribe el concepto" autoFocus />}<small className="field-help">La opción “Otro concepto” permite capturar cualquier servicio manualmente.</small></>;
}

function CompanionFields({ value, onChange }: { value: Companion[]; onChange: (value: Companion[]) => void }) {
  const update = (index: number, field: keyof Companion, next: string) => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: next } : item));
  return <div className="repeatable-field"><div className="repeatable-heading"><span>Acompañantes</span><button type="button" className="secondary compact" onClick={() => onChange([...value, { name: "", relationship: "" }])}><Plus /> Añadir</button></div>{value.map((companion, index) => <div className="repeatable-row companion-row" key={index}><input value={companion.name} onChange={(event) => update(index, "name", event.target.value)} placeholder="Nombre del acompañante" /><input value={companion.relationship} onChange={(event) => update(index, "relationship", event.target.value)} placeholder="Parentesco o relación" /><button type="button" className="icon-button danger-icon" aria-label="Quitar acompañante" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></button></div>)}{value.length === 0 && <small className="field-help">No se registran como clientes independientes.</small>}</div>;
}

function PaymentPlanFields({ value, onChange, documentAmount }: { value: PaymentStage[]; onChange: (value: PaymentStage[]) => void; documentAmount: number }) {
  const update = (index: number, field: "description" | "amount" | "scheduledDate", next: string) => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: field === "amount" ? Number(next) : next } : item));
  const total = value.reduce((sum, stage) => sum + (stage.amount || 0), 0);
  return <div className="payment-plan-editor"><div className="repeatable-heading"><span>Actos procesales e importes</span><button type="button" className="secondary compact" onClick={() => onChange([...value, { id: crypto.randomUUID(), description: "", amount: 0, scheduledDate: "" }])}><Plus /> Añadir acto</button></div>{value.map((stage, index) => <div className="repeatable-row plan-row" key={stage.id}><input value={stage.description} onChange={(event) => update(index, "description", event.target.value)} placeholder="Ej. Presentación de la demanda" /><div className="money-input"><span>$</span><input inputMode="decimal" value={stage.amount || ""} onChange={(event) => update(index, "amount", event.target.value)} placeholder="0.00" /></div><label className="scheduled-date-field">Fecha prevista (opcional)<input type="date" value={stage.scheduledDate ?? ""} onChange={(event) => update(index, "scheduledDate", event.target.value)} /></label><button type="button" className="icon-button danger-icon" aria-label="Quitar acto procesal" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></button></div>)}<small className="field-help plan-date-help">La fecha prevista sirve como recordatorio y no se registra como ingreso.</small><div className={`plan-total ${Math.abs(total - documentAmount) > .009 ? "warning" : "complete"}`}><span>Total programado</span><strong>{money.format(total)}</strong><small>{Math.abs(total - documentAmount) > .009 ? `Diferencia con el presupuesto: ${money.format(documentAmount - total)}` : "Coincide con el total del presupuesto"}</small></div></div>;
}

function DocumentComposer({ clients, saving, onClose, onSave }: { clients: Client[]; saving: boolean; onClose: () => void; onSave: (doc: NewDocumentInput) => void }) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? 0);
  const [concept, setConcept] = useState(servicePresets[0]);
  const [amount, setAmount] = useState("8000");
  const [notes, setNotes] = useState("");
  const [planEnabled, setPlanEnabled] = useState(false);
  const [paymentPlan, setPaymentPlan] = useState<PaymentStage[]>([]);
  const [requestId] = useState(() => crypto.randomUUID());
  const selected = clients.find((client) => client.id === clientId);
  const validPlan = !planEnabled || (paymentPlan.length > 0 && paymentPlan.every((stage) => stage.description.trim() && stage.amount > 0));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !concept.trim() || Number(amount) <= 0 || !validPlan) return;
    onSave({ kind: "Presupuesto", clientId, client: selected.name, concept: concept.trim(), amount: Number(amount), paymentPlan: planEnabled ? paymentPlan : [], status: "Pendiente", notes, requestId });
  };
  return <div className="overlay"><form className="sheet" onSubmit={submit}><div className="sheet-head"><div><p className="eyebrow">NUEVO PRESUPUESTO</p><h2>Crear propuesta</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div>{clients.length === 0 && <div className="empty-note">Primero añade un cliente desde la sección Clientes.</div>}<label>Cliente<select value={clientId} onChange={(event) => setClientId(Number(event.target.value))}>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label>Concepto<ServiceConceptField value={concept} onChange={setConcept} /></label><label>Importe total (MXN)<div className="money-input"><span>$</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></div></label><div className="total-preview"><span>Total</span><strong>{money.format(Number(amount) || 0)}</strong></div><label className="toggle-field"><input type="checkbox" checked={planEnabled} onChange={(event) => { const enabled = event.target.checked; setPlanEnabled(enabled); if (enabled && paymentPlan.length === 0) setPaymentPlan([{ id: crypto.randomUUID(), description: "Anticipo", amount: Number(amount) || 0, scheduledDate: "" }]); }} /><span><strong>Plan de pagos por actos procesales</strong><small>Puedes añadir una fecha prevista opcional; el ingreso solo se contará al registrar el abono real.</small></span></label>{planEnabled && <PaymentPlanFields value={paymentPlan} onChange={setPaymentPlan} documentAmount={Number(amount) || 0} />}<label>Notas<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Condiciones de pago, alcance o vigencia del presupuesto…" /></label><div className="sheet-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving || !selected || !concept.trim() || Number(amount) <= 0 || !validPlan}><FileCheck2 /> {saving ? "Guardando…" : "Crear presupuesto"}</button></div></form></div>;
}

function ClientComposer({ saving, onClose, onSave }: { saving: boolean; onClose: () => void; onSave: (client: Omit<Client, "id" | "total" | "updatedAt">) => void }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [phone, setPhone] = useState(""); const [nationalityOption, setNationalityOption] = useState(""); const [customNationality, setCustomNationality] = useState(""); const [stage, setStage] = useState<ClientStage>("Pendiente"); const [practiceArea, setPracticeArea] = useState<PracticeArea | null>(null); const [internalKey, setInternalKey] = useState(""); const [companions, setCompanions] = useState<Companion[]>([]);
  const nationality = nationalityOption === "Otra" ? customNationality.trim() : nationalityOption;
  const validNationality = nationalityOption !== "Otra" || Boolean(customNationality.trim());
  const validCompanions = companions.every((companion) => companion.name.trim() && companion.relationship.trim());
  return <div className="overlay"><form className="sheet compact-sheet" onSubmit={(event) => { event.preventDefault(); if (name.trim() && validNationality && validCompanions) onSave({ name: name.trim(), email: email.trim(), phone: phone.trim(), nationality, stage, practiceArea, internalKey: internalKey.trim(), companions: companions.map((companion) => ({ name: companion.name.trim(), relationship: companion.relationship.trim() })) }); }}><div className="sheet-head"><div><p className="eyebrow">DIRECTORIO</p><h2>Añadir cliente</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><label>Nombre o razón social<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre completo" autoFocus /></label><label>Clave interna<input value={internalKey} onChange={(event) => setInternalKey(event.target.value)} placeholder="Dato interno opcional" /><small className="field-help">Solo se mostrará en la ficha del cliente.</small></label><label>Clasificación<select value={stage} onChange={(event) => setStage(event.target.value as ClientStage)}><option>Aceptado</option><option>Pendiente</option><option>Rechazado</option></select></label><PracticeAreaField value={practiceArea} onChange={setPracticeArea} /><NationalityField option={nationalityOption} custom={customNationality} onOptionChange={setNationalityOption} onCustomChange={setCustomNationality} /><label>Correo electrónico<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="correo@ejemplo.com" /></label><label>Teléfono<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="55 0000 0000" /></label><CompanionFields value={companions} onChange={setCompanions} />{!validNationality && <div className="auth-error">Escribe la nacionalidad del cliente.</div>}{!validCompanions && <div className="auth-error">Completa el nombre y parentesco de cada acompañante.</div>}<div className="sheet-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving || !name.trim() || !validNationality || !validCompanions}><UserRound /> {saving ? "Guardando…" : "Guardar cliente"}</button></div></form></div>;
}

function ExpenseComposer({ documents, saving, onClose, onSave }: { documents: Document[]; saving: boolean; onClose: () => void; onSave: (movement: NewExpenseInput) => void }) {
  const [description, setDescription] = useState(""); const [category, setCategory] = useState("Operación"); const [amount, setAmount] = useState(""); const [spentBy, setSpentBy] = useState(expenseSpenders[0]); const [date, setDate] = useState(todayInput()); const [documentId, setDocumentId] = useState(""); const [requestId] = useState(() => crypto.randomUUID());
  return <div className="overlay"><form className="sheet compact-sheet" onSubmit={(event) => { event.preventDefault(); if (description && spentBy && Number(amount) > 0) onSave({ description, category, amount: Number(amount), spentBy, occurredAt: toDatabaseDate(date), documentId: documentId ? Number(documentId) : null, requestId }); }}><div className="sheet-head"><div><p className="eyebrow">MOVIMIENTO</p><h2>Registrar gasto</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><label>Descripción<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ej. Impresiones del expediente" autoFocus /></label><label>Categoría<select value={category} onChange={(event) => setCategory(event.target.value)}>{expenseCategories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Expediente o presupuesto (opcional)<select value={documentId} onChange={(event) => setDocumentId(event.target.value)}><option value="">Gasto general de la firma</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.folio} · {document.client}</option>)}</select><small className="field-help">Si lo vinculas, se descontará del margen de ese expediente y de su cliente.</small></label><label>¿Quién cubrió el gasto?<select value={spentBy} onChange={(event) => setSpentBy(event.target.value)}>{expenseSpenders.map((name) => <option key={name}>{name}</option>)}</select><small className="field-help">Si eliges Fondo, el importe se descontará automáticamente de su saldo.</small></label><label>Fecha del gasto<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Importe (MXN)<div className="money-input"><span>$</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></div></label><div className="sheet-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving || !description || !spentBy || Number(amount) <= 0}><WalletCards /> {saving ? "Guardando…" : "Registrar gasto"}</button></div></form></div>;
}

function PaymentComposer({ document, payments, saving, onClose, onSave }: { document: Document; payments: Movement[]; saving: boolean; onClose: () => void; onSave: (payment: NewPaymentInput) => void }) {
  const stageBalance = (stage: PaymentStage) => Math.max(stage.amount - payments.filter((payment) => payment.paymentStageId === stage.id).reduce((sum, payment) => sum + payment.amount, 0), 0);
  const firstPendingStage = document.paymentPlan.find((stage) => stageBalance(stage) > 0);
  const [paymentStageId, setPaymentStageId] = useState(firstPendingStage?.id ?? "");
  const initialMaximum = firstPendingStage ? Math.min(stageBalance(firstPendingStage), document.balance) : document.balance;
  const [amount, setAmount] = useState(String(initialMaximum)); const [date, setDate] = useState(todayInput()); const [note, setNote] = useState(""); const [requestId] = useState(() => crypto.randomUUID());
  const numericAmount = Number(amount);
  const selectedStage = document.paymentPlan.find((stage) => stage.id === paymentStageId);
  const maximum = selectedStage ? Math.min(stageBalance(selectedStage), document.balance) : document.balance;
  const today = todayInput();
  const futurePayment = date > today;
  const futureStage = Boolean(selectedStage?.scheduledDate && selectedStage.scheduledDate > today);
  return <div className="overlay payment-overlay"><form className="sheet compact-sheet" onSubmit={(event) => { event.preventDefault(); if (numericAmount > 0 && numericAmount <= maximum && !futurePayment) onSave({ documentId: document.id, amount: numericAmount, occurredAt: toDatabaseDate(date), note, paymentStageId: paymentStageId || null, requestId }); }}><div className="sheet-head"><div><p className="eyebrow">PAGO RECIBIDO</p><h2>Registrar abono</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><div className="payment-context"><strong>{document.folio}</strong><span>{document.client}</span><small>Saldo actual: {money.format(document.balance)}</small></div>{document.paymentPlan.length > 0 && <label>Acto procesal<select value={paymentStageId} onChange={(event) => { const nextId = event.target.value; setPaymentStageId(nextId); const stage = document.paymentPlan.find((item) => item.id === nextId); setAmount(String(stage ? Math.min(stageBalance(stage), document.balance) : document.balance)); }}><option value="">Pago general</option>{document.paymentPlan.map((stage) => <option key={stage.id} value={stage.id} disabled={stageBalance(stage) <= 0}>{stage.description}{stage.scheduledDate ? ` · previsto ${formatDate(`${stage.scheduledDate}T12:00:00.000Z`)}` : ""} · saldo {money.format(stageBalance(stage))}</option>)}</select></label>}{futureStage && <div className="scheduled-payment-note">Este pago está previsto para {formatDate(`${selectedStage!.scheduledDate}T12:00:00.000Z`)}. Regístralo solamente cuando el dinero haya sido recibido.</div>}<label>Importe del abono (MXN)<div className="money-input"><span>$</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></div></label>{numericAmount > maximum && <div className="auth-error">El abono no puede exceder {selectedStage ? "el saldo de este acto procesal" : "el saldo pendiente"}.</div>}<label>Fecha real de recepción<input type="date" max={today} value={date} onChange={(event) => setDate(event.target.value)} /><small className="field-help">Solo los abonos ya recibidos cuentan como ingreso en informes, margen y reparto.</small></label>{futurePayment && <div className="auth-error">La fecha real del abono no puede ser futura. Usa la fecha prevista del acto procesal.</div>}<label>Nota o referencia<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej. Transferencia o referencia bancaria…" /></label><div className="total-preview"><span>Saldo general después del abono</span><strong>{money.format(Math.max(document.balance - (numericAmount || 0), 0))}</strong></div><div className="sheet-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving || numericAmount <= 0 || numericAmount > maximum || futurePayment}><CircleDollarSign /> {saving ? "Guardando…" : "Registrar abono recibido"}</button></div></form></div>;
}

function DocumentDetail({ doc, payments, margin, saving, onClose, onPdf, onShare, onEdit, onDelete, onPayment, onPaymentPdf, onPaymentShare, onDeletePayment, onPaid, onStatusChange }: { doc: Document; payments: Movement[]; margin?: DocumentMargin; saving: boolean; onClose: () => void; onPdf: () => void; onShare: () => void; onEdit: () => void; onDelete: () => void; onPayment: () => void; onPaymentPdf: (payment: Movement) => void; onPaymentShare: (payment: Movement) => void; onDeletePayment: (payment: Movement) => void; onPaid: () => void; onStatusChange: (status: Status) => void }) {
  const progress = doc.amount ? Math.min((doc.paidAmount / doc.amount) * 100, 100) : 0;
  const stagePaid = (stage: PaymentStage) => payments.filter((payment) => payment.paymentStageId === stage.id).reduce((sum, payment) => sum + payment.amount, 0);
  return <div className="overlay"><section className="sheet detail-sheet"><div className="sheet-head"><div><p className="eyebrow">{doc.kind.toUpperCase()}</p><h2>{doc.folio}</h2></div><div className="sheet-head-actions"><button className="icon-button" aria-label="Editar documento" onClick={onEdit}><Pencil /></button><button className="icon-button danger-icon" aria-label="Enviar documento a la papelera" onClick={onDelete}><Trash2 /></button><button className="icon-button" aria-label="Cerrar" onClick={onClose}><X /></button></div></div><div className="detail-status"><StatusPill status={doc.status} /><span>{doc.date}</span></div><div className="preview-card"><div className="preview-brand"><img className="preview-logo" src={brandLogoSrc} alt="Fernández Conde, S.C." /></div><p>EMITIDO PARA</p><h3>{doc.client}</h3><div className="preview-line"><span>{doc.concept}</span><strong>{money.format(doc.amount)}</strong></div>{doc.notes && <div className="preview-notes"><strong>Notas</strong><span>{doc.notes}</span></div>}<div className="preview-total"><span>Total</span><strong>{money.format(doc.amount)}</strong></div></div>{doc.status !== "Pagado" && <section className="budget-decision"><div><p className="eyebrow">RESULTADO</p><h3>Estado del presupuesto</h3></div><div className="decision-buttons">{(["Pendiente", "Aceptado", "Rechazado"] as Status[]).map((status) => <button type="button" key={status} className={doc.status === status ? "selected" : ""} disabled={saving || (doc.paidAmount > 0 && status !== "Aceptado")} onClick={() => onStatusChange(status)}>{status}</button>)}</div><small>{doc.paidAmount > 0 ? "Al existir un abono, el presupuesto se considera aceptado automáticamente." : "“Rechazado” se marca manualmente cuando el cliente comunica que no acepta el presupuesto."}</small></section>}<section className="payment-summary"><div><span>Pagado</span><strong>{money.format(doc.paidAmount)}</strong></div><div><span>Saldo pendiente</span><strong>{money.format(doc.balance)}</strong></div><div className="payment-progress"><i style={{ width: `${progress}%` }} /></div></section><section className="document-margin-summary"><div><span>Ingresos del expediente</span><strong>{money.format(margin?.income ?? 0)}</strong></div><div><span>Gastos atribuibles</span><strong>{money.format(margin?.expenses ?? 0)}</strong></div><div><span>Margen</span><strong className={(margin?.margin ?? 0) < 0 ? "negative" : "positive"}>{money.format(margin?.margin ?? 0)}{margin?.marginPercent !== null && margin?.marginPercent !== undefined && ` · ${margin.marginPercent}%`}</strong></div></section>{doc.paymentPlan.length > 0 && <section className="stage-breakdown"><div className="payment-heading"><div><p className="eyebrow">PLAN DE PAGOS</p><h3>Actos procesales</h3></div></div>{doc.paymentPlan.map((stage) => { const paid = stagePaid(stage); const stageStatus = paid >= stage.amount ? "Cubierto" : paid > 0 ? "Abonado" : stage.scheduledDate && stage.scheduledDate < todayInput() ? "Atrasado" : "Pendiente"; return <div className="stage-row" key={stage.id}><span><strong>{stage.description}</strong><small>{money.format(paid)} de {money.format(stage.amount)}{stage.scheduledDate && ` · Previsto: ${formatDate(`${stage.scheduledDate}T12:00:00.000Z`)}`}</small></span><span className={`stage-status ${stageStatus.toLowerCase()}`}>{stageStatus}</span></div>; })}</section>}<section className="payment-breakdown"><div className="payment-heading"><div><p className="eyebrow">PAGOS RECIBIDOS</p><h3>Abonos y recibos</h3></div>{doc.balance > 0 && <button className="secondary compact" onClick={onPayment}><Plus /> Registrar abono</button>}</div>{payments.map((payment) => { const stage = doc.paymentPlan.find((item) => item.id === payment.paymentStageId); return <div className="payment-row" key={payment.id}><span><strong>{money.format(payment.amount)}</strong><small>{formatDate(payment.occurredAt)} · {stage?.description ?? "Pago general"}{payment.note && ` · ${payment.note}`}</small></span><div className="payment-row-actions"><button className="icon-button" aria-label="Descargar recibo" onClick={() => onPaymentPdf(payment)}><Download /></button><button className="icon-button" aria-label="Compartir recibo" onClick={() => onPaymentShare(payment)}><Send /></button><button className="icon-button danger-icon" aria-label="Enviar pago a papelera" onClick={() => onDeletePayment(payment)}><Trash2 /></button></div></div>; })}{payments.length === 0 && <p className="payment-empty">Aún no se han registrado pagos recibidos.</p>}</section><div className="detail-actions"><button className="secondary" onClick={onPdf}><Download /> Presupuesto PDF</button><button className="secondary" onClick={onShare}><Send /> Compartir</button>{doc.balance > 0 && doc.paymentPlan.length === 0 && <button className="primary" onClick={onPaid}><Check /> Liquidar saldo</button>}</div></section></div>;
}

function ClientEditor({ client, saving, onClose, onSave }: { client: Client; saving: boolean; onClose: () => void; onSave: (client: Client) => void }) {
  const [name, setName] = useState(client.name); const [email, setEmail] = useState(client.email); const [phone, setPhone] = useState(client.phone); const [nationalityOption, setNationalityOption] = useState(isPresetNationality(client.nationality) ? client.nationality : client.nationality ? "Otra" : ""); const [customNationality, setCustomNationality] = useState(isPresetNationality(client.nationality) ? "" : client.nationality); const [stage, setStage] = useState<ClientStage>(client.stage); const [practiceArea, setPracticeArea] = useState<PracticeArea | null>(client.practiceArea); const [internalKey, setInternalKey] = useState(client.internalKey); const [companions, setCompanions] = useState<Companion[]>(client.companions);
  const nationality = nationalityOption === "Otra" ? customNationality.trim() : nationalityOption;
  const validNationality = nationalityOption !== "Otra" || Boolean(customNationality.trim());
  const validCompanions = companions.every((companion) => companion.name.trim() && companion.relationship.trim());
  return <div className="overlay"><form className="sheet compact-sheet" onSubmit={(event) => { event.preventDefault(); if (name.trim() && validNationality && validCompanions) onSave({ ...client, name: name.trim(), email: email.trim(), phone: phone.trim(), nationality, stage, practiceArea, internalKey: internalKey.trim(), companions: companions.map((companion) => ({ name: companion.name.trim(), relationship: companion.relationship.trim() })) }); }}><div className="sheet-head"><div><p className="eyebrow">EDITAR CLIENTE</p><h2>{client.name}</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><label>Nombre o razón social<input value={name} onChange={(event) => setName(event.target.value)} autoFocus /></label><label>Clave interna<input value={internalKey} onChange={(event) => setInternalKey(event.target.value)} placeholder="Dato interno opcional" /><small className="field-help">Solo se muestra en la ficha del cliente.</small></label><label>Clasificación<select value={stage} onChange={(event) => setStage(event.target.value as ClientStage)}><option>Aceptado</option><option>Pendiente</option><option>Rechazado</option></select></label><PracticeAreaField value={practiceArea} onChange={setPracticeArea} /><NationalityField option={nationalityOption} custom={customNationality} onOptionChange={setNationalityOption} onCustomChange={setCustomNationality} /><label>Correo electrónico<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Teléfono<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label><CompanionFields value={companions} onChange={setCompanions} />{!validNationality && <div className="auth-error">Escribe la nacionalidad del cliente.</div>}{!validCompanions && <div className="auth-error">Completa el nombre y parentesco de cada acompañante.</div>}<div className="sheet-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving || !name.trim() || !validNationality || !validCompanions}><Check /> {saving ? "Guardando…" : "Guardar cambios"}</button></div></form></div>;
}

function DocumentEditor({ document, clients, saving, onClose, onSave }: { document: Document; clients: Client[]; saving: boolean; onClose: () => void; onSave: (document: Document) => void }) {
  const [clientId, setClientId] = useState(document.clientId); const [concept, setConcept] = useState(document.concept); const [amount, setAmount] = useState(String(document.amount)); const [status, setStatus] = useState(document.status); const [notes, setNotes] = useState(document.notes); const [planEnabled, setPlanEnabled] = useState(document.paymentPlan.length > 0); const [paymentPlan, setPaymentPlan] = useState<PaymentStage[]>(document.paymentPlan); const selected = clients.find((client) => client.id === clientId);
  const validPlan = !planEnabled || (paymentPlan.length > 0 && paymentPlan.every((stage) => stage.description.trim() && stage.amount > 0));
  return <div className="overlay"><form className="sheet" onSubmit={(event) => { event.preventDefault(); if (selected && concept.trim() && Number(amount) > 0 && validPlan) onSave({ ...document, clientId, client: selected.name, concept: concept.trim(), amount: Number(amount), paymentPlan: planEnabled ? paymentPlan : [], status, notes }); }}><div className="sheet-head"><div><p className="eyebrow">EDITAR {document.kind.toUpperCase()}</p><h2>{document.folio}</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><label>Cliente<select value={clientId} onChange={(event) => setClientId(Number(event.target.value))}>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label><label>Concepto<ServiceConceptField value={concept} onChange={setConcept} /></label><label>Importe (MXN)<div className="money-input"><span>$</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></div></label><label>Estado<select value={status} onChange={(event) => setStatus(event.target.value as Status)}><option>Pendiente</option><option>Aceptado</option><option>Rechazado</option><option>Vencido</option><option>Pagado</option></select><small className="field-help">El estado Pagado también se actualiza automáticamente conforme a los abonos.</small></label><label className="toggle-field"><input type="checkbox" checked={planEnabled} onChange={(event) => { const enabled = event.target.checked; setPlanEnabled(enabled); if (enabled && paymentPlan.length === 0) setPaymentPlan([{ id: crypto.randomUUID(), description: "Anticipo", amount: Number(amount) || 0, scheduledDate: "" }]); }} /><span><strong>Plan de pagos por actos procesales</strong><small>La fecha prevista es opcional y no representa un ingreso cobrado.</small></span></label>{planEnabled && <PaymentPlanFields value={paymentPlan} onChange={setPaymentPlan} documentAmount={Number(amount) || 0} />}<label>Notas<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label><div className="sheet-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving || !selected || !concept.trim() || Number(amount) <= 0 || !validPlan}><Check /> {saving ? "Guardando…" : "Guardar cambios"}</button></div></form></div>;
}

function ExpenseEditor({ movement, documents, saving, onClose, onSave }: { movement: Movement; documents: Document[]; saving: boolean; onClose: () => void; onSave: (movement: Movement) => void }) {
  const [description, setDescription] = useState(movement.description); const [category, setCategory] = useState(expenseCategories.includes(movement.category) ? movement.category : "Otros"); const [amount, setAmount] = useState(String(movement.amount)); const [spentBy, setSpentBy] = useState(expenseSpenders.includes(movement.spentBy) ? movement.spentBy : expenseSpenders[0]); const [date, setDate] = useState(toInputDate(movement.occurredAt)); const [documentId, setDocumentId] = useState(movement.documentId ? String(movement.documentId) : "");
  return <div className="overlay"><form className="sheet compact-sheet" onSubmit={(event) => { event.preventDefault(); if (description && spentBy && Number(amount) > 0) onSave({ ...movement, description, category, amount: Number(amount), spentBy, occurredAt: toDatabaseDate(date), documentId: documentId ? Number(documentId) : null }); }}><div className="sheet-head"><div><p className="eyebrow">EDITAR GASTO</p><h2>{movement.description}</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><label>Descripción<input value={description} onChange={(event) => setDescription(event.target.value)} autoFocus /></label><label>Categoría<select value={category} onChange={(event) => setCategory(event.target.value)}>{expenseCategories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Expediente o presupuesto (opcional)<select value={documentId} onChange={(event) => setDocumentId(event.target.value)}><option value="">Gasto general de la firma</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.folio} · {document.client}</option>)}</select></label><label>¿Quién cubrió el gasto?<select value={spentBy} onChange={(event) => setSpentBy(event.target.value)}>{expenseSpenders.map((name) => <option key={name}>{name}</option>)}</select><small className="field-help">Si eliges Fondo, el importe se descontará automáticamente de su saldo.</small></label><label>Fecha del gasto<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Importe (MXN)<div className="money-input"><span>$</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></div></label><div className="sheet-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving || !description || !spentBy || Number(amount) <= 0}><Check /> {saving ? "Guardando…" : "Guardar cambios"}</button></div></form></div>;
}

function QuickCreateMenu({ onClose, onSelect }: { onClose: () => void; onSelect: (action: QuickAction) => void }) {
  const actions: Array<{ id: QuickAction; title: string; detail: string; icon: React.ReactNode; tone: string }> = [
    { id: "presupuesto", title: "Presupuesto", detail: "Crear una nueva propuesta", icon: <FilePlus2 />, tone: "blue" },
    { id: "gasto", title: "Gasto", detail: "Registrar un egreso", icon: <WalletCards />, tone: "gold" },
    { id: "cliente", title: "Cliente", detail: "Añadir al directorio", icon: <UserRound />, tone: "green" },
    { id: "abono", title: "Abono", detail: "Aplicar a un saldo pendiente", icon: <CircleDollarSign />, tone: "navy" },
  ];
  return <div className="overlay quick-create-overlay" role="dialog" aria-modal="true" aria-labelledby="quick-create-title"><section className="quick-create-card"><div className="sheet-head"><div><p className="eyebrow">CAPTURA RÁPIDA</p><h2 id="quick-create-title">¿Qué deseas registrar?</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar captura rápida"><X /></button></div><div className="quick-create-grid">{actions.map((action) => <button type="button" className="quick-create-option" key={action.id} onClick={() => onSelect(action.id)}><span className={`quick-icon ${action.tone}`}>{action.icon}</span><span><strong>{action.title}</strong><small>{action.detail}</small></span><ChevronRight /></button>)}</div></section></div>;
}

function PendingPaymentPicker({ documents, onClose, onSelect }: { documents: Document[]; onClose: () => void; onSelect: (document: Document) => void }) {
  const [search, setSearch] = useState("");
  const normalized = search.trim().toLowerCase();
  const pending = documents
    .filter((document) => document.balance > 0 && document.status !== "Rechazado")
    .filter((document) => `${document.client} ${document.folio} ${document.concept}`.toLowerCase().includes(normalized))
    .sort((a, b) => new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime());
  return <div className="overlay quick-picker-overlay" role="dialog" aria-modal="true" aria-labelledby="payment-picker-title"><section className="sheet compact-sheet payment-picker-sheet"><div className="sheet-head"><div><p className="eyebrow">CAPTURA RÁPIDA</p><h2 id="payment-picker-title">Selecciona el presupuesto</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar selector de abonos"><X /></button></div><label className="payment-picker-search">Buscar saldo pendiente<div className="search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente, folio o concepto" autoFocus /></div></label><div className="payment-picker-list">{pending.map((document) => <button type="button" key={document.id} className="payment-picker-row" onClick={() => onSelect(document)}><span className="quick-icon navy"><CircleDollarSign /></span><span><strong>{document.client}</strong><small>{document.folio} · {document.concept}</small></span><span><small>Saldo</small><strong>{money.format(document.balance)}</strong></span><ChevronRight /></button>)}{pending.length === 0 && <EmptyState title={normalized ? "No encontramos presupuestos" : "Sin saldos pendientes"} text={normalized ? "Prueba con otro cliente, folio o concepto." : "No hay presupuestos activos con saldo por cobrar."} />}</div></section></div>;
}

function ConfirmDialog({ eyebrow, title, message, confirmLabel, savingLabel, saving, onClose, onConfirm }: { eyebrow: string; title: string; message: string; confirmLabel: string; savingLabel: string; saving: boolean; onClose: () => void; onConfirm: () => void }) {
  return <div className="overlay centered confirmation-overlay" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-message"><section className="confirm-card"><span className="confirm-icon"><AlertTriangle /></span><p className="eyebrow">{eyebrow}</p><h2 id="confirmation-title">{title}</h2><p id="confirmation-message">{message}</p><div className="confirm-actions"><button className="secondary" disabled={saving} onClick={onClose}>Cancelar</button><button className="danger-button" disabled={saving} onClick={onConfirm}><Trash2 /> {saving ? savingLabel : confirmLabel}</button></div></section></div>;
}

function DeleteConfirm({ target, saving, onClose, onConfirm }: { target: DeleteTarget; saving: boolean; onClose: () => void; onConfirm: () => void }) {
  return <ConfirmDialog eyebrow="ENVIAR A PAPELERA" title={`¿Retirar ${target.label}?`} message="El registro dejará de aparecer en los informes, pero podrás restaurarlo desde la papelera. Los clientes con documentos activos deben conservarse." confirmLabel="Enviar a papelera" savingLabel="Moviendo…" saving={saving} onClose={onClose} onConfirm={onConfirm} />;
}
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="empty"><FileText /><h3>{title}</h3><p>{text}</p></div>; }
