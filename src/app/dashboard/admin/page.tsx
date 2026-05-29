"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CaretDown, Check, UserPlus } from "phosphor-react";
import { useUser } from "@clerk/nextjs";
import { crearUsuarioClerkDB, guardarUsuarioScopeDB, listarProyectosDB, listarUsuariosClerkDB } from "../../actions";

type AdminUser = {
  id: string;
  email: string;
  nombre: string;
  firstName?: string;
  lastName?: string;
  role: "admin" | "director" | "equipo" | "oficina" | "";
  colegio: string;
  polo: string;
  projectIds: string[];
  compareProjectIds?: string[];
};

type Project = { id: string; nombre: string };

export default function AdminAssignmentsPage() {
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === "admin";
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newRole, setNewRole] = useState<"director" | "equipo" | "admin" | "oficina">("director");
  const [newColegio, setNewColegio] = useState("");
  const [newPolo, setNewPolo] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const [u, p] = await Promise.all([listarUsuariosClerkDB(), listarProyectosDB()]);
      setUsers(u as AdminUser[]);
      setProjects((p as any[]).map((x) => ({ id: String(x.id), nombre: String(x.nombre) })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    refresh();
  }, [isAdmin]);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => (a.nombre || a.email).localeCompare(b.nombre || b.email, "es"));
  }, [users]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F7FB]">
        <div className="rounded-2xl bg-white p-8 shadow-xl text-center">
          <p className="font-black text-slate-800">Solo administradores pueden ver esta página.</p>
          <Link href="/dashboard" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-white font-bold">
            <ArrowLeft size={16} /> Volver
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F7FB] p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow">
            <ArrowLeft size={16} /> Volver
          </Link>
          <h1 className="font-display text-3xl font-black text-slate-900">Admin · Perfiles</h1>
        </div>

        <div className="mb-6 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-black text-slate-900 mb-3">Crear cuenta (con contraseña)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
            <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@colegio.com" className="rounded-xl border px-3 py-2 text-sm" />
            <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" placeholder="Contraseña inicial" className="rounded-xl border px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} placeholder="Nombre" className="rounded-xl border px-3 py-2 text-sm" />
            <input value={newLastName} onChange={(e) => setNewLastName(e.target.value)} placeholder="Apellido" className="rounded-xl border px-3 py-2 text-sm" />
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as any)} className="rounded-xl border px-3 py-2 text-sm font-bold">
              <option value="director">Director</option>
              <option value="equipo">Equipo</option>
              <option value="oficina">Oficina central</option>
              <option value="admin">Admin</option>
            </select>
            <input value={newColegio} onChange={(e) => setNewColegio(e.target.value)} placeholder="Colegio" className="rounded-xl border px-3 py-2 text-sm" />
          </div>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
            <input value={newPolo} onChange={(e) => setNewPolo(e.target.value)} placeholder="Polo" className="rounded-xl border px-3 py-2 text-sm" />
            <button
              disabled={!newEmail || !newPassword || creating}
              onClick={async () => {
                setCreating(true);
                try {
                  await crearUsuarioClerkDB({
                    email: newEmail.trim(),
                    password: newPassword,
                    firstName: newFirstName.trim() || undefined,
                    lastName: newLastName.trim() || undefined,
                    role: newRole,
                    colegio: newColegio.trim(),
                    polo: newPolo.trim(),
                  });
                  setNewEmail("");
                  setNewPassword("");
                  setNewFirstName("");
                  setNewLastName("");
                  setNewColegio("");
                  setNewPolo("");
                  await refresh();
                } finally {
                  setCreating(false);
                }
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              <UserPlus size={16} /> Crear usuario
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            <p className="text-sm font-bold text-slate-500">Cargando usuarios...</p>
          ) : (
            sortedUsers.map((u) => {
              const isOpen = expandedId === u.id;
              return (
                <div key={u.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <button
                    onClick={() => setExpandedId((prev) => (prev === u.id ? null : u.id))}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">{u.nombre || "Sin nombre"}</p>
                      <p className="truncate text-xs font-semibold text-slate-500">{u.email} · {u.role || "sin rol"}</p>
                    </div>
                    <CaretDown size={14} className={`shrink-0 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>

                  {isOpen && (
                    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input value={u.firstName || ""} onChange={(e) => setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, firstName: e.target.value, nombre: `${e.target.value} ${x.lastName || ""}`.trim() } : x))} placeholder="Nombre" className="rounded-xl border px-3 py-2 text-xs" />
                        <input value={u.lastName || ""} onChange={(e) => setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, lastName: e.target.value, nombre: `${x.firstName || ""} ${e.target.value}`.trim() } : x))} placeholder="Apellido" className="rounded-xl border px-3 py-2 text-xs" />
                        <select value={u.role || "equipo"} onChange={(e) => setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, role: e.target.value as any } : x))} className="rounded-xl border px-3 py-2 text-xs font-bold">
                          <option value="admin">Admin</option>
                          <option value="director">Director</option>
                          <option value="equipo">Equipo</option>
                          <option value="oficina">Oficina central</option>
                        </select>
                      </div>

                      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input value={u.colegio} onChange={(e) => setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, colegio: e.target.value } : x))} placeholder="Colegio" className="rounded-xl border px-3 py-2 text-xs" />
                        <input value={u.polo} onChange={(e) => setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, polo: e.target.value } : x))} placeholder="Polo" className="rounded-xl border px-3 py-2 text-xs" />
                      </div>

                      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Proyectos visibles</p>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, projectIds: projects.map((p) => p.id) } : x))}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-500 hover:bg-slate-50"
                            >
                              Todos
                            </button>
                            <button
                              type="button"
                              onClick={() => setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, projectIds: [] } : x))}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-500 hover:bg-slate-50"
                            >
                              Limpiar
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                          {projects.map((p) => (
                            <label key={p.id} className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                              <input
                                type="checkbox"
                                checked={u.projectIds.includes(p.id)}
                                onChange={(e) =>
                                  setUsers((prev) =>
                                    prev.map((x) =>
                                      x.id === u.id
                                        ? {
                                            ...x,
                                            projectIds: e.target.checked
                                              ? [...new Set([...x.projectIds, p.id])]
                                              : x.projectIds.filter((id) => id !== p.id),
                                          }
                                        : x
                                    )
                                  )
                                }
                              />
                              {p.nombre}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Comparación NPS (Director)</p>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, compareProjectIds: projects.map((p) => p.id) } : x))}
                              className="rounded-lg border border-indigo-200 bg-white px-2 py-1 text-[10px] font-black text-indigo-600 hover:bg-indigo-50"
                            >
                              Todos
                            </button>
                            <button
                              type="button"
                              onClick={() => setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, compareProjectIds: [] } : x))}
                              className="rounded-lg border border-indigo-200 bg-white px-2 py-1 text-[10px] font-black text-indigo-600 hover:bg-indigo-50"
                            >
                              Limpiar
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                          {projects.map((p) => (
                            <label key={`cmp-${p.id}`} className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                              <input
                                type="checkbox"
                                checked={(u.compareProjectIds ?? []).includes(p.id)}
                                onChange={(e) =>
                                  setUsers((prev) =>
                                    prev.map((x) =>
                                      x.id === u.id
                                        ? {
                                            ...x,
                                            compareProjectIds: e.target.checked
                                              ? [...new Set([...(x.compareProjectIds ?? []), p.id])]
                                              : (x.compareProjectIds ?? []).filter((id) => id !== p.id),
                                          }
                                        : x
                                    )
                                  )
                                }
                              />
                              {p.nombre}
                            </label>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={async () => {
                          await guardarUsuarioScopeDB({
                            userId: u.id,
                            firstName: u.firstName,
                            lastName: u.lastName,
                            role: (u.role || "equipo") as any,
                            colegio: u.colegio,
                            polo: u.polo,
                            projectIds: u.projectIds,
                            compareProjectIds: u.compareProjectIds ?? [],
                          });
                          await refresh();
                        }}
                        className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white"
                      >
                        <Check size={14} /> Guardar cambios
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
