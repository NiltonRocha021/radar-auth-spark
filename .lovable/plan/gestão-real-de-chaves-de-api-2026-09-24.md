# Gestão real de chaves de API

## Entrega
- Substituir o aviso “Em breve” por uma tela funcional nas Configurações e na área de API.
- Permitir criar uma chave com nome, copiar o valor uma única vez, rotacionar e revogar.
- Exibir somente prefixo/sufixo seguro, status, criação, último uso e quantidade de requisições do dia.
- Incluir estados de carregamento, vazio e erro, além de confirmações antes de ações destrutivas.

## Segurança e dados
- Criar uma tabela privada por usuário para armazenar apenas o hash da chave, nunca o valor completo.
- Aplicar acesso por usuário, permissões explícitas e regras de segurança no banco.
- Gerar as chaves no servidor com aleatoriedade criptográfica e registrar rotação/revogação.
- Limitar a quantidade de chaves ativas por usuário e validar nomes e entradas.

## Uso e monitoramento
- Criar a base de autenticação por chave para endpoints públicos do AISignalRadar.
- Disponibilizar um endpoint real de sinais protegido pela chave para que o contador, último uso e status sejam atualizados.
- Atualizar os exemplos de integração para o endereço publicado do projeto e documentar que a chave aparece somente na criação/rotação.

## Validação
- Testar criação, cópia, rotação, revogação e isolamento entre usuários.
- Confirmar no navegador que a tela permanece íntegra em desktop e celular.
- Verificar compilação, testes e segurança antes de publicar uma nova versão.
