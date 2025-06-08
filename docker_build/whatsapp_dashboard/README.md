# Dashboard Web Administrativa - WhatsApp Bot

## Visão Geral

Dashboard web completa desenvolvida em Flask para gerenciar e monitorar o bot WhatsApp. A interface oferece controle total sobre clientes, ordens de serviço, técnicos, financeiro e usuários do sistema.

## Funcionalidades Implementadas

### 1. Sistema de Autenticação
- **Login seguro** com diferentes níveis de acesso
- **Três tipos de usuário**:
  - **Admin**: Acesso total ao sistema
  - **Atendente**: Gerenciamento de clientes, ordens e financeiro
  - **Técnico**: Visualização de suas próprias ordens de serviço
- **Gerenciamento de usuários** (criação, edição, ativação/desativação)

### 2. Dashboard Principal
- **Estatísticas em tempo real**:
  - Total de clientes cadastrados
  - Ordens de serviço (pendentes, concluídas)
  - Faturamento e boletos pendentes
  - Técnicos ativos
- **Gráficos interativos**:
  - Ordens por status
  - Faturamento mensal
  - Tipos de interação com clientes
- **Alertas automáticos**:
  - Boletos vencidos
  - Ordens urgentes pendentes

### 3. Gerenciamento de Clientes
- **Lista completa** com busca e paginação
- **Detalhes do cliente**:
  - Histórico de agendamentos
  - Ordens de serviço
  - Faturas e pagamentos
- **Edição de dados** (nome, endereço)

### 4. Módulo Financeiro
- **Resumo financeiro** com estatísticas
- **Gerenciamento de faturas/boletos**:
  - Criação de novas faturas
  - Filtros por status (pendente, pago, vencido)
  - Busca por cliente ou descrição
- **Configuração PIX** para pagamentos
- **Relatórios financeiros** por período

### 5. Gerenciamento de Técnicos
- **Lista de técnicos** com status atual
- **Detalhes do técnico**:
  - Ordens atribuídas
  - Estatísticas de performance
  - Tempo médio de conclusão
- **Cadastro e edição** de técnicos
- **Relatórios de performance** por período

### 6. Ordens de Serviço
- **Lista completa** com filtros avançados
- **Detalhes da ordem**:
  - Informações do cliente
  - Técnico responsável
  - Fotos do serviço (antes, embalagens, depois)
  - Status e histórico
- **Criação de novas ordens**
- **Atualização de status** e notas
- **Mapa de técnicos** e ordens ativas

## Estrutura Técnica

### Arquitetura
```
whatsapp_dashboard/
├── src/
│   ├── main.py              # Aplicação principal Flask
│   ├── models/              # Modelos de dados
│   │   ├── user.py          # Modelo de usuários
│   │   └── dashboard_stats.py # Estatísticas do dashboard
│   ├── routes/              # Rotas da aplicação
│   │   ├── auth.py          # Autenticação e usuários
│   │   ├── dashboard.py     # Dashboard principal
│   │   ├── clients.py       # Gerenciamento de clientes
│   │   ├── financial.py     # Módulo financeiro
│   │   ├── technicians.py   # Gerenciamento de técnicos
│   │   └── service_orders.py # Ordens de serviço
│   ├── templates/           # Templates HTML
│   └── static/              # Arquivos estáticos
├── venv/                    # Ambiente virtual Python
└── requirements.txt         # Dependências
```

### Integração com Banco de Dados
- **Conecta ao mesmo banco** do bot WhatsApp (WTS2)
- **Utiliza tabelas existentes**:
  - `clients` - Dados dos clientes
  - `appointments` - Agendamentos
  - `service_orders` - Ordens de serviço
  - `technicians` - Técnicos cadastrados
  - `invoices` - Faturas/boletos
  - `settings` - Configurações do sistema
- **Cria tabela adicional**:
  - `dashboard_users` - Usuários da dashboard

## Instruções de Uso

### 1. Instalação e Configuração
```bash
cd whatsapp_dashboard
source venv/bin/activate
pip install -r requirements.txt
python src/main.py
```

### 2. Primeiro Acesso
- **URL**: http://localhost:5000
- **Usuário padrão**: admin
- **Senha padrão**: admin123
- **Recomendação**: Alterar senha após primeiro login

### 3. Criação de Usuários
1. Faça login como admin
2. Acesse "Usuários" no menu lateral
3. Clique em "Novo Usuário"
4. Preencha os dados e selecione o nível de acesso
5. O usuário poderá fazer login imediatamente

### 4. Navegação Principal
- **Dashboard**: Visão geral e estatísticas
- **Clientes**: Gerenciamento de clientes do bot
- **Ordens de Serviço**: Controle de atendimentos técnicos
- **Técnicos**: Gerenciamento da equipe técnica
- **Financeiro**: Controle de faturas e pagamentos
- **Usuários**: Administração de acessos (apenas admin)

## Permissões por Tipo de Usuário

### Administrador
- ✅ Acesso total a todos os módulos
- ✅ Gerenciamento de usuários
- ✅ Relatórios completos
- ✅ Configurações do sistema

### Atendente
- ✅ Visualização e edição de clientes
- ✅ Gerenciamento de ordens de serviço
- ✅ Acesso ao módulo financeiro
- ❌ Gerenciamento de usuários
- ❌ Configurações avançadas

### Técnico
- ✅ Visualização de suas ordens de serviço
- ✅ Atualização de status das ordens
- ❌ Acesso a outros módulos
- ❌ Dados de outros técnicos

## Design e Interface

### Características Visuais
- **Design moderno** com bordas quadradas conforme solicitado
- **Cores do WhatsApp** (verde #25D366, #128C7E, #075E54)
- **Interface responsiva** para desktop e mobile
- **Navegação intuitiva** com sidebar e breadcrumbs
- **Ícones Font Awesome** para melhor usabilidade

### Componentes
- **Cards informativos** com estatísticas
- **Tabelas responsivas** com paginação
- **Formulários validados** com feedback visual
- **Alertas contextuais** para ações importantes
- **Gráficos interativos** com Chart.js

## Próximos Passos Sugeridos

### Melhorias Futuras
1. **Notificações em tempo real** via WebSocket
2. **Exportação de relatórios** em PDF/Excel
3. **Integração com Google Maps** para visualização de rotas
4. **Sistema de backup** automático
5. **API REST** para integrações externas
6. **Aplicativo mobile** complementar

### Customizações Possíveis
1. **Temas personalizados** por empresa
2. **Campos adicionais** conforme necessidade
3. **Relatórios customizados** por setor
4. **Integrações específicas** com outros sistemas
5. **Automações avançadas** de workflow

## Suporte e Manutenção

### Logs e Monitoramento
- **Logs de erro** são exibidos no console
- **Ações de usuário** são registradas automaticamente
- **Estatísticas** são calculadas em tempo real

### Backup e Segurança
- **Senhas criptografadas** com hash seguro
- **Sessões protegidas** com chave secreta
- **Validação de entrada** em todos os formulários
- **Controle de acesso** por permissões

---

**Dashboard desenvolvida especificamente para integração com o bot WhatsApp, oferecendo controle completo e interface moderna conforme especificações solicitadas.**
