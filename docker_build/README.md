# WhatsApp Bot e Dashboard Administrativo

Este projeto contém um bot WhatsApp completo com dashboard administrativo, empacotados em containers Docker para fácil implantação e execução.

## Estrutura do Projeto

O projeto é composto por dois componentes principais:

1. **Bot WhatsApp**: Sistema de atendimento automatizado via WhatsApp com módulos para técnicos, financeiro, agendamento e mais.
2. **Dashboard Administrativo**: Interface web para gerenciamento de clientes, técnicos, ordens de serviço e relatórios.

## Requisitos

- Docker
- Docker Compose

## Instruções de Instalação

### 1. Baixar as imagens do Docker Hub

```bash
docker pull kasbysuporttech/whatsapp-bot:latest
docker pull kasbysuporttech/whatsapp-dashboard:latest
```

### 2. Baixar o arquivo docker-compose.yml

Salve o arquivo `docker-compose.yml` fornecido em um diretório de sua preferência.

### 3. Iniciar os serviços

```bash
docker-compose up -d
```

Ou, usando o script auxiliar:

```bash
chmod +x whatsapp-bot.sh
./whatsapp-bot.sh start
```

## Acesso aos Serviços

- **Bot WhatsApp**: http://localhost:3000
- **Dashboard Administrativo**: http://localhost:5000

## Credenciais Padrão

Para acessar o dashboard administrativo:
- **Usuário**: admin
- **Senha**: admin123

## Comandos Úteis

O script `whatsapp-bot.sh` fornece comandos úteis para gerenciar os serviços:

- **Iniciar**: `./whatsapp-bot.sh start`
- **Parar**: `./whatsapp-bot.sh stop`
- **Reiniciar**: `./whatsapp-bot.sh restart`
- **Status**: `./whatsapp-bot.sh status`
- **Logs**: `./whatsapp-bot.sh logs`

## Funcionalidades Principais

### Bot WhatsApp
- Fluxo de primeiro contato e clientes recorrentes
- Módulo financeiro (boletos, PIX)
- Módulo para técnicos com integração Google Maps
- Sistema de agendamento
- Anexo de fotos

### Dashboard Administrativo
- Autenticação com diferentes níveis de acesso
- Estatísticas gerais de atendimento
- Relatórios financeiros
- Gerenciamento de técnicos e rotas
- Controle de ordens de serviço

## Persistência de Dados

Os dados são persistidos em volumes Docker:
- `whatsapp_data`: Dados de autenticação do WhatsApp
- `whatsapp_uploads`: Arquivos enviados pelos usuários
- `db_data`: Banco de dados MariaDB

## Configuração Avançada

Para configurações avançadas, edite o arquivo `docker-compose.yml` antes de iniciar os serviços.

## Suporte

Para suporte ou dúvidas, entre em contato com a equipe de desenvolvimento.
