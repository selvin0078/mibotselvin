const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ytDlpWrap = new YTDlpWrap();

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('sesion');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // no muestra QR
        // Habilitamos pairing code
        generateHighQualityLinkPreview: true,
    });

    // Si no hay sesión, genera el código de emparejamiento
    if (!state.creds.registered) {
        setTimeout(async () => {
            const phoneNumber = await question('Ingresa tu número de WhatsApp con código de país (ej: 50212345678): ');
            const code = await sock.requestPairingCode(phoneNumber.trim());
            console.log(`Tu código de emparejamiento es: ${code}`);
            console.log(`Abrí WhatsApp → Dispositivos vinculados → Vincular con código de teléfono → Ingresa este código`);
        }, 3000);
    }

    sock.ev.on('connection.update', (update) => {
        if (update.connection === 'open') console.log('¡Bot conectado y listo! 🚀');
    });

    sock.ev.on('creds.update', saveCreds);

    // El resto del código del .play y comandos es el mismo que antes
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const chatId = msg.key.remoteJid;
        const textoOriginal = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const texto = textoOriginal.toLowerCase().trim();

        const responder = (txt) => sock.sendMessage(chatId, { text: txt }, { quoted: msg });

        if (texto.startsWith('.play ')) {
            const query = textoOriginal.slice(6).trim();
            if (!query) {
                responder('Uso: .play nombre canción');
                return;
            }

            responder(`Buscando "${query}"...`);

            try {
                const searchOutput = await ytDlpWrap.execPromise([
                    '--print', '%(id)s',
                    'ytsearch1:' + query
                ]);

                const videoId = searchOutput.trim();
                if (!videoId) {
                    responder('No encontré la canción.');
                    return;
                }

                const videoUrl = 'https://www.youtube.com/watch?v=' + videoId;

                const infoOutput = await ytDlpWrap.execPromise([
                    '--print', '%(title)s|||%(duration)s',
                    videoUrl
                ]);

                const [titulo, duracionStr] = infoOutput.trim().split('|||');
                const duracion = parseInt(duracionStr) || 0;

                if (duracion > 600) {
                    responder('Muy larga (máx 10 min).');
                    return;
                }

                responder(`Descargando: ${titulo}`);

                const tempFile = `temp_${Date.now()}.mp3`;

                await ytDlpWrap.execPromise([
                    videoUrl,
                    '-x',
                    '--audio-format', 'mp3',
                    '--audio-quality', '0',
                    '-o', tempFile
                ]);

                await sock.sendMessage(chatId, {
                    audio: { url: tempFile },
                    mimetype: 'audio/mpeg',
                    fileName: `${titulo.substring(0, 60)}.mp3`
                });

                responder('¡Audio enviado! 🎶');

            } catch (err) {
                console.log('Error .play:', err);
                responder('Error al descargar.');
            }
            return;
        }

        if (msg.key.fromMe) return;

        if (texto.includes('hola')) {
            responder('¡Hola! ¿En qué te ayudo?');
        } else if (texto === 'menu') {
            responder('.play nombre canción → audio MP3 🎶');
        }
    });
}

// Función para preguntar número (Railway no tiene input, así que lo hardcodeamos o usamos variable)
function question(text) {
    return new Promise(resolve => {
        console.log(text);
        // En Railway, ponemos el número manualmente aquí la primera vez
        // Cambia "50212345678" por tu número real con código de país (sin + ni espacios)
        resolve('50242924800'); // <-- CAMBIA ESTO POR TU NÚMERO
    });
}

iniciarBot().catch(console.error);
