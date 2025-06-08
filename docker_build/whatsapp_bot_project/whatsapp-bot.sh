#!/bin/bash

# Script para facilitar a execução do container WhatsApp Bot
# Autor: Kadan Tech
# Data: 07/06/2025

# Verifica se o Docker está instalado
if ! command -v docker &> /dev/null; then
    echo "Docker não está instalado. Por favor, instale o Docker primeiro."
    exit 1
fi

# Verifica se o Docker Compose está instalado
if ! command -v docker-compose &> /dev/null; then
    echo "Docker Compose não está instalado. Por favor, instale o Docker Compose primeiro."
    exit 1
fi

# Função para iniciar o container
start_container() {
    echo "Iniciando WhatsApp Bot..."
    docker start whatsapp-bot || docker-compose up -d
    echo "WhatsApp Bot iniciado com sucesso!"
}

# Função para parar o container
stop_container() {
    echo "Parando WhatsApp Bot..."
    docker stop whatsapp-bot
    echo "WhatsApp Bot parado com sucesso!"
}

# Função para reiniciar o container
restart_container() {
    echo "Reiniciando WhatsApp Bot..."
    docker restart whatsapp-bot
    echo "WhatsApp Bot reiniciado com sucesso!"
}

# Função para verificar o status do container
status_container() {
    echo "Verificando status do WhatsApp Bot..."
    docker ps -a | grep whatsapp-bot
}

# Função para visualizar logs do container
logs_container() {
    echo "Exibindo logs do WhatsApp Bot..."
    docker logs -f whatsapp-bot
}

# Menu de ajuda
show_help() {
    echo "Uso: $0 [comando]"
    echo "Comandos:"
    echo "  start    - Inicia o WhatsApp Bot"
    echo "  stop     - Para o WhatsApp Bot"
    echo "  restart  - Reinicia o WhatsApp Bot"
    echo "  status   - Verifica o status do WhatsApp Bot"
    echo "  logs     - Exibe os logs do WhatsApp Bot"
    echo "  help     - Exibe este menu de ajuda"
}

# Verifica o comando fornecido
case "$1" in
    start)
        start_container
        ;;
    stop)
        stop_container
        ;;
    restart)
        restart_container
        ;;
    status)
        status_container
        ;;
    logs)
        logs_container
        ;;
    help|*)
        show_help
        ;;
esac

exit 0
