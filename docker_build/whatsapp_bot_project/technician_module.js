/**
 * Módulo de Técnicos para o Bot WhatsApp
 * 
 * Este módulo implementa as funcionalidades específicas para técnicos, incluindo:
 * - Verificação de técnicos no sistema
 * - Comandos específicos para técnicos
 * - Sistema de atribuição e gerenciamento de ordens de serviço
 * - Integração com Google Maps para navegação e cálculo de rotas
 * - Sistema de notificação de chegada ao local
 * - Fluxo pós-chegada com coleta de fotos e registros
 */

const { MessageMedia, Buttons } = require("whatsapp-web.js");
const fs = require("fs");
const path = require("path");
const { Client: GoogleMapsClient } = require('@googlemaps/google-maps-services-js');

// Configuração do cliente Google Maps
const googleMapsClient = new GoogleMapsClient({});
const GOOGLE_MAPS_API_KEY = "AIzaSyD7JwL-0YJsLmBQDl7Jx4dmSqRrSfRkQA0"; // Chave API configurada

/**
 * Verifica se o número é de um técnico registrado
 * @param {Object} conn - Conexão com o banco de dados
 * @param {String} whatsappNumber - Número do WhatsApp
 * @returns {Promise<Object|null>} - Dados do técnico ou null se não for técnico
 */
async function checkIfTechnician(conn, whatsappNumber) {
    try {
        const result = await conn.query(
            "SELECT id, name, status FROM technicians WHERE whatsapp_number = ?",
            [whatsappNumber]
        );
        
        if (result.length > 0) {
            return result[0];
        }
        return null;
    } catch (error) {
        console.error("[ERRO DB] Falha ao verificar técnico:", error);
        return null;
    }
}

/**
 * Atualiza o status do técnico no banco de dados
 * @param {Object} conn - Conexão com o banco de dados
 * @param {Number} technicianId - ID do técnico
 * @param {String} status - Novo status (available, busy, offline)
 * @param {String} currentLocation - Localização atual (opcional)
 */
async function updateTechnicianStatus(conn, technicianId, status, currentLocation = null) {
    try {
        if (currentLocation) {
            await conn.query(
                "UPDATE technicians SET status = ?, current_location = ?, last_activity = NOW() WHERE id = ?",
                [status, currentLocation, technicianId]
            );
        } else {
            await conn.query(
                "UPDATE technicians SET status = ?, last_activity = NOW() WHERE id = ?",
                [status, technicianId]
            );
        }
        console.log(`[TÉCNICO] Status do técnico ${technicianId} atualizado para ${status}`);
    } catch (error) {
        console.error("[ERRO DB] Falha ao atualizar status do técnico:", error);
    }
}

/**
 * Busca ordens de serviço atribuídas ao técnico
 * @param {Object} conn - Conexão com o banco de dados
 * @param {Number} technicianId - ID do técnico
 * @returns {Promise<Array>} - Lista de ordens de serviço
 */
async function getTechnicianServiceOrders(conn, technicianId) {
    try {
        const orders = await conn.query(
            `SELECT so.id, so.appointment_id, so.status, so.arrival_time, so.notes,
            a.specialty, a.problem_description, a.scheduled_datetime, a.visit_fee,
            c.name as client_name, c.whatsapp_number, c.address
            FROM service_orders so
            JOIN appointments a ON so.appointment_id = a.id
            JOIN clients c ON a.client_id = c.id
            WHERE so.technician_id = ? AND so.status != 'completed' AND so.status != 'cancelled'
            ORDER BY a.scheduled_datetime ASC`,
            [technicianId]
        );
        
        return orders;
    } catch (error) {
        console.error("[ERRO DB] Falha ao buscar ordens de serviço:", error);
        return [];
    }
}

/**
 * Cria botões para ações do técnico
 * @param {Object} serviceOrder - Dados da ordem de serviço
 * @returns {Object} - Botões para o técnico
 */
function createTechnicianButtons(serviceOrder) {
    let buttons = [];
    
    switch (serviceOrder.status) {
        case 'assigned':
            buttons = [
                {id: 'navigate', body: '🗺️ Navegar'},
                {id: 'reject', body: '❌ Rejeitar'}
            ];
            break;
        case 'en_route':
            buttons = [
                {id: 'arrived', body: '🏠 Cheguei no Local'},
                {id: 'navigate', body: '🗺️ Navegar Novamente'}
            ];
            break;
        case 'arrived':
            buttons = [
                {id: 'start_service', body: '🔧 Iniciar Serviço'},
                {id: 'client_absent', body: '❓ Cliente Ausente'}
            ];
            break;
        case 'in_progress':
            buttons = [
                {id: 'complete_service', body: '✅ Finalizar Serviço'},
                {id: 'upload_photos', body: '📷 Enviar Fotos'}
            ];
            break;
    }
    
    return new Buttons('Selecione uma ação:', buttons, 'Ordem de Serviço #' + serviceOrder.id);
}

/**
 * Calcula rota e tempo estimado usando Google Maps
 * @param {String} origin - Endereço de origem
 * @param {String} destination - Endereço de destino
 * @returns {Promise<Object>} - Dados da rota
 */
