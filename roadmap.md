# Roadmap

- [ ] Auditar e corrigir leitura real de mercado, sinais, operações, risco e alertas.
- [ ] Eliminar dados simulados ou rótulos enganosos nos fluxos identificados como reais.
- [ ] Validar atualização, reconexão, expiração e estados de erro dos dados operacionais.
- [ ] Revisar segurança, saúde da base e permissões dos fluxos reais.
- [ ] Validar sessão autenticada e telas críticas em desktop e celular.

- [x] Persistir modo DEMO/LIVE por usuário e conectar bot/ordens.
- [x] Isolar e criptografar credenciais Binance por perfil, com salvar, rotacionar, validar e revogar.
- [x] Adicionar controle DEMO/REAL na administração com auditoria.
- [x] Ligar risco, ROI, alertas e gráfico por par ao modo salvo.
- [x] Remover os rótulos “Em breve”.
- [ ] Validar sessão, conexão Binance sem ordem, desktop/celular e publicar.
- [x] Exigir confirmação explícita do titular antes de cada envio de ordem real.
- [x] Adicionar comparativo DEMO/REAL por perfil com ganhos, perdas e taxa de sucesso no dashboard.
- [x] Exibir carteira, capital disponível e capital em ordens para o modo salvo do perfil.
- [x] Atualizar risco, margem e alerta de perda quando o modo do perfil mudar.
- [x] Validar ordem Binance sem execução financeira e refletir a confirmação no dashboard e em Trades.
- [ ] Validar conta autenticada sem expor credenciais; credenciais reais continuam sendo salvas pelo titular no formulário seguro.

- [ ] Corrigir os achados confirmados da Auditoria Técnica — Rodada 2.
  - [x] Fechar exposição de alertas de manipulação e escrita direta financeira.
  - [ ] Exigir 2FA e interruptor global em todo fluxo REAL.
  - [ ] Substituir controles simulados da tela Segurança.
  - [ ] Validar testes, telas críticas e nova varredura de segurança.
