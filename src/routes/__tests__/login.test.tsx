// Testes de integração da tela de /login: Entrar, Criar conta e
// Esqueceu a senha. Foco em mensagens amigáveis e resiliência de render.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const signInWithPassword = vi.fn();
const signUp = vi.fn();
const resetPasswordForEmail = vi.fn();
const getUser = vi.fn(async () => ({ data: { user: null }, error: null }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: (...a: unknown[]) => signInWithPassword(...a),
      signUp: (...a: unknown[]) => signUp(...a),
      resetPasswordForEmail: (...a: unknown[]) => resetPasswordForEmail(...a),
      getUser: () => getUser(),
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
  },
}));

vi.mock("@/integrations/lovable", () => ({
  lovable: { auth: { signInWithOAuth: vi.fn(async () => ({ error: null })) } },
}));

const navigate = vi.fn();
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router",
  );
  return { ...actual, useNavigate: () => navigate };
});

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ session: null, user: null, loading: false }),
}));

import { Route } from "../login";

const LoginPage = Route.options.component as React.ComponentType;

function typeIn(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("Tela de login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInWithPassword.mockResolvedValue({ data: {}, error: null });
    signUp.mockResolvedValue({ data: { session: null }, error: null });
    resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  it("renderiza as abas e o formulário de entrada", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: "Entrar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Criar conta" })).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
  });

  it("valida campos vazios sem chamar o serviço de autenticação", async () => {
    render(<LoginPage />);
    fireEvent.submit(screen.getByLabelText("Senha").closest("form")!);
    await waitFor(() => expect(screen.getByText("Email inválido")).toBeTruthy());
    expect(screen.getByText("Informe sua senha")).toBeTruthy();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("mostra mensagem amigável quando as credenciais estão erradas", async () => {
    signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: "Invalid login credentials" },
    });
    render(<LoginPage />);
    typeIn("Email", "user@test.com");
    typeIn("Senha", "senha-qualquer");
    fireEvent.submit(screen.getByLabelText("Senha").closest("form")!);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Email ou senha incorretos."),
    );
  });

  it("traduz erro de email não confirmado e de excesso de tentativas", async () => {
    signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: "Email not confirmed" },
    });
    const { unmount } = render(<LoginPage />);
    typeIn("Email", "user@test.com");
    typeIn("Senha", "senha-qualquer");
    fireEvent.submit(screen.getByLabelText("Senha").closest("form")!);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Confirme seu email"),
    );
    unmount();

    signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: "Request rate limit reached" },
    });
    render(<LoginPage />);
    typeIn("Email", "user@test.com");
    typeIn("Senha", "senha-qualquer");
    fireEvent.submit(screen.getByLabelText("Senha").closest("form")!);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Muitas tentativas"),
    );
  });

  it("não quebra quando o serviço devolve erro sem mensagem", async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: { message: "" } });
    render(<LoginPage />);
    typeIn("Email", "user@test.com");
    typeIn("Senha", "senha-qualquer");
    fireEvent.submit(screen.getByLabelText("Senha").closest("form")!);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Não foi possível concluir"),
    );
    expect(screen.getByLabelText("Email")).toBeTruthy();
  });

  it("valida a força da senha no cadastro antes de enviar", async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    typeIn("Nome completo", "Nilton Rocha");
    typeIn("Email", "novo@test.com");
    typeIn("Senha", "fraca");
    typeIn("Confirmar senha", "fraca");
    fireEvent.submit(screen.getByLabelText("Senha").closest("form")!);
    await waitFor(() =>
      expect(screen.getByText("A senha deve ter no mínimo 12 caracteres")).toBeTruthy(),
    );
    expect(signUp).not.toHaveBeenCalled();
  });

  it("acusa senhas divergentes e termos não aceitos no cadastro", async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    typeIn("Nome completo", "Nilton Rocha");
    typeIn("Email", "novo@test.com");
    typeIn("Senha", "SenhaForte#2026");
    typeIn("Confirmar senha", "OutraSenha#2026");
    fireEvent.submit(screen.getByLabelText("Senha").closest("form")!);
    await waitFor(() => expect(screen.getByText("As senhas não conferem")).toBeTruthy());
    expect(screen.getByText("Aceite os termos para continuar")).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("mostra a tela de confirmação de email após cadastro válido", async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    typeIn("Nome completo", "Nilton Rocha");
    typeIn("Email", "novo@test.com");
    typeIn("Senha", "SenhaForte#2026");
    typeIn("Confirmar senha", "SenhaForte#2026");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(screen.getByLabelText("Senha").closest("form")!);
    await waitFor(() => expect(screen.getByText("Verifique seu email")).toBeTruthy());
    expect(screen.getByText("novo@test.com")).toBeTruthy();
    expect(signUp).toHaveBeenCalledTimes(1);
  });

  it("mostra mensagem amigável quando o email já está cadastrado", async () => {
    signUp.mockResolvedValue({
      data: { session: null },
      error: { message: "User already registered" },
    });
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    typeIn("Nome completo", "Nilton Rocha");
    typeIn("Email", "novo@test.com");
    typeIn("Senha", "SenhaForte#2026");
    typeIn("Confirmar senha", "SenhaForte#2026");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(screen.getByLabelText("Senha").closest("form")!);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Já existe uma conta"),
    );
    expect(screen.queryByText("Verifique seu email")).toBeNull();
  });

  it("envia o link de redefinição e mostra a confirmação", async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Esqueceu a senha?" }));
    typeIn("Email", "reset@test.com");
    fireEvent.submit(screen.getByLabelText("Email").closest("form")!);
    await waitFor(() =>
      expect(screen.getByText("Verifique sua caixa de entrada")).toBeTruthy(),
    );
    expect(screen.getByText("reset@test.com")).toBeTruthy();
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });

  it("mostra erro amigável e permite voltar quando a redefinição falha", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { message: "Failed to fetch" } });
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Esqueceu a senha?" }));
    typeIn("Email", "reset@test.com");
    fireEvent.submit(screen.getByLabelText("Email").closest("form")!);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Sem conexão com o servidor"),
    );
    fireEvent.click(screen.getByRole("button", { name: /Voltar/ }));
    expect(screen.getByLabelText("Senha")).toBeTruthy();
  });
});
