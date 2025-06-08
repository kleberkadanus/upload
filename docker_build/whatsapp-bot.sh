#!/bin/bash

# Script para facilitar o gerenciamento do container WhatsApp Bot
# Uso: ./whatsapp-bot.sh [comando]
# Comandos disponíveis: start, stop, restart, status, logs

# Verificar se o Docker está instalado
if ! command -v docker &> /dev/null; then
    echo "Docker não está instalado. Por favor, instale o Docker primeiro."
    exit 1
fi

# Verificar se o Docker Compose está instalado
if ! command -v docker compose &> /dev/null; then
    echo "Docker Compose não está instalado. Por favor, instale o Docker Compose primeiro."
    exit 1
fi

# Função para iniciar os containers
start() {
    echo "Iniciando WhatsApp Bot e Dashboard..."
    docker compose up -d
    echo "Serviços iniciados com sucesso!"
    echo "- Bot WhatsApp: http://localhost:3000"
    echo "- Dashboard: http://localhost:5000"
}

# Função para parar os containers
stop() {
    echo "Parando WhatsApp Bot e Dashboard..."
    docker compose down
    echo "Serviços parados com sucesso!"
}

# Função para reiniciar os containers
restart() {
    echo "Reiniciando WhatsApp Bot e Dashboard..."
    docker compose restart
    echo "Serviços reiniciados com sucesso!"
}

# Função para verificar o status dos containers
status() {
    echo "Status dos serviços:"
    docker compose ps
} 

# Função para exibir logs dos containers
logs() {
    if [ -z "$2" ]; then
        echo "Exibindo logs de todos os serviços..."
        docker compose logs --tail=100 -f
    else
        echo "Exibindo logs do serviço $2..."
        docker compose logs --tail=100 -f "$2"
    fi
}

# Verificar o comando fornecido
case "$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    status)
        status
        ;;
    logs)
        logs "$@"
        ;;
    *)
        echo "Uso: $0 {start|stop|restart|status|logs [serviço]}"
        exit 1
        ;;
esac

exit 0
