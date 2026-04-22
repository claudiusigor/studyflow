# StudyFlow v1 Beta - Checklist de Release

## 1) Smoke funcional (Desktop + Mobile)
- Abrir app e validar render inicial sem tela em branco.
- Clicar em `Começar foco` (hero) e confirmar início do Pomodoro.
- Clicar em `Nova tarefa` (hero) e confirmar abertura do modal.
- Clicar em `Editar layout` e confirmar troca para modo ajuste.
- Abrir `Matérias` e validar gerenciamento (adicionar/editar/excluir).
- Abrir `Humor` e registrar emoji do dia.
- Navegar para `Agenda` e adicionar/remover aula.

## 2) Regressão de dados (`localStorage`)
- Cenário limpo: remover dados e recarregar.
- Cenário legado: inserir dados corrompidos e recarregar.
- Confirmar migração automática de nomes/ícones e dados válidos preservados.

## 3) Tema e acessibilidade
- Alternar claro/escuro e validar persistência após reload.
- Verificar contraste em cards, listas, botões e labels.
- Navegar por teclado: foco visível, modais com `Tab` preso e `Esc` para fechar.

## 4) PWA e cache
- Validar registro do Service Worker.
- Atualizar versão e confirmar que nova build é carregada.
- Em offline, validar shell principal e ícones locais.

## 5) Backup e telemetria
- Exportar dados JSON.
- Importar dados JSON válidos e confirmar render após import.
- Exportar eventos de telemetria e validar conteúdo do arquivo.

## 6) Gate de release
- `npm test` totalmente verde.
- Zero bug crítico aberto.
- Todos os itens acima concluídos.
