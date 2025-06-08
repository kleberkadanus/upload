
const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { google } = require("googleapis");

// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/calendar"];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

// Define o redirect URI explicitamente
const REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>} The OAuth2Client object.
 */
async function loadSavedCredentialsIfExist() {
  console.log("[AUTH] Tentando carregar credenciais salvas de", TOKEN_PATH);
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    console.log("[AUTH] Credenciais salvas encontradas.");
    // Certifique-se de que o cliente carregado também use o redirect_uri correto
    const client = google.auth.fromJSON(credentials);
    // A biblioteca pode não armazenar/recarregar o redirect_uri, então vamos garantir que ele esteja definido
    // Isso pode não ser estritamente necessário aqui, mas é bom garantir consistência
    // client._redirectUri = REDIRECT_URI; // A propriedade pode ser interna/diferente
    return client;
  } catch (err) {
    console.log("[AUTH] Credenciais salvas não encontradas ou inválidas.");
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client The client instance to serialize.
 * @return {Promise<void>} Promise that resolves when the file is written.
 */
async function saveCredentials(client) {
  console.log("[AUTH] Tentando ler credentials.json de", CREDENTIALS_PATH);
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
    access_token: client.credentials.access_token,
    expiry_date: client.credentials.expiry_date,
  });
  console.log("[AUTH] Salvando credenciais (token) em", TOKEN_PATH);
  await fs.writeFile(TOKEN_PATH, payload);
  console.log("[AUTH] Credenciais (token) salvas com sucesso.");
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    console.log("[AUTH] Usando credenciais salvas.");
    return client;
  }
  console.log("[AUTH] Iniciando novo fluxo de autenticação...");

  console.log("[AUTH] Lendo credentials.json...");
  const credentialsContent = await fs.readFile(CREDENTIALS_PATH);
  const credentials = JSON.parse(credentialsContent);
  const { client_secret, client_id } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    REDIRECT_URI // Usar o URI OOB explicitamente
  );

  console.log(`[AUTH] Gerando URL de autorização com redirect_uri: ${REDIRECT_URI}...`);
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    // prompt: 'consent', // Descomente para forçar a tela de consentimento sempre
  });

  console.log("[AUTH] URL de Autorização Gerada:");
  console.log("################################################################################");
  console.log(authUrl);
  console.log("################################################################################");
  console.log(
    "[AUTH] Por favor, peça ao seu assistente (Manus) para enviar esta URL para você."
  );
  console.log(
    "[AUTH] Visite a URL, autorize o acesso e cole o CÓDIGO DE AUTORIZAÇÃO aqui quando solicitado."
  );

  console.log("[AUTH] Script pausado. Aguardando código de autorização do usuário via Manus.");
  process.exit(0); // Termina o script aqui para esta etapa
}

// Inicia o processo de autorização (geração da URL)
authorize().catch(console.error);