async function calculateRoute(origin, destination) {
    try {
        const response = await googleMapsClient.directions({
            params: {
                origin: origin,
                destination: destination,
                key: GOOGLE_MAPS_API_KEY,
                alternatives: true,
                traffic_model: 'best_guess',
                departure_time: 'now'
            }
        });
        
        if (response.data.status === 'OK' && response.data.routes.length > 0) {
            const route = response.data.routes[0];
            const leg = route.legs[0];
            
            // Extrair pontos para visualização no mapa
            const polyline = route.overview_polyline.points;
            
            // Calcular ETA (Estimated Time of Arrival)
            const now = new Date();
            const etaMs = now.getTime() + leg.duration_in_traffic?.value * 1000 || leg.duration.value * 1000;
            const eta = new Date(etaMs);
            const etaFormatted = eta.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
            
            return {
                distance: leg.distance.text,
                duration: leg.duration_in_traffic?.text || leg.duration.text,
                durationValue: leg.duration_in_traffic?.value || leg.duration.value,
                startAddress: leg.start_address,
                endAddress: leg.end_address,
                eta: etaFormatted,
                steps: leg.steps.map(step => ({
                    instruction: step.html_instructions.replace(/<[^>]*>/g, ' '),
                    distance: step.distance.text,
                    duration: step.duration.text
                })),
                polyline: polyline,
                mapUrl: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`
            };
        }
        
        throw new Error('Não foi possível calcular a rota');
    } catch (error) {
        console.error("[ERRO MAPS] Falha ao calcular rota:", error);
        return {
            error: true,
            message: 'Não foi possível calcular a rota',
            mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`
        };
    }
}

/**
 * Notifica o cliente sobre o deslocamento do técnico
 * @param {Object} client - Cliente WhatsApp
 * @param {Object} serviceOrder - Dados da ordem de serviço
 * @param {Object} routeInfo - Informações da rota
 * @returns {Promise<void>}
 */
async function notifyClientAboutTechnician(client, serviceOrder, routeInfo) {
    try {
        const clientId = `${serviceOrder.whatsapp_number}@c.us`;
        
        // Criar mensagem com informações de deslocamento
        let message = `*Atualização sobre seu agendamento*\n\n`;
        message += `Olá ${serviceOrder.client_name}! O técnico está a caminho do seu endereço.\n\n`;
        message += `🚗 *Distância:* ${routeInfo.distance}\n`;
        message += `⏱️ *Tempo estimado:* ${routeInfo.duration}\n`;
        message += `🕒 *Horário previsto de chegada:* ${routeInfo.eta}\n\n`;
        message += `Você receberá uma notificação quando o técnico chegar ao local.`;
        
        // Enviar mensagem para o cliente
        await client.sendMessage(clientId, message);
        
        console.log(`[NOTIFICAÇÃO] Cliente ${serviceOrder.client_name} notificado sobre deslocamento do técnico`);
    } catch (error) {
        console.error("[ERRO] Falha ao notificar cliente:", error);
    }
}

/**
 * Salva foto enviada pelo técnico
 * @param {Object} conn - Conexão com o banco de dados
 * @param {Number} serviceOrderId - ID da ordem de serviço
 * @param {String} photoType - Tipo da foto (before, packaging, after)
 * @param {Object} media - Objeto MessageMedia com a foto
 * @param {String} description - Descrição da foto
 * @returns {Promise<String>} - Caminho da foto salva
 */
async function saveTechnicianPhoto(conn, serviceOrderId, photoType, media, description = '') {
    try {
        // Criar diretório para fotos se não existir
        const uploadDir = path.join(__dirname, 'uploads', 'service_photos', serviceOrderId.toString());
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        // Gerar nome de arquivo único
        const timestamp = new Date().getTime();
        const fileName = `${photoType}_${timestamp}.${media.mimetype.split('/')[1]}`;
        const filePath = path.join(uploadDir, fileName);
        
        // Salvar arquivo
        const fileData = media.data.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(filePath, Buffer.from(fileData, 'base64'));
        
        // Salvar referência no banco de dados
        const relativePath = path.join('uploads', 'service_photos', serviceOrderId.toString(), fileName);
        await conn.query(
            "INSERT INTO service_photos (service_order_id, photo_type, photo_path, description) VALUES (?, ?, ?, ?)",
            [serviceOrderId, photoType, relativePath, description]
        );
        
        console.log(`[FOTO] Foto do tipo ${photoType} salva para ordem de serviço ${serviceOrderId}`);
        return relativePath;
    } catch (error) {
        console.error("[ERRO] Falha ao salvar foto:", error);
        throw error;
    }
}

/**
 * Processa comandos específicos de técnicos
 * @param {Object} client - Cliente WhatsApp
 * @param {Object} conn - Conexão com o banco de dados
 * @param {String} senderId - ID do remetente
 * @param {String} senderNumber - Número do remetente
 * @param {String} command - Comando recebido
 * @param {String} params - Parâmetros do comando
 * @returns {Promise<Boolean>} - True se o comando foi processado
 */
async function processTechnicianCommand(client, conn, senderId, senderNumber, command, params) {
    // Verificar se é um técnico
    const technician = await checkIfTechnician(conn, senderNumber);
    if (!technician) {
        return false; // Não é um técnico
    }
    
    console.log(`[TÉCNICO] Comando recebido de ${technician.name}: ${command} ${params}`);
    
    switch (command) {
        case '/status':
            // Atualizar status do técnico
            const newStatus = params.trim().toLowerCase();
            if (['available', 'busy', 'offline'].includes(newStatus)) {
                await updateTechnicianStatus(conn, technician.id, newStatus);
                await client.sendMessage(senderId, `✅ Seu status foi atualizado para: *${newStatus}*`);
            } else {
                await client.sendMessage(
                    senderId, 
                    "Status inválido. Use:\n/status available\n/status busy\n/status offline"
                );
            }
            return true;
            
        case '/ordens':
            // Listar ordens de serviço atribuídas ao técnico
            const orders = await getTechnicianServiceOrders(conn, technician.id);
            
            if (orders.length === 0) {
                await client.sendMessage(senderId, "Você não possui ordens de serviço atribuídas no momento.");
                return true;
            }
            
            let ordersList = "*Suas Ordens de Serviço:*\n\n";
            for (const order of orders) {
                const scheduledDate = new Date(order.scheduled_datetime).toLocaleDateString('pt-BR');
                const scheduledTime = new Date(order.scheduled_datetime).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
                
                ordersList += `*OS #${order.id}* - ${order.status.toUpperCase()}\n`;
                ordersList += `Cliente: ${order.client_name}\n`;
                ordersList += `Serviço: ${order.specialty}\n`;
                ordersList += `Data: ${scheduledDate} às ${scheduledTime}\n`;
                ordersList += `Endereço: ${order.address}\n\n`;
            }
            
            ordersList += "Para ver detalhes de uma ordem específica, digite:\n/ordem [número da OS]";
            
            await client.sendMessage(senderId, ordersList);
            return true;
            
        case '/ordem':
            // Ver detalhes de uma ordem específica
            const orderId = parseInt(params.trim());
            if (isNaN(orderId)) {
                await client.sendMessage(senderId, "Por favor, forneça o número da ordem de serviço. Exemplo: /ordem 123");
                return true;
            }
            
            try {
                const orderDetails = await conn.query(
                    `SELECT so.id, so.appointment_id, so.status, so.arrival_time, so.notes,
                    a.specialty, a.problem_description, a.scheduled_datetime, a.visit_fee,
                    c.name as client_name, c.whatsapp_number, c.address
                    FROM service_orders so
                    JOIN appointments a ON so.appointment_id = a.id
                    JOIN clients c ON a.client_id = c.id
                    WHERE so.id = ? AND so.technician_id = ?`,
                    [orderId, technician.id]
                );
                
                if (orderDetails.length === 0) {
                    await client.sendMessage(senderId, `Ordem de serviço #${orderId} não encontrada ou não está atribuída a você.`);
                    return true;
                }
                
                const order = orderDetails[0];
                const scheduledDate = new Date(order.scheduled_datetime).toLocaleDateString('pt-BR');
                const scheduledTime = new Date(order.scheduled_datetime).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
                
                // Buscar fotos associadas à ordem
                const photos = await conn.query(
                    "SELECT photo_type, COUNT(*) as count FROM service_photos WHERE service_order_id = ? GROUP BY photo_type",
                    [order.id]
                );
                
                let photosInfo = "";
                if (photos.length > 0) {
                    photosInfo = "\n*Fotos:*\n";
                    for (const photo of photos) {
                        photosInfo += `- ${photo.photo_type}: ${photo.count} foto(s)\n`;
                    }
                }
                
                const orderMessage = 
                    `*Detalhes da Ordem de Serviço #${order.id}*\n\n` +
                    `*Status:* ${order.status.toUpperCase()}\n` +
                    `*Cliente:* ${order.client_name}\n` +
                    `*Telefone:* ${order.whatsapp_number}\n` +
                    `*Serviço:* ${order.specialty}\n` +
                    `*Descrição:* ${order.problem_description || 'Não informada'}\n` +
                    `*Data:* ${scheduledDate} às ${scheduledTime}\n` +
                    `*Endereço:* ${order.address}\n` +
                    `*Valor da Visita:* R$ ${order.visit_fee.toFixed(2)}` +
                    photosInfo;
                
                await client.sendMessage(senderId, orderMessage);
                
                // Enviar botões de ação conforme o status da ordem
                const buttons = createTechnicianButtons(order);
                await client.sendMessage(senderId, buttons);
                
            } catch (error) {
                console.error("[ERRO DB] Falha ao buscar detalhes da ordem:", error);
                await client.sendMessage(senderId, "Ocorreu um erro ao buscar os detalhes da ordem de serviço. Tente novamente mais tarde.");
            }
            return true;
            
        case '/localizacao':
            // Atualizar localização atual do técnico
            const location = params.trim();
            if (location.length < 5) {
                await client.sendMessage(senderId, "Por favor, forneça um endereço válido. Exemplo: /localizacao Rua Exemplo, 123, Cidade");
                return true;
            }
            
            await updateTechnicianStatus(conn, technician.id, technician.status, location);
            await client.sendMessage(senderId, `✅ Sua localização foi atualizada para: *${location}*`);
            return true;
            
        case '/ajuda':
            // Mostrar comandos disponíveis para técnicos
            const helpMessage = 
                "*Comandos disponíveis para técnicos:*\n\n" +
                "📋 */ordens* - Listar todas as suas ordens de serviço\n" +
                "🔍 */ordem [número]* - Ver detalhes de uma ordem específica\n" +
                "🚦 */status [estado]* - Atualizar seu status (available, busy, offline)\n" +
                "📍 */localizacao* - Atualizar sua localização atual\n" +
                "❓ */ajuda* - Mostrar esta mensagem de ajuda\n\n" +
                "*Botões de ação:*\n" +
                "🗺️ *Navegar* - Iniciar navegação para o endereço do cliente\n" +
                "🏠 *Cheguei no Local* - Notificar que você chegou ao local\n" +
                "🔧 *Iniciar Serviço* - Começar o atendimento\n" +
                "📷 *Enviar Fotos* - Enviar fotos do serviço\n" +
                "✅ *Finalizar Serviço* - Concluir a ordem de serviço";
                
            await client.sendMessage(senderId, helpMessage);
            return true;
            
        default:
            return false; // Comando não reconhecido
    }
}

/**
 * Processa botões de ação do técnico
 * @param {Object} client - Cliente WhatsApp
 * @param {Object} conn - Conexão com o banco de dados
 * @param {String} senderId - ID do remetente
 * @param {String} senderNumber - Número do remetente
 * @param {Object} msg - Mensagem recebida
 * @param {Object} userState - Estado da conversa do usuário
 * @returns {Promise<Boolean>} - True se o botão foi processado
 */
async function processTechnicianButton(client, conn, senderId, senderNumber, msg, userState) {
    // Verificar se é um técnico
    const technician = await checkIfTechnician(conn, senderNumber);
    if (!technician) {
        return false; // Não é um técnico
    }
    
    // Verificar se é um botão de técnico
    const buttonId = msg.selectedButtonId;
    if (!buttonId) {
        return false;
    }
    
    console.log(`[TÉCNICO] Botão pressionado por ${technician.name}: ${buttonId}`);
    
    // Extrair ID da ordem de serviço do título do botão
    const titleMatch = msg.body.match(/Ordem de Serviço #(\d+)/);
    if (!titleMatch) {
        return false;
    }
    
    const serviceOrderId = parseInt(titleMatch[1]);
    
    try {
        // Buscar detalhes da ordem de serviço
        const orderDetails = await conn.query(
            `SELECT so.id, so.appointment_id, so.status, so.technician_id, so.arrival_time, so.notes,
            a.specialty, a.problem_description, a.scheduled_datetime, a.visit_fee,
            c.id as client_id, c.name as client_name, c.whatsapp_number, c.address
            FROM service_orders so
            JOIN appointments a ON so.appointment_id = a.id
            JOIN clients c ON a.client_id = c.id
            WHERE so.id = ?`,
            [serviceOrderId]
        );
        
        if (orderDetails.length === 0) {
            await client.sendMessage(senderId, `Ordem de serviço #${serviceOrderId} não encontrada.`);
            return true;
        }
        
        const order = orderDetails[0];
        
        // Verificar se a ordem pertence a este técnico
        if (order.technician_id !== technician.id) {
            await client.sendMessage(senderId, `Ordem de serviço #${serviceOrderId} não está atribuída a você.`);
            return true;
        }
        
        // Processar ação do botão
        switch (buttonId) {
            case 'navigate':
                // Iniciar navegação para o endereço do cliente
                const technicianLocation = await conn.query(
                    "SELECT current_location FROM technicians WHERE id = ?",
                    [technician.id]
                );
                
                let origin = technicianLocation[0]?.current_location;
                if (!origin) {
                    // Se não tiver localização atual, pedir para informar
                    if (!userState[senderId]) {
                        userState[senderId] = { state: "awaiting_technician_location", data: {} };
                    } else {
                        userState[senderId].state = "awaiting_technician_location";
                    }
                    userState[senderId].data = { serviceOrderId: serviceOrderId };
                    
                    await client.sendMessage(senderId, "Para calcular a rota, preciso da sua localização atual. Por favor, informe seu endereço atual:");
                    return true;
                }
                
                // Calcular rota
                const destination = order.address;
                const routeInfo = await calculateRoute(origin, destination);
                
                if (routeInfo.error) {
                    await client.sendMessage(senderId, `Não foi possível calcular a rota: ${routeInfo.message}\n\nVocê pode acessar o mapa diretamente: ${routeInfo.mapUrl}`);
                    return true;
                }
                
                // Atualizar status da ordem para "em rota"
                if (order.status === 'assigned') {
                    await conn.query(
                        "UPDATE service_orders SET status = 'en_route', departure_time = NOW() WHERE id = ?",
                        [serviceOrderId]
                    );
                    
                    // Notificar cliente sobre o deslocamento do técnico
                    await notifyClientAboutTechnician(client, order, routeInfo);
                }
                
                // Enviar informações da rota para o técnico
                let routeMessage = `*Rota para ${order.client_name}*\n\n`;
                routeMessage += `📍 *Origem:* ${routeInfo.startAddress}\n`;
                routeMessage += `🏠 *Destino:* ${routeInfo.endAddress}\n`;
                routeMessage += `🚗 *Distância:* ${routeInfo.distance}\n`;
                routeMessage += `⏱️ *Tempo estimado:* ${routeInfo.duration}\n`;
                routeMessage += `🕒 *Horário previsto de chegada:* ${routeInfo.eta}\n\n`;
                
                // Adicionar instruções de navegação
                routeMessage += "*Instruções de navegação:*\n";
                routeInfo.steps.forEach((step, index) => {
                    if (index < 5) { // Limitar a 5 passos para não sobrecarregar a mensagem
                        routeMessage += `${index + 1}. ${step.instruction} (${step.distance})\n`;
                    }
                });
                
                if (routeInfo.steps.length > 5) {
                    routeMessage += `... e mais ${routeInfo.steps.length - 5} passos\n`;
                }
                
                routeMessage += `\nPara iniciar a navegação no Google Maps, clique no link abaixo:\n${routeInfo.mapUrl}`;
                
                await client.sendMessage(senderId, routeMessage);
                
                // Enviar botões atualizados
                const updatedButtons = createTechnicianButtons({...order, status: 'en_route'});
                await client.sendMessage(senderId, updatedButtons);
                
                return true;
                
            case 'arrived':
                // Notificar chegada ao local
                await conn.query(
                    "UPDATE service_orders SET status = 'arrived', arrival_time = NOW() WHERE id = ?",
                    [serviceOrderId]
                );
                
                // Notificar cliente sobre a chegada do técnico
                const clientId = `${order.whatsapp_number}@c.us`;
                
                // Configurar botões de confirmação para o cliente
                const confirmButtons = new Buttons(
                    `O técnico chegou ao seu endereço para realizar o serviço de ${order.specialty}. Por favor, confirme sua presença:`,
                    [
                        {id: 'confirm_presence', body: '✅ Confirmar Presença'},
                        {id: 'reschedule', body: '📅 Reagendar'}
                    ],
                    `Ordem de Serviço #${serviceOrderId}`
                );
                
                // Enviar notificação com botões para o cliente
                await client.sendMessage(clientId, confirmButtons);
                
                // Configurar estado do cliente para aguardar confirmação
                if (!userState[clientId]) {
                    userState[clientId] = { state: "awaiting_arrival_confirmation", data: {} };
                } else {
                    userState[clientId].state = "awaiting_arrival_confirmation";
                }
                userState[clientId].data = { 
                    serviceOrderId: serviceOrderId,
                    technicianId: technician.id,
                    technicianName: technician.name
                };
                
                // Informar técnico que o cliente foi notificado
                await client.sendMessage(
                    senderId,
                    `✅ Cliente ${order.client_name} foi notificado sobre sua chegada. Aguarde a confirmação de presença.`
                );
                
                // Enviar botões atualizados
                const arrivedButtons = createTechnicianButtons({...order, status: 'arrived'});
                await client.sendMessage(senderId, arrivedButtons);
                
                return true;
                
            case 'start_service':
                // Iniciar serviço
                await conn.query(
                    "UPDATE service_orders SET status = 'in_progress', service_start_time = NOW() WHERE id = ?",
                    [serviceOrderId]
                );
                
                // Notificar cliente que o serviço foi iniciado
                const clientStartId = `${order.whatsapp_number}@c.us`;
                await client.sendMessage(
                    clientStartId,
                    `O técnico iniciou o serviço de ${order.specialty}. Qualquer dúvida, entre em contato conosco.`
                );
                
                // Solicitar fotos do "antes"
                await client.sendMessage(
                    senderId,
                    `✅ Serviço iniciado! Por favor, tire fotos do local/equipamento *antes* de iniciar o trabalho.`
                );
                
                // Configurar estado do técnico para envio de fotos
                if (!userState[senderId]) {
                    userState[senderId] = { state: "awaiting_technician_photos", data: {} };
                } else {
                    userState[senderId].state = "awaiting_technician_photos";
                }
                userState[senderId].data = { 
                    serviceOrderId: serviceOrderId,
                    photoType: "before",
                    photoCount: 0
                };
                
                return true;
                
            case 'upload_photos':
                // Solicitar tipo de foto
                const photoOptions = new Buttons(
                    `Que tipo de foto você deseja enviar para a OS #${serviceOrderId}?`,
                    [
                        {id: 'photo_before', body: '📸 Antes do Serviço'},
                        {id: 'photo_packaging', body: '📦 Embalagens/Peças'},
                        {id: 'photo_after', body: '✅ Depois do Serviço'}
                    ],
                    `Fotos da Ordem de Serviço #${serviceOrderId}`
                );
                
                await client.sendMessage(senderId, photoOptions);
                return true;
                
            case 'photo_before':
            case 'photo_packaging':
            case 'photo_after':
                // Configurar estado para receber fotos
                const photoType = buttonId.replace('photo_', '');
                
                if (!userState[senderId]) {
                    userState[senderId] = { state: "awaiting_technician_photos", data: {} };
                } else {
                    userState[senderId].state = "awaiting_technician_photos";
                }
                userState[senderId].data = { 
                    serviceOrderId: serviceOrderId,
                    photoType: photoType,
                    photoCount: 0
                };
                
                await client.sendMessage(
                    senderId,
                    `Envie as fotos do tipo "${photoType}". Quando terminar, digite "pronto".`
                );
                return true;
                
            case 'complete_service':
                // Verificar se há fotos do tipo "after"
                const afterPhotos = await conn.query(
                    "SELECT COUNT(*) as count FROM service_photos WHERE service_order_id = ? AND photo_type = 'after'",
                    [serviceOrderId]
                );
                
                if (afterPhotos[0].count === 0) {
                    // Solicitar fotos do "depois" antes de finalizar
                    await client.sendMessage(
                        senderId,
                        `⚠️ Antes de finalizar o serviço, é necessário enviar fotos do trabalho concluído. Por favor, use o botão "Enviar Fotos" e selecione "Depois do Serviço".`
                    );
                    return true;
                }
                
                // Solicitar descrição do serviço realizado
                if (!userState[senderId]) {
                    userState[senderId] = { state: "awaiting_service_description", data: {} };
                } else {
                    userState[senderId].state = "awaiting_service_description";
                }
                userState[senderId].data = { serviceOrderId: serviceOrderId };
                
                await client.sendMessage(
                    senderId,
                    `Por favor, descreva o serviço realizado e os materiais utilizados:`
                );
                return true;
                
            case 'reject':
                // Rejeitar ordem de serviço
                if (!userState[senderId]) {
                    userState[senderId] = { state: "awaiting_rejection_reason", data: {} };
                } else {
                    userState[senderId].state = "awaiting_rejection_reason";
                }
                userState[senderId].data = { serviceOrderId: serviceOrderId };
                
                await client.sendMessage(
                    senderId,
                    `Por favor, informe o motivo da rejeição desta ordem de serviço:`
                );
                return true;
                
            case 'client_absent':
                // Cliente ausente
                await conn.query(
                    "UPDATE service_orders SET status = 'client_absent', notes = CONCAT(IFNULL(notes, ''), '\nCliente ausente em ', NOW()) WHERE id = ?",
                    [serviceOrderId]
                );
                
                // Notificar cliente sobre a ausência
                const absentClientId = `${order.whatsapp_number}@c.us`;
                await client.sendMessage(
                    absentClientId,
                    `Nosso técnico esteve no local agendado, mas não encontrou ninguém. Por favor, entre em contato para reagendar o serviço.`
                );
                
                // Informar técnico
                await client.sendMessage(
                    senderId,
                    `✅ Registramos que o cliente estava ausente. A ordem de serviço foi marcada como "cliente ausente" e o cliente foi notificado.`
                );
                
                // Perguntar se deseja reagendar
                const rescheduleButtons = new Buttons(
                    `Deseja reagendar esta visita para outro dia?`,
                    [
                        {id: 'reschedule_yes', body: '✅ Sim, Reagendar'},
                        {id: 'reschedule_no', body: '❌ Não, Cancelar OS'}
                    ],
                    `Reagendamento da OS #${serviceOrderId}`
                );
                
                await client.sendMessage(senderId, rescheduleButtons);
                return true;
                
            default:
                return false; // Botão não reconhecido
        }
    } catch (error) {
        console.error("[ERRO DB] Falha ao processar botão de técnico:", error);
        await client.sendMessage(senderId, "Ocorreu um erro ao processar sua ação. Tente novamente mais tarde.");
        return true;
    }
}

/**
 * Processa estados específicos de técnicos
 * @param {Object} client - Cliente WhatsApp
 * @param {Object} conn - Conexão com o banco de dados
 * @param {String} senderId - ID do remetente
 * @param {String} senderNumber - Número do remetente
 * @param {Object} msg - Mensagem recebida
 * @param {Object} stateInfo - Informações do estado atual
 * @returns {Promise<Boolean>} - True se o estado foi processado
 */
async function processTechnicianState(client, conn, senderId, senderNumber, msg, stateInfo) {
    // Verificar se é um técnico
    const technician = await checkIfTechnician(conn, senderNumber);
    if (!technician) {
        return false; // Não é um técnico
    }
    
    // Verificar se é um estado de técnico
    if (!stateInfo.state.startsWith('awaiting_technician') && 
        !stateInfo.state === 'awaiting_service_description' && 
        !stateInfo.state === 'awaiting_rejection_reason') {
        return false;
    }
    
    console.log(`[TÉCNICO] Processando estado ${stateInfo.state} para ${technician.name}`);
    
    switch (stateInfo.state) {
        case 'awaiting_technician_location':
            // Técnico informando sua localização atual
            const location = msg.body.trim();
            if (location.length < 5) {
                await client.sendMessage(senderId, "Por favor, forneça um endereço válido.");
                return true;
            }
            
            // Atualizar localização do técnico
            await updateTechnicianStatus(conn, technician.id, technician.status, location);
            
            // Buscar detalhes da ordem de serviço
            const serviceOrderId = stateInfo.data.serviceOrderId;
            const orderDetails = await conn.query(
                `SELECT so.id, so.status, c.name as client_name, c.address
                FROM service_orders so
                JOIN appointments a ON so.appointment_id = a.id
                JOIN clients c ON a.client_id = c.id
                WHERE so.id = ?`,
                [serviceOrderId]
            );
            
            if (orderDetails.length === 0) {
                await client.sendMessage(senderId, `Ordem de serviço #${serviceOrderId} não encontrada.`);
                delete stateInfo.state;
                return true;
            }
            
            const order = orderDetails[0];
            
            // Calcular rota
            const routeInfo = await calculateRoute(location, order.address);
            
            if (routeInfo.error) {
                await client.sendMessage(senderId, `Não foi possível calcular a rota: ${routeInfo.message}\n\nVocê pode acessar o mapa diretamente: ${routeInfo.mapUrl}`);
                delete stateInfo.state;
                return true;
            }
            
            // Atualizar status da ordem para "em rota" se necessário
            if (order.status === 'assigned') {
                await conn.query(
                    "UPDATE service_orders SET status = 'en_route', departure_time = NOW() WHERE id = ?",
                    [serviceOrderId]
                );
                
                // Notificar cliente sobre o deslocamento do técnico
                await notifyClientAboutTechnician(client, order, routeInfo);
            }
            
            // Enviar informações da rota para o técnico
            let routeMessage = `*Rota para ${order.client_name}*\n\n`;
            routeMessage += `📍 *Origem:* ${routeInfo.startAddress}\n`;
            routeMessage += `🏠 *Destino:* ${routeInfo.endAddress}\n`;
            routeMessage += `🚗 *Distância:* ${routeInfo.distance}\n`;
            routeMessage += `⏱️ *Tempo estimado:* ${routeInfo.duration}\n`;
            routeMessage += `🕒 *Horário previsto de chegada:* ${routeInfo.eta}\n\n`;
            
            // Adicionar instruções de navegação
            routeMessage += "*Instruções de navegação:*\n";
            routeInfo.steps.forEach((step, index) => {
                if (index < 5) { // Limitar a 5 passos para não sobrecarregar a mensagem
                    routeMessage += `${index + 1}. ${step.instruction} (${step.distance})\n`;
                }
            });
            
            if (routeInfo.steps.length > 5) {
                routeMessage += `... e mais ${routeInfo.steps.length - 5} passos\n`;
            }
            
            routeMessage += `\nPara iniciar a navegação no Google Maps, clique no link abaixo:\n${routeInfo.mapUrl}`;
            
            await client.sendMessage(senderId, routeMessage);
            
            // Enviar botões atualizados
            const updatedButtons = createTechnicianButtons({...order, status: 'en_route'});
            await client.sendMessage(senderId, updatedButtons);
            
            // Limpar estado
            delete stateInfo.state;
            return true;
            
        case 'awaiting_technician_photos':
            // Técnico enviando fotos
            if (msg.type === 'image' || msg.type === 'video') {
                try {
                    const media = await msg.downloadMedia();
                    if (!media || !media.data) {
                        await client.sendMessage(senderId, "Não foi possível processar esta mídia. Tente novamente.");
                        return true;
                    }
                    
                    // Salvar foto
                    const serviceOrderId = stateInfo.data.serviceOrderId;
                    const photoType = stateInfo.data.photoType;
                    const photoPath = await saveTechnicianPhoto(conn, serviceOrderId, photoType, media);
                    
                    // Incrementar contador de fotos
                    stateInfo.data.photoCount = (stateInfo.data.photoCount || 0) + 1;
                    
                    await client.sendMessage(
                        senderId,
                        `✅ Foto #${stateInfo.data.photoCount} do tipo "${photoType}" salva com sucesso. Você pode enviar mais fotos ou digitar "pronto" para finalizar.`
                    );
                } catch (error) {
                    console.error("[ERRO] Falha ao processar foto:", error);
                    await client.sendMessage(senderId, "Ocorreu um erro ao processar a foto. Tente novamente.");
                }
                return true;
            } else if (msg.type === 'chat') {
                const text = msg.body.trim().toLowerCase();
                if (text === 'pronto' || text === 'finalizar' || text === 'concluir') {
                    // Finalizar envio de fotos
                    const photoCount = stateInfo.data.photoCount || 0;
                    const photoType = stateInfo.data.photoType;
                    const serviceOrderId = stateInfo.data.serviceOrderId;
                    
                    if (photoCount === 0) {
                        await client.sendMessage(senderId, `Você não enviou nenhuma foto do tipo "${photoType}". Por favor, envie pelo menos uma foto.`);
                        return true;
                    }
                    
                    await client.sendMessage(senderId, `✅ ${photoCount} foto(s) do tipo "${photoType}" foram salvas com sucesso.`);
                    
                    // Se for foto do tipo "after", perguntar se deseja finalizar o serviço
                    if (photoType === 'after') {
                        const completeButtons = new Buttons(
                            `Você enviou todas as fotos necessárias do serviço concluído. Deseja finalizar a ordem de serviço agora?`,
                            [
                                {id: 'complete_service', body: '✅ Finalizar Serviço'},
                                {id: 'upload_photos', body: '📷 Enviar Mais Fotos'}
                            ],
                            `Ordem de Serviço #${serviceOrderId}`
                        );
                        
                        await client.sendMessage(senderId, completeButtons);
                    } else {
                        // Buscar detalhes da ordem para enviar botões atualizados
                        const orderDetails = await conn.query(
                            `SELECT so.id, so.status FROM service_orders so WHERE so.id = ?`,
                            [serviceOrderId]
                        );
                        
                        if (orderDetails.length > 0) {
                            const buttons = createTechnicianButtons(orderDetails[0]);
                            await client.sendMessage(senderId, buttons);
                        }
                    }
                    
                    // Limpar estado
                    delete stateInfo.state;
                } else {
                    await client.sendMessage(senderId, `Por favor, envie uma foto ou digite "pronto" para finalizar o envio de fotos.`);
                }
                return true;
            }
            return true;
            
        case 'awaiting_service_description':
            // Técnico informando descrição do serviço realizado
            const description = msg.body.trim();
            if (description.length < 10) {
                await client.sendMessage(senderId, "Por favor, forneça uma descrição mais detalhada do serviço realizado.");
                return true;
            }
            
            const serviceOrderId = stateInfo.data.serviceOrderId;
            
            // Atualizar ordem de serviço
            await conn.query(
                "UPDATE service_orders SET status = 'completed', service_end_time = NOW(), notes = ? WHERE id = ?",
                [description, serviceOrderId]
            );
            
            // Buscar detalhes da ordem
            const completedOrder = await conn.query(
                `SELECT so.id, c.name as client_name, c.whatsapp_number, a.specialty
                FROM service_orders so
                JOIN appointments a ON so.appointment_id = a.id
                JOIN clients c ON a.client_id = c.id
                WHERE so.id = ?`,
                [serviceOrderId]
            );
            
            if (completedOrder.length === 0) {
                await client.sendMessage(senderId, "Não foi possível encontrar os detalhes da ordem de serviço.");
                delete stateInfo.state;
                return true;
            }
            
            const order = completedOrder[0];
            
            // Notificar cliente sobre a conclusão do serviço
            const clientId = `${order.whatsapp_number}@c.us`;
            await client.sendMessage(
                clientId,
                `✅ O serviço de ${order.specialty} foi concluído com sucesso!\n\n*Descrição do serviço realizado:*\n${description}\n\nAgradecemos a preferência! Em breve você receberá uma pesquisa de satisfação.`
            );
            
            // Configurar estado do cliente para avaliação
            if (!userState[clientId]) {
                userState[clientId] = { state: "awaiting_service_rating", data: {} };
            } else {
                userState[clientId].state = "awaiting_service_rating";
            }
            userState[clientId].data = { 
                serviceOrderId: serviceOrderId,
                technicianId: technician.id
            };
            
            // Enviar pesquisa de satisfação para o cliente
            const ratingMessage = 
                `Como você avalia o serviço realizado?\n\n` +
                `1 - ⭐ Muito insatisfeito\n` +
                `2 - ⭐⭐ Insatisfeito\n` +
                `3 - ⭐⭐⭐ Neutro\n` +
                `4 - ⭐⭐⭐⭐ Satisfeito\n` +
                `5 - ⭐⭐⭐⭐⭐ Muito satisfeito\n\n` +
                `Por favor, responda com um número de 1 a 5.`;
            
            await client.sendMessage(clientId, ratingMessage);
            
            // Informar técnico sobre a conclusão
            await client.sendMessage(
                senderId,
                `✅ Ordem de serviço #${serviceOrderId} finalizada com sucesso! O cliente foi notificado e receberá uma pesquisa de satisfação.`
            );
            
            // Atualizar status do técnico para disponível
            await updateTechnicianStatus(conn, technician.id, 'available');
            
            // Verificar se há mais ordens pendentes
            const pendingOrders = await getTechnicianServiceOrders(conn, technician.id);
            
            if (pendingOrders.length > 0) {
                await client.sendMessage(
                    senderId,
                    `Você ainda tem ${pendingOrders.length} ordem(s) de serviço pendente(s). Use o comando /ordens para visualizá-las.`
                );
            } else {
                await client.sendMessage(
                    senderId,
                    `Você não possui mais ordens de serviço pendentes. Bom trabalho!`
                );
            }
            
            // Limpar estado
            delete stateInfo.state;
            return true;
            
        case 'awaiting_rejection_reason':
            // Técnico informando motivo da rejeição
            const reason = msg.body.trim();
            if (reason.length < 5) {
                await client.sendMessage(senderId, "Por favor, forneça um motivo válido para a rejeição.");
                return true;
            }
            
            const rejectedOrderId = stateInfo.data.serviceOrderId;
            
            // Atualizar ordem de serviço
            await conn.query(
                "UPDATE service_orders SET status = 'rejected', notes = ? WHERE id = ?",
                [`Rejeitado pelo técnico: ${reason}`, rejectedOrderId]
            );
            
            // Buscar detalhes da ordem
            const rejectedOrder = await conn.query(
                `SELECT so.id, c.name as client_name, c.whatsapp_number, a.specialty
                FROM service_orders so
                JOIN appointments a ON so.appointment_id = a.id
                JOIN clients c ON a.client_id = c.id
                WHERE so.id = ?`,
                [rejectedOrderId]
            );
            
            if (rejectedOrder.length === 0) {
                await client.sendMessage(senderId, "Não foi possível encontrar os detalhes da ordem de serviço.");
                delete stateInfo.state;
                return true;
            }
            
            const rejected = rejectedOrder[0];
            
            // Notificar cliente sobre a rejeição
            const rejectedClientId = `${rejected.whatsapp_number}@c.us`;
            await client.sendMessage(
                rejectedClientId,
                `Infelizmente, o técnico não poderá realizar o serviço de ${rejected.specialty} no momento. Motivo: ${reason}\n\nEntraremos em contato para reagendar.`
            );
            
            // Informar técnico sobre a rejeição
            await client.sendMessage(
                senderId,
                `✅ Ordem de serviço #${rejectedOrderId} foi rejeitada. O cliente foi notificado.`
            );
            
            // Atualizar status do técnico para disponível
            await updateTechnicianStatus(conn, technician.id, 'available');
            
            // Limpar estado
            delete stateInfo.state;
            return true;
            
        default:
            return false; // Estado não reconhecido
    }
}

// Exportar funções
module.exports = {
    checkIfTechnician,
    updateTechnicianStatus,
    getTechnicianServiceOrders,
    calculateRoute,
    notifyClientAboutTechnician,
    saveTechnicianPhoto,
    processTechnicianCommand,
    processTechnicianButton,
    processTechnicianState
};
