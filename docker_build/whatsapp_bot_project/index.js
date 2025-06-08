
const qrcodeTerminal = require("qrcode-terminal");
const qrcode = require("qrcode");
const fs = require("fs");
const { Client, LocalAuth, MessageMedia, List, Buttons } = require("whatsapp-web.js");
const mariadb = require("mariadb");
const { google } = require("googleapis");
const path = require("path");
const { Client: GoogleMapsClient } = require("@googlemaps/google-maps-services-js");
const financeModule = require("./finance_module.js"); // Added Finance Module
const technicianModule = require("./technician_module.js"); // Added Technician Module

// --- Database Configuration ---
const pool = mariadb.createPool({
  host: "104.234.30.102",
  user: "root",
  password: "+0q)3E3.G]Yu",
  database: "WTS2",
  connectionLimit: 5,
  connectTimeout: 15000,
  acquireTimeout: 15000,
});

// --- Google Calendar Configuration ---
const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar"];
const SERVICE_ACCOUNT_KEY_PATH = path.join(__dirname, "service_account.json");
const CALENDAR_ID = "kleberkadanus94@gmail.com"; // User's main calendar

const googleAuth = new google.auth.GoogleAuth({
  keyFile: SERVICE_ACCOUNT_KEY_PATH,
  scopes: CALENDAR_SCOPES,
});

const calendar = google.calendar({ version: "v3", auth: googleAuth });

// --- WhatsApp Client Setup ---
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

// Store conversation state for each user { senderId: { state: ..., data: {} } }
const userState = {};
global.userState = userState; // Make userState globally accessible for modules
const QR_FILE_PATH = "/home/ubuntu/whatsapp_bot_project/qrcode.png";

client.on("qr", (qr) => {
  console.log("[EVENTO QR] QR Code recebido. Tentando salvar como imagem...");
  qrcode.toFile(QR_FILE_PATH, qr, { errorCorrectionLevel: "H" }, function (err) {
    if (err) {
      console.error("[ERRO QR] Erro ao salvar QR code como imagem:", err);
      console.log(
        "[QR ALTERNATIVO] Exibindo QR code no terminal (pode ser grande):"
      );
      qrcodeTerminal.generate(qr, { small: true });
    } else {
      console.log(`[QR SALVO] QR Code salvo como imagem em: ${QR_FILE_PATH}`);
      console.log(
        "[AÇÃO NECESSÁRIA] Peça ao seu assistente (Manus) para enviar o arquivo qrcode.png para você."
      );
    }
  });
});

client.on("ready", () => {
  console.log("[EVENTO READY] Cliente WhatsApp está pronto!");
  if (fs.existsSync(QR_FILE_PATH)) {
    try {
      fs.unlinkSync(QR_FILE_PATH);
      console.log(`[INFO] Arquivo QR code (${QR_FILE_PATH}) removido após conexão.`);
    } catch (unlinkErr) {
      console.error(`[ERRO] Falha ao remover arquivo QR code: ${unlinkErr.message}`);
    }
  }
});

client.on("auth_failure", (msg) => {
  console.error("[EVENTO AUTH_FAILURE] Falha na autenticação:", msg);
});

client.on("disconnected", (reason) => {
  console.log("[EVENTO DISCONNECTED] Cliente foi desconectado:", reason);
});

// --- Helper Functions (showMainMenu, showThankYouAndRating, handleMenuChoice) ---
async function showMainMenu(senderId, clientName, dbConnection, clientId, whatsappClientInstance = client) {
    let conn = dbConnection;
    let connectionReleasedOrNotOwned = false;
    try {
        if (!conn) {
            conn = await pool.getConnection();
        } else {
            connectionReleasedOrNotOwned = true; // Assume connection is managed externally
        }

        const greeting = clientName ? `Olá ${clientName}, ` : "";
        const menuMessage = `${greeting}Como posso te ajudar hoje?\n\n1. Financeiro (PIX, Boletos)\n2. Agendar Serviço Técnico\n3. Dúvidas / Falar com Atendente\n4. Informações sobre Serviços\n5. Cancelar Agendamento\n\nDigite o número da opção desejada:`;
        
        userState[senderId] = { state: "awaiting_menu_choice", data: { name: clientName, clientId: clientId } };
        console.log(`[ESTADO] Estado atualizado para awaiting_menu_choice para ${senderId}`);
        await whatsappClientInstance.sendMessage(senderId, menuMessage);
    } catch (error) {
        console.error("[ERRO] Falha ao mostrar menu principal:", error);
        await whatsappClientInstance.sendMessage(senderId, "Desculpe, ocorreu um erro. Tente novamente.");
        delete userState[senderId];
    } finally {
        if (conn && !connectionReleasedOrNotOwned) {
            conn.release();
        }
    }
}

