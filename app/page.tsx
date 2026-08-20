"use client";

import {
  ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays, Check, ChevronRight,
  CircleDollarSign, Clock3, Download, FileCheck2, FilePlus2, FileText, Home,
  AlertTriangle, LogOut, Mail, Menu, MoreHorizontal, Pencil, Phone, Plus, ReceiptText,
  Search, Send, Trash2, TrendingUp, UserRound, Users, WalletCards, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import {
  createClient, createDocument, createExpense, deleteClient, deleteDocument, deleteMovement,
  loadFinanceData, markDocumentPaid, updateClient, updateDocument, updateExpense,
  type Client, type DocumentKind, type FinanceDocument as Document, type Movement, type Status,
} from "../lib/finance";
import { getSession, isSupabaseConfigured, signIn, signOut, type Session } from "../lib/supabase";

type Tab = "inicio" | "documentos" | "clientes" | "movimientos" | "informes";
type DeleteTarget = { type: "client" | "document" | "movement"; id: number; label: string };

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
const servicePresets = ["Consulta y estrategia jurídica", "Juicio de amparo migratorio", "Regularización migratoria", "Asesoría corporativa mensual", "Elaboración y revisión de contrato"];

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [tab, setTab] = useState<Tab>("inicio");
  const [clients, setClients] = useState<Client[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [query, setQuery] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [detail, setDetail] = useState<Document | null>(null);
  const [toast, setToast] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const refreshData = useCallback(async () => {
    const data = await loadFinanceData();
    setClients(data.clients); setDocuments(data.documents); setMovements(data.movements);
  }, []);
  useEffect(() => {
    getSession().then((current) => { setSession(current); setAuthReady(true) });
    if ("serviceWorker" in navigator) {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      navigator.serviceWorker.register(`${basePath}/sw.js`).catch(() => undefined);
    }
  }, []);
  useEffect(() => {
    if (!session) return;
    refreshData().catch((error) => setToast(error instanceof Error ? error.message : "No fue posible cargar los datos"));
    const interval = window.setInterval(() => refreshData().catch(() => undefined), 30000);
    const onFocus = () => refreshData().catch(() => undefined);
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", onFocus) };
  }, [session, refreshData]);
  const totals = useMemo(() => ({
    income: documents.filter((d) => d.status === "Pagado").reduce((sum, d) => sum + d.amount, 0),
    pending: documents.filter((d) => d.status === "Pendiente" || d.status === "Vencido").reduce((sum, d) => sum + d.amount, 0),
    quoted: documents.filter((d) => d.kind === "Presupuesto").reduce((sum, d) => sum + d.amount, 0),
    expenses: movements.filter((m) => m.type === "Gasto").reduce((sum, m) => sum + m.amount, 0),
  }), [documents, movements]);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600) };
  const addClient = async (client: Omit<Client, "id" | "total">) => {
    setIsSaving(true);
    try {
      const saved = await createClient(client); setClients((current) => [saved, ...current]);
      setClientOpen(false); notify("Cliente guardado correctamente");
    } catch (error) { notify(error instanceof Error ? error.message : "No fue posible guardar el cliente") }
    finally { setIsSaving(false) }
  };
  const addDocument = async (draft: Omit<Document, "id" | "folio" | "date">) => {
    setIsSaving(true);
    try {
      const next = await createDocument(draft); await refreshData(); setComposerOpen(false); setDetail(next); notify(`${draft.kind} creado correctamente`);
    } catch (error) { notify(error instanceof Error ? error.message : "No fue posible crear el documento") }
    finally { setIsSaving(false) }
  };
  const addExpense = async (draft: Omit<Movement, "id" | "type" | "occurredAt">) => {
    setIsSaving(true);
    try {
      const next = await createExpense(draft); setMovements((current) => [next, ...current]); setExpenseOpen(false); notify("Gasto registrado correctamente");
    } catch (error) { notify(error instanceof Error ? error.message : "No fue posible guardar el gasto") }
    finally { setIsSaving(false) }
  };
  const saveClientEdit = async (updated: Client) => {
    setIsSaving(true);
    try { await updateClient(updated); setClients((current) => current.map((item) => item.id === updated.id ? updated : item)); setEditingClient(null); notify("Cliente actualizado") }
    catch (error) { notify(error instanceof Error ? error.message : "No fue posible editar el cliente") }
    finally { setIsSaving(false) }
  };
  const saveDocumentEdit = async (updated: Document) => {
    setIsSaving(true);
    try {
      const previous = documents.find((item) => item.id === updated.id);
      await updateDocument(updated, previous?.status ?? updated.status);
      await refreshData(); setEditingDocument(null); setDetail(updated); notify("Documento actualizado");
    } catch (error) { notify(error instanceof Error ? error.message : "No fue posible editar el documento") }
    finally { setIsSaving(false) }
  };
  const saveMovementEdit = async (updated: Movement) => {
    setIsSaving(true);
    try { await updateExpense(updated); setMovements((current) => current.map((item) => item.id === updated.id ? updated : item)); setEditingMovement(null); notify("Gasto actualizado") }
    catch (error) { notify(error instanceof Error ? error.message : "No fue posible editar el movimiento") }
    finally { setIsSaving(false) }
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsSaving(true);
    try {
      if (deleteTarget.type === "client") await deleteClient(deleteTarget.id);
      if (deleteTarget.type === "document") await deleteDocument(deleteTarget.id);
      if (deleteTarget.type === "movement") await deleteMovement(deleteTarget.id);
      if (deleteTarget.type === "client") setClients((current) => current.filter((item) => item.id !== deleteTarget.id));
      if (deleteTarget.type === "document") { setDocuments((current) => current.filter((item) => item.id !== deleteTarget.id)); setMovements((current) => current.filter((item) => item.documentId !== deleteTarget.id)); setDetail(null) }
      if (deleteTarget.type === "movement") setMovements((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null); notify("Registro eliminado");
    } catch (error) { setDeleteTarget(null); notify(error instanceof Error ? error.message : "No fue posible eliminar") }
    finally { setIsSaving(false) }
  };
  const handlePaid = async () => {
    if (!detail) return;
    setIsSaving(true);
    try { await markDocumentPaid(detail); await refreshData(); setDetail({ ...detail, status: "Pagado" }); notify("Pago registrado") }
    catch (error) { notify(error instanceof Error ? error.message : "No fue posible registrar el pago") }
    finally { setIsSaving(false) }
  };
  const generatePdf = async (doc: Document, share = false) => {
    const pdf = new jsPDF({ unit: "mm", format: "letter" }); const blue: [number, number, number] = [15, 48, 87]; const gold: [number, number, number] = [184, 139, 55];
    pdf.setFillColor(...blue); pdf.rect(0, 0, 216, 38, "F"); pdf.setTextColor(255,255,255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(19); pdf.text("FERNÁNDEZ CONDE", 18, 18); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.text("SOCIEDAD CIVIL · SOLUCIONES JURÍDICAS", 18, 26); pdf.setTextColor(...gold); pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.text(doc.kind.toUpperCase(), 198, 18, { align: "right" }); pdf.setTextColor(60,70,82); pdf.setFontSize(9); pdf.text(doc.folio, 198, 26, { align: "right" });
    pdf.setTextColor(40,47,55); pdf.setFont("helvetica", "normal"); pdf.text("EMITIDO PARA", 18, 56); pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.text(doc.client, 18, 65); pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.text(`Fecha: ${doc.date}`, 198, 56, { align: "right" }); pdf.text("Moneda: MXN", 198, 63, { align: "right" });
    pdf.setDrawColor(220,224,229); pdf.line(18,78,198,78); pdf.setFont("helvetica", "bold"); pdf.setFillColor(245,247,250); pdf.rect(18,82,180,12,"F"); pdf.text("CONCEPTO",23,90); pdf.text("IMPORTE",191,90,{align:"right"}); pdf.setFont("helvetica","normal"); pdf.text(doc.concept,23,106); pdf.text(money.format(doc.amount),191,106,{align:"right"}); pdf.line(18,116,198,116); pdf.setFont("helvetica","bold"); pdf.setFontSize(12); pdf.text("TOTAL",145,130); pdf.setTextColor(...blue); pdf.setFontSize(16); pdf.text(money.format(doc.amount),198,130,{align:"right"});
    pdf.setTextColor(75,82,90); pdf.setFont("helvetica","normal"); pdf.setFontSize(8.5); pdf.text("El presente documento no constituye un CFDI.",18,154); pdf.text("Gracias por confiar en Fernández Conde, S.C.",18,161); pdf.setDrawColor(...gold); pdf.setLineWidth(1); pdf.line(18,244,198,244); pdf.setTextColor(95,102,110); pdf.text("contacto@fernandezconde.mx  ·  Ciudad de México",108,253,{align:"center"});
    const filename = `${doc.folio}-${doc.client.replace(/\s+/g,"-")}.pdf`;
    if (share && navigator.share) {
      const file = new File([pdf.output("blob")], filename, { type: "application/pdf" });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({ title: `${doc.kind} ${doc.folio}`, text: `Documento de Fernández Conde, S.C. por ${money.format(doc.amount)}`, files: [file] });
        notify("Documento compartido");
        return;
      }
    }
    pdf.save(filename); notify(share ? "PDF descargado para compartir" : "PDF descargado");
  };
  if (!authReady) return <LoadingScreen />;
  if (!isSupabaseConfigured) return <SetupScreen />;
  if (!session) return <LoginScreen onSignedIn={setSession} />;
  return <main className="app-shell">
    <aside className="sidebar"><div className="brand-mark"><span>FC</span></div><div className="brand-copy"><strong>Fernández Conde</strong><small>Control financiero</small></div><nav><NavItem active={tab === "inicio"} icon={<Home />} label="Inicio" onClick={() => setTab("inicio")} /><NavItem active={tab === "documentos"} icon={<FileText />} label="Documentos" onClick={() => setTab("documentos")} /><NavItem active={tab === "clientes"} icon={<Users />} label="Clientes" onClick={() => setTab("clientes")} /><NavItem active={tab === "movimientos"} icon={<WalletCards />} label="Movimientos" onClick={() => setTab("movimientos")} /><NavItem active={tab === "informes"} icon={<BarChart3 />} label="Informes" onClick={() => setTab("informes")} /></nav><div className="firm-pill"><span className="avatar">FC</span><div><strong>Socio conectado</strong><small>{session.user.email}</small></div><button className="session-exit" aria-label="Cerrar sesión" onClick={() => { signOut(); setSession(null) }}><LogOut /></button></div></aside>
    <section className="workspace"><header className="topbar"><button className="mobile-menu" aria-label="Menú"><Menu /></button><div><p className="eyebrow">FERNÁNDEZ CONDE, S.C.</p><h1>{titleFor(tab)}</h1></div><button className="primary compact" onClick={() => setComposerOpen(true)}><Plus /> Nuevo documento</button></header>
      {tab === "inicio" && <Dashboard totals={totals} documents={documents} setTab={setTab} openDocument={setDetail} openComposer={() => setComposerOpen(true)} />}
      {tab === "documentos" && <DocumentsView documents={documents} query={query} setQuery={setQuery} openDocument={setDetail} openComposer={() => setComposerOpen(true)} />}
      {tab === "clientes" && <ClientsView clients={clients} query={query} setQuery={setQuery} openClient={() => setClientOpen(true)} onEdit={setEditingClient} onDelete={(client) => setDeleteTarget({ type: "client", id: client.id, label: client.name })} />}
      {tab === "movimientos" && <MovementsView movements={movements} openExpense={() => setExpenseOpen(true)} onEdit={setEditingMovement} onDelete={(movement) => setDeleteTarget({ type: "movement", id: movement.id, label: movement.description })} />}
      {tab === "informes" && <ReportsView documents={documents} totals={totals} />}
    </section>
    <nav className="bottom-nav"><NavItem active={tab === "inicio"} icon={<Home />} label="Inicio" onClick={() => setTab("inicio")} /><NavItem active={tab === "documentos"} icon={<FileText />} label="Docs" onClick={() => setTab("documentos")} /><button className="mobile-create" onClick={() => setComposerOpen(true)} aria-label="Nuevo documento"><Plus /></button><NavItem active={tab === "clientes"} icon={<Users />} label="Clientes" onClick={() => setTab("clientes")} /><NavItem active={tab === "movimientos"} icon={<WalletCards />} label="Gastos" onClick={() => setTab("movimientos")} /><NavItem active={tab === "informes"} icon={<BarChart3 />} label="Informes" onClick={() => setTab("informes")} /></nav>
    {composerOpen && <DocumentComposer clients={clients} saving={isSaving} onClose={() => setComposerOpen(false)} onSave={addDocument} />}
    {clientOpen && <ClientComposer saving={isSaving} onClose={() => setClientOpen(false)} onSave={addClient} />}
    {expenseOpen && <ExpenseComposer saving={isSaving} onClose={() => setExpenseOpen(false)} onSave={addExpense} />}
    {editingClient && <ClientEditor client={editingClient} saving={isSaving} onClose={() => setEditingClient(null)} onSave={saveClientEdit} />}
    {editingDocument && <DocumentEditor document={editingDocument} clients={clients} saving={isSaving} onClose={() => setEditingDocument(null)} onSave={saveDocumentEdit} />}
    {editingMovement && <ExpenseEditor movement={editingMovement} saving={isSaving} onClose={() => setEditingMovement(null)} onSave={saveMovementEdit} />}
    {deleteTarget && <DeleteConfirm target={deleteTarget} saving={isSaving} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} />}
    {detail && <DocumentDetail doc={detail} onClose={() => setDetail(null)} onPdf={() => generatePdf(detail)} onShare={() => generatePdf(detail, true)} onEdit={() => { setEditingDocument(detail); setDetail(null) }} onDelete={() => setDeleteTarget({ type: "document", id: detail.id, label: detail.folio })} onPaid={handlePaid} />}
    {toast && <div className="toast"><Check /> {toast}</div>}
  </main>;
}

