import { Fragment, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { nombreLegible } from "../lib/roles";
import { useToast } from "../context/ToastContext";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { IconUser, IconShield, IconInbox, IconInfo, IconClock, IconSettings, IconDatabase, IconEdit, IconKey, IconTrash } from "../components/icons";

const inputClass =
  "w-full rounded-[var(--radius-input)] border border-[var(--color-ink)]/20 bg-[var(--color-ink)]/5 px-3 py-2 text-sm outline-none focus:border-[var(--color-ink)]";

const TABS = [
  { k: "usuarios", l: "Usuarios", icon: IconUser },
  { k: "roles", l: "Roles", icon: IconShield },
  { k: "tipos", l: "Tipos de solicitud", icon: IconInbox },
  { k: "motivos", l: "Motivos", icon: IconInfo },
  { k: "sla", l: "Plazos SLA", icon: IconClock },
  { k: "festivos", l: "Festivos", icon: IconSettings },
  { k: "almacenamiento", l: "Almacenamiento", icon: IconDatabase },
];

export function Admin() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") || "usuarios");
  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Administración</h2>
        <nav className="mt-4 flex flex-wrap gap-1 border-b border-[var(--color-border)] pb-0">
          {TABS.map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`flex items-center gap-2 rounded-t-[var(--radius-button)] border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === t.k
                  ? "border-[var(--color-ink)] text-[var(--color-ink)]"
                  : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              <t.icon size={15} />
              {t.l}
            </button>
          ))}
        </nav>
      </div>

      <div className="grid gap-6">
        {tab === "usuarios" && <Usuarios />}
        {tab === "roles" && <Roles />}
        {tab === "tipos" && <Catalogo titulo="Tipos de solicitud" path="tipos" />}
        {tab === "motivos" && <Catalogo titulo="Motivos" path="motivos" />}
        {tab === "sla" && <Sla />}
        {tab === "festivos" && <Festivos />}
        {tab === "almacenamiento" && <Almacenamiento />}
      </div>
    </div>
  );
}

// Texto que se convierte en input al hacer clic; el lápiz solo aparece al
// pasar el mouse (patrón "hover actions" de Help Scout: no abarrotar la fila
// con controles que casi nunca se usan).
function CampoEditable({ valor, onGuardar, tipo = "text", placeholder, className = "" }) {
  const [editando, setEditando] = useState(false);
  const [valorLocal, setValorLocal] = useState(valor || "");

  useEffect(() => {
    setValorLocal(valor || "");
  }, [valor]);

  if (editando) {
    return (
      <input
        autoFocus
        type={tipo}
        value={valorLocal}
        onChange={(e) => setValorLocal(e.target.value)}
        onBlur={() => {
          setEditando(false);
          const limpio = valorLocal.trim();
          if (limpio && limpio !== (valor || "")) onGuardar(limpio);
          else setValorLocal(valor || "");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setValorLocal(valor || "");
            setEditando(false);
          }
        }}
        placeholder={placeholder}
        className={`w-full rounded-[var(--radius-input)] border border-[var(--color-ink)] bg-[var(--color-canvas)] px-1.5 py-0.5 outline-none ${className}`}
      />
    );
  }
  return (
    <button type="button" onClick={() => setEditando(true)} className="group/campo flex max-w-full items-center gap-1 text-left">
      <span className={`truncate ${className}`}>{valor || <span className="text-[var(--color-muted)]">{placeholder}</span>}</span>
      <IconEdit
        size={11}
        className="shrink-0 text-[var(--color-muted)] opacity-0 transition-opacity group-hover/campo:opacity-100"
      />
    </button>
  );
}

function FormularioContrasena({ onGuardar, onCancelar }) {
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState(null);

  function enviar(e) {
    e.preventDefault();
    if (password.length < 8) return setError("Debe tener al menos 8 caracteres");
    if (password !== confirmar) return setError("Las contraseñas no coinciden");
    setError(null);
    onGuardar(password);
  }

  return (
    <form onSubmit={enviar} className="mt-2 grid gap-2 rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-canvas)] p-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
      <label className="text-xs">
        <span className="mb-1 block font-medium">Nueva contraseña</span>
        <input type="password" autoFocus minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
      </label>
      <label className="text-xs">
        <span className="mb-1 block font-medium">Confirmar</span>
        <input type="password" minLength={8} value={confirmar} onChange={(e) => setConfirmar(e.target.value)} className={inputClass} />
      </label>
      <Button type="submit" variant="accent">
        Guardar
      </Button>
      <Button type="button" variant="ghost" onClick={onCancelar}>
        Cancelar
      </Button>
      {error && <p className="text-xs text-[#b3362a] sm:col-span-4">{error}</p>}
    </form>
  );
}

function Mensaje({ error, ok }) {
  if (error) return <p className="text-sm text-[#b3362a]">{error}</p>;
  if (ok) return <p className="text-sm text-[var(--color-state-cerrado)]">{ok}</p>;
  return null;
}

// ======================= Usuarios =======================

function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [rolId, setRolId] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [cambiandoPassId, setCambiandoPassId] = useState(null);

  async function cargar() {
    const [u, r] = await Promise.all([apiFetch("/admin/usuarios"), apiFetch("/admin/roles")]);
    setUsuarios(u);
    setRoles(r);
    if (!rolId && r[0]) setRolId(r[0].id);
  }
  useEffect(() => {
    cargar();
  }, []);

  async function invitar(e) {
    e.preventDefault();
    setError(null);
    setOk(null);
    setEnviando(true);
    try {
      await apiFetch("/admin/usuarios", {
        method: "POST",
        body: JSON.stringify({ email, nombre, rol_id: rolId, proveedor: proveedor || null }),
      });
      setOk(`Invitación enviada a ${email}`);
      setEmail("");
      setNombre("");
      setProveedor("");
      await cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  const { exito, fallo } = useToast();

  async function cambiarRol(id, rol_id) {
    try {
      await apiFetch(`/admin/usuarios/${id}`, { method: "PATCH", body: JSON.stringify({ rol_id }) });
      exito("Rol actualizado");
      cargar();
    } catch (e) {
      fallo(e.message);
    }
  }
  async function alternarActivo(u) {
    try {
      await apiFetch(`/admin/usuarios/${u.id}`, { method: "PATCH", body: JSON.stringify({ activo: !u.activo }) });
      exito(u.activo ? `${u.nombre} desactivado` : `${u.nombre} activado`);
      cargar();
    } catch (e) {
      fallo(e.message);
    }
  }
  async function guardarCodigoInterno(u, valor) {
    try {
      await apiFetch(`/admin/usuarios/${u.id}`, { method: "PATCH", body: JSON.stringify({ codigo_interno: valor || null }) });
      exito("Código interno actualizado");
      cargar();
    } catch (e) {
      fallo(e.message);
      cargar();
    }
  }
  async function guardarCampo(u, campo, valor, etiqueta) {
    try {
      await apiFetch(`/admin/usuarios/${u.id}`, { method: "PATCH", body: JSON.stringify({ [campo]: valor }) });
      exito(`${etiqueta} actualizado`);
      cargar();
    } catch (e) {
      fallo(e.message);
      cargar();
    }
  }
  async function eliminarUsuario(u) {
    if (!window.confirm(`Esto elimina PERMANENTEMENTE la cuenta de "${u.nombre}" (${u.email}). ¿Continuar?`)) return;
    try {
      await apiFetch(`/admin/usuarios/${u.id}`, { method: "DELETE" });
      exito(`${u.nombre} eliminado`);
      cargar();
    } catch (e) {
      fallo(e.message);
    }
  }
  async function cambiarContrasena(u, password) {
    try {
      await apiFetch(`/admin/usuarios/${u.id}/contrasena`, { method: "POST", body: JSON.stringify({ password }) });
      exito(`Contraseña de ${u.nombre} actualizada`);
      setCambiandoPassId(null);
    } catch (e) {
      fallo(e.message);
    }
  }

  return (
    <div className="grid gap-4">
      <Card className="grid gap-3 sm:grid-cols-2">
        <form onSubmit={invitar} className="col-span-2 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Correo</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Nombre</span>
            <input required value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputClass} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Rol</span>
            <select value={rolId} onChange={(e) => setRolId(e.target.value)} className={inputClass}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {nombreLegible(r.nombre)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Proveedor (opcional, ej. SYS HIGEA)</span>
            <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} className={inputClass} />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" variant="accent" disabled={enviando}>
              {enviando ? "Invitando…" : "Invitar usuario"}
            </Button>
          </div>
          <div className="sm:col-span-2">
            <Mensaje error={error} ok={ok} />
          </div>
        </form>
      </Card>

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
        <div className="hidden grid-cols-[1fr_88px_190px_190px] items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)] sm:grid">
          <span>Usuario</span>
          <span className="text-center">Código</span>
          <span>Rol</span>
          <span className="text-right">Acciones</span>
        </div>
        <ul className="divide-y divide-[var(--color-border)]">
          {usuarios.map((u) => (
            <li
              key={u.id}
              className="grid grid-cols-1 items-center gap-2 px-4 py-3 sm:grid-cols-[1fr_88px_190px_190px] sm:gap-3"
            >
              <div className="min-w-0">
                <CampoEditable
                  valor={u.nombre}
                  className="font-medium"
                  placeholder="Nombre"
                  onGuardar={(v) => guardarCampo(u, "nombre", v, "Nombre")}
                />
                <div className="flex flex-wrap items-center gap-1 text-xs text-[var(--color-muted)]">
                  <CampoEditable
                    valor={u.email}
                    tipo="email"
                    placeholder="correo@ejemplo.com"
                    onGuardar={(v) => guardarCampo(u, "email", v, "Correo")}
                  />
                  <span>
                    {u.proveedor ? `· ${u.proveedor}` : ""} {!u.activo && "· Desactivado"}
                  </span>
                </div>
              </div>
              <span className="relative justify-self-center">
                <IconEdit size={11} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
                <input
                  key={u.id + (u.codigo_interno || "")}
                  defaultValue={u.codigo_interno || ""}
                  onBlur={(e) => {
                    const valor = e.target.value.trim();
                    if (valor === (u.codigo_interno || "")) return;
                    if (valor && !/^\d{3}$/.test(valor)) {
                      fallo("El código interno debe tener exactamente 3 dígitos (ej. 101)");
                      e.target.value = u.codigo_interno || "";
                      return;
                    }
                    guardarCodigoInterno(u, valor);
                  }}
                  placeholder="Código"
                  title="Código interno (3 dígitos, se asigna solo al crear el usuario; aquí puedes corregirlo)"
                  maxLength={3}
                  className="w-16 rounded-[var(--radius-input)] border border-[var(--color-border)] py-1 pl-2 pr-4 text-center text-sm"
                />
              </span>
              <select
                value={u.roles?.id || ""}
                onChange={(e) => cambiarRol(u.id, e.target.value)}
                className="w-full rounded-[var(--radius-input)] border border-[var(--color-border)] px-2 py-1 text-sm"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {nombreLegible(r.nombre)}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1 sm:justify-self-end">
                <Button variant={u.activo ? "danger" : "ghost"} onClick={() => alternarActivo(u)}>
                  {u.activo ? "Desactivar" : "Activar"}
                </Button>
                <Button
                  variant="ghost"
                  title="Cambiar contraseña"
                  onClick={() => setCambiandoPassId(cambiandoPassId === u.id ? null : u.id)}
                >
                  <IconKey size={14} />
                </Button>
                <Button variant="ghost" title="Eliminar usuario" onClick={() => eliminarUsuario(u)}>
                  <IconTrash size={14} />
                </Button>
              </div>
              {cambiandoPassId === u.id && (
                <div className="sm:col-span-4">
                  <FormularioContrasena onGuardar={(pass) => cambiarContrasena(u, pass)} onCancelar={() => setCambiandoPassId(null)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ======================= Roles =======================

function Roles() {
  const [roles, setRoles] = useState([]);
  const [permisos, setPermisos] = useState([]);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [seleccion, setSeleccion] = useState([]);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function cargar() {
    const [r, p] = await Promise.all([apiFetch("/admin/roles"), apiFetch("/admin/permisos")]);
    setRoles(r);
    setPermisos(p);
  }
  useEffect(() => {
    cargar();
  }, []);

  function alternarPermiso(clave) {
    setSeleccion((prev) => (prev.includes(clave) ? prev.filter((c) => c !== clave) : [...prev, clave]));
  }

  const { exito, fallo } = useToast();

  async function crear(e) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await apiFetch("/admin/roles", { method: "POST", body: JSON.stringify({ nombre, descripcion, permisos: seleccion }) });
      exito(`Rol "${nombre}" creado`);
      setNombre("");
      setDescripcion("");
      setSeleccion([]);
      await cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  // Guarda inmediatamente al marcar/desmarcar una casilla de la matriz: no hay botón
  // "Guardar" aparte, cada clic en la tabla persiste de una vez.
  async function togglePermisoRol(rol, clave) {
    const nuevos = rol.permisos.includes(clave) ? rol.permisos.filter((c) => c !== clave) : [...rol.permisos, clave];
    setRoles((prev) => prev.map((r) => (r.id === rol.id ? { ...r, permisos: nuevos } : r)));
    try {
      await apiFetch(`/admin/roles/${rol.id}`, { method: "PATCH", body: JSON.stringify({ permisos: nuevos }) });
    } catch (e) {
      fallo(e.message);
      cargar(); // revierte el checkbox si el servidor rechazó el cambio
    }
  }

  const CATEGORIAS = {
    tickets: "Tickets",
    usuarios: "Usuarios",
    roles: "Roles",
    config: "Configuración",
    reportes: "Reportes",
  };
  const grupos = {};
  for (const p of permisos) {
    const cat = p.clave.split(".")[0];
    (grupos[cat] ||= []).push(p);
  }

  return (
    <div className="grid gap-4">
      <Card className="grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">Nuevo rol</h3>
        <form onSubmit={crear} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Nombre</span>
            <input required value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputClass} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Descripción</span>
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={inputClass} />
          </label>
          <div className="sm:col-span-2 grid gap-3">
            {Object.entries(grupos).map(([cat, items]) => (
              <div key={cat}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
                  {CATEGORIAS[cat] || cat}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {items.map((p) => (
                    <label key={p.clave} className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" checked={seleccion.includes(p.clave)} onChange={() => alternarPermiso(p.clave)} />
                      {p.descripcion}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" variant="accent" disabled={enviando}>
              Crear rol
            </Button>
          </div>
          <div className="sm:col-span-2">
            <Mensaje error={error} />
          </div>
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 bg-[var(--color-surface)] px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
                Permiso
              </th>
              {roles.map((r) => (
                <th key={r.id} className="px-4 py-3 text-center text-xs font-semibold">
                  {nombreLegible(r.nombre)}
                  {r.es_sistema && <div className="font-normal normal-case text-[var(--color-muted)]">rol de sistema</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(grupos).map(([cat, items]) => (
              <Fragment key={cat}>
                <tr>
                  <td
                    colSpan={roles.length + 1}
                    className="bg-[var(--color-canvas)] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)] border-t border-b border-[var(--color-border)]"
                  >
                    {CATEGORIAS[cat] || cat}
                  </td>
                </tr>
                {items.map((p) => (
                  <tr key={p.clave} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="sticky left-0 bg-[var(--color-surface)] px-4 py-2">{p.descripcion}</td>
                    {roles.map((r) => (
                      <td key={r.id} className="px-4 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={r.permisos.includes(p.clave)}
                          onChange={() => togglePermisoRol(r, p.clave)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ======================= Catálogos (tipos / motivos) =======================

function Catalogo({ titulo, path }) {
  const [items, setItems] = useState([]);
  const [clave, setClave] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const [error, setError] = useState(null);
  const [editando, setEditando] = useState(null); // clave del item en edición, o null
  const [edicion, setEdicion] = useState({ clave: "", etiqueta: "" });

  async function cargar() {
    setItems(await apiFetch(`/admin/${path}`));
  }
  useEffect(() => {
    cargar();
  }, []);

  const { exito, fallo } = useToast();

  async function agregar(e) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch(`/admin/${path}`, { method: "POST", body: JSON.stringify({ clave, etiqueta }) });
      exito(`"${etiqueta}" agregado`);
      setClave("");
      setEtiqueta("");
      await cargar();
    } catch (e) {
      setError(e.message);
    }
  }

  async function alternarActivo(item) {
    try {
      await apiFetch(`/admin/${path}/${item.clave}`, { method: "PATCH", body: JSON.stringify({ activo: !item.activo }) });
      exito(item.activo ? `"${item.etiqueta}" desactivado` : `"${item.etiqueta}" activado`);
      cargar();
    } catch (e) {
      fallo(e.message);
    }
  }

  function empezarEdicion(item) {
    setEditando(item.clave);
    setEdicion({ clave: item.clave, etiqueta: item.etiqueta });
    setError(null);
  }

  async function guardarEdicion(claveOriginal) {
    setError(null);
    try {
      await apiFetch(`/admin/${path}/${claveOriginal}`, {
        method: "PATCH",
        body: JSON.stringify({ nueva_clave: edicion.clave, etiqueta: edicion.etiqueta }),
      });
      exito("Cambios guardados");
      setEditando(null);
      await cargar();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="grid gap-4">
      <Card className="grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">Agregar {titulo.toLowerCase()}</h3>
        <form onSubmit={agregar} className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Clave</span>
            <input required value={clave} onChange={(e) => setClave(e.target.value)} placeholder="ej. equivocacion_cups" className={inputClass} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Etiqueta</span>
            <input required value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} className={inputClass} />
          </label>
          <Button type="submit" variant="accent">
            Agregar
          </Button>
        </form>
        <Mensaje error={error} />
      </Card>

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
        <ul className="divide-y divide-[var(--color-border)]">
        {items.map((item) =>
          editando === item.clave ? (
            <li key={item.clave} className="grid gap-2 px-4 py-3 sm:grid-cols-[160px_1fr_auto_auto] sm:items-end">
              <label className="text-sm">
                <span className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Clave</span>
                <input
                  value={edicion.clave}
                  onChange={(e) => setEdicion((p) => ({ ...p, clave: e.target.value }))}
                  className={inputClass}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Etiqueta</span>
                <input
                  value={edicion.etiqueta}
                  onChange={(e) => setEdicion((p) => ({ ...p, etiqueta: e.target.value }))}
                  className={inputClass}
                />
              </label>
              <Button variant="accent" onClick={() => guardarEdicion(item.clave)}>
                Guardar
              </Button>
              <Button variant="ghost" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
            </li>
          ) : (
            <li key={item.clave} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="font-medium">{item.etiqueta}</div>
                <div className="text-xs text-[var(--color-muted)]">{item.clave}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => empezarEdicion(item)}>
                  <IconEdit size={13} />
                  Editar
                </Button>
                <Button variant={item.activo ? "danger" : "ghost"} onClick={() => alternarActivo(item)}>
                  {item.activo ? "Desactivar" : "Activar"}
                </Button>
              </div>
            </li>
          )
        )}
        </ul>
      </div>
      <Mensaje error={error} />
    </div>
  );
}

// ======================= SLA =======================

function Sla() {
  const [config, setConfig] = useState([]);

  async function cargar() {
    setConfig(await apiFetch("/admin/sla"));
  }
  useEffect(() => {
    cargar();
  }, []);

  async function guardar(prioridad, dias_habiles) {
    await apiFetch(`/admin/sla/${prioridad}`, { method: "PATCH", body: JSON.stringify({ dias_habiles }) });
    cargar();
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
        <span>Prioridad</span>
        <span>Plazo</span>
      </div>
      <ul className="divide-y divide-[var(--color-border)]">
      {config.map((c) => (
        <li key={c.prioridad} className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="capitalize font-medium">{c.prioridad}</span>
          <div className="flex items-center gap-2">
            <span className="relative">
              <IconEdit size={11} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
              <input
                type="number"
                min="1"
                defaultValue={c.dias_habiles}
                onBlur={(e) => guardar(c.prioridad, Number(e.target.value))}
                className="w-20 rounded-[var(--radius-input)] border border-[var(--color-border)] py-1 pl-2 pr-5 text-sm"
              />
            </span>
            <span className="text-sm text-[var(--color-muted)]">días hábiles</span>
          </div>
        </li>
      ))}
      </ul>
    </div>
  );
}

// ======================= Festivos =======================

function Festivos() {
  const [festivos, setFestivos] = useState([]);
  const [fecha, setFecha] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState(null);

  async function cargar() {
    setFestivos(await apiFetch("/admin/festivos"));
  }
  useEffect(() => {
    cargar();
  }, []);

  async function agregar(e) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/admin/festivos", { method: "POST", body: JSON.stringify({ fecha, descripcion }) });
      setFecha("");
      setDescripcion("");
      await cargar();
    } catch (e) {
      setError(e.message);
    }
  }

  async function eliminar(f) {
    await apiFetch(`/admin/festivos/${f}`, { method: "DELETE" });
    cargar();
  }

  return (
    <div className="grid gap-4">
      <Card className="grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">Agregar festivo</h3>
        <form onSubmit={agregar} className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Fecha</span>
            <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputClass} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Descripción</span>
            <input required value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={inputClass} />
          </label>
          <Button type="submit" variant="accent">
            Agregar
          </Button>
        </form>
        <Mensaje error={error} />
      </Card>

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
        <ul className="divide-y divide-[var(--color-border)]">
          {festivos.map((f) => (
            <li key={f.fecha} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="font-medium">{f.descripcion}</div>
                <div className="text-xs text-[var(--color-muted)]">{f.fecha}</div>
              </div>
              <Button variant="danger" onClick={() => eliminar(f.fecha)}>
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ======================= Almacenamiento =======================

function kb(bytes) {
  if (bytes > 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  return Math.max(0, Math.round(bytes / 1024)) + " KB";
}

function Barra({ porcentaje }) {
  const color = porcentaje > 80 ? "var(--color-danger)" : porcentaje > 50 ? "var(--color-state-devuelto)" : "var(--color-state-cerrado)";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-ink)]/10">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, porcentaje)}%`, background: color }} />
    </div>
  );
}