async function showThankYouAndRating(senderId, clientId, interactionType, dbConnection, whatsappClientInstance = client) {
    let conn = dbConnection;
    let connectionReleasedOrNotOwned = false;
    try {
        if (!conn) {
            conn = await pool.getConnection();
        } else {
            connectionReleasedOrNotOwned = true;
        }

        const dailyPhraseResult = await conn.query("SELECT phrase FROM daily_phrases ORDER BY RAND() LIMIT 1");
        const dailyPhrase = dailyPhraseResult.length > 0 ? dailyPhraseResult[0].phrase : "Agradecemos seu contato!";

        await whatsappClientInstance.sendMessage(senderId, `${dailyPhrase}\n\nComo você avalia este atendimento/interação? (Digite um número de 1 a 5 estrelas)`);
        userState[senderId] = { state: "awaiting_rating", data: { clientId: clientId, reviewType: interactionType } };
        console.log(`[ESTADO] Estado atualizado para awaiting_rating para ${senderId} (Interação: ${interactionType})`);
    } catch (error) {
        console.error("[ERRO] Falha ao mostrar agradecimento/avaliação:", error);
        await whatsappClientInstance.sendMessage(senderId, "Obrigado pelo seu contato!");
        delete userState[senderId]; // Clear state on error to avoid loop
    } finally {
        if (conn && !connectionReleasedOrNotOwned) {
            conn.release();
        }
    }
}

async function handleMenuChoice(senderId, choice, stateInfo, currentClient, dbConnection, whatsappClientInstance = client) {
    let conn = dbConnection;
    let connectionReleasedOrNotOwned = false;
    try {
        if (!conn) {
            conn = await pool.getConnection();
        } else {
            connectionReleasedOrNotOwned = true;
        }

        const clientId = currentClient ? currentClient.id : stateInfo.data.clientId;

        switch (choice) {
            case "1": // Financeiro
                stateInfo.state = "awaiting_finance_choice";
                userState[senderId] = stateInfo;
                console.log(`[ESTADO] Estado atualizado para awaiting_finance_choice para ${senderId}`);
                if (clientId) {
                    await conn.query("UPDATE clients SET last_interaction_type = 'Financeiro', last_interaction_at = NOW() WHERE id = ?", [clientId]);
                    console.log(`[DB] Last interaction type for client ${clientId} updated to Financeiro.`);
                }
                // financeModule.processFinanceState will be called on the next message and will send the finance menu.
                // To send menu immediately:
                const financeMenuText = `*Financeiro*\n\nEscolha uma opção:\n1. Consultar Chave PIX\n2. Consultar Faturas/Boletos\n3. Enviar Comprovante de Pagamento`;
                await whatsappClientInstance.sendMessage(senderId, financeMenuText);
                break;
            case "2": // Agendar Serviço Técnico
                stateInfo.state = "awaiting_specialty";
                userState[senderId] = stateInfo;
                console.log(`[ESTADO] Estado atualizado para awaiting_specialty para ${senderId}`);
                if (clientId) {
                     await conn.query("UPDATE clients SET last_interaction_type = 'Agendamento', last_interaction_at = NOW() WHERE id = ?", [clientId]);
                     console.log(`[DB] Last interaction type for client ${clientId} updated to Agendamento.`);
                }
                await whatsappClientInstance.sendMessage(senderId, "Qual especialidade você precisa? (Ex: Informática, Eletricista, Encanador)");
                break;
            case "3": // Dúvidas / Falar com Atendente
                stateInfo.state = "awaiting_support_reason";
                userState[senderId] = stateInfo;
                console.log(`[ESTADO] Estado atualizado para awaiting_support_reason para ${senderId}`);
                if (clientId) {
                    await conn.query("UPDATE clients SET last_interaction_type = 'Suporte Atendente', last_interaction_at = NOW() WHERE id = ?", [clientId]);
                    console.log(`[DB] Last interaction type for client ${clientId} updated to Suporte Atendente.`);
                }
                await whatsappClientInstance.sendMessage(senderId, "Por favor, descreva brevemente o motivo do seu contato para que possamos direcioná-lo ao melhor atendente.");
                break;
            case "4": // Informações sobre Serviços
                stateInfo.state = "awaiting_info_request";
                userState[senderId] = stateInfo;
                console.log(`[ESTADO] Estado atualizado para awaiting_info_request para ${senderId}`);
                if (clientId) {
                    await conn.query("UPDATE clients SET last_interaction_type = 'Informações', last_interaction_at = NOW() WHERE id = ?", [clientId]);
                    console.log(`[DB] Last interaction type for client ${clientId} updated to Informações.`);
                }
                await whatsappClientInstance.sendMessage(senderId, "Sobre qual serviço você gostaria de informações?");
                break;
            case "5": // Cancelar Agendamento
                stateInfo.state = "awaiting_cancel_confirmation";
                userState[senderId] = stateInfo;
                console.log(`[ESTADO] Estado atualizado para awaiting_cancel_confirmation para ${senderId}`);
                if (clientId) {
                    await conn.query("UPDATE clients SET last_interaction_type = 'Cancelamento', last_interaction_at = NOW() WHERE id = ?", [clientId]);
                    console.log(`[DB] Last interaction type for client ${clientId} updated to Cancelamento.`);
                }
                const upcomingAppointments = await conn.query("SELECT id, specialty, scheduled_datetime FROM appointments WHERE client_id = ? AND status = 'scheduled' AND scheduled_datetime > NOW() ORDER BY scheduled_datetime ASC", [clientId]);
                if (upcomingAppointments.length === 0) {
                    await whatsappClientInstance.sendMessage(senderId, "Você não possui agendamentos futuros para cancelar.");
                    await showMainMenu(senderId, stateInfo.data.name, conn, clientId, whatsappClientInstance);
                } else {
                    let cancelMsg = "Seus próximos agendamentos:\n";
                    upcomingAppointments.forEach((appt, index) => {
                        cancelMsg += `${index + 1}. ${appt.specialty} - ${new Date(appt.scheduled_datetime).toLocaleString('pt-BR')}\n`;
                    });
                    cancelMsg += "\nDigite o número do agendamento que deseja cancelar ou '0' para voltar.";
                    stateInfo.data.appointments_to_cancel = upcomingAppointments;
                    await whatsappClientInstance.sendMessage(senderId, cancelMsg);
                }
                break;
            default:
                await whatsappClientInstance.sendMessage(senderId, "Opção inválida. Por favor, digite o número de uma das opções do menu.");
                break;
        }
    } catch (error) {
        console.error("[ERRO] Falha ao processar escolha do menu:", error);
        await whatsappClientInstance.sendMessage(senderId, "Desculpe, ocorreu um erro ao processar sua escolha. Tente novamente.");
        delete userState[senderId];
    } finally {
        if (conn && !connectionReleasedOrNotOwned) {
            conn.release();
        }
    }
}