function LoadingScreen() { return <main className="auth-screen"><div className="auth-card"><div className="brand-mark auth-logo"><span>FC</span></div><p>Abriendo control financiero…</p></div></main> }
function SetupScreen() { return <main className="auth-screen"><div className="auth-card"><div className="brand-mark auth-logo"><span>FC</span></div><p className="eyebrow">CONFIGURACIÓN PENDIENTE</p><h1>Falta conectar la base compartida</h1><p>Agrega las variables de Supabase al repositorio para habilitar el acceso de los dos socios.</p></div></main> }
function LoginScreen({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
  return <main className="auth-screen"><form className="auth-card" onSubmit={async(e)=>{e.preventDefault();setLoading(true);setError("");try{onSignedIn(await signIn(email,password))}catch(err){setError(err instanceof Error?err.message:"No fue posible iniciar sesión")}finally{setLoading(false)}}}><div className="brand-mark auth-logo"><span>FC</span></div><p className="eyebrow">FERNÁNDEZ CONDE, S.C.</p><h1>Control financiero</h1><p>Acceso exclusivo para socios autorizados.</p><label>Correo electrónico<input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} autoComplete="email" required /></label><label>Contraseña<input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} autoComplete="current-password" required /></label>{error&&<div className="auth-error">{error}</div>}<button className="primary" disabled={loading}>{loading?"Ingresando…":"Iniciar sesión"}</button></form></main>
}

