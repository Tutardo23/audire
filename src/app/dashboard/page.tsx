"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Trash,
  X,
  Folder,
  ArrowRight,
  DotsThreeCircle,
  ArrowsLeftRight,
  PencilSimple,
  Check,
} from "phosphor-react";
import { SignOutButton, useUser } from "@clerk/nextjs";
import {
  schoolBrand,
  schoolInitials,
  schoolLogoPath,
} from "../lib/schoolBrand";

import {
  listarProyectosDB,
  crearProyectoDB,
  eliminarProyectoDB,
  renombrarProyectoDB,
  registrarAccessLogDB,
  listarAccessLogsDB,
} from "../actions";

type Project = {
  id: string;
  nombre: string;
  descripcion: string | null;
  creado_at: string;
};

type AccessLogItem = {
  id: string;
  user_id: string | null;
  email: string | null;
  role: string | null;
  project_id: string | null;
  project_name: string | null;
  colegio: string | null;
  vista: string | null;
  action: string;
  metadata: any;
  created_at: string;
};

const formatLogAction = (action: string) => {
  const labels: Record<string, string> = {
    dashboard_open: "Entró al hub",
    project_open: "Entró a proyecto",
    project_create: "Creó proyecto",
    project_rename: "Renombró proyecto",
    project_delete: "Eliminó proyecto",
  };
  return labels[action] || action;
};

