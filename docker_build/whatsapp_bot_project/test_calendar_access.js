
const { google } = require("googleapis");
const path = require("path");

// Caminho para o arquivo da chave da conta de serviço
const KEYFILEPATH = path.join(__dirname, "service_account.json");

// Escopo necessário para acessar o Google Calendar
const SCOPES = ["https://www.googleapis.com/auth/calendar"];

// ID da agenda a ser acessada (geralmente o e-mail do proprietário ou um ID específico)
const CALENDAR_ID = "kleberkadanus94@gmail.com";

// Cria um cliente JWT para autenticação com a conta de serviço
const auth = new google.auth.GoogleAuth({
  keyFile: KEYFILEPATH,
  scopes: SCOPES,
});

async function testCalendarAccess() {
  try {
    console.log(`[TESTE CALENDAR] Autenticando com ${KEYFILEPATH}...`);
    const client = await auth.getClient();
    console.log("[TESTE CALENDAR] Autenticação bem-sucedida.");

    const calendar = google.calendar({ version: "v3", auth: client });
    console.log(`[TESTE CALENDAR] Acessando agenda: ${CALENDAR_ID}...`);

    // Lista os próximos 10 eventos na agenda principal
    const res = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = res.data.items;
    if (!events || events.length === 0) {
      console.log("[TESTE CALENDAR] Nenhum evento futuro encontrado na agenda.");
      console.log("[TESTE CALENDAR] Acesso à agenda validado com sucesso!");
      return;
    }

    console.log("[TESTE CALENDAR] Próximos 10 eventos:");
    events.map((event, i) => {
      const start = event.start.dateTime || event.start.date;
      console.log(`- ${start} - ${event.summary}`);
    });
    console.log("[TESTE CALENDAR] Acesso à agenda validado com sucesso!");

  } catch (err) {
    console.error("[TESTE CALENDAR] Erro ao acessar o Google Calendar:", err.message);
    if (err.response && err.response.data) {
        console.error("Detalhes do erro:", JSON.stringify(err.response.data, null, 2));
    }
    console.error("[TESTE CALENDAR] Verifique se o arquivo service_account.json está correto e se a agenda foi compartilhada com o e-mail da conta de serviço com permissão para 'Fazer alterações nos eventos'.");
  }
}

testCalendarAccess();

