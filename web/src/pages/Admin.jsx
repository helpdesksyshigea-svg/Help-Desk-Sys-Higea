import { Fragment, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { nombreLegible } from "../lib/roles";
import { useToast } from "../context/ToastContext";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { IconUser, IconShield, IconInbox, IconInfo, IconClock, IconSettings } from "../components/icons";

const inputClass =
  "w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-[var(--color-border-strong)]";

const TABS = [
  { k: "usuarios", l: "Usuarios", icon: IconUser },
  { k: "roles", l: "Roles", icon: IconShield },
  { k: "tipos", l: "Tipos de solicitud", icon: IconInbox },
  { k: "motivos", l: "Motivos", icon: IconInfo },
  { k: "sla", l: "Plazos SLA", icon: IconClock },
  { k: "festivos", l: "Festivos", icon: IconSettings },
];

export function Admin() {
  const [tab, setTab] = useState("usuarios");
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <aside className="h-fit overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-elevated)] p-3">
        <div className="mb-3 px-2 pt-1">
          <p className="text-sm font-bold leading-tight text-[var(--color-ink)]">Mesa de ayuda</p>
          <p className="text-xs" style={{ color: "var(--color-accent)" }}>
            SYS HIGEA
          </p>
        </div>
        <nav className="grid gap-0.5">
          {TABS.map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`flex items-center gap-2 rounded-[var(--radius-button)] px-3 py-2 text-left text-sm transition-colors ${
                tab === t.k
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)]"
                  : "text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-ink)]"
              }`}
              style={{ fontWeight: 510 }}
            >
              <t.icon size={15} />
              {t.l}
            </button>
          ))}
        </nav>
      </aside>

      <div className="grid gap-6">
        <h2 className="text-xl font-semibold tracking-tight">Administración</h2>
        {tab === "usuarios" && <Usuarios />}
        {tab === "roles" && <Roles />}
        {tab === "tipos" && <Catalogo titulo="Tipos de solicitud" path="tipos" />}
        {tab === "motivos" && <Catalogo titulo="Motivos" path="motivos" />}
        {tab === "sla" && <Sla />}
        {tab === "festivos" && <Festivos />}
      </div>
    </div>
  );
}

function Mensaje({ error, ok }) {
  if (error) return <p className="text-sm text-[var(--color-danger)]">{error}</p>;
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
        <ul className="divide-y divide-[var(--color-border)]">
          {usuarios.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="font-medium">{u.nombre}</div>
                <div className="truncate text-xs text-[var(--color-muted)]">
                  {u.email} {u.proveedor ? `· ${u.proveedor}` : ""} {!u.activo && "· Desactivado"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={u.roles?.id || ""}
                  onChange={(e) => cambiarRol(u.id, e.target.value)}
                  className="rounded-[var(--radius-input)] border border-[var(--color-border)] px-2 py-1 text-sm"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {nombreLegible(r.nombre)}
                    </option>
                  ))}
                </select>
                <Button variant={u.activo ? "danger" : "ghost"} onClick={() => alternarActivo(u)}>
                  {u.activo ? "Desactivar" : "Activar"}
                </Button>
              </div>
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
      <ul className="divide-y divide-[var(--color-border)]">
      {config.map((c) => (
        <li key={c.prioridad} className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="capitalize font-medium">{c.prioridad}</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              defaultValue={c.dias_habiles}
              onBlur={(e) => guardar(c.prioridad, Number(e.target.value))}
              className="w-20 rounded-[var(--radius-input)] border border-[var(--color-border)] px-2 py-1 text-sm"
            />
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
