FROM node:16-slim

# Instalar dependências do sistema para o bot WhatsApp
RUN apt-get update && apt-get install -y \
    gconf-service \
    libgbm-dev \
    libasound2 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    ca-certificates \
    fonts-liberation \
    libappindicator1 \
    libnss3 \
    lsb-release \
    xdg-utils \
    wget \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Criar diretório da aplicação
WORKDIR /usr/src/app

# Copiar package.json e package-lock.json
COPY whatsapp_bot_project/package*.json ./

# Instalar dependências do projeto
RUN npm install

# Copiar arquivos do bot WhatsApp
COPY whatsapp_bot_project/ ./

# Criar diretório para armazenar dados da sessão do WhatsApp
RUN mkdir -p ./.wwebjs_auth
RUN mkdir -p ./uploads

# Expor porta do bot WhatsApp
EXPOSE 3000

# Definir variáveis de ambiente
ENV NODE_ENV=production

# Configurar para iniciar automaticamente
LABEL com.centurylinklabs.watchtower.enable="true"

# Criar script de inicialização
RUN echo '#!/bin/bash\nnode index.js' > /usr/src/app/start.sh
RUN chmod +x /usr/src/app/start.sh

# Comando para iniciar a aplicação
CMD ["/usr/src/app/start.sh"]

# Configurar healthcheck para garantir que o container está funcionando corretamente
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 CMD node -e "try { require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1)); } catch (e) { process.exit(1); }"
