
const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { google } = require("googleapis");

// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/calendar"];
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

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
  // Use 'installed' key for Desktop app credentials
  const key = keys.installed || keys.web; 
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
    // Incluir access_token e expiry_date também pode ser útil
    access_token: client.credentials.access_token,
    expiry_date: client.credentials.expiry_date,
  });
  console.log("[AUTH] Salvando credenciais (token) em", TOKEN_PATH);
  await fs.writeFile(TOKEN_PATH, payload);
  console.log("[AUTH] Credenciais (token) salvas com sucesso em", TOKEN_PATH);
}

/**
 * Exchange the authorization code for tokens.
 *
 * @param {string} code The authorization code obtained from the user.
 */
async function exchangeCodeForToken(code) {
  console.log("[AUTH] Lendo credentials.json...");
  const credentialsContent = await fs.readFile(CREDENTIALS_PATH);
  const credentials = JSON.parse(credentialsContent);
  // CORREÇÃO: Usar .installed para credenciais Desktop app
  const { client_secret, client_id, redirect_uris } = credentials.installed; 
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0] // Usar o primeiro URI configurado (geralmente http://localhost para Desktop)
  );

  try {
    console.log(`[AUTH] Trocando código '${code}' por token...`);
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    console.log("[AUTH] Tokens obtidos com sucesso:", tokens);
    await saveCredentials(oAuth2Client);
    console.log("[AUTH] Autenticação concluída e tokens salvos!");
    return oAuth2Client;
  } catch (err) {
    console.error("[AUTH] Erro ao trocar código por token:", err.response ? err.response.data : err.message);
    process.exit(1);
  }
}

// Pega o código do argumento da linha de comando
const authCode = process.argv[2];

if (!authCode) {
  console.error("Erro: Código de autorização não fornecido.");
  console.log("Uso: node exchange_token.js <codigo_de_autorizacao>");
  process.exit(1);
}

console.log(`[AUTH] Código recebido: ${authCode}`);
exchangeCodeForToken(authCode).catch(console.error);