const ETIQUETAS_TABLA = {
  tickets: "Tickets",
  ticket_items: "Registros de tickets",
  ticket_adjuntos: "Adjuntos",
  ticket_eventos: "Eventos de historial",
  aprobaciones: "Aprobaciones",
  usuarios: "Usuarios",
  roles: "Roles",
};

function Almacenamiento() {
  const { exito, fallo } = useToast();
  const [datos, setDatos] = useState(null);
  const [dias, setDias] = useState("");
  const [limpiando, setLimpiando] = useState(false);

  async function cargar() {
    const r = await apiFetch("/admin/almacenamiento");
    setDatos(r);
    setDias(String(r.diasRetencionCierre));
  }
  useEffect(() => {
    cargar();
  }, []);

  async function guardarDias(e) {
    e.preventDefault();
    try {
      await apiFetch("/admin/config/dias_retencion_cierre", { method: "PATCH", body: JSON.stringify({ valor: dias }) });
      exito("Plazo de retención actualizado");
      cargar();
    } catch (e) {
      fallo(e.message);
    }
  }

  async function limpiarAhora() {
    if (!window.confirm(`Esto borra PERMANENTEMENTE y sin respaldo todo ticket cerrado hace más de ${dias} días. ¿Continuar?`)) return;
    setLimpiando(true);
    try {
      const r = await apiFetch("/admin/limpieza/ejecutar", { method: "POST" });
      exito(`${r.eliminados.length} ticket(s) eliminado(s) de ${r.evaluados} evaluado(s)`);
      if (r.errores.length) fallo(`${r.errores.length} no se pudieron eliminar`);
      cargar();
    } catch (e) {
      fallo(e.message);
    } finally {
      setLimpiando(false);
    }
  }

  if (!datos) return <p className="text-[var(--color-muted)]">Cargando…</p>;

  const pctStorage = (datos.storage.bytes / datos.storage.limite) * 100;

  return (
    <div className="grid gap-4">
      <Card className="grid gap-5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
          Storage de archivos (plan gratuito Supabase)
        </h3>
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between text-sm">
            <span>{kb(datos.storage.bytes)} usados · {datos.storage.archivos} archivo(s)</span>
            <span className="text-[var(--color-muted)]">de {kb(datos.storage.limite)}</span>
          </div>
          <Barra porcentaje={pctStorage} />
          <span className="text-xs text-[var(--color-muted)]">{pctStorage.toFixed(3)}% del límite</span>
        </div>
      </Card>

      <Card className="grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
          Filas por tabla (base de datos)
        </h3>
        <p className="text-xs text-[var(--color-muted)]">
          Supabase no expone el tamaño exacto en bytes de la base por API; el conteo de filas es la señal disponible para
          saber si se acerca el momento de limpiar. El límite del plan gratuito es {kb(datos.baseDatos.limite)}.
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {Object.entries(datos.conteos).map(([tabla, n]) => (
            <div key={tabla} className="flex items-center justify-between rounded-[var(--radius-input)] border border-[var(--color-border)] px-3 py-1.5 text-sm">
              <span>{ETIQUETAS_TABLA[tabla] || tabla}</span>
              <span className="font-semibold">{n}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
          Limpieza automática de tickets cerrados
        </h3>
        <p className="text-sm text-[var(--color-muted)]">
          Todos los días se borran permanentemente (sin respaldo) los tickets en estado "Cerrado" con más de este número de
          días desde su cierre. Incluye su historial, registros y adjuntos.
        </p>
        <form onSubmit={guardarDias} className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Días de retención</span>
            <span className="relative block">
              <IconEdit size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
              <input
                type="number"
                min="1"
                value={dias}
                onChange={(e) => setDias(e.target.value)}
                className="w-28 rounded-[var(--radius-input)] border border-[var(--color-border)] py-2 pl-3 pr-7 text-sm"
              />
            </span>
          </label>
          <Button type="submit" variant="ghost">
            Guardar
          </Button>
          <Button type="button" variant="danger" disabled={limpiando} onClick={limpiarAhora}>
            {limpiando ? "Limpiando…" : "Limpiar ahora"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
