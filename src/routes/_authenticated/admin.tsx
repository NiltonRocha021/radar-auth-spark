import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { adminListUsers, adminGetUser, adminUpdateUser, adminCreateUser, adminSetRole, adminSetExecutionMode } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShieldAlert, UserPlus } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [
    { title: "Administração — AISignalRadar" },
    { name: "description", content: "Gerencie perfis, planos, permissões e o status do bot por usuário." },
    { property: "og:title", content: "Administração — AISignalRadar" },
    { property: "og:description", content: "Gestão segura de usuários, permissões e status do bot." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: (s: Record<string, unknown>) => ({ userId: typeof s.userId === "string" ? s.userId : undefined }),
  errorComponent: ({ error }) => (
    <div className="p-8 max-w-xl mx-auto">
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <ShieldAlert className="size-5 text-destructive" />
          <CardTitle>Acesso restrito</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "Não foi possível carregar a administração."}</CardContent>
      </Card>
    </div>
  ),
  notFoundComponent: () => <div className="p-8">Não encontrado</div>,
  component: AdminPage,
});

function AdminPage() {
  const { userId } = Route.useSearch();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const listFn = useServerFn(adminListUsers);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "users", search],
    queryFn: () => listFn({ data: { search: search || undefined } }),
  });

  if (error) throw error;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Painel Administrativo</h1>
        <p className="text-sm text-muted-foreground">Gerencie perfis e plano dos usuários. Todas as alterações são auditadas.</p>
      </div>

      <CreateUserCard />

      <div className="grid md:grid-cols-[360px_1fr] gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usuários</CardTitle>
            <Input
              placeholder="Buscar por email, nome ou usuário"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mt-2"
            />
          </CardHeader>
          <CardContent className="space-y-1 max-h-[70vh] overflow-auto">
            {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {data?.users.map((u: any) => (
              <button
                key={u.id}
                onClick={() => navigate({ to: "/admin", search: { userId: u.id } })}
                className={`w-full text-left p-2 rounded hover:bg-muted text-sm ${
                  userId === u.id ? "bg-muted" : ""
                }`}
              >
                <div className="font-medium truncate">{u.full_name || u.username || u.email}</div>
                <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{u.plan_tier ?? "free"}</Badge>
                   <Badge variant={u.executionMode === "LIVE" ? "default" : "secondary"} className="text-[10px]">
                     Modo {u.executionMode}
                  </Badge>
                </div>
              </button>
            ))}
            {data && data.users.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum usuário.</p>
            )}
          </CardContent>
        </Card>

        <div>{userId ? <UserDetail userId={userId} /> : <EmptyDetail />}</div>
      </div>
    </div>
  );
}

function EmptyDetail() {
  return (
    <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
      Selecione um usuário para editar.
    </CardContent></Card>
  );
}