// --- Message Handling Logic ---
client.on("message", async (msg) => {
  const chat = await msg.getChat();
  const contact = await msg.getContact();
  const senderNumber = contact.id.user;
  const senderId = contact.id._serialized;
  let conn;

  console.log(
    `[MSG RECEBIDA] De: ${senderNumber} (${contact.pushname || "N/A"}) | Chat: ${chat.id.user} | Tipo: ${msg.type} | Corpo: ${msg.body}`
  );

  if (chat.isGroup || msg.isStatus) {
    console.log("[INFO] Ignorando msg de grupo/status.");
    return;
  }

  try {
    conn = await pool.getConnection();

    // Verificar se é um comando de atendente ou técnico
    if (msg.body.startsWith("/")) {
      const commandParts = msg.body.split(" ");
      const command = commandParts[0].toLowerCase();
      const params = commandParts.slice(1).join(" ");

      const isAttendantResult = await conn.query(
        "SELECT id, name FROM attendants WHERE whatsapp_number = ? AND status != 'inactive'", // Consider only active attendants
        [senderNumber]
      );

      if (isAttendantResult.length > 0) {
        const attendantId = isAttendantResult[0].id;
        const attendantName = isAttendantResult[0].name;
        await conn.query(
          "UPDATE attendants SET last_activity = NOW() WHERE id = ?",
          [attendantId]
        );

        // Try to process as a finance command first for attendants
        const isFinanceAttendantCommand = await financeModule.processFinanceCommand(client, conn, senderId, senderNumber, command, params);
        if (isFinanceAttendantCommand) {
            if (conn) conn.release();
            return; // Command handled by finance module
        }

        // If not a finance command, proceed with other attendant commands
        switch (command) {
            case '/finalizar':
                const activeTickets = await conn.query(
                    "SELECT sq.id, sq.whatsapp_number, c.name, c.id as client_id FROM support_queue sq JOIN clients c ON sq.client_id = c.id WHERE sq.assigned_to = ? AND sq.status = 'in_progress'",
                    [attendantId]
                );
                if (activeTickets.length === 0) {
                    await client.sendMessage(senderId, "Você não possui nenhum atendimento em andamento para finalizar.");
                    break;
                }
                for (const ticket of activeTickets) {
                    await conn.query("UPDATE support_queue SET status = 'completed', ended_at = NOW() WHERE id = ?", [ticket.id]);
                    const clientId = `${ticket.whatsapp_number}@c.us`;
                    await showThankYouAndRating(clientId, ticket.client_id, `Suporte com ${attendantName}`, conn, client);
                }
                const waitingClients = await conn.query(
                    "SELECT sq.id, sq.whatsapp_number, c.id as client_id, c.name FROM support_queue sq JOIN clients c ON sq.client_id = c.id WHERE sq.status = 'waiting' ORDER BY sq.created_at ASC LIMIT 1"
                );
                if (waitingClients.length > 0) {
                    const nextClient = waitingClients[0];
                    await conn.query("UPDATE support_queue SET status = 'in_progress', assigned_to = ?, started_at = NOW() WHERE id = ?", [attendantId, nextClient.id]);
                    const clientInfo = `Nome: ${nextClient.name}\nTelefone: ${nextClient.whatsapp_number}`;
                    await client.sendMessage(senderId, `✅ Atendimento(s) anterior(es) finalizado(s).\n\n🔔 *Próximo Cliente na Fila*\n\n${clientInfo}\n\nPara iniciar a conversa, use o comando:\n/falarcom ${nextClient.whatsapp_number}`);
                    const nextClientId = `${nextClient.whatsapp_number}@c.us`;
                    await client.sendMessage(nextClientId, `Olá! O atendente ${attendantName} está disponível e irá atendê-lo em instantes.`);
                } else {
                    await client.sendMessage(senderId, "✅ Atendimento(s) finalizado(s). Não há mais clientes na fila de espera.");
                    await conn.query("UPDATE attendants SET status = 'available' WHERE id = ?", [attendantId]);
                }
                break;
            case '/falarcom':
                if (!params) {
                    await client.sendMessage(senderId, "Por favor, forneça o número do cliente. Exemplo: /falarcom 5541999999999");
                    break;
                }
                const clientNumberToTalk = params.trim();
                const clientIdToTalk = `${clientNumberToTalk}@c.us`;
                const clientExists = await conn.query("SELECT id, name FROM clients WHERE whatsapp_number = ?", [clientNumberToTalk]);
                if (clientExists.length === 0) {
                    await client.sendMessage(senderId, `Cliente com número ${clientNumberToTalk} não encontrado no sistema.`);
                    break;
                }
                const existingTicket = await conn.query("SELECT id, assigned_to FROM support_queue WHERE whatsapp_number = ? AND status = 'in_progress'", [clientNumberToTalk]);
                if (existingTicket.length > 0 && existingTicket[0].assigned_to !== attendantId) {
                    const otherAttendant = await conn.query("SELECT name FROM attendants WHERE id = ?", [existingTicket[0].assigned_to]);
                    const otherAttendantName = otherAttendant.length > 0 ? otherAttendant[0].name : "outro atendente";
                    await client.sendMessage(senderId, `Este cliente já está sendo atendido por ${otherAttendantName}.`);
                    break;
                }
                if (existingTicket.length > 0) {
                    await client.sendMessage(senderId, `Você já está em atendimento com ${clientExists[0].name}. Continue a conversa normalmente.`);
                } else {
                    const waitingTicket = await conn.query("SELECT id FROM support_queue WHERE whatsapp_number = ? AND status = 'waiting'", [clientNumberToTalk]);
                    if (waitingTicket.length > 0) {
                        await conn.query("UPDATE support_queue SET status = 'in_progress', assigned_to = ?, started_at = NOW() WHERE id = ?", [attendantId, waitingTicket[0].id]);
                    } else {
                        await conn.query("INSERT INTO support_queue (client_id, whatsapp_number, status, assigned_to, started_at) VALUES (?, ?, 'in_progress', ?, NOW())", [clientExists[0].id, clientNumberToTalk, attendantId]);
                    }
                    await conn.query("UPDATE attendants SET status = 'busy' WHERE id = ?", [attendantId]);
                    await client.sendMessage(clientIdToTalk, `Olá! Sou ${attendantName}, atendente da empresa, e estou aqui para ajudá-lo. Como posso ser útil hoje?`);
                    await client.sendMessage(senderId, `✅ Atendimento iniciado com ${clientExists[0].name} (${clientNumberToTalk}).\nTodas as suas mensagens serão encaminhadas para o cliente até que você use o comando /finalizar.`);
                }
                break;
            default:
                await client.sendMessage(senderId, "Comando de atendente não reconhecido. Use /finalizar, /falarcom [numero], ou comandos financeiros como /enviarpix [numero].");
        }
        if (conn) conn.release();
        return; 
      }

      // Se não for atendente, verificar se é técnico
      const isTechnicianCommand = await technicianModule.processTechnicianCommand(client, conn, senderId, senderNumber, command, params);
      if (isTechnicianCommand) {
        if (conn) conn.release();
        return; 
      }
      // If command not recognized for attendant or technician
      await client.sendMessage(senderId, "Comando não reconhecido ou você não tem permissão para usá-lo.");
      if (conn) conn.release();
      return;
    }

    // Processar botões de técnico
    if (msg.selectedButtonId) {
        const isTechnicianButton = await technicianModule.processTechnicianButton(client, conn, senderId, senderNumber, msg, userState);
        if (isTechnicianButton) {
            if (conn) conn.release();
            return;
        }
    }

    let currentClient = null;
    const clientResult = await conn.query(
      "SELECT id, name, address, last_interaction_type, last_appointment_id, last_ticket_id FROM clients WHERE whatsapp_number = ? LIMIT 1",
      [senderNumber]
    );
    if (clientResult.length > 0) {
      currentClient = clientResult[0];
      console.log(`[DB] Cliente encontrado: ${currentClient.name}`);
    } else {
      console.log("[DB] Cliente não encontrado, iniciando cadastro.");
    }

    const stateInfo = userState[senderId];

    if (stateInfo && stateInfo.state) {
        // Processar estados financeiros do cliente ou atendente
        if (stateInfo.state.startsWith('awaiting_finance_') || 
            stateInfo.state === 'awaiting_invoice_choice' || 
            stateInfo.state === 'awaiting_payment_option' || 
            stateInfo.state === 'awaiting_payment_proof' ||
            stateInfo.state === 'awaiting_attendant_invoice_choice') { // Handles attendant state too
            const processedByFinanceModule = await financeModule.processFinanceState(client, conn, senderId, senderNumber, msg, stateInfo);
            if (processedByFinanceModule) {
                if (conn) conn.release();
                return; 
            }
        }

        // Processar estados de técnico
        if (stateInfo.state.startsWith('awaiting_technician') || 
            stateInfo.state === 'awaiting_service_description' || 
            stateInfo.state === 'awaiting_rejection_reason' ||
            stateInfo.state.startsWith('awaiting_photo_') ||
            stateInfo.state === 'awaiting_products_used' ||
            stateInfo.state === 'awaiting_solution_applied') {
            const isTechnicianState = await technicianModule.processTechnicianState(client, conn, senderId, senderNumber, msg, stateInfo);
            if (isTechnicianState) {
                if (conn) conn.release();
                return; 
            }
        }
    }
    

    if (!stateInfo) {
      if (!currentClient) {
        userState[senderId] = { state: "awaiting_name", data: {} };
        console.log(`[ESTADO] Novo estado: awaiting_name para ${senderId}`);
        await client.sendMessage(
          senderId,
          "Olá! Sou o assistente virtual da Kadan Tech. Para começarmos, qual é o seu nome?"
        );
      } else {
        let welcomeMessage = `Olá ${currentClient.name}, bem-vindo(a) de volta!`;
        const buttons = [
          { id: "main_menu", body: "Ver Menu Principal" },
          { id: "update_data", body: "Atualizar Meus Dados" },
        ];
        let lastInteractionInfo = null;

        if (currentClient.last_interaction_type) {
          if (currentClient.last_interaction_type === "Agendamento" && currentClient.last_appointment_id) {
            const lastAppointment = await conn.query("SELECT specialty, scheduled_datetime FROM appointments WHERE id = ?", [currentClient.last_appointment_id]);
            if (lastAppointment.length > 0) {
              lastInteractionInfo = { type: "Agendamento", details: `Agendamento: ${lastAppointment[0].specialty} em ${new Date(lastAppointment[0].scheduled_datetime).toLocaleDateString('pt-BR')}` };
            }
          } else if (currentClient.last_interaction_type === "Suporte Atendente" && currentClient.last_ticket_id) {
            lastInteractionInfo = { type: "Suporte Atendente", details: "Última interação: Suporte com Atendente" };
          } else if (currentClient.last_interaction_type === "Financeiro") {
              lastInteractionInfo = { type: "Financeiro", details: "Última interação: Financeiro" };
          }
        }

        if (lastInteractionInfo) {
          welcomeMessage += `\nSua última interação conosco foi sobre: *${lastInteractionInfo.details}*.`;
          buttons.unshift({ id: "repeat_last", body: "Repetir Última Interação" });
        }
        
        welcomeMessage += `\n\nSeus dados cadastrados são:\nEndereço: ${currentClient.address || 'Não informado'}\n\nO que você gostaria de fazer?`;

        const welcomeButtons = new Buttons(welcomeMessage, buttons, "Bem-vindo(a) de Volta!");
        await client.sendMessage(senderId, welcomeButtons);
        userState[senderId] = { 
            state: "awaiting_welcome_choice", 
            data: { 
                clientId: currentClient.id, 
                name: currentClient.name, 
                address: currentClient.address,
                lastInteractionInfo: lastInteractionInfo 
            }
        };
        console.log(`[ESTADO] Novo estado: awaiting_welcome_choice para ${senderId}`);
      }
    } else {
      console.log(`[ESTADO] Processando estado ${stateInfo.state} para ${senderId}`);
      switch (stateInfo.state) {
        case "awaiting_name":
          const name = msg.body.trim();
          if (name.length < 2 || name.length > 100) {
            await client.sendMessage(senderId, "Por favor, digite um nome válido (entre 2 e 100 caracteres).");
            break;
          }
          stateInfo.data.name = name;
          stateInfo.state = "awaiting_address";
          console.log(`[DADO] Nome recebido: ${name}`);
          console.log(`[ESTADO] Estado atualizado para awaiting_address para ${senderId}`);
          await client.sendMessage(
            senderId,
            `Obrigado, ${name}! Agora, por favor, me informe seu endereço completo (Ex: Rua Exemplo, 123, Bairro, Cidade - UF).`
          );
          break;
        case "awaiting_address":
          const address = msg.body.trim();
          if (address.length < 10 || address.length > 255) {
            await client.sendMessage(senderId, "Por favor, digite um endereço válido e completo (entre 10 e 255 caracteres).");
            break;
          }
          stateInfo.data.address = address;
          stateInfo.state = "awaiting_address_confirmation";
          console.log(`[DADO] Endereço recebido: ${address}`);
          console.log(`[ESTADO] Estado atualizado para awaiting_address_confirmation para ${senderId}`);
          const confirmationMessage = `Por favor, confirme seus dados:\n\nNome: ${stateInfo.data.name}\nEndereço: ${stateInfo.data.address}\n\nOs dados estão corretos?\n1. Sim, salvar dados\n2. Não, corrigir nome\n3. Não, corrigir endereço`;
          await client.sendMessage(senderId, confirmationMessage);
          break;
        case "awaiting_address_confirmation":
          const confirmationChoice = msg.body.trim();
          console.log(`[DADO] Escolha de confirmação: ${confirmationChoice}`);
          switch (confirmationChoice) {
            case "1":
              const insertResult = await conn.query(
                "INSERT INTO clients (name, whatsapp_number, address, last_interaction_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE name = VALUES(name), address = VALUES(address), last_interaction_at = NOW()",
                [stateInfo.data.name, senderNumber, stateInfo.data.address]
              );
              currentClient = { id: insertResult.insertId || (currentClient ? currentClient.id : null), name: stateInfo.data.name, address: stateInfo.data.address }; 
              console.log(
                `[DB] Cliente ${stateInfo.data.name} (ID: ${currentClient.id}) salvo/atualizado com sucesso.`
              );
              await showMainMenu(senderId, stateInfo.data.name, conn, currentClient.id, client);
              break;
            case "2": 
              stateInfo.state = "awaiting_name";
              delete stateInfo.data.name; 
              console.log(`[ESTADO] Estado atualizado para awaiting_name (correção) para ${senderId}`);
              await client.sendMessage(senderId, "Ok, vamos corrigir seu nome. Qual é o seu nome completo?");
              break;
            case "3": 
              stateInfo.state = "awaiting_address";
              delete stateInfo.data.address; 
              console.log(`[ESTADO] Estado atualizado para awaiting_address (correção) para ${senderId}`);
              await client.sendMessage(senderId, "Ok, vamos corrigir seu endereço. Qual é o seu endereço completo (Rua, Número, Bairro, Cidade - UF)?");
              break;
            default:
              await client.sendMessage(senderId, "Opção inválida. Por favor, digite 1 para confirmar, 2 para corrigir o nome ou 3 para corrigir o endereço.");
              break;
          }
          break;
        case "awaiting_welcome_choice":
          const welcomeChoice = msg.selectedButtonId || msg.body.trim().toLowerCase();
          console.log(`[DADO] Escolha de boas-vindas: ${welcomeChoice}`);
          if (welcomeChoice === "main_menu" || welcomeChoice.includes("menu")) {
              await showMainMenu(senderId, stateInfo.data.name, conn, stateInfo.data.clientId, client);
          } else if (welcomeChoice === "update_data" || welcomeChoice.includes("atualizar")) {
              stateInfo.state = "awaiting_data_update_choice";
              const updateOptions = new Buttons(
                  `O que você gostaria de atualizar?`,
                  [
                      {id: "update_name", body: "Atualizar Nome"},
                      {id: "update_address", body: "Atualizar Endereço"},
                      {id: "cancel_update", body: "Cancelar"}
                  ],
                  "Atualizar Dados"
              );
              await client.sendMessage(senderId, updateOptions);
              console.log(`[ESTADO] Estado atualizado para awaiting_data_update_choice para ${senderId}`);
          } else if (welcomeChoice === "repeat_last" || welcomeChoice.includes("repetir")) {
              const lastInteraction = stateInfo.data.lastInteractionInfo;
              if (lastInteraction) {
                  console.log(`[INFO] Cliente ${senderId} escolheu repetir última interação: ${lastInteraction.type}`);
                  if (lastInteraction.type === "Agendamento") {
                      userState[senderId] = { state: "awaiting_specialty", data: { ...stateInfo.data, isRepeating: true, lastSpecialty: lastInteraction.details.split(": ")[1].split(" em ")[0] } };
                      await client.sendMessage(senderId, `Ok, vamos tentar agendar um serviço de ${userState[senderId].data.lastSpecialty} novamente. Por favor, descreva o problema ou o serviço que você precisa.`);
                      console.log(`[ESTADO] Estado atualizado para awaiting_specialty (repetição) para ${senderId}`);
                  } else if (lastInteraction.type === "Suporte Atendente") {
                      await handleMenuChoice(senderId, "3", stateInfo, currentClient, conn, client); 
                  } else if (lastInteraction.type === "Financeiro") {
                      await handleMenuChoice(senderId, "1", stateInfo, currentClient, conn, client);
                  } else {
                      await client.sendMessage(senderId, "Não foi possível identificar sua última interação para repetição. Vamos para o menu principal.");
                      await showMainMenu(senderId, stateInfo.data.name, conn, stateInfo.data.clientId, client);
                  }
              } else {
                  await client.sendMessage(senderId, "Não encontramos uma interação anterior para repetir. Vamos para o menu principal.");
                  await showMainMenu(senderId, stateInfo.data.name, conn, stateInfo.data.clientId, client);
              }
          } else {
              await client.sendMessage(senderId, "Opção inválida. Por favor, selecione uma das opções.");
          }
          break;
        case "awaiting_data_update_choice":
          const updateFieldChoice = msg.selectedButtonId || msg.body.trim().toLowerCase();
          console.log(`[DADO] Escolha de campo para atualizar: ${updateFieldChoice}`);
          switch (updateFieldChoice) {
              case "update_name": case "nome":
                  stateInfo.state = "awaiting_new_name";
                  await client.sendMessage(senderId, "Qual é o seu novo nome completo?");
                  console.log(`[ESTADO] Estado atualizado para awaiting_new_name para ${senderId}`);
                  break;
              case "update_address": case "endereço": case "endereco":
                  stateInfo.state = "awaiting_new_address";
                  await client.sendMessage(senderId, "Qual é o seu novo endereço completo (Rua, Número, Bairro, Cidade - UF)?");
                  console.log(`[ESTADO] Estado atualizado para awaiting_new_address para ${senderId}`);
                  break;
              case "cancel_update": case "cancelar":
                  await client.sendMessage(senderId, "Atualização de dados cancelada.");
                  await showMainMenu(senderId, stateInfo.data.name, conn, stateInfo.data.clientId, client);
                  break;
              default:
                  await client.sendMessage(senderId, "Opção inválida. Por favor, selecione o que deseja atualizar ou cancele.");
                  break;
          }
          break;
        case "awaiting_new_name":
          const newName = msg.body.trim();
          if (newName.length < 2 || newName.length > 100) {
              await client.sendMessage(senderId, "Por favor, digite um nome válido (entre 2 e 100 caracteres).");
              break;
          }
          stateInfo.data.newName = newName;
          stateInfo.state = "awaiting_update_confirmation";
          const confirmNewNameMsg = `Confirmar novo nome: ${newName}?\n1. Sim\n2. Não, digitar novamente`;
          await client.sendMessage(senderId, confirmNewNameMsg);
          console.log(`[ESTADO] Estado atualizado para awaiting_update_confirmation (nome) para ${senderId}`);
          break;
        case "awaiting_new_address":
          const newAddress = msg.body.trim();
          if (newAddress.length < 10 || newAddress.length > 255) {
              await client.sendMessage(senderId, "Por favor, digite um endereço válido e completo (entre 10 e 255 caracteres).");
              break;
          }
          stateInfo.data.newAddress = newAddress;
          stateInfo.state = "awaiting_update_confirmation";
          const confirmNewAddressMsg = `Confirmar novo endereço: ${newAddress}?\n1. Sim\n2. Não, digitar novamente`;
          await client.sendMessage(senderId, confirmNewAddressMsg);
          console.log(`[ESTADO] Estado atualizado para awaiting_update_confirmation (endereço) para ${senderId}`);
          break;
        case "awaiting_update_confirmation":
          const updateConfirmChoice = msg.body.trim();
          if (updateConfirmChoice === "1") {
              let fieldToUpdate = "";
              let newValue = "";
              if (stateInfo.data.newName) {
                  fieldToUpdate = "name";
                  newValue = stateInfo.data.newName;
                  stateInfo.data.name = newValue; 
              } else if (stateInfo.data.newAddress) {
                  fieldToUpdate = "address";
                  newValue = stateInfo.data.newAddress;
                  stateInfo.data.address = newValue; 
              }
              if (fieldToUpdate) {
                  await conn.query(
                      `UPDATE clients SET ${fieldToUpdate} = ?, last_interaction_at = NOW() WHERE id = ?`,
                      [newValue, stateInfo.data.clientId]
                  );
                  await client.sendMessage(senderId, `Seu ${fieldToUpdate === 'name' ? 'nome' : 'endereço'} foi atualizado com sucesso!`);
                  console.log(`[DB] ${fieldToUpdate} do cliente ${stateInfo.data.clientId} atualizado para ${newValue}`);
                  delete stateInfo.data.newName; 
                  delete stateInfo.data.newAddress;
                  await showMainMenu(senderId, stateInfo.data.name, conn, stateInfo.data.clientId, client);
              }
          } else if (updateConfirmChoice === "2") {
              if (stateInfo.data.newName) {
                  stateInfo.state = "awaiting_new_name";
                  await client.sendMessage(senderId, "Ok, digite seu novo nome completo novamente.");
              } else if (stateInfo.data.newAddress) {
                  stateInfo.state = "awaiting_new_address";
                  await client.sendMessage(senderId, "Ok, digite seu novo endereço completo novamente.");
              }
              delete stateInfo.data.newName;
              delete stateInfo.data.newAddress;
          } else {
              await client.sendMessage(senderId, "Opção inválida. Digite 1 para Sim ou 2 para Não.");
          }
          break;
        case "awaiting_menu_choice":
            await handleMenuChoice(senderId, msg.body.trim(), stateInfo, currentClient, conn, client);
            break;
        case "awaiting_specialty":
            const specialty = msg.body.trim();
            if (specialty.length < 3) {
                await client.sendMessage(senderId, "Por favor, descreva a especialidade com mais detalhes.");
                break;
            }
            stateInfo.data.specialty = specialty;
            stateInfo.state = "awaiting_problem_description";
            await client.sendMessage(senderId, `Entendido: ${specialty}. Agora, por favor, descreva o problema ou serviço que você precisa.`);
            break;
        case "awaiting_problem_description":
            const problemDescription = msg.body.trim();
            if (problemDescription.length < 10) {
                await client.sendMessage(senderId, "Por favor, forneça uma descrição mais detalhada do problema (mínimo 10 caracteres).");
                break;
            }
            stateInfo.data.problemDescription = problemDescription;
            stateInfo.state = "awaiting_availability";
            await client.sendMessage(senderId, "Qual o melhor dia e horário para o atendimento? (Ex: Amanhã às 14h, ou 20/06 às 10:00)");
            break;
        case "awaiting_availability":
            const availability = msg.body.trim();
            // Basic validation, can be improved with date parsing libraries
            if (availability.length < 5) {
                await client.sendMessage(senderId, "Por favor, informe uma data e horário válidos.");
                break;
            }
            stateInfo.data.availability = availability;
            // Attempt to save to Google Calendar and DB
            try {
                // Simplified date parsing - replace with robust parsing in production
                const eventStartTime = new Date(); // Placeholder
                const eventEndTime = new Date(eventStartTime.getTime() + 60 * 60 * 1000); // 1 hour later

                await calendar.events.insert({
                    calendarId: CALENDAR_ID,
                    requestBody: {
                        summary: `Serviço: ${stateInfo.data.specialty} para ${stateInfo.data.name}`,
                        description: `Problema: ${stateInfo.data.problemDescription}\nCliente: ${stateInfo.data.name} (${senderNumber})\nEndereço: ${stateInfo.data.address || 'Não informado'}`,
                        start: { dateTime: eventStartTime.toISOString(), timeZone: 'America/Sao_Paulo' },
                        end: { dateTime: eventEndTime.toISOString(), timeZone: 'America/Sao_Paulo' },
                    },
                });
                const appointmentResult = await conn.query(
                    "INSERT INTO appointments (client_id, specialty, problem_description, requested_datetime_text, status, scheduled_datetime) VALUES (?, ?, ?, ?, 'scheduled', ?)",
                    [stateInfo.data.clientId, stateInfo.data.specialty, stateInfo.data.problemDescription, availability, eventStartTime]
                );
                await conn.query("UPDATE clients SET last_appointment_id = ?, last_interaction_at = NOW() WHERE id = ?", [appointmentResult.insertId, stateInfo.data.clientId]);
                await client.sendMessage(senderId, `Agendamento para ${stateInfo.data.specialty} solicitado para ${availability}. Entraremos em contato para confirmar. Obrigado!`);
                await showThankYouAndRating(senderId, stateInfo.data.clientId, "Agendamento", conn, client);
            } catch (error) {
                console.error("[ERRO AGENDAMENTO] Falha ao criar evento/agendamento:", error);
                await client.sendMessage(senderId, "Desculpe, não consegui registrar seu agendamento no momento. Tente novamente ou contate o suporte.");
                delete userState[senderId];
            }
            break;
        case "awaiting_support_reason":
            const supportReason = msg.body.trim();
            if (supportReason.length < 5) {
                await client.sendMessage(senderId, "Por favor, descreva o motivo do contato com um pouco mais de detalhe.");
                break;
            }
            // Add to support queue
            const ticketResult = await conn.query(
                "INSERT INTO support_queue (client_id, whatsapp_number, reason, status) VALUES (?, ?, ?, 'waiting')", 
                [stateInfo.data.clientId, senderNumber, supportReason]
            );
            await conn.query("UPDATE clients SET last_ticket_id = ?, last_interaction_at = NOW() WHERE id = ?", [ticketResult.insertId, stateInfo.data.clientId]);
            await client.sendMessage(senderId, "Sua solicitação de suporte foi registrada. Um de nossos atendentes entrará em contato em breve. Obrigado!");
            // Notify available attendants
            const availableAttendants = await conn.query("SELECT whatsapp_number FROM attendants WHERE status = 'available'");
            if (availableAttendants.length > 0) {
                const clientNameForAttendant = stateInfo.data.name || senderNumber;
                for (const attendant of availableAttendants) {
                    await client.sendMessage(`${attendant.whatsapp_number}@c.us`, `🔔 Novo cliente na fila de espera: ${clientNameForAttendant} (${senderNumber}). Motivo: ${supportReason}`);
                }
            }
            delete userState[senderId]; // Clear state after queuing
            break;
        case "awaiting_info_request":
            // Placeholder for information logic
            await client.sendMessage(senderId, "Obrigado pela sua pergunta! No momento, para informações detalhadas sobre nossos serviços, por favor, aguarde e um de nossos atendentes irá contatá-lo em breve para fornecer todos os detalhes.");
            // Optionally, queue for an attendant or provide some predefined info
            await showThankYouAndRating(senderId, stateInfo.data.clientId, "Informações", conn, client);
            break;
        case "awaiting_cancel_confirmation":
            const cancelChoice = msg.body.trim();
            if (cancelChoice === '0') {
                await client.sendMessage(senderId, "Cancelamento abortado.");
                await showMainMenu(senderId, stateInfo.data.name, conn, stateInfo.data.clientId, client);
                break;
            }
            const apptToCancelIndex = parseInt(cancelChoice) - 1;
            if (stateInfo.data.appointments_to_cancel && apptToCancelIndex >= 0 && apptToCancelIndex < stateInfo.data.appointments_to_cancel.length) {
                const apptToCancel = stateInfo.data.appointments_to_cancel[apptToCancelIndex];
                await conn.query("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [apptToCancel.id]);
                // Optionally, delete from Google Calendar too
                await client.sendMessage(senderId, `Agendamento de ${apptToCancel.specialty} para ${new Date(apptToCancel.scheduled_datetime).toLocaleString('pt-BR')} foi cancelado.`);
                await showThankYouAndRating(senderId, stateInfo.data.clientId, "Cancelamento Agendamento", conn, client);
            } else {
                await client.sendMessage(senderId, "Opção inválida. Por favor, digite o número do agendamento a ser cancelado ou '0' para voltar.");
            }
            break;
        case "awaiting_rating":
            const rating = parseInt(msg.body.trim());
            if (isNaN(rating) || rating < 1 || rating > 5) {
                await client.sendMessage(senderId, "Por favor, envie uma avaliação válida de 1 a 5 estrelas.");
                break;
            }
            await conn.query(
                "INSERT INTO reviews (client_id, rating, review_type, attendant_id, appointment_id, service_order_id) VALUES (?, ?, ?, ?, ?, ?)",
                [
                    stateInfo.data.clientId, 
                    rating, 
                    stateInfo.data.reviewType, 
                    stateInfo.data.attendantId || null, 
                    stateInfo.data.appointmentId || null,
                    stateInfo.data.serviceOrderId || null
                ]
            );
            await client.sendMessage(senderId, "Obrigado pela sua avaliação!");
            delete userState[senderId]; // Clear state
            // Optionally, show main menu again or end interaction
            break;
        default:
          console.log(`[AVISO] Estado desconhecido ou não manipulado: ${stateInfo.state} para ${senderId}`);
          // Fallback to main menu if state is unrecognized to prevent user from getting stuck
          // await showMainMenu(senderId, stateInfo.data.name || (currentClient ? currentClient.name : 'Cliente'), conn, stateInfo.data.clientId || (currentClient ? currentClient.id : null), client);
          break;
      }
    }
  } catch (error) {
    console.error("[ERRO GLOBAL MSG HANDLER]:", error);
    try {
        await client.sendMessage(senderId, "Ocorreu um erro inesperado ao processar sua mensagem. Por favor, tente novamente em alguns instantes.");
        delete userState[senderId]; // Clear state on unhandled error
    } catch (sendError) {
        console.error("[ERRO FATAL] Não foi possível enviar mensagem de erro ao usuário:", sendError);
    }
  } finally {
    if (conn) {
      try {
        await conn.release();
        console.log("[DB] Conexão liberada.");
      } catch (releaseError) {
        console.error("[ERRO DB] Falha ao liberar conexão:", releaseError);
      }
    }
  }
});

client.initialize();

