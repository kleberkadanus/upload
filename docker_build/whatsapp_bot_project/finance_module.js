/**
 * Módulo Financeiro para WhatsApp Bot
 * 
 * Este módulo gerencia todas as funcionalidades financeiras do bot, incluindo:
 * - Visualização e envio de faturas/boletos
 * - Gerenciamento de chave PIX
 * - Geração de QR Code PIX
 * - Confirmação de pagamentos
 * - Painel administrativo financeiro
 */

const { MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const fs = require("fs");
const path = require("path");

/**
 * Processa comandos financeiros de atendentes
 * @param {Object} client - Cliente WhatsApp
 * @param {Object} conn - Conexão com o banco de dados
 * @param {String} senderId - ID do remetente
 * @param {String} senderNumber - Número do remetente
 * @param {String} command - Comando recebido
 * @param {String} params - Parâmetros do comando
 * @returns {Boolean} - Se o comando foi processado
 */
async function processFinanceCommand(client, conn, senderId, senderNumber, command, params) {
    switch (command) {
        case '/enviarpix':
            if (!params) {
                await client.sendMessage(senderId, "Por favor, forneça o número do cliente. Exemplo: /enviarpix 5541999999999");
                return true;
            }
            const pixClientNumber = params.trim();
            const pixClientId = `${pixClientNumber}@c.us`;
            const pixConfig = await conn.query("SELECT value FROM settings WHERE name = 'pix_key'");
            if (pixConfig.length === 0 || !pixConfig[0].value) {
                await client.sendMessage(senderId, "Chave PIX não configurada no sistema.");
                return true;
            }
            const pixKey = pixConfig[0].value;
            
            // Gerar QR Code PIX se possível
            let pixQrCode = null;
            try {
                pixQrCode = await generatePixQrCode(pixKey, 0, "Pagamento Kadan Tech");
            } catch (error) {
                console.error("[ERRO PIX] Falha ao gerar QR Code PIX:", error);
            }
            
            let pixMessage = `*Chave PIX para Pagamento*\n\nSegue nossa chave PIX para pagamento:\n\n${pixKey}\n\nApós realizar o pagamento, por favor envie o comprovante para confirmarmos.`;
            
            await client.sendMessage(pixClientId, pixMessage);
            
            // Enviar QR Code PIX se disponível
            if (pixQrCode) {
                const media = new MessageMedia('image/png', pixQrCode, 'qrcode_pix.png');
                await client.sendMessage(pixClientId, media, { caption: "QR Code PIX para pagamento" });
            }
            
            await client.sendMessage(senderId, `✅ Chave PIX enviada com sucesso para o cliente ${pixClientNumber}.`);
            return true;
            
        case '/enviarboleto':
            if (!params) {
                await client.sendMessage(senderId, "Por favor, forneça o número do cliente. Exemplo: /enviarboleto 5541999999999");
                return true;
            }
            const boletoClientNumber = params.trim();
            const boletoClientId = `${boletoClientNumber}@c.us`;
            const boletoClient = await conn.query("SELECT id, name FROM clients WHERE whatsapp_number = ?", [boletoClientNumber]);
            if (boletoClient.length === 0) {
                await client.sendMessage(senderId, `Cliente com número ${boletoClientNumber} não encontrado no sistema.`);
                return true;
            }
            
            // Buscar faturas/boletos do cliente
            const invoices = await conn.query(
                "SELECT id, description, due_date, amount, pdf_url, status FROM invoices WHERE client_id = ? ORDER BY due_date DESC", 
                [boletoClient[0].id]
            );
            
            if (invoices.length === 0) {
                await client.sendMessage(senderId, `Não foram encontradas faturas para o cliente ${boletoClient[0].name}.`);
                return true;
            }
            
            // Listar faturas para o atendente escolher
            let invoiceList = `*Faturas de ${boletoClient[0].name}:*\n\n`;
            invoices.forEach((inv, index) => {
                const dueDate = new Date(inv.due_date).toLocaleDateString('pt-BR');
                invoiceList += `${index + 1}. ${inv.description || 'Fatura'} - R$ ${inv.amount.toFixed(2)} - Venc: ${dueDate} - Status: ${getStatusText(inv.status)}\n`;
            });
            
            invoiceList += "\nDigite o número da fatura que deseja enviar ou 'todas' para enviar a lista ao cliente:";
            await client.sendMessage(senderId, invoiceList);
            
            // Salvar estado para processar a escolha
            global.userState[senderId] = { 
                state: "awaiting_attendant_invoice_choice", 
                data: { 
                    invoices: invoices,
                    clientNumber: boletoClientNumber,
                    clientId: boletoClient[0].id,
                    clientName: boletoClient[0].name
                } 
            };
            return true;
            
        case '/atualizarpix':
            if (!params) {
                await client.sendMessage(senderId, "Por favor, forneça a nova chave PIX. Exemplo: /atualizarpix email@exemplo.com");
                return true;
            }
            
            const newPixKey = params.trim();
            try {
                // Verificar se já existe configuração
                const existingPix = await conn.query("SELECT id FROM settings WHERE name = 'pix_key'");
                
                if (existingPix.length > 0) {
                    await conn.query("UPDATE settings SET value = ? WHERE name = 'pix_key'", [newPixKey]);
                } else {
                    await conn.query("INSERT INTO settings (name, value) VALUES ('pix_key', ?)", [newPixKey]);
                }
                
                await client.sendMessage(senderId, `✅ Chave PIX atualizada com sucesso para: ${newPixKey}`);
            } catch (error) {
                console.error("[ERRO DB] Falha ao atualizar chave PIX:", error);
                await client.sendMessage(senderId, "❌ Erro ao atualizar chave PIX. Tente novamente mais tarde.");
            }
            return true;
            
        case '/cadastrarboleto':
            await client.sendMessage(senderId, "Para cadastrar um novo boleto, use o formato:\n/cadastrarboleto [número_cliente] [valor] [vencimento_dd/mm/aaaa] [descrição] [url_pdf]\n\nExemplo:\n/cadastrarboleto 5541999999999 150.00 25/06/2025 Mensalidade Junho https://exemplo.com/boleto.pdf");
            return true;
            
        case '/relatoriofin':
            try {
                const today = new Date();
                const firstDayMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                const lastDayMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                
                const invoiceStats = await conn.query(
                    `SELECT 
                        COUNT(*) as total_count,
                        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_count,
                        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
                        SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue_count,
                        SUM(amount) as total_amount,
                        SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as paid_amount
                     FROM invoices 
                     WHERE due_date BETWEEN ? AND ?`,
                    [firstDayMonth.toISOString().split('T')[0], lastDayMonth.toISOString().split('T')[0]]
                );
                
                if (invoiceStats.length > 0) {
                    const stats = invoiceStats[0];
                    const report = 
                        `📊 *Relatório Financeiro - ${today.toLocaleDateString('pt-BR')}*\n\n` +
                        `Período: ${firstDayMonth.toLocaleDateString('pt-BR')} a ${lastDayMonth.toLocaleDateString('pt-BR')}\n\n` +
                        `Total de faturas: ${stats.total_count}\n` +
                        `- Pagas: ${stats.paid_count}\n` +
                        `- Em aberto: ${stats.open_count}\n` +
                        `- Vencidas: ${stats.overdue_count}\n\n` +
                        `Valor total: R$ ${stats.total_amount ? stats.total_amount.toFixed(2) : '0.00'}\n` +
                        `Valor recebido: R$ ${stats.paid_amount ? stats.paid_amount.toFixed(2) : '0.00'}\n` +
                        `Taxa de conversão: ${stats.total_count > 0 ? ((stats.paid_count / stats.total_count) * 100).toFixed(1) : 0}%`;
                    
                    await client.sendMessage(senderId, report);
                } else {
                    await client.sendMessage(senderId, "Não foram encontrados dados financeiros para o período atual.");
                }
            } catch (error) {
                console.error("[ERRO DB] Falha ao gerar relatório financeiro:", error);
                await client.sendMessage(senderId, "❌ Erro ao gerar relatório financeiro. Tente novamente mais tarde.");
            }
            return true;
            
        default:
            return false; // Comando não reconhecido
    }
}

/**
 * Processa estados financeiros de clientes
 * @param {Object} client - Cliente WhatsApp
 * @param {Object} conn - Conexão com o banco de dados
 * @param {String} senderId - ID do remetente
 * @param {String} senderNumber - Número do remetente
 * @param {Object} msg - Mensagem recebida
 * @param {Object} stateInfo - Informações de estado do usuário
 * @returns {Boolean} - Se o estado foi processado
 */
async function processFinanceState(client, conn, senderId, senderNumber, msg, stateInfo) {
    switch (stateInfo.state) {
        case "awaiting_finance_choice":
            const financeChoice = msg.body.trim();
            console.log(`[DADO] Opção Financeiro: ${financeChoice}`);
            
            if (financeChoice === "1") { // Consultar Chave PIX
                let pixKey = "Chave PIX não configurada.";
                try {
                    const settingResult = await conn.query("SELECT value FROM settings WHERE name = ?", ["pix_key"]);
                    if (settingResult.length > 0) pixKey = settingResult[0].value;
                    
                    // Gerar QR Code PIX se possível
                    let pixQrCode = null;
                    try {
                        pixQrCode = await generatePixQrCode(pixKey, 0, "Pagamento Kadan Tech");
                    } catch (error) {
                        console.error("[ERRO PIX] Falha ao gerar QR Code PIX:", error);
                    }
                    
                    await client.sendMessage(senderId, `Nossa chave PIX é: ${pixKey}`);
                    
                    // Enviar QR Code PIX se disponível
                    if (pixQrCode) {
                        const media = new MessageMedia('image/png', pixQrCode, 'qrcode_pix.png');
                        await client.sendMessage(senderId, media, { caption: "QR Code PIX para pagamento" });
                    }
                    
                    await showThankYouAndRating(senderId, stateInfo.data.clientId, "Consulta PIX", conn, client);
                } catch (e) { 
                    console.error("[ERRO DB] Erro ao buscar chave PIX", e);
                    await client.sendMessage(senderId, "Desculpe, não consegui consultar a chave PIX no momento. Tente novamente mais tarde.");
                }
            } else if (financeChoice === "2") { // Consultar Faturas/Boletos
                try {
                    const invoices = await conn.query(
                        "SELECT id, description, due_date, amount, pdf_url, status FROM invoices WHERE client_id = ? ORDER BY due_date ASC", 
                        [stateInfo.data.clientId]
                    );
                    
                    if (invoices.length === 0) {
                        await client.sendMessage(senderId, "Você não possui faturas/boletos registrados no momento.");
                        await showThankYouAndRating(senderId, stateInfo.data.clientId, "Consulta Faturas (Nenhuma)", conn, client);
                    } else {
                        let invoiceList = "*Suas faturas:*\n";
                        invoices.forEach((inv, index) => {
                            const dueDate = new Date(inv.due_date).toLocaleDateString("pt-BR");
                            const statusText = getStatusText(inv.status);
                            invoiceList += `\n${index + 1}. ${inv.description || 'Fatura'} (Venc: ${dueDate}, R$ ${inv.amount.toFixed(2)}) - ${statusText}`;
                        });
                        
                        invoiceList += "\n\nDigite o número da fatura que deseja receber:";
                        stateInfo.state = "awaiting_invoice_choice";
                        stateInfo.data.invoices = invoices;
                        console.log(`[ESTADO] Estado atualizado para awaiting_invoice_choice para ${senderId}`);
                        await client.sendMessage(senderId, invoiceList);
                    }
                } catch (dbErr) {
                    console.error("[ERRO DB] Erro ao buscar faturas:", dbErr);
                    await client.sendMessage(senderId, "Desculpe, não consegui consultar suas faturas agora. Tente novamente mais tarde.");
                    delete global.userState[senderId];
                }
            } else if (financeChoice === "3") { // Enviar comprovante de pagamento
                stateInfo.state = "awaiting_payment_proof";
                console.log(`[ESTADO] Estado atualizado para awaiting_payment_proof para ${senderId}`);
                await client.sendMessage(senderId, "Por favor, envie uma foto do comprovante de pagamento. Você também pode adicionar uma descrição para identificar o pagamento.");
            } else {
                await client.sendMessage(senderId, "Opção inválida. Por favor, digite 1 para PIX, 2 para Faturas/Boletos ou 3 para Enviar Comprovante.");
            }
            return true;
            
        case "awaiting_invoice_choice":
            const invoiceIndex = parseInt(msg.body.trim()) - 1;
            const userInvoices = stateInfo.data.invoices;
            
            if (userInvoices && invoiceIndex >= 0 && invoiceIndex < userInvoices.length) {
                const selectedInvoice = userInvoices[invoiceIndex];
                console.log(`[DADO] Fatura selecionada: ID ${selectedInvoice.id}`);
                
                const dueDate = new Date(selectedInvoice.due_date).toLocaleDateString('pt-BR');
                const statusText = getStatusText(selectedInvoice.status);
                
                await client.sendMessage(
                    senderId, 
                    `*Detalhes da Fatura*\n\n` +
                    `Descrição: ${selectedInvoice.description || 'Fatura'}\n` +
                    `Vencimento: ${dueDate}\n` +
                    `Valor: R$ ${selectedInvoice.amount.toFixed(2)}\n` +
                    `Status: ${statusText}`
                );
                
                if (selectedInvoice.pdf_url) {
                    try {
                        const media = await MessageMedia.fromUrl(selectedInvoice.pdf_url, { unsafeMime: true });
                        await client.sendMessage(senderId, media, { caption: `Fatura - Vencimento: ${dueDate}` });
                        console.log(`[INFO] PDF da fatura ${selectedInvoice.id} enviado para ${senderId}`);
                    } catch (mediaError) {
                        console.error(`[ERRO MÍDIA] Falha ao buscar/enviar PDF da fatura ${selectedInvoice.id} da URL ${selectedInvoice.pdf_url}:`, mediaError);
                        await client.sendMessage(senderId, `Desculpe, não consegui obter o PDF da fatura no momento. Por favor, entre em contato com o suporte.`);
                    }
                } else {
                    await client.sendMessage(senderId, `Esta fatura não possui um arquivo PDF disponível para envio automático.`);
                }
                
                // Oferecer opções de pagamento
                if (selectedInvoice.status === 'open' || selectedInvoice.status === 'overdue') {
                    await client.sendMessage(
                        senderId,
                        "Deseja efetuar o pagamento agora?\n\n" +
                        "1. Sim, pagar via PIX\n" +
                        "2. Não, voltar ao menu principal"
                    );
                    
                    stateInfo.state = "awaiting_payment_option";
                    stateInfo.data.selectedInvoice = selectedInvoice;
                    console.log(`[ESTADO] Estado atualizado para awaiting_payment_option para ${senderId}`);
                } else {
                    await showThankYouAndRating(senderId, stateInfo.data.clientId, "Envio Fatura", conn, client);
                }
            } else {
                await client.sendMessage(senderId, "Número de fatura inválido. Por favor, digite o número correspondente à fatura desejada da lista anterior.");
            }
            return true;
            
        case "awaiting_payment_option":
            const paymentOption = msg.body.trim();
            
            if (paymentOption === "1") { // Pagar via PIX
                let pixKey = "Chave PIX não configurada.";
                try {
                    const settingResult = await conn.query("SELECT value FROM settings WHERE name = ?", ["pix_key"]);
                    if (settingResult.length > 0) pixKey = settingResult[0].value;
                    
                    const selectedInvoice = stateInfo.data.selectedInvoice;
                    const amount = selectedInvoice.amount;
                    const description = selectedInvoice.description || `Fatura #${selectedInvoice.id}`;
                    
                    // Gerar QR Code PIX
                    let pixQrCode = null;
                    try {
                        pixQrCode = await generatePixQrCode(pixKey, amount, description);
                    } catch (error) {
                        console.error("[ERRO PIX] Falha ao gerar QR Code PIX:", error);
                    }
                    
                    await client.sendMessage(
                        senderId,
                        `*Pagamento via PIX*\n\n` +
                        `Chave PIX: ${pixKey}\n` +
                        `Valor: R$ ${amount.toFixed(2)}\n` +
                        `Descrição: ${description}\n\n` +
                        `Após realizar o pagamento, por favor envie o comprovante para confirmarmos.`
                    );
                    
                    // Enviar QR Code PIX se disponível
                    if (pixQrCode) {
                        const media = new MessageMedia('image/png', pixQrCode, 'qrcode_pix.png');
                        await client.sendMessage(senderId, media, { caption: "QR Code PIX para pagamento" });
                    }
                    
                    stateInfo.state = "awaiting_payment_proof";
                    stateInfo.data.payingInvoice = selectedInvoice.id;
                    console.log(`[ESTADO] Estado atualizado para awaiting_payment_proof para ${senderId}`);
                } catch (e) {
                    console.error("[ERRO DB] Erro ao buscar chave PIX", e);
                    await client.sendMessage(senderId, "Desculpe, não consegui processar o pagamento via PIX no momento. Tente novamente mais tarde.");
                    await showThankYouAndRating(senderId, stateInfo.data.clientId, "Erro Pagamento PIX", conn, client);
                }
            } else if (paymentOption === "2") { // Voltar ao menu principal
                await client.sendMessage(senderId, "Operação de pagamento cancelada.");
                await showMainMenu(senderId, stateInfo.data.name, conn, stateInfo.data.clientId, client);
            } else {
                await client.sendMessage(senderId, "Opção inválida. Por favor, digite 1 para pagar via PIX ou 2 para voltar ao menu principal.");
            }
            return true;
            
        case "awaiting_payment_proof":
            if (msg.type === "image") {
                try {
                    const media = await msg.downloadMedia();
                    if (!media || !media.data) {
                        await client.sendMessage(senderId, "Não foi possível processar esta imagem. Tente novamente.");
                        return true;
                    }
                    
                    // Salvar comprovante
                    const uploadDir = path.join(__dirname, 'uploads', 'payments');
                    if (!fs.existsSync(uploadDir)) {
                        fs.mkdirSync(uploadDir, { recursive: true });
                    }
                    
                    const timestamp = new Date().getTime();
                    const fileName = `payment_proof_${stateInfo.data.clientId}_${timestamp}.jpg`;
                    const filePath = path.join(uploadDir, fileName);
                    const relativePath = path.join('uploads', 'payments', fileName);
                    
                    const fileData = media.data.replace(/^data:[\w/]+;base64,/, '');
                    fs.writeFileSync(filePath, Buffer.from(fileData, 'base64'));
                    
                    // Registrar comprovante no banco de dados
                    const description = msg.caption || "Comprovante de pagamento";
                    const invoiceId = stateInfo.data.payingInvoice || null;
                    
                    await conn.query(
                        "INSERT INTO payment_proofs (client_id, invoice_id, file_path, description, status) VALUES (?, ?, ?, ?, 'pending')",
                        [stateInfo.data.clientId, invoiceId, relativePath, description]
                    );
                    
                    // Notificar atendentes sobre novo comprovante
                    const availableAttendants = await conn.query(
                        "SELECT whatsapp_number FROM attendants WHERE status = 'available'"
                    );
                    
                    if (availableAttendants.length > 0) {
                        const clientInfo = await conn.query("SELECT name FROM clients WHERE id = ?", [stateInfo.data.clientId]);
                        const clientName = clientInfo.length > 0 ? clientInfo[0].name : "Cliente";
                        
                        for (const attendant of availableAttendants) {
                            const attendantWppId = `${attendant.whatsapp_number}@c.us`;
                            await client.sendMessage(
                                attendantWppId, 
                                `🧾 *Novo comprovante de pagamento*\n\nCliente: ${clientName}\nDescrição: ${description}\n${invoiceId ? `Fatura ID: ${invoiceId}` : 'Sem fatura específica'}`
                            );
                            
                            // Enviar a imagem do comprovante para o atendente
                            await client.sendMessage(attendantWppId, media, { caption: "Comprovante de pagamento" });
                        }
                    }
                    
                    await client.sendMessage(
                        senderId, 
                        "✅ Comprovante recebido com sucesso! Nossa equipe irá verificar e confirmar o pagamento em breve."
                    );
                    
                    await showThankYouAndRating(senderId, stateInfo.data.clientId, "Envio Comprovante", conn, client);
                } catch (error) {
                    console.error("[ERRO] Falha ao processar comprovante de pagamento:", error);
                    await client.sendMessage(senderId, "Desculpe, ocorreu um erro ao processar seu comprovante. Tente novamente mais tarde.");
                    delete global.userState[senderId];
                }
            } else if (msg.body.toLowerCase() === "cancelar") {
                await client.sendMessage(senderId, "Envio de comprovante cancelado.");
                await showMainMenu(senderId, stateInfo.data.name, conn, stateInfo.data.clientId, client);
            } else {
                await client.sendMessage(senderId, "Por favor, envie uma foto do comprovante de pagamento ou digite 'cancelar' para voltar ao menu principal.");
            }
            return true;
            
        case "awaiting_attendant_invoice_choice":
            const attendantChoice = msg.body.trim();
            const clientInvoices = stateInfo.data.invoices;
            const clientNumber = stateInfo.data.clientNumber;
            const clientId = `${clientNumber}@c.us`;
            
            if (attendantChoice.toLowerCase() === "todas") {
                // Enviar lista de faturas para o cliente
                let invoiceList = "*Suas faturas:*\n\n";
                clientInvoices.forEach((inv, index) => {
                    const dueDate = new Date(inv.due_date).toLocaleDateString('pt-BR');
                    const statusText = getStatusText(inv.status);
                    invoiceList += `${index + 1}. ${inv.description || 'Fatura'} - R$ ${inv.amount.toFixed(2)} - Venc: ${dueDate} - ${statusText}\n`;
                });
                
                await client.sendMessage(clientId, invoiceList);
                await client.sendMessage(senderId, `✅ Lista de faturas enviada com sucesso para o cliente ${stateInfo.data.clientName}.`);
                delete global.userState[senderId];
            } else {
                const invoiceIndex = parseInt(attendantChoice) - 1;
                
                if (invoiceIndex >= 0 && invoiceIndex < clientInvoices.length) {
                    const selectedInvoice = clientInvoices[invoiceIndex];
                    const dueDate = new Date(selectedInvoice.due_date).toLocaleDateString('pt-BR');
                    
                    await client.sendMessage(
                        clientId, 
                        `*Detalhes da Fatura*\n\n` +
                        `Descrição: ${selectedInvoice.description || 'Fatura'}\n` +
                        `Vencimento: ${dueDate}\n` +
                        `Valor: R$ ${selectedInvoice.amount.toFixed(2)}\n` +
                        `Status: ${getStatusText(selectedInvoice.status)}`
                    );
                    
                    if (selectedInvoice.pdf_url) {
                        try {
                            const media = await MessageMedia.fromUrl(selectedInvoice.pdf_url, { unsafeMime: true });
                            await client.sendMessage(clientId, media, { caption: `Fatura - Vencimento: ${dueDate}` });
                            await client.sendMessage(senderId, `✅ Fatura enviada com sucesso para o cliente ${stateInfo.data.clientName}.`);
                        } catch (mediaError) {
                            console.error(`[ERRO MÍDIA] Falha ao buscar/enviar PDF da fatura:`, mediaError);
                            await client.sendMessage(senderId, `❌ Erro ao enviar PDF da fatura. URL inválida ou inacessível: ${selectedInvoice.pdf_url}`);
                        }
                    } else {
                        await client.sendMessage(senderId, `⚠️ A fatura não possui URL do PDF cadastrada no sistema.`);
                    }
                    
                    delete global.userState[senderId];
                } else {
                    await client.sendMessage(senderId, "Número de fatura inválido. Por favor, digite o número correspondente ou 'todas' para enviar a lista completa.");
                }
            }
            return true;
            
        default:
            return false; // Estado não reconhecido
    }
}

/**
 * Gera um QR Code PIX
 * @param {String} pixKey - Chave PIX
 * @param {Number} amount - Valor do pagamento (0 para valor livre)
 * @param {String} description - Descrição do pagamento
 * @returns {Promise<String>} - Base64 do QR Code
 */
async function generatePixQrCode(pixKey, amount, description) {
    // Implementação simplificada - em produção, usar biblioteca específica para PIX
    const pixData = `PIX: ${pixKey}\nValor: R$ ${amount.toFixed(2)}\nDesc: ${description}`;
    
    return new Promise((resolve, reject) => {
        qrcode.toDataURL(pixData, { errorCorrectionLevel: 'H' }, (err, url) => {
            if (err) {
                reject(err);
                return;
            }
            // Extrair apenas a parte base64 da URL de dados
            const base64Data = url.replace(/^data:image\/png;base64,/, '');
            resolve(base64Data);
        });
    });
}

/**
 * Obtém texto legível para status de fatura
 * @param {String} status - Status da fatura
 * @returns {String} - Texto legível
 */
function getStatusText(status) {
    switch (status) {
        case 'open': return '⏳ Em aberto';
        case 'paid': return '✅ Pago';
        case 'overdue': return '⚠️ Vencido';
        case 'cancelled': return '❌ Cancelado';
        default: return status;
    }
}

/**
 * Mostra mensagem de agradecimento e solicita avaliação
 * @param {String} senderId - ID do remetente
 * @param {Number} clientId - ID do cliente
 * @param {String} interactionType - Tipo de interação
 * @param {Object} conn - Conexão com o banco de dados
 * @param {Object} client - Cliente WhatsApp
 */
async function showThankYouAndRating(senderId, clientId, interactionType, conn, client) {
    try {
        // Não atualiza last_interaction_type aqui, pois já é feito em handleMenuChoice ou no final de fluxos específicos

        const dailyPhraseResult = await conn.query("SELECT phrase FROM daily_phrases ORDER BY RAND() LIMIT 1");
        const dailyPhrase = dailyPhraseResult.length > 0 ? dailyPhraseResult[0].phrase : "Agradecemos seu contato!";

        await client.sendMessage(senderId, `${dailyPhrase}\n\nComo você avalia este atendimento/interação? (Digite um número de 1 a 5 estrelas)`);
        global.userState[senderId] = { state: "awaiting_rating", data: { clientId: clientId, reviewType: interactionType } };
        console.log(`[ESTADO] Estado atualizado para awaiting_rating para ${senderId} (Interação: ${interactionType})`);
    } catch (error) {
        console.error("[ERRO] Falha ao mostrar agradecimento/avaliação:", error);
        await client.sendMessage(senderId, "Obrigado pelo seu contato!");
        delete global.userState[senderId];
    }
}

/**
 * Mostra menu principal
 * @param {String} senderId - ID do remetente
 * @param {String} clientName - Nome do cliente
 * @param {Object} dbConnection - Conexão com o banco de dados
 * @param {Number} clientId - ID do cliente
 * @param {Object} whatsappClient - Cliente WhatsApp
 */
async function showMainMenu(senderId, clientName, dbConnection, clientId, whatsappClient) {
    let conn = dbConnection;
    let connectionReleasedOrNotOwned = false;
    try {
        if (!conn) {
            conn = await pool.getConnection();
        } else {
            connectionReleasedOrNotOwned = true;
        }

        const greeting = clientName ? `Olá ${clientName}, ` : "";
        const menuMessage = `${greeting}Como posso te ajudar hoje?\n\n1. Financeiro (PIX, Boletos)\n2. Agendar Serviço Técnico\n3. Dúvidas / Falar com Atendente\n4. Informações sobre Serviços\n5. Cancelar Agendamento\n\nDigite o número da opção desejada:`;
        
        global.userState[senderId] = { state: "awaiting_menu_choice", data: { name: clientName, clientId: clientId } };
        console.log(`[ESTADO] Estado atualizado para awaiting_menu_choice para ${senderId}`);
        await whatsappClient.sendMessage(senderId, menuMessage);
    } catch (error) {
        console.error("[ERRO] Falha ao mostrar menu principal:", error);
        await whatsappClient.sendMessage(senderId, "Desculpe, ocorreu um erro. Tente novamente.");
        delete global.userState[senderId];
    } finally {
        if (conn && !connectionReleasedOrNotOwned) {
            conn.release();
        }
    }
}

module.exports = {
    processFinanceCommand,
    processFinanceState
};