function UserDetail({ userId }: { userId: string }) {
  const getFn = useServerFn(adminGetUser);
  const updateFn = useServerFn(adminUpdateUser);
  const setModeFn = useServerFn(adminSetExecutionMode);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "user", userId],
    queryFn: () => getFn({ data: { userId } }),
  });

  const [form, setForm] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async (updates: Record<string, string>) => updateFn({ data: { userId, updates } }),
    onSuccess: (r) => {
      toast.success(`Salvo (${r.changed} campo(s) alterado(s))`);
      setForm({});
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const modeMutation = useMutation({
    mutationFn: (mode: "DEMO" | "LIVE") => setModeFn({ data: { userId, mode } }),
    onSuccess: async (result) => {
      toast.success(`Modo ${result.mode} salvo para este perfil`);
      await qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Card><CardContent className="p-8">Carregando…</CardContent></Card>;
  if (error) return <Card><CardContent className="p-8 text-destructive">{(error as Error).message}</CardContent></Card>;
  if (!data) return null;

  const p = data.profile as Record<string, unknown>;
  const get = (k: string) => (k in form ? form[k] : ((p[k] as string | null) ?? ""));
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (Object.keys(form).length === 0) return toast.info("Nenhuma alteração");
    mutation.mutate(form);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {p.email as string}
            {data.roles.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}
            <Badge variant={data.botStatus === "LIVE" ? "default" : "outline"}>Bot {data.botStatus}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <Field label="Nome completo"><Input value={get("full_name")} onChange={(e) => set("full_name", e.target.value)} /></Field>
          <Field label="Usuário"><Input value={get("username")} onChange={(e) => set("username", e.target.value)} /></Field>
          <Field label="País"><Input value={get("country")} onChange={(e) => set("country", e.target.value)} /></Field>
          <Field label="Plano (service_role)">
            <Select value={get("plan_tier") || "free"} onValueChange={(v) => set("plan_tier", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="free">free</SelectItem>
                <SelectItem value="pro">pro</SelectItem>
                <SelectItem value="elite">elite</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Bio"><Input value={get("bio")} onChange={(e) => set("bio", e.target.value)} /></Field>
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setForm({})} disabled={mutation.isPending}>Reverter</Button>
            <Button onClick={submit} disabled={mutation.isPending}>
              {mutation.isPending ? "Salvando…" : "Salvar alterações"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <RolesCard userId={userId} roles={data.roles} />

      <Card>
        <CardHeader><CardTitle className="text-base">Modo de execução do perfil</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Button variant={data.executionMode === "DEMO" ? "default" : "outline"} onClick={() => modeMutation.mutate("DEMO")} disabled={modeMutation.isPending}>DEMO</Button>
            <Button variant={data.executionMode === "LIVE" ? "destructive" : "outline"} onClick={() => modeMutation.mutate("LIVE")} disabled={modeMutation.isPending || !data.credentialsValid}>REAL</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {data.credentialsValid ? "Credenciais Binance válidas neste perfil." : "REAL bloqueado: o usuário ainda não validou suas credenciais Binance."}
            {" · "}Estado do bot: {data.botStatus}.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Auditoria (últimas 50)</CardTitle></CardHeader>
        <CardContent>
          {data.audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma alteração registrada.</p>
          ) : (
            <div className="space-y-2 text-xs font-mono">
              {data.audit.map((a: any) => (
                <div key={a.id} className="border-l-2 border-muted pl-2">
                  <div className="text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()} · actor {a.actor_id.slice(0, 8)}
                  </div>
                  <div>
                    <span className="font-semibold">{a.field_name}</span>: {String(a.old_value)} → {String(a.new_value)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

const ROLE_INFO = [
  { role: "admin" as const, label: "Administrador", desc: "Acesso total ao painel administrativo e às permissões." },
  { role: "moderator" as const, label: "Moderador", desc: "Pode revisar conteúdo e apoiar usuários." },
  { role: "user" as const, label: "Usuário", desc: "Acesso padrão da plataforma." },
];

function RolesCard({ userId, roles }: { userId: string; roles: string[] }) {
  const setRoleFn = useServerFn(adminSetRole);
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (v: { role: "admin" | "moderator" | "user"; grant: boolean }) =>
      setRoleFn({ data: { userId, role: v.role, grant: v.grant } }),
    onSuccess: () => {
      toast.success("Permissões atualizadas");
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Permissões</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {ROLE_INFO.map((r) => (
          <div key={r.role} className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">{r.label}</div>
              <div className="text-xs text-muted-foreground">{r.desc}</div>
            </div>
            <Switch
              checked={roles.includes(r.role)}
              disabled={mutation.isPending}
              onCheckedChange={(checked) => mutation.mutate({ role: r.role, grant: checked })}
              aria-label={r.label}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CreateUserCard() {
  const createFn = useServerFn(adminCreateUser);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", fullName: "", username: "", planTier: "free", role: "user" });

  const mutation = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          email: form.email,
          password: form.password,
          fullName: form.fullName || undefined,
          username: form.username || undefined,
          planTier: form.planTier as "free" | "pro" | "elite",
          roles: [form.role as "admin" | "moderator" | "user"],
        },
      }),
    onSuccess: (r) => {
      toast.success("Conta criada com sucesso");
      setForm({ email: "", password: "", fullName: "", username: "", planTier: "free", role: "user" });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin"] });
      navigate({ to: "/admin", search: { userId: r.userId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="size-4" /> Criar novo perfil
        </CardTitle>
        <Button variant={open ? "ghost" : "default"} size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Cancelar" : "Novo usuário"}
        </Button>
      </CardHeader>
      {open && (
        <CardContent className="grid md:grid-cols-3 gap-4">
          <Field label="E-mail">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Senha provisória (mín. 8)">
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="Nome completo">
            <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </Field>
          <Field label="Usuário">
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </Field>
          <Field label="Plano">
            <Select value={form.planTier} onValueChange={(v) => setForm({ ...form, planTier: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="free">free</SelectItem>
                <SelectItem value="pro">pro</SelectItem>
                <SelectItem value="elite">elite</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Permissão inicial">
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Usuário</SelectItem>
                <SelectItem value="moderator">Moderador</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="md:col-span-3 flex justify-end">
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !form.email || form.password.length < 8}
            >
              {mutation.isPending ? "Criando…" : "Criar conta"}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