function titleFor(tab: Tab) { return { inicio: "Resumen", documentos: "Documentos", clientes: "Clientes", movimientos: "Movimientos", informes: "Informes" }[tab] }
function NavItem({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) { return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>{icon}<span>{label}</span></button> }
function Dashboard({ totals, documents, setTab, openDocument, openComposer }: { totals: { income: number; pending: number; quoted: number; expenses: number }; documents: Document[]; setTab: (tab: Tab) => void; openDocument: (doc: Document) => void; openComposer: () => void }) { return <div className="page-content"><section className="welcome-row"><div><h2>Buenas noches, Óscar.</h2><p>Éste es el estado de la firma durante agosto.</p></div><button className="text-button"><CalendarDays /> Agosto 2026</button></section><section className="stats-grid"><StatCard label="Ingresos cobrados" value={totals.income} icon={<ArrowUpRight />} trend="Cobros registrados" tone="green" /><StatCard label="Por cobrar" value={totals.pending} icon={<Clock3 />} trend="Documentos pendientes" tone="amber" /><StatCard label="Presupuestado" value={totals.quoted} icon={<FileCheck2 />} trend="Propuestas emitidas" tone="blue" /><StatCard label="Balance del mes" value={totals.income - totals.expenses} icon={<TrendingUp />} trend="Después de gastos" tone="navy" /></section><section className="main-grid"><article className="panel activity-panel"><div className="panel-heading"><div><p className="eyebrow">ACTIVIDAD</p><h3>Documentos recientes</h3></div><button className="text-link" onClick={() => setTab("documentos")}>Ver todos <ChevronRight /></button></div><div className="document-list">{documents.slice(0,4).map((doc) => <DocumentRow key={doc.id} doc={doc} onClick={() => openDocument(doc)} />)}{documents.length === 0 && <EmptyState title="Aún no hay documentos" text="Crea tu primer presupuesto o recibo." />}</div></article><article className="panel quick-panel"><p className="eyebrow">ACCESOS RÁPIDOS</p><h3>¿Qué necesitas crear?</h3><button className="quick-action" onClick={openComposer}><span className="quick-icon blue"><FilePlus2 /></span><span><strong>Presupuesto</strong><small>Envía una propuesta formal</small></span><ChevronRight /></button><button className="quick-action" onClick={openComposer}><span className="quick-icon gold"><ReceiptText /></span><span><strong>Recibo</strong><small>Confirma un pago recibido</small></span><ChevronRight /></button><button className="quick-action" onClick={openComposer}><span className="quick-icon green"><CircleDollarSign /></span><span><strong>Cuenta de cobro</strong><small>Registra un saldo pendiente</small></span><ChevronRight /></button></article></section></div> }
function StatCard({ label, value, icon, trend, tone }: { label: string; value: number; icon: React.ReactNode; trend: string; tone: string }) { return <article className={`stat-card ${tone}`}><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><strong>{money.format(value)}</strong><small>{trend}</small></article> }
function DocumentRow({ doc, onClick }: { doc: Document; onClick: () => void }) { return <button className="document-row" onClick={onClick}><span className="file-icon"><FileText /></span><span className="document-main"><strong>{doc.client}</strong><small>{doc.folio} · {doc.concept}</small></span><span className="document-amount"><strong>{money.format(doc.amount)}</strong><StatusPill status={doc.status} /></span><ChevronRight className="chevron" /></button> }
function StatusPill({ status }: { status: Status }) { return <span className={`status ${status.toLowerCase().replace(" ", "-")}`}>{status}</span> }
function DocumentsView({ documents, query, setQuery, openDocument, openComposer }: { documents: Document[]; query: string; setQuery: (value: string) => void; openDocument: (doc: Document) => void; openComposer: () => void }) { const [filter,setFilter] = useState("Todos"); const visible = documents.filter((doc) => (filter === "Todos" || doc.kind === filter) && `${doc.client} ${doc.folio} ${doc.concept}`.toLowerCase().includes(query.toLowerCase())); return <div className="page-content"><div className="section-tools"><label className="search"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por cliente, folio o concepto" /></label><button className="primary" onClick={openComposer}><Plus /> Crear documento</button></div><div className="filter-row">{["Todos","Presupuesto","Recibo","Cuenta de cobro"].map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><article className="panel"><div className="table-head"><span>Documento</span><span>Cliente y concepto</span><span>Fecha</span><span>Importe</span><span>Estado</span></div>{visible.map((doc) => <DocumentRow key={doc.id} doc={doc} onClick={() => openDocument(doc)} />)}{visible.length === 0 && <EmptyState title="No encontramos documentos" text="Prueba con otra búsqueda o crea uno nuevo." />}</article></div> }
function ClientsView({ clients, query, setQuery, openClient, onEdit, onDelete }: { clients: Client[]; query: string; setQuery: (value: string) => void; openClient: () => void; onEdit: (client: Client) => void; onDelete: (client: Client) => void }) {
  const visible = clients.filter((client) => `${client.name} ${client.email}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="page-content">
    <div className="section-tools"><label className="search"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cliente" /></label><button className="primary" onClick={openClient}><Plus /> Añadir cliente</button></div>
    <section className="client-grid">{visible.map((client) => <article className="client-card" key={client.id}>
      <div className="client-top"><span className="avatar large">{client.name.split(" ").slice(0,2).map((word) => word[0]).join("")}</span><div className="row-actions"><button aria-label={`Editar ${client.name}`} onClick={() => onEdit(client)}><Pencil /></button><button className="danger-icon" aria-label={`Eliminar ${client.name}`} onClick={() => onDelete(client)}><Trash2 /></button></div></div>
      <h3>{client.name}</h3><a href={`mailto:${client.email}`}><Mail /> {client.email || "Sin correo"}</a><a href={`tel:${client.phone}`}><Phone /> {client.phone || "Sin teléfono"}</a><div className="client-total"><span>Total facturado</span><strong>{money.format(client.total)}</strong></div>
    </article>)}</section>
  </div>
}
function MovementsView({ movements, openExpense, onEdit, onDelete }: { movements: Movement[]; openExpense: () => void; onEdit: (movement: Movement) => void; onDelete: (movement: Movement) => void }) {
  const income = movements.filter((m)=>m.type==="Ingreso").reduce((s,m)=>s+m.amount,0); const expenses = movements.filter((m)=>m.type==="Gasto").reduce((s,m)=>s+m.amount,0);
  return <div className="page-content"><div className="expense-banner"><div><span className="movement-icon expense"><ArrowDownRight /></span><div><strong>Registrar un gasto</strong><small>Renta, marketing, transporte, servicios y más.</small></div></div><button className="primary" onClick={openExpense}><Plus /> Agregar gasto</button></div><section className="stats-grid compact-grid"><StatCard label="Entradas del mes" value={income} icon={<ArrowUpRight />} trend="Pagos registrados" tone="green" /><StatCard label="Gastos del mes" value={expenses} icon={<ArrowDownRight />} trend="Egresos registrados" tone="red" /></section><article className="panel"><div className="panel-heading"><div><p className="eyebrow">AGOSTO 2026</p><h3>Movimientos recientes</h3></div><button className="primary subtle" onClick={openExpense}><Plus /> Registrar gasto</button></div>{movements.map((movement) => <div className="movement editable" key={movement.id}><span className={`movement-icon ${movement.type === "Ingreso" ? "income" : "expense"}`}>{movement.type === "Ingreso" ? <ArrowUpRight /> : <ArrowDownRight />}</span><span><strong>{movement.description}</strong><small>{movement.category} · {movement.occurredAt}</small></span><strong className={movement.type === "Ingreso" ? "positive" : "negative"}>{movement.type === "Ingreso" ? "+" : "−"}{money.format(movement.amount)}</strong>{movement.type === "Gasto" ? <div className="row-actions"><button aria-label={`Editar ${movement.description}`} onClick={() => onEdit(movement)}><Pencil /></button><button className="danger-icon" aria-label={`Eliminar ${movement.description}`} onClick={() => onDelete(movement)}><Trash2 /></button></div> : <small className="linked-note">Desde documento</small>}</div>)}{movements.length === 0 && <EmptyState title="Sin movimientos" text="Los cobros y gastos aparecerán aquí." />}</article></div>
}
function ReportsView({ documents, totals }: { documents: Document[]; totals: { income:number; pending:number; quoted:number; expenses:number } }) { const max = Math.max(totals.quoted,totals.income,totals.pending,totals.expenses,1); const average = documents.length ? documents.reduce((s,d) => s+d.amount,0)/documents.length : 0; return <div className="page-content reports"><section className="report-hero"><div><p className="eyebrow">AGOSTO 2026</p><h2>{totals.income - totals.expenses >= 0 ? "La firma mantiene un balance positivo." : "Los gastos superan los cobros del periodo."}</h2><p>Los cobros representan el {Math.round((totals.income/Math.max(totals.income+totals.pending,1))*100)}% del ingreso comprometido.</p></div><div className="balance-orb"><small>Balance</small><strong>{money.format(totals.income-totals.expenses)}</strong><span><TrendingUp /> Actualizado</span></div></section><section className="report-grid"><article className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">FINANZAS</p><h3>Ingresos, pendientes y gastos</h3></div></div><div className="bars"><ReportBar label="Cobrado" value={totals.income} max={max} tone="navy" /><ReportBar label="Pendiente" value={totals.pending} max={max} tone="gold" /><ReportBar label="Gastos" value={totals.expenses} max={max} tone="red" /><ReportBar label="Presupuestado" value={totals.quoted} max={max} tone="blue" /></div></article><article className="panel"><p className="eyebrow">INDICADORES</p><h3>Rendimiento comercial</h3><div className="kpi"><span>Presupuestos aceptados</span><strong>{documents.filter((d) => d.status === "Aceptado").length}</strong></div><div className="kpi"><span>Documentos emitidos</span><strong>{documents.length}</strong></div><div className="kpi"><span>Ticket promedio</span><strong>{money.format(average)}</strong></div></article></section></div> }
function ReportBar({ label, value, max, tone }: { label:string; value:number; max:number; tone:string }) { return <div className="bar-row"><div><span>{label}</span><strong>{money.format(value)}</strong></div><div className="bar-track"><span className={tone} style={{width:`${Math.max((value/max)*100,4)}%`}} /></div></div> }
function DocumentComposer({ clients, saving, onClose, onSave }: { clients:Client[]; saving:boolean; onClose:()=>void; onSave:(doc:Omit<Document,"id"|"folio"|"date">)=>void }) { const [kind,setKind]=useState<DocumentKind>("Presupuesto"); const [clientId,setClientId]=useState(clients[0]?.id??0); const [concept,setConcept]=useState(servicePresets[0]); const [amount,setAmount]=useState("8000"); const selected=clients.find((client)=>client.id===clientId); const submit=(e:React.FormEvent)=>{e.preventDefault(); if(!selected||!concept||Number(amount)<=0)return; onSave({kind,clientId,client:selected.name,concept,amount:Number(amount),status:kind==="Recibo"?"Pagado":"Pendiente"})}; return <div className="overlay"><form className="sheet" onSubmit={submit}><div className="sheet-head"><div><p className="eyebrow">NUEVO DOCUMENTO</p><h2>Crear y enviar</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div>{clients.length === 0 && <div className="empty-note">Primero añade un cliente desde la sección Clientes.</div>}<label>Tipo de documento<select value={kind} onChange={(e)=>setKind(e.target.value as DocumentKind)}><option>Presupuesto</option><option>Recibo</option><option>Cuenta de cobro</option></select></label><label>Cliente<select value={clientId} onChange={(e)=>setClientId(Number(e.target.value))}>{clients.map((client)=><option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label>Concepto<select value={concept} onChange={(e)=>setConcept(e.target.value)}>{servicePresets.map((service)=><option key={service}>{service}</option>)}</select></label><label>Importe (MXN)<div className="money-input"><span>$</span><input inputMode="decimal" value={amount} onChange={(e)=>setAmount(e.target.value)} /></div></label><div className="total-preview"><span>Total</span><strong>{money.format(Number(amount)||0)}</strong></div><label>Notas<textarea placeholder="Condiciones de pago, alcance o vigencia del presupuesto…" /></label><div className="sheet-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving || !selected}><FileCheck2 /> {saving ? "Guardando…" : "Crear documento"}</button></div></form></div> }
function ClientComposer({ saving, onClose, onSave }: { saving:boolean; onClose:()=>void; onSave:(client:Omit<Client,"id"|"total">)=>void }) { const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [phone,setPhone]=useState(""); return <div className="overlay"><form className="sheet compact-sheet" onSubmit={(e)=>{e.preventDefault(); if(name)onSave({name,email,phone})}}><div className="sheet-head"><div><p className="eyebrow">DIRECTORIO</p><h2>Añadir cliente</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><label>Nombre o razón social<input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Nombre completo" autoFocus /></label><label>Correo electrónico<input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="correo@ejemplo.com" /></label><label>Teléfono<input value={phone} onChange={(e)=>setPhone(e.target.value)} placeholder="55 0000 0000" /></label><div className="sheet-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving || !name}><UserRound /> {saving ? "Guardando…" : "Guardar cliente"}</button></div></form></div> }
function ExpenseComposer({ saving, onClose, onSave }: { saving:boolean; onClose:()=>void; onSave:(movement:Omit<Movement,"id"|"type"|"occurredAt">)=>void }) { const [description,setDescription]=useState(""); const [category,setCategory]=useState("Operación"); const [amount,setAmount]=useState(""); return <div className="overlay"><form className="sheet compact-sheet" onSubmit={(e)=>{e.preventDefault(); if(description&&Number(amount)>0)onSave({description,category,amount:Number(amount)})}}><div className="sheet-head"><div><p className="eyebrow">MOVIMIENTO</p><h2>Registrar gasto</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><label>Descripción<input value={description} onChange={(e)=>setDescription(e.target.value)} placeholder="Ej. Publicidad digital" autoFocus /></label><label>Categoría<select value={category} onChange={(e)=>setCategory(e.target.value)}><option>Operación</option><option>Marketing</option><option>Transporte</option><option>Servicios</option><option>Impuestos</option><option>Otros</option></select></label><label>Importe (MXN)<div className="money-input"><span>$</span><input inputMode="decimal" value={amount} onChange={(e)=>setAmount(e.target.value)} placeholder="0.00" /></div></label><div className="sheet-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving||!description||Number(amount)<=0}><WalletCards /> {saving?"Guardando…":"Registrar gasto"}</button></div></form></div> }
function DocumentDetail({ doc,onClose,onPdf,onShare,onEdit,onDelete,onPaid }: { doc:Document; onClose:()=>void; onPdf:()=>void; onShare:()=>void; onEdit:()=>void; onDelete:()=>void; onPaid:()=>void }) { return <div className="overlay"><section className="sheet detail-sheet"><div className="sheet-head"><div><p className="eyebrow">{doc.kind.toUpperCase()}</p><h2>{doc.folio}</h2></div><div className="sheet-head-actions"><button className="icon-button" aria-label="Editar documento" onClick={onEdit}><Pencil /></button><button className="icon-button danger-icon" aria-label="Eliminar documento" onClick={onDelete}><Trash2 /></button><button className="icon-button" aria-label="Cerrar" onClick={onClose}><X /></button></div></div><div className="detail-status"><StatusPill status={doc.status} /><span>{doc.date}</span></div><div className="preview-card"><div className="preview-brand"><div className="brand-mark small"><span>FC</span></div><div><strong>FERNÁNDEZ CONDE</strong><small>SOCIEDAD CIVIL · SOLUCIONES JURÍDICAS</small></div></div><p>EMITIDO PARA</p><h3>{doc.client}</h3><div className="preview-line"><span>{doc.concept}</span><strong>{money.format(doc.amount)}</strong></div><div className="preview-total"><span>Total</span><strong>{money.format(doc.amount)}</strong></div></div><div className="detail-actions"><button className="secondary" onClick={onPdf}><Download /> Descargar PDF</button><button className="secondary" onClick={onShare}><Send /> Compartir PDF</button>{doc.status!=="Pagado"&&<button className="primary" onClick={onPaid}><Check /> Marcar pagado</button>}</div></section></div> }
function ClientEditor({ client, saving, onClose, onSave }: { client:Client; saving:boolean; onClose:()=>void; onSave:(client:Client)=>void }) { const [name,setName]=useState(client.name); const [email,setEmail]=useState(client.email); const [phone,setPhone]=useState(client.phone); return <div className="overlay"><form className="sheet compact-sheet" onSubmit={(e)=>{e.preventDefault(); if(name)onSave({...client,name,email,phone})}}><div className="sheet-head"><div><p className="eyebrow">EDITAR CLIENTE</p><h2>{client.name}</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><label>Nombre o razón social<input value={name} onChange={(e)=>setName(e.target.value)} autoFocus /></label><label>Correo electrónico<input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} /></label><label>Teléfono<input value={phone} onChange={(e)=>setPhone(e.target.value)} /></label><div className="sheet-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving||!name}><Check /> {saving?"Guardando…":"Guardar cambios"}</button></div></form></div> }
function DocumentEditor({ document, clients, saving, onClose, onSave }: { document:Document; clients:Client[]; saving:boolean; onClose:()=>void; onSave:(document:Document)=>void }) { const [kind,setKind]=useState(document.kind); const [clientId,setClientId]=useState(document.clientId); const [concept,setConcept]=useState(document.concept); const [amount,setAmount]=useState(String(document.amount)); const [status,setStatus]=useState(document.status); const selected=clients.find((client)=>client.id===clientId); return <div className="overlay"><form className="sheet" onSubmit={(e)=>{e.preventDefault(); if(selected&&concept&&Number(amount)>0)onSave({...document,kind,clientId,client:selected.name,concept,amount:Number(amount),status})}}><div className="sheet-head"><div><p className="eyebrow">EDITAR DOCUMENTO</p><h2>{document.folio}</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><label>Tipo<select value={kind} onChange={(e)=>setKind(e.target.value as DocumentKind)}><option>Presupuesto</option><option>Recibo</option><option>Cuenta de cobro</option></select></label><label>Cliente<select value={clientId} onChange={(e)=>setClientId(Number(e.target.value))}>{clients.map((client)=><option value={client.id} key={client.id}>{client.name}</option>)}</select></label><label>Concepto<input value={concept} onChange={(e)=>setConcept(e.target.value)} /></label><label>Importe (MXN)<div className="money-input"><span>$</span><input inputMode="decimal" value={amount} onChange={(e)=>setAmount(e.target.value)} /></div></label><label>Estado<select value={status} onChange={(e)=>setStatus(e.target.value as Status)}><option>Pendiente</option><option>Aceptado</option><option>Pagado</option><option>Vencido</option></select></label><div className="sheet-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving||!selected||!concept||Number(amount)<=0}><Check /> {saving?"Guardando…":"Guardar cambios"}</button></div></form></div> }
function ExpenseEditor({ movement, saving, onClose, onSave }: { movement:Movement; saving:boolean; onClose:()=>void; onSave:(movement:Movement)=>void }) { const [description,setDescription]=useState(movement.description); const [category,setCategory]=useState(movement.category); const [amount,setAmount]=useState(String(movement.amount)); return <div className="overlay"><form className="sheet compact-sheet" onSubmit={(e)=>{e.preventDefault(); if(description&&Number(amount)>0)onSave({...movement,description,category,amount:Number(amount)})}}><div className="sheet-head"><div><p className="eyebrow">EDITAR GASTO</p><h2>{movement.description}</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><label>Descripción<input value={description} onChange={(e)=>setDescription(e.target.value)} autoFocus /></label><label>Categoría<select value={category} onChange={(e)=>setCategory(e.target.value)}><option>Operación</option><option>Marketing</option><option>Transporte</option><option>Servicios</option><option>Impuestos</option><option>Otros</option></select></label><label>Importe (MXN)<div className="money-input"><span>$</span><input inputMode="decimal" value={amount} onChange={(e)=>setAmount(e.target.value)} /></div></label><div className="sheet-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving||!description||Number(amount)<=0}><Check /> {saving?"Guardando…":"Guardar cambios"}</button></div></form></div> }
function DeleteConfirm({ target, saving, onClose, onConfirm }: { target:DeleteTarget; saving:boolean; onClose:()=>void; onConfirm:()=>void }) { return <div className="overlay centered"><section className="confirm-card"><span className="confirm-icon"><AlertTriangle /></span><p className="eyebrow">CONFIRMAR ELIMINACIÓN</p><h2>¿Eliminar {target.label}?</h2><p>Esta acción no se puede deshacer. Los clientes con documentos asociados deberán conservarse hasta eliminar o reasignar sus documentos.</p><div className="confirm-actions"><button className="secondary" onClick={onClose}>Cancelar</button><button className="danger-button" disabled={saving} onClick={onConfirm}><Trash2 /> {saving?"Eliminando…":"Sí, eliminar"}</button></div></section></div> }
function EmptyState({ title,text }: { title:string; text:string }) { return <div className="empty"><FileText /><h3>{title}</h3><p>{text}</p></div> }
