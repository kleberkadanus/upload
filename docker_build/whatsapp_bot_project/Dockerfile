FROM node:16-slim

# Instalar dependências do sistema
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
    && rm -rf /var/lib/apt/lists/*

# Criar diretório da aplicação
WORKDIR /usr/src/app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências do projeto
RUN npm install

# Copiar arquivos do projeto
COPY . .

# Criar diretório para armazenar dados da sessão do WhatsApp
RUN mkdir -p ./.wwebjs_auth

# Expor porta (se necessário)
EXPOSE 8080

# Definir variáveis de ambiente
ENV NODE_ENV=production

# Configurar para iniciar automaticamente
LABEL com.centurylinklabs.watchtower.enable="true"

# Comando para iniciar a aplicação
CMD ["node", "index.js"]

# Configurar healthcheck para garantir que o container está funcionando corretamente
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 CMD node -e "try { require('http').get('http://localhost:8080/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1)); } catch (e) { process.exit(1); }"