const formatLogDate = (value: string) => {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

export default function DashboardHubPage() {
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === "admin";
  const isDirector = user?.publicMetadata?.role === "director";
  const userSchool = String(
    user?.publicMetadata?.colegio ?? user?.publicMetadata?.school ?? "",
  ).trim();
  const theme = schoolBrand(userSchool || "APDES");
  const schoolLogo = userSchool ? schoolLogoPath(userSchool) : "";

  const getProjectYear = (projectName: string) => {
    const match = String(projectName || "").match(/\b(20\d{2})\b/);
    return match ? match[1] : "";
  };

  const getVisibleProjectName = (project: Project) => {
    if (!isDirector || !userSchool) return project.nombre;

    const year = getProjectYear(project.nombre);
    return year ? `${userSchool} ${year}` : userSchool;
  };

  const getVisibleProjectDescription = (project: Project) => {
    if (!isDirector || !userSchool) {
      return project.descripcion || "Espacio de trabajo sin descripción.";
    }

    const year = getProjectYear(project.nombre);
    return year ? `Panel de ${userSchool} ${year}` : `Panel de ${userSchool}`;
  };

  const normalizeProjectName = (value: string) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim();

  const getProjectGroup = (projectName: string) => {
    const name = normalizeProjectName(projectName);

    if (name.includes("varon")) {
      return {
        key: "varones",
        label: "Colegios de varones",
        description: "Proyectos de colegios de varones ordenados por año.",
        badgeClass: "bg-blue-50 text-blue-700 border-blue-100",
        headerClass: "from-blue-50 to-white border-blue-100",
        order: 1,
      };
    }

    if (name.includes("mujer")) {
      return {
        key: "mujeres",
        label: "Colegios de mujeres",
        description: "Proyectos de colegios de mujeres ordenados por año.",
        badgeClass: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100",
        headerClass: "from-fuchsia-50 to-white border-fuchsia-100",
        order: 2,
      };
    }

    if (name.includes("jardin")) {
      return {
        key: "jardines",
        label: "Jardines",
        description: "Proyectos de jardines ordenados por año.",
        badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-100",
        headerClass: "from-emerald-50 to-white border-emerald-100",
        order: 3,
      };
    }

    return {
      key: "otros",
      label: "Otros proyectos",
      description: "Otros espacios de trabajo.",
      badgeClass: "bg-slate-50 text-slate-600 border-slate-100",
      headerClass: "from-slate-50 to-white border-slate-100",
      order: 4,
    };
  };

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [openCreate, setOpenCreate] = useState(false);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");

  // ── Edición inline de nombre ──────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLogs, setActivityLogs] = useState<AccessLogItem[]>([]);
  const [activityFilter, setActivityFilter] = useState("Todo");

  const loadActivityLogs = async () => {
    if (!isAdmin) return;
    setActivityOpen(true);
    setActivityLoading(true);
    try {
      const data = await listarAccessLogsDB({ limit: 80 });
      setActivityLogs(Array.isArray(data) ? data : []);
    } catch {
      setActivityLogs([]);
    } finally {
      setActivityLoading(false);
    }
  };

  const logProjectOpen = (project: Project) => {
    if (typeof window === "undefined") return;
    const key = `apdes:access-log:project-open:${project.id}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");

    registrarAccessLogDB({
      action: "project_open",
      projectId: project.id,
      projectName: project.nombre,
      vista: "hub",
    }).catch(() => undefined);
  };

  const logAdminAction = (input: {
    action: string;
    projectId?: string;
    projectName?: string;
    metadata?: Record<string, any>;
  }) => {
    if (!isAdmin) return;
    registrarAccessLogDB({
      action: input.action,
      projectId: input.projectId,
      projectName: input.projectName,
      vista: "hub-admin",
      metadata: input.metadata || {},
    }).catch(() => undefined);
  };

  const filteredActivityLogs = useMemo(() => {
    if (activityFilter === "Todo") return activityLogs;
    return activityLogs.filter(
      (item) =>
        formatLogAction(item.action) === activityFilter ||
        item.action === activityFilter,
    );
  }, [activityLogs, activityFilter]);

  const activityActions = useMemo(() => {
    const labels = Array.from(
      new Set(
        activityLogs
          .map((item) => formatLogAction(item.action))
          .filter(Boolean),
      ),
    );
    return ["Todo", ...labels];
  }, [activityLogs]);

  const startEdit = (p: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(p.id);
    setEditNombre(p.nombre);
    setEditDesc(p.descripcion || "");
  };

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const saveEdit = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editNombre.trim()) return;
    setSavingId(id);
    try {
      await renombrarProyectoDB(
        id,
        editNombre.trim(),
        editDesc.trim() || undefined,
      );
      logAdminAction({
        action: "project_rename",
        projectId: id,
        projectName: editNombre.trim(),
      });
      setEditingId(null);
      await refresh();
    } catch {
      alert("No se pudo renombrar.");
    } finally {
      setSavingId(null);
    }
  };

  // ── Modo comparar ──────────────────────────────────────────
  const [compareMode, setCompareMode] = useState(false);
  const [selectedToCompare, setSelectedToCompare] = useState<string[]>([]);

  const toggleCompareSelect = (id: string) => {
    setSelectedToCompare((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < 2
          ? [...prev, id]
          : prev,
    );
  };

  const compareUrl =
    selectedToCompare.length === 2
      ? `/dashboard/compare?a=${selectedToCompare[0]}&b=${selectedToCompare[1]}`
      : null;
  // ────────────────────────────────────────────────────────────

  async function refresh() {
    setLoading(true);
    try {
      const data = await listarProyectosDB();
      const lista = Array.isArray(data)
        ? (data as Project[])
        : (data as any).rows || [];
      setProjects(lista);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return;
    const key = `apdes:access-log:dashboard-open:${user.id}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
    registrarAccessLogDB({ action: "dashboard_open", vista: "hub" }).catch(
      () => undefined,
    );
  }, [user?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsProfileOpen(false);
    };
    if (isProfileOpen) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isProfileOpen]);

  const sorted = useMemo(() => {
    if (!isAdmin) return projects;

    return [...projects].sort((a, b) => {
      const groupA = getProjectGroup(a.nombre);
      const groupB = getProjectGroup(b.nombre);
      if (groupA.order !== groupB.order) return groupA.order - groupB.order;

      const yearA = Number(getProjectYear(a.nombre) || 0);
      const yearB = Number(getProjectYear(b.nombre) || 0);
      if (yearA !== yearB) return yearB - yearA;

      return String(a.nombre || "").localeCompare(String(b.nombre || ""));
    });
  }, [projects, isAdmin]);

  const handleCreate = async () => {
    const n = nombre.trim();
    if (!n) return alert("Por favor, poné un nombre para el proyecto.");
    try {
      const created = await crearProyectoDB(n, descripcion.trim());
      logAdminAction({
        action: "project_create",
        projectId: String((created as any)?.id || ""),
        projectName: n,
      });
      setNombre("");
      setDescripcion("");
      setOpenCreate(false);
      await refresh();
    } catch (e) {
      alert("No se pudo crear el proyecto.");
    }
  };

  const handleDelete = async (id: string, projectName: string) => {
    if (
      !confirm(
        `¿Estás seguro de que querés borrar "${projectName}"? Se eliminarán todas las encuestas asociadas irreversiblemente.`,
      )
    )
      return;
    try {
      await eliminarProyectoDB(id);
      logAdminAction({ action: "project_delete", projectId: id, projectName });
      await refresh();
    } catch {
      alert("Error al intentar borrar el proyecto.");
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F7FB] pb-12 font-sans overflow-x-hidden selection:bg-blue-200 text-slate-900">
      <header
        className={`sticky top-0 z-40 border-b px-6 py-4 backdrop-blur-xl shadow-sm shadow-blue-900/5 ${theme.ring} ${theme.bg}`}
      >
        <div className="mx-auto flex max-w-[1500px] items-center justify-between">
          <div className="flex items-center gap-6 lg:gap-8">
            <div className="flex items-center gap-3">
              <div className="flex h-12 items-center justify-center">
                <img
                  src={schoolLogo || "/escudo-apdes.png"}
                  alt="Escudo colegio"
                  className="h-full w-auto object-contain drop-shadow-sm"
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (img.src.endsWith("/escudo-apdes.png")) return;
                    img.src = "/escudo-apdes.png";
                  }}
                />
              </div>
              <span
                id="fallback-apdes-text"
                className={`hidden font-display text-2xl font-black tracking-tight md:block ${theme.text}`}
              >
                {userSchool || "APDES"}
              </span>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <img
              src="/audire.png"
              alt="Audire"
              className="h-12 w-auto object-contain"
              onError={(e) => {
                const img = e.currentTarget;
                img.style.display = "none";
              }}
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={() => setIsProfileOpen((prev) => !prev)}
                className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-blue-200 bg-white p-1 shadow-sm transition-all hover:scale-[1.02] hover:border-blue-400"
                aria-label="Abrir menú de sesión"
              >
                {schoolLogo ? (
                  <img
                    src={schoolLogo}
                    alt="Escudo colegio"
                    className="h-10 w-10 object-contain"
                    onError={(e) => {
                      const img = e.currentTarget;
                      if (img.src.endsWith("/escudo-apdes.png")) return;
                      img.src = "/escudo-apdes.png";
                    }}
                  />
                ) : (
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-full border bg-white text-xs font-black ${theme.ring} ${theme.text}`}
                  >
                    {schoolInitials(userSchool || "APDES")}
                  </span>
                )}
              </button>
              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-2xl border border-white bg-white/95 p-2 shadow-2xl backdrop-blur-xl">
                  {isAdmin && (
                    <Link
                      href="/dashboard/admin"
                      className="mb-2 flex w-full items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-black text-blue-700 transition-all hover:bg-blue-100"
                    >
                      Administrar perfiles
                    </Link>
                  )}
                  {isAdmin && (
                    <Link
                      href="/dashboard/families"
                      className="mb-2 flex w-full items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-black text-blue-700 transition-all hover:bg-blue-100"
                    >
                      Universo Familia
                    </Link>
                  )}
                  {isAdmin && (
                    <button
                      onClick={loadActivityLogs}
                      className="mb-2 flex w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700"
                    >
                      Actividad
                    </button>
                  )}
                  <SignOutButton>
                    <button className="flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-slate-800">
                      Cerrar sesión
                    </button>
                  </SignOutButton>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-12 w-full max-w-[1500px] px-6">
        <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-4xl font-black tracking-tight text-slate-900">
              Tus Proyectos
            </h1>
            {isDirector ? (
              <p className="text-sm font-medium text-slate-500 max-w-2xl">
                ¡Hola Director/a! Elegí un proyecto para entrar al panel.
                Primero revisá NPS general y participación familiar, después
                abrí la comparación de proyectos del año correspondiente
                (Mujeres/Jardín) para analizar evolución.
              </p>
            ) : (
              <p className="text-sm font-medium text-slate-500 max-w-xl">
                Seleccioná un espacio de trabajo para acceder a su panel de
                control, ver sus encuestas y realizar análisis avanzados.
              </p>
            )}
          </div>
          {/* ── Botón Comparar (SOLO VISIBLE PARA ADMINS) ────────────────────────────────── */}
          {isAdmin && projects.length >= 2 && (
            <div className="flex items-center gap-3">
              {compareMode ? (
                <>
                  <span className="text-xs font-bold text-slate-500">
                    {selectedToCompare.length === 0
                      ? "Elegí 2 proyectos"
                      : selectedToCompare.length === 1
                        ? "Elegí 1 más"
                        : "¡Listo!"}
                  </span>
                  {compareUrl ? (
                    <Link
                      href={compareUrl}
                      className="flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white transition-all hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/25 active:scale-[0.98]"
                    >
                      Ver comparación <ArrowRight size={16} weight="bold" />
                    </Link>
                  ) : null}
                  <button
                    onClick={() => {
                      setCompareMode(false);
                      setSelectedToCompare([]);
                    }}
                    className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all"
                  >
                    <X size={14} weight="bold" /> Cancelar
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setCompareMode(true)}
                  className="flex items-center gap-2 rounded-2xl border-2 border-indigo-100 bg-indigo-50 px-5 py-2.5 text-sm font-black text-indigo-700 transition-all hover:bg-indigo-100 hover:border-indigo-300 active:scale-[0.98]"
                >
                  <ArrowsLeftRight size={18} weight="bold" />
                  Comparar proyectos
                </button>
              )}
            </div>
          )}
          {/* ────────────────────────────────────────────────────── */}
        </div>

        {/* Banner modo comparar (SOLO VISIBLE PARA ADMINS) */}
        {isAdmin && compareMode && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/80 px-5 py-3.5">
            <ArrowsLeftRight
              size={18}
              weight="bold"
              className="text-indigo-500 shrink-0"
            />
            <p className="text-sm font-bold text-indigo-700">
              Modo comparación activo — hacé clic en los proyectos que querés
              comparar{" "}
              <span className="font-black">
                ({selectedToCompare.length}/2 seleccionados)
              </span>
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex h-64 w-full items-center justify-center rounded-[40px] border border-white bg-white/40 backdrop-blur-xl shadow-lg">
            <div className="flex flex-col items-center gap-4 text-blue-600">
              <DotsThreeCircle
                size={48}
                className="animate-pulse"
                weight="fill"
              />
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">
                Cargando espacios...
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 items-stretch">
            {isAdmin && !compareMode && (
              <button
                onClick={() => setOpenCreate(true)}
                className="group flex h-[240px] flex-col items-center justify-center gap-4 rounded-[32px] border-2 border-dashed border-blue-200 bg-blue-50/50 transition-all hover:bg-blue-50 hover:border-blue-400 hover:shadow-xl hover:shadow-blue-900/5 active:scale-95"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                  <Plus size={28} weight="bold" />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="font-black text-blue-700">
                    Nuevo Proyecto
                  </span>
                  <span className="text-xs font-medium text-blue-500">
                    Crear base de datos
                  </span>
                </div>
              </button>
            )}

            {sorted.map((p, index) => {
              const isSelected = selectedToCompare.includes(p.id);
              const isDisabled =
                compareMode && selectedToCompare.length === 2 && !isSelected;

              const currentGroup = getProjectGroup(p.nombre);
              const previousGroup =
                index > 0
                  ? getProjectGroup(sorted[index - 1]?.nombre || "")
                  : null;
              const shouldShowAdminGroupHeader =
                isAdmin &&
                !compareMode &&
                (!previousGroup || previousGroup.key !== currentGroup.key);

              return (
                <>
                  {shouldShowAdminGroupHeader && (
                    <div
                      className={`col-span-full rounded-[24px] border bg-gradient-to-r px-5 py-4 shadow-sm ${currentGroup.headerClass}`}
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="font-display text-xl font-black tracking-tight text-slate-900">
                            {currentGroup.label}
                          </p>
                          <p className="mt-1 text-xs font-bold text-slate-500">
                            {currentGroup.description}
                          </p>
                        </div>
                        <span
                          className={`w-fit rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${currentGroup.badgeClass}`}
                        >
                          {
                            sorted.filter(
                              (item) =>
                                getProjectGroup(item.nombre).key ===
                                currentGroup.key,
                            ).length
                          }{" "}
                          proyectos
                        </span>
                      </div>
                    </div>
                  )}
                  <div
                    key={p.id}
                    onClick={() => compareMode && toggleCompareSelect(p.id)}
                    className={`group relative flex h-[240px] flex-col justify-between rounded-[32px] border p-6 backdrop-blur-xl shadow-lg transition-all
                    ${
                      compareMode
                        ? `cursor-pointer ${
                            isSelected
                              ? "border-indigo-400 bg-indigo-50 shadow-indigo-200/60 ring-2 ring-indigo-400"
                              : isDisabled
                                ? "border-slate-100 bg-white/30 opacity-40 cursor-not-allowed"
                                : "border-indigo-100 bg-white/60 hover:border-indigo-300 hover:bg-indigo-50/40"
                          }`
                        : "border-white bg-white/60 shadow-slate-200/50 hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-900/10 hover:bg-white"
                    }`}
                  >
                    {/* Badge de selección */}
                    {compareMode && isSelected && (
                      <div className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-black shadow-lg">
                        {selectedToCompare.indexOf(p.id) + 1}
                      </div>
                    )}

                    <div>
                      <div className="flex justify-between items-start mb-4">
                        <div
                          className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-inner transition-colors shrink-0
                        ${
                          isSelected
                            ? "bg-indigo-100 text-indigo-600"
                            : "bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600 group-hover:text-blue-600 group-hover:from-blue-50 group-hover:to-blue-100"
                        }`}
                        >
                          <Folder size={24} weight="fill" />
                        </div>
                        {isAdmin && !compareMode && (
                          <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                            {editingId !== p.id && (
                              <button
                                onClick={(e) => startEdit(p, e)}
                                className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-500 hover:bg-blue-100 hover:text-blue-700"
                                title="Renombrar proyecto"
                              >
                                <PencilSimple size={15} weight="bold" />
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(p.id, p.nombre);
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700"
                              title="Eliminar proyecto"
                            >
                              <Trash size={16} weight="bold" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Nombre — editable inline */}
                      {editingId === p.id ? (
                        <div
                          className="flex flex-col gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            autoFocus
                            value={editNombre}
                            onChange={(e) => setEditNombre(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit(p.id, e as any);
                              if (e.key === "Escape") cancelEdit(e as any);
                            }}
                            className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm"
                            placeholder="Nombre del proyecto"
                          />
                          <input
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 outline-none focus:ring-2 focus:ring-blue-500/10 shadow-sm"
                            placeholder="Descripción (opcional)"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => saveEdit(p.id, e)}
                              disabled={savingId === p.id}
                              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-white text-xs font-black py-1.5 hover:bg-blue-700 transition-all disabled:opacity-60"
                            >
                              {savingId === p.id ? (
                                "Guardando..."
                              ) : (
                                <>
                                  <Check size={13} weight="bold" /> Guardar
                                </>
                              )}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 text-xs font-bold px-3 py-1.5 hover:bg-slate-50 transition-all"
                            >
                              <X size={13} weight="bold" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <img
                            src="/audire.png"
                            alt="Audire"
                            className="h-5 w-auto object-contain"
                            onError={(e) => {
                              const img = e.currentTarget;
                              img.style.display = "none";
                            }}
                          />
                          <h4 className="font-display text-xl font-black tracking-tight text-slate-900 line-clamp-1">
                            {getVisibleProjectName(p)}
                          </h4>
                          <p className="mt-1.5 text-xs font-medium text-slate-500 line-clamp-2">
                            {getVisibleProjectDescription(p)}
                          </p>
                        </>
                      )}
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="h-px w-full bg-slate-100"></div>
                      {compareMode ? (
                        <p
                          className={`text-sm font-bold ${isSelected ? "text-indigo-600" : "text-slate-400"}`}
                        >
                          {isSelected
                            ? `✓ Seleccionado (${selectedToCompare.indexOf(p.id) + 1})`
                            : "Clic para seleccionar"}
                        </p>
                      ) : (
                        <Link
                          href={`/dashboard/surveys?projectId=${p.id}`}
                          onClick={() => logProjectOpen(p)}
                          className="flex w-full items-center justify-between rounded-xl px-2 py-1 text-sm font-bold text-slate-600 transition-all hover:text-blue-600"
                        >
                          Ingresar al panel
                          <ArrowRight
                            size={18}
                            weight="bold"
                            className="group-hover:translate-x-1 transition-transform"
                          />
                        </Link>
                      )}
                    </div>
                  </div>
                </>
              );
            })}
          </div>
        )}
      </main>

      {activityOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setActivityOpen(false)}
          />
          <div className="relative flex max-h-[82vh] w-full max-w-5xl flex-col rounded-[32px] border border-white bg-white/95 p-6 shadow-2xl shadow-slate-900/20 backdrop-blur-2xl">
            <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Control interno
                </p>
                <h3 className="mt-1 font-display text-2xl font-black tracking-tight text-slate-900">
                  Actividad por cuenta
                </h3>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  Últimos movimientos importantes. No registra filtros,
                  búsquedas ni clicks menores.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadActivityLogs}
                  disabled={activityLoading}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
                >
                  {activityLoading ? "Actualizando..." : "Actualizar"}
                </button>
                <button
                  onClick={() => setActivityOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200"
                  aria-label="Cerrar actividad"
                >
                  <X size={16} weight="bold" />
                </button>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2">
              {activityActions.map((action) => (
                <button
                  key={action}
                  onClick={() => setActivityFilter(action)}
                  className={`rounded-xl px-3 py-2 text-[11px] font-black transition-all ${activityFilter === action ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
                >
                  {action}
                </button>
              ))}
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
              <div className="max-h-[52vh] overflow-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-black">Fecha</th>
                      <th className="px-4 py-3 font-black">Cuenta</th>
                      <th className="px-4 py-3 font-black">Rol</th>
                      <th className="px-4 py-3 font-black">Acción</th>
                      <th className="px-4 py-3 font-black">Proyecto</th>
                      <th className="px-4 py-3 font-black">Vista</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityLoading ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-10 text-center text-sm font-black text-slate-400"
                        >
                          Cargando actividad...
                        </td>
                      </tr>
                    ) : filteredActivityLogs.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-10 text-center text-sm font-black text-slate-400"
                        >
                          Sin actividad para mostrar.
                        </td>
                      </tr>
                    ) : (
                      filteredActivityLogs.map((item) => (
                        <tr
                          key={item.id}
                          className="border-t border-slate-50 text-slate-700"
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-black text-slate-500">
                            {formatLogDate(item.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-black text-slate-800">
                              {item.email || item.user_id || "Usuario"}
                            </div>
                            {item.colegio && (
                              <div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                {item.colegio}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-bold capitalize text-slate-500">
                            {item.role || "-"}
                          </td>
                          <td className="px-4 py-3 font-black text-slate-800">
                            {formatLogAction(item.action)}
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-600">
                            {item.project_name || "-"}
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-500">
                            {item.vista || "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="mt-3 text-[11px] font-bold text-slate-400">
              Se leen solo los últimos 80 registros y las
              entradas a proyectos se guardan una vez por sesión.
            </p>
          </div>
        </div>
      )}

      {openCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
            onClick={() => setOpenCreate(false)}
          />

          <div className="relative w-full max-w-[480px] scale-100 rounded-[32px] border border-white bg-white/80 p-8 backdrop-blur-2xl shadow-2xl shadow-slate-900/20 transition-all">
            <div className="flex items-start justify-between mb-6">
              <div className="flex flex-col gap-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 mb-2">
                  <Plus size={20} weight="bold" />
                </div>
                <h3 className="font-display text-2xl font-black tracking-tight text-slate-900">
                  Crear proyecto
                </h3>
                <p className="text-sm font-medium text-slate-500">
                  Definí un nombre para aislar esta base de encuestas.
                </p>
              </div>
              <button
                onClick={() => setOpenCreate(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">
                  Nombre del Proyecto
                </label>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Encuesta Docentes 2026"
                  className="w-full rounded-2xl border border-white bg-white/70 px-4 py-3.5 text-sm font-bold text-slate-900 outline-none shadow-inner focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">
                  Descripción (Opcional)
                </label>
                <textarea
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Ej: Análisis de clima laboral y recursos..."
                  className="min-h-[100px] w-full rounded-2xl border border-white bg-white/70 px-4 py-3.5 text-sm font-medium text-slate-700 outline-none shadow-inner focus:ring-2 focus:ring-blue-500/20 resize-none"
                />
              </div>
              <button
                onClick={handleCreate}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-sm font-black text-white transition-all hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/30 active:scale-[0.98]"
              >
                Generar Espacio <ArrowRight size={18} weight="bold" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
